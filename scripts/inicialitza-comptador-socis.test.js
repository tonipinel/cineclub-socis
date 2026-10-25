// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  llegirOpcions, analitzar, valorNou, comprovarCopia, executar, desfer,
} from './inicialitza-comptador-socis.mjs';

const AVUI = new Date('2026-10-25T10:00:00Z');

// Firestore fals amb la forma de l'Admin SDK (`snap.exists` és un booleà). Les escriptures d'una transacció només
// s'apliquen si la funció acaba bé; les lectures fora de transacció es compten per comprovar que l'informe no escriu.
function firestoreFals({ socis = {}, comptador } = {}) {
  const estat = { comptador, escriptures: 0, transaccions: 0 };
  const colSocis = { tipus: 'col', nom: 'socis' };
  const refComptador = { tipus: 'doc', path: 'configuracio/socis' };
  const snapSocis = () => ({ docs: Object.entries(socis).map(([id, dades]) => ({ id, data: () => ({ ...dades }) })) });
  const snapComptador = () => ({ exists: estat.comptador !== undefined, data: () => (estat.comptador && { ...estat.comptador }) });
  const llegeix = async (ref) => (ref === colSocis ? snapSocis() : snapComptador());
  colSocis.get = () => llegeix(colSocis);
  refComptador.get = () => llegeix(refComptador);
  return {
    estat,
    collection: (nom) => (nom === 'socis' ? colSocis : { doc: (id) => (nom === 'configuracio' && id === 'socis' ? refComptador : null) }),
    runTransaction: async (fn) => {
      estat.transaccions += 1;
      const pendents = [];
      const t = {
        get: llegeix,
        set: (ref, dades, opcions) => { pendents.push(() => { estat.comptador = { ...(opcions?.merge ? estat.comptador : {}), ...dades }; }); return t; },
        update: (ref, dades) => { pendents.push(() => { estat.comptador = { ...estat.comptador, ...dades }; }); return t; },
        delete: () => { pendents.push(() => { estat.comptador = undefined; }); return t; },
      };
      const resultat = await fn(t);
      pendents.forEach((aplica) => { aplica(); estat.escriptures += 1; });
      return resultat;
    },
  };
}

const SOCIS = {
  a: { numeroSoci: 12, nom: 'Anna', cognoms: 'Vidal' },
  b: { numeroSoci: '41', nom: 'Marc', cognoms: 'Serra' },
  c: { numeroSoci: '', nom: 'Sense', cognoms: 'Número' },
  d: { numeroSoci: 7, nom: 'Laia', cognoms: 'Puig' },
};

function copiaDAvui() {
  const dir = mkdtempSync(join(tmpdir(), 'backups-'));
  mkdirSync(join(dir, '2026-10-25'));
  writeFileSync(join(dir, '2026-10-25', 'manifest.json'), '{}');
  return dir;
}

const registreDe = (dir) => join(dir, '2026-10-25', 'comptador-socis.json');
const silenci = () => {};

describe('llegirOpcions', () => {
  it('per defecte és informe', () => expect(llegirOpcions([])).toEqual({ apply: false, desfer: null }));
  it('--apply l\'activa', () => expect(llegirOpcions(['--apply'])).toEqual({ apply: true, desfer: null }));
  it('--desfer porta el fitxer', () => expect(llegirOpcions(['--desfer', 'f.json'])).toEqual({ apply: false, desfer: 'f.json' }));
  it('rebutja opcions desconegudes o incompletes', () => {
    expect(() => llegirOpcions(['--aplica'])).toThrow(/desconeguda/);
    expect(() => llegirOpcions(['--desfer'])).toThrow(/desconeguda o incompleta/);
  });
  it('no combina --apply i --desfer', () => expect(() => llegirOpcions(['--apply', '--desfer', 'f'])).toThrow(/no es poden combinar/));
});

describe('analitzar', () => {
  it('troba el màxim, tractant els números en text com a números, i compta els socis sense número', () => {
    const r = analitzar(Object.entries(SOCIS).map(([id, d]) => ({ id, data: () => d })));
    expect(r.maxim).toBe(41);
    expect(r.senseNumero).toBe(1);
    expect(r.duplicats).toEqual([]);
    expect(r.noValids).toEqual([]);
  });

  it('detecta duplicats (també 7 i «7») i números no vàlids', () => {
    const docs = [
      { id: 'x', data: () => ({ numeroSoci: 7, nom: 'Laia', cognoms: 'Puig' }) },
      { id: 'y', data: () => ({ numeroSoci: '7', nom: 'Pere', cognoms: 'Roig' }) },
      { id: 'z', data: () => ({ numeroSoci: 'abc', nom: 'Rara', cognoms: 'Dada' }) },
      { id: 'w', data: () => ({ numeroSoci: 3.5, nom: 'Mig', cognoms: 'Número' }) },
    ];
    const r = analitzar(docs);
    expect(r.maxim).toBe(7);
    expect(r.duplicats).toEqual([{ numero: 7, socis: [{ id: 'x', nom: 'Laia Puig' }, { id: 'y', nom: 'Pere Roig' }] }]);
    expect(r.noValids).toEqual([{ id: 'z', valor: 'abc' }, { id: 'w', valor: 3.5 }]);
  });

  it('sense socis, el màxim és 0', () => expect(analitzar([]).maxim).toBe(0));
});

describe('valorNou', () => {
  it('sense comptador, el posa al màxim actual', () => expect(valorNou(41, undefined)).toBe(41));
  it('amb el comptador endarrerit, l\'avança al màxim', () => expect(valorNou(41, { ultimNumeroSoci: 30 })).toBe(41));
  it('amb el comptador al dia o per davant, no el toca mai cap enrere', () => {
    expect(valorNou(41, { ultimNumeroSoci: 41 })).toBeNull();
    expect(valorNou(41, { ultimNumeroSoci: 60 })).toBeNull();
  });
  it('amb un valor no vàlid, el substitueix pel màxim', () => {
    expect(valorNou(41, { ultimNumeroSoci: 'x' })).toBe(41);
    expect(valorNou(41, {})).toBe(41);
  });
});

describe('comprovarCopia', () => {
  it('falla sense manifest d\'avui', () => {
    expect(() => comprovarCopia(mkdtempSync(join(tmpdir(), 'backups-')), AVUI)).toThrow(/còpia de seguretat/);
  });
  it('accepta el manifest d\'avui', () => expect(() => comprovarCopia(copiaDAvui(), AVUI)).not.toThrow());
});

describe('executar', () => {
  it('l\'informe no escriu res, no exigeix còpia i llista els duplicats', async () => {
    const db = firestoreFals({ socis: { ...SOCIS, e: { numeroSoci: 12, nom: 'Repe', cognoms: 'Tit' } } });
    const linies = [];
    const dirBackups = mkdtempSync(join(tmpdir(), 'backups-'));
    const r = await executar({ db, dirBackups, avui: AVUI, log: (l) => linies.push(l) });
    expect(r).toEqual(expect.objectContaining({ maxim: 41, anterior: null, nou: 41, escrit: false }));
    expect(db.estat.escriptures).toBe(0);
    expect(db.estat.transaccions).toBe(0);
    expect(db.estat.comptador).toBeUndefined();
    expect(existsSync(registreDe(dirBackups))).toBe(false);
    const text = linies.join('\n');
    expect(text).toMatch(/MODE INFORME/);
    expect(text).toMatch(/DUPLICAT: número 12: a \(Anna Vidal\), e \(Repe Tit\)/);
    expect(text).toMatch(/s'inicialitzaria a 41/);
  });

  it('--apply sense còpia d\'avui no escriu res', async () => {
    const db = firestoreFals({ socis: SOCIS });
    await expect(executar({ apply: true, db, dirBackups: mkdtempSync(join(tmpdir(), 'backups-')), avui: AVUI, log: silenci }))
      .rejects.toThrow(/còpia de seguretat/);
    expect(db.estat.comptador).toBeUndefined();
    expect(db.estat.escriptures).toBe(0);
  });

  it('--apply crea el comptador al màxim dins d\'una transacció i en desa el registre per poder-lo desfer', async () => {
    const db = firestoreFals({ socis: SOCIS });
    const dirBackups = copiaDAvui();
    const r = await executar({ apply: true, db, dirBackups, avui: AVUI, log: silenci });
    expect(r).toEqual(expect.objectContaining({ maxim: 41, anterior: null, nou: 41, escrit: true }));
    expect(db.estat.transaccions).toBe(1);
    expect(db.estat.comptador).toEqual({ ultimNumeroSoci: 41 });
    expect(JSON.parse(readFileSync(registreDe(dirBackups), 'utf8'))).toEqual({
      actualitzat: AVUI.toISOString(),
      execucions: [{ actualitzat: AVUI.toISOString(), anterior: null, escrit: 41 }],
    });
  });

  it('--apply avança un comptador endarrerit conservant els altres camps', async () => {
    const db = firestoreFals({ socis: SOCIS, comptador: { ultimNumeroSoci: 30, altre: 'x' } });
    const dirBackups = copiaDAvui();
    await executar({ apply: true, db, dirBackups, avui: AVUI, log: silenci });
    expect(db.estat.comptador).toEqual({ ultimNumeroSoci: 41, altre: 'x' });
    expect(JSON.parse(readFileSync(registreDe(dirBackups), 'utf8')).execucions[0].anterior).toEqual({ ultimNumeroSoci: 30, altre: 'x' });
  });

  it('una segona execució el mateix dia afegeix una entrada al registre i conserva la primera (el punt de retorn)', async () => {
    const socis = { ...SOCIS };
    const db = firestoreFals({ socis, comptador: { ultimNumeroSoci: 30 } });
    const dirBackups = copiaDAvui();
    await executar({ apply: true, db, dirBackups, avui: AVUI, log: silenci });
    socis.e = { numeroSoci: 55, nom: 'Nou', cognoms: 'Importat' };
    const mesTard = new Date('2026-10-25T12:00:00Z');
    await executar({ apply: true, db, dirBackups, avui: mesTard, log: silenci });
    expect(db.estat.comptador).toEqual({ ultimNumeroSoci: 55 });
    expect(JSON.parse(readFileSync(registreDe(dirBackups), 'utf8'))).toEqual({
      actualitzat: mesTard.toISOString(),
      execucions: [
        { actualitzat: AVUI.toISOString(), anterior: { ultimNumeroSoci: 30 }, escrit: 41 },
        { actualitzat: mesTard.toISOString(), anterior: { ultimNumeroSoci: 41 }, escrit: 55 },
      ],
    });
  });

  it('--apply és idempotent: amb el comptador al dia (o per davant) no escriu ni sobreescriu el registre', async () => {
    const db = firestoreFals({ socis: SOCIS, comptador: { ultimNumeroSoci: 60 } });
    const dirBackups = copiaDAvui();
    const r = await executar({ apply: true, db, dirBackups, avui: AVUI, log: silenci });
    expect(r.escrit).toBe(false);
    expect(db.estat.comptador).toEqual({ ultimNumeroSoci: 60 });
    expect(db.estat.escriptures).toBe(0);
    expect(existsSync(registreDe(dirBackups))).toBe(false);
  });
});

describe('desfer', () => {
  async function aplicat(comptador) {
    const db = firestoreFals({ socis: SOCIS, comptador });
    const dirBackups = copiaDAvui();
    await executar({ apply: true, db, dirBackups, avui: AVUI, log: silenci });
    return { db, dirBackups, fitxer: registreDe(dirBackups) };
  }

  it('esborra el comptador si abans no existia', async () => {
    const { db, dirBackups, fitxer } = await aplicat(undefined);
    const r = await desfer({ fitxer, db, dirBackups, avui: AVUI, log: silenci });
    expect(r).toEqual({ desfet: true });
    expect(db.estat.comptador).toBeUndefined();
  });

  it('restaura el valor anterior si ja existia', async () => {
    const { db, dirBackups, fitxer } = await aplicat({ ultimNumeroSoci: 30, altre: 'x' });
    await desfer({ fitxer, db, dirBackups, avui: AVUI, log: silenci });
    expect(db.estat.comptador).toEqual({ ultimNumeroSoci: 30, altre: 'x' });
  });

  it('després de dues execucions, restaura el PRIMER valor anterior si el comptador encara val el darrer escrit', async () => {
    const socis = { ...SOCIS };
    const db = firestoreFals({ socis, comptador: { ultimNumeroSoci: 30 } });
    const dirBackups = copiaDAvui();
    await executar({ apply: true, db, dirBackups, avui: AVUI, log: silenci });
    socis.e = { numeroSoci: 55, nom: 'Nou', cognoms: 'Importat' };
    await executar({ apply: true, db, dirBackups, avui: AVUI, log: silenci });
    const r = await desfer({ fitxer: registreDe(dirBackups), db, dirBackups, avui: AVUI, log: silenci });
    expect(r).toEqual({ desfet: true });
    expect(db.estat.comptador).toEqual({ ultimNumeroSoci: 30 });
  });

  it('després de dues execucions, es nega a desfer si el comptador no val el darrer escrit', async () => {
    const socis = { ...SOCIS };
    const db = firestoreFals({ socis });
    const dirBackups = copiaDAvui();
    await executar({ apply: true, db, dirBackups, avui: AVUI, log: silenci });
    socis.e = { numeroSoci: 55, nom: 'Nou', cognoms: 'Importat' };
    await executar({ apply: true, db, dirBackups, avui: AVUI, log: silenci });
    db.estat.comptador = { ultimNumeroSoci: 41 };
    const r = await desfer({ fitxer: registreDe(dirBackups), db, dirBackups, avui: AVUI, log: silenci });
    expect(r).toEqual({ desfet: false });
    expect(db.estat.comptador).toEqual({ ultimNumeroSoci: 41 });
  });

  it('es nega a desfer si l\'app ja ha assignat números des d\'aleshores (tornaria a donar números repetits)', async () => {
    const { db, dirBackups, fitxer } = await aplicat(undefined);
    db.estat.comptador = { ultimNumeroSoci: 43 };
    const linies = [];
    const r = await desfer({ fitxer, db, dirBackups, avui: AVUI, log: (l) => linies.push(l) });
    expect(r).toEqual({ desfet: false });
    expect(db.estat.comptador).toEqual({ ultimNumeroSoci: 43 });
    expect(linies.join('\n')).toMatch(/ja s'han assignat números/);
  });

  it('exigeix la còpia d\'avui', async () => {
    const { db, fitxer } = await aplicat(undefined);
    await expect(desfer({ fitxer, db, dirBackups: mkdtempSync(join(tmpdir(), 'backups-')), avui: AVUI, log: silenci }))
      .rejects.toThrow(/còpia de seguretat/);
    expect(db.estat.comptador).toEqual({ ultimNumeroSoci: 41 });
  });
});
