// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import porta from '../functions/socis-porta.js';
import {
  llegirOpcions, planificar, comprovarCopia, executar, desfer,
} from './omple-socis-porta.mjs';

const { docPorta } = porta;
const AVUI = new Date('2026-10-25T10:00:00Z');

// Firestore fals amb la forma de l'Admin SDK (`snap.exists` és un booleà) per a `socis` i `socisPorta`.
function firestoreFals({ socis = {}, socisPorta = {} } = {}) {
  const estat = { socis: { ...socis }, socisPorta: structuredClone(socisPorta), escriptures: 0 };
  const snapCol = (nom) => ({
    docs: Object.entries(estat[nom]).map(([id, dades]) => ({ id, data: () => structuredClone(dades) })),
  });
  const ref = (nom, id) => ({
    nom,
    id,
    get: async () => ({ exists: id in estat[nom], data: () => structuredClone(estat[nom][id]) }),
  });
  return {
    estat,
    collection: (nom) => ({ get: async () => snapCol(nom), doc: (id) => ref(nom, id) }),
    batch: () => {
      const ops = [];
      const b = {
        set: (r, dades) => { ops.push(() => { estat[r.nom][r.id] = structuredClone(dades); }); return b; },
        delete: (r) => { ops.push(() => { delete estat[r.nom][r.id]; }); return b; },
        commit: async () => { ops.forEach((op) => { op(); estat.escriptures += 1; }); },
      };
      return b;
    },
  };
}

const SOCIS = {
  a: { numeroSoci: 12, nom: 'Anna', cognoms: 'Vidal', dni: '12345678Z', telefon: '600', tokenCarnet: 'tok-a', ultimPagament: '2026-01-01' },
  b: { numeroSoci: 41, nom: 'Marc', cognoms: 'Serra', tokenCarnet: 'tok-b', ultimPagament: '2026-02-01', actiu: false },
  c: { numeroSoci: '', nom: 'Sense', cognoms: 'Número', tokenCarnet: 'tok-c' },
};

function copiaDAvui() {
  const dir = mkdtempSync(join(tmpdir(), 'backups-'));
  mkdirSync(join(dir, '2026-10-25'));
  writeFileSync(join(dir, '2026-10-25', 'manifest.json'), '{}');
  return dir;
}

const registreDe = (dir) => join(dir, '2026-10-25', 'socis-porta.json');
const silenci = () => {};

describe('llegirOpcions', () => {
  it('per defecte és informe', () => expect(llegirOpcions([])).toEqual({ apply: false, desfer: null }));
  it('--apply', () => expect(llegirOpcions(['--apply'])).toEqual({ apply: true, desfer: null }));
  it('--desfer <fitxer>', () => expect(llegirOpcions(['--desfer', 'f.json'])).toEqual({ apply: false, desfer: 'f.json' }));
  it('rebutja opcions desconegudes, incompletes o combinades', () => {
    expect(() => llegirOpcions(['--aplica'])).toThrow(/desconeguda/);
    expect(() => llegirOpcions(['--desfer'])).toThrow(/desconeguda o incompleta/);
    expect(() => llegirOpcions(['--apply', '--desfer', 'f'])).toThrow(/combinar/);
  });
});

describe('planificar', () => {
  it('crea un document per soci amb número, amb la mateixa llista blanca que la Cloud Function', () => {
    const pla = planificar(Object.entries(SOCIS).map(([id, d]) => ({ id, data: () => d })), []);
    expect(pla.escriure).toEqual([
      { id: '12', dades: docPorta(SOCIS.a), anterior: null },
      { id: '41', dades: docPorta(SOCIS.b), anterior: null },
    ]);
    expect(pla.senseNumero).toBe(1);
    expect(pla.esborrar).toEqual([]);
    expect(JSON.stringify(pla.escriure)).not.toMatch(/12345678Z|tok-a|"telefon"/);
  });

  it('no reescriu els que ja estan al dia i actualitza els desfasats', () => {
    const existents = [
      { id: '12', data: () => docPorta(SOCIS.a) },
      { id: '41', data: () => ({ ...docPorta(SOCIS.b), nom: 'Vell' }) },
    ];
    const pla = planificar(Object.entries(SOCIS).map(([id, d]) => ({ id, data: () => d })), existents);
    expect(pla.alDia).toBe(1);
    expect(pla.escriure).toEqual([{ id: '41', dades: docPorta(SOCIS.b), anterior: { ...docPorta(SOCIS.b), nom: 'Vell' } }]);
  });

  it('esborra els documents de porta que ja no corresponen a cap soci', () => {
    const existents = [{ id: '99', data: () => ({ numeroSoci: 99, nom: 'Antic' }) }];
    const pla = planificar([], existents);
    expect(pla.esborrar).toEqual([{ id: '99', anterior: { numeroSoci: 99, nom: 'Antic' } }]);
  });

  it('amb un número repetit no escriu cap dels dos i ho avisa (cal arreglar-ho a mà)', () => {
    const docs = [
      { id: 'a', data: () => SOCIS.a },
      { id: 'x', data: () => ({ ...SOCIS.a, nom: 'Altre', tokenCarnet: 'tok-x' }) },
    ];
    const existents = [{ id: '12', data: () => docPorta(SOCIS.a) }];
    const pla = planificar(docs, existents);
    expect(pla.duplicats).toEqual([{ numero: '12', socis: ['a', 'x'] }]);
    expect(pla.escriure).toEqual([]);
    expect(pla.esborrar).toEqual([]);
  });
});

describe('comprovarCopia', () => {
  it('falla si no hi ha la còpia d\'avui', () => {
    expect(() => comprovarCopia(mkdtempSync(join(tmpdir(), 'buit-')), AVUI)).toThrow(/còpia de seguretat d'avui/);
  });
});

describe('executar', () => {
  const llegeixSocis = () => Object.entries(SOCIS);

  it('en mode informe no escriu res ni necessita la còpia', async () => {
    const db = firestoreFals({ socis: Object.fromEntries(llegeixSocis()) });
    const resultat = await executar({ db, dirBackups: mkdtempSync(join(tmpdir(), 'buit-')), avui: AVUI, log: silenci });
    expect(resultat.escrit).toBe(false);
    expect(resultat.escriure).toBe(2);
    expect(db.estat.escriptures).toBe(0);
    expect(db.estat.socisPorta).toEqual({});
  });

  it('l\'informe no mostra cap dada personal (només ids i números)', async () => {
    const db = firestoreFals({ socis: Object.fromEntries(llegeixSocis()) });
    const linies = [];
    await executar({ db, avui: AVUI, log: (l) => linies.push(l) });
    expect(linies.join('\n')).not.toMatch(/Anna|Vidal|12345678Z|tok-a|600/);
  });

  it('amb --apply sense còpia d\'avui no escriu res', async () => {
    const db = firestoreFals({ socis: Object.fromEntries(llegeixSocis()) });
    await expect(executar({
      db, apply: true, dirBackups: mkdtempSync(join(tmpdir(), 'buit-')), avui: AVUI, log: silenci,
    })).rejects.toThrow(/còpia de seguretat/);
    expect(db.estat.escriptures).toBe(0);
  });

  it('amb --apply crea els documents, desa l\'estat anterior i és idempotent', async () => {
    const dir = copiaDAvui();
    const db = firestoreFals({ socis: Object.fromEntries(llegeixSocis()), socisPorta: { 99: { numeroSoci: 99 } } });
    const resultat = await executar({ db, apply: true, dirBackups: dir, avui: AVUI, log: silenci });
    expect(resultat.escrit).toBe(true);
    expect(db.estat.socisPorta).toEqual({ 12: docPorta(SOCIS.a), 41: docPorta(SOCIS.b) });
    const registre = JSON.parse(readFileSync(registreDe(dir), 'utf8'));
    expect(registre.execucions).toHaveLength(1);
    expect(registre.execucions[0].canvis).toEqual([
      { id: '12', anterior: null, escrit: docPorta(SOCIS.a) },
      { id: '41', anterior: null, escrit: docPorta(SOCIS.b) },
      { id: '99', anterior: { numeroSoci: 99 }, escrit: null },
    ]);

    const escripturesAbans = db.estat.escriptures;
    const segona = await executar({ db, apply: true, dirBackups: dir, avui: AVUI, log: silenci });
    expect(segona.escrit).toBe(false);
    expect(db.estat.escriptures).toBe(escripturesAbans);
    expect(JSON.parse(readFileSync(registreDe(dir), 'utf8')).execucions).toHaveLength(1);
  });

  it('el registre d\'execució (backups/) no conté el token en clar', async () => {
    const dir = copiaDAvui();
    const db = firestoreFals({ socis: Object.fromEntries(llegeixSocis()) });
    await executar({ db, apply: true, dirBackups: dir, avui: AVUI, log: silenci });
    expect(readFileSync(registreDe(dir), 'utf8')).not.toMatch(/tok-a|12345678Z/);
  });
});

describe('desfer', () => {
  it('torna cada document a l\'estat d\'abans de la primera execució', async () => {
    const dir = copiaDAvui();
    const vell = { ...docPorta(SOCIS.b), nom: 'Vell' };
    const db = firestoreFals({ socis: Object.fromEntries(Object.entries(SOCIS)), socisPorta: { 41: vell, 99: { numeroSoci: 99 } } });
    await executar({ db, apply: true, dirBackups: dir, avui: AVUI, log: silenci });
    const resultat = await desfer({ fitxer: registreDe(dir), db, dirBackups: dir, avui: AVUI, log: silenci });
    expect(resultat.desfets).toBe(3);
    expect(db.estat.socisPorta).toEqual({ 41: vell, 99: { numeroSoci: 99 } });
  });

  it('no toca un document que ha canviat des d\'aleshores (l\'ha actualitzat la Cloud Function)', async () => {
    const dir = copiaDAvui();
    const db = firestoreFals({ socis: Object.fromEntries(Object.entries(SOCIS)) });
    await executar({ db, apply: true, dirBackups: dir, avui: AVUI, log: silenci });
    const recent = { ...docPorta(SOCIS.a), ultimPagament: '2026-10-25' };
    db.estat.socisPorta['12'] = recent;
    const resultat = await desfer({ fitxer: registreDe(dir), db, dirBackups: dir, avui: AVUI, log: silenci });
    expect(resultat).toEqual({ desfets: 1, saltats: 1 });
    expect(db.estat.socisPorta).toEqual({ 12: recent });
  });

  it('necessita la còpia d\'avui', async () => {
    const dir = copiaDAvui();
    const db = firestoreFals({ socis: Object.fromEntries(Object.entries(SOCIS)) });
    await executar({ db, apply: true, dirBackups: dir, avui: AVUI, log: silenci });
    expect(existsSync(registreDe(dir))).toBe(true);
    await expect(desfer({
      fitxer: registreDe(dir), db, dirBackups: mkdtempSync(join(tmpdir(), 'buit-')), avui: AVUI, log: silenci,
    })).rejects.toThrow(/còpia de seguretat/);
  });
});
