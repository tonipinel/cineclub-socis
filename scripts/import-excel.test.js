// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CAPCALERES, llegirOpcions, filesDeValors, pla, nomPublic, comprovarCopia, importa, desfer,
} from './import-excel.js';
import { calcularNomPublic } from '../src/lib/propostes.js';

const AVUI = new Date('2026-10-25T10:00:00Z');
const DIA = '2026-10-25';
const ESBORRA = { esborra: true };

const backups = (ambCopia = true) => {
  const dir = mkdtempSync(join(tmpdir(), 'backups-'));
  if (ambCopia) {
    mkdirSync(join(dir, DIA));
    writeFileSync(join(dir, DIA, 'manifest.json'), '{}');
  }
  return dir;
};
const registre = (dir) => JSON.parse(readFileSync(join(dir, DIA, 'import-excel-registre.json'), 'utf8'));

// Firestore fals: col·leccions en memòria; `update` entén el sentinella ESBORRA i `batch` aplica en bloc.
function firestoreFals({ socis = {}, solicituds = {}, socisPublic = {} } = {}) {
  const cols = {
    socis: new Map(Object.entries(structuredClone(socis))),
    solicituds: new Map(Object.entries(structuredClone(solicituds))),
    socisPublic: new Map(Object.entries(structuredClone(socisPublic))),
  };
  const escriptures = [];
  let n = 0;
  const ref = (col, id) => ({
    id,
    col,
    get: async () => ({ exists: cols[col].has(id), data: () => cols[col].get(id) }),
    set: async (dades) => { escriptures.push(['set', col, id, dades]); cols[col].set(id, dades); },
    update: async (camps) => {
      if (!cols[col].has(id)) throw new Error(`no existeix ${col}/${id}`);
      escriptures.push(['update', col, id, camps]);
      const doc = cols[col].get(id);
      for (const [camp, valor] of Object.entries(camps)) {
        if (valor === ESBORRA) delete doc[camp];
        else doc[camp] = valor;
      }
    },
    delete: async () => { escriptures.push(['delete', col, id]); cols[col].delete(id); },
  });
  return {
    cols,
    escriptures,
    collection: (col) => ({
      get: async () => ({ docs: [...cols[col]].map(([id, d]) => ({ id, data: () => d })) }),
      doc: (id) => ref(col, id ?? `nou${n++}`),
    }),
    batch: () => {
      const ops = [];
      return {
        set: (r, dades) => { ops.push(() => r.set(dades)); },
        delete: (r) => { ops.push(() => r.delete()); },
        commit: async () => { for (const op of ops) await op(); },
      };
    },
  };
}

const CAPS = ['Número de soci/a', 'Nom', 'Cognoms', 'Població', 'Codi postal', 'Telèfon', 'Correu electrònic', 'Estat pagament', 'Correu pagament', 'DNI', 'Grup whatsapp'];
const fila = (numero, nom, cognoms, extra = {}) => ({ numeroSoci: numero, nom, cognoms, ...extra });

// Soci existent desactivat, pagat fa temps i amb carnet: no s'ha de tocar res d'això.
const SOCI_12 = {
  numeroSoci: 12, nom: 'Anna', cognoms: 'Vidal', poblacio: 'Roda de Berà', codiPostal: '43883', telefon: '',
  correuElectronic: 'anna@example.com', dni: '', grupWhatsapp: '', dataAlta: '2025-01-10',
  ultimPagament: '2025-01-10', inicPeriode: '2025-02-01', actiu: false, tokenCarnet: 'tok-12',
};

const base = (extra = {}) => ({
  dirBackups: backups(), avui: AVUI, nouToken: (() => { let i = 0; return () => `tok-nou-${i++}`; })(),
  ara: () => 'TS', log: () => {}, ...extra,
});

describe('llegirOpcions', () => {
  it('per defecte és informe sobre el fitxer Excel', () => {
    expect(llegirOpcions(['cens.xlsx'])).toEqual({ excel: 'cens.xlsx', apply: false, desfer: null });
  });
  it('--apply', () => expect(llegirOpcions(['cens.xlsx', '--apply'])).toEqual({ excel: 'cens.xlsx', apply: true, desfer: null }));
  it('--desfer <fitxer> sense Excel', () => {
    expect(llegirOpcions(['--desfer', 'r.json'])).toEqual({ excel: null, apply: false, desfer: 'r.json' });
  });
  it('errors', () => {
    expect(() => llegirOpcions([])).toThrow(/Excel/);
    expect(() => llegirOpcions(['--apply'])).toThrow(/Excel/);
    expect(() => llegirOpcions(['--desfer'])).toThrow(/incompleta/);
    expect(() => llegirOpcions(['a.xlsx', '--desfer', 'r.json'])).toThrow();
    expect(() => llegirOpcions(['--apply', '--desfer', 'r.json'])).toThrow();
    expect(() => llegirOpcions(['a.xlsx', 'clau.json'])).toThrow(/desconeguda/);
    expect(() => llegirOpcions(['a.xlsx', '--executa'])).toThrow(/desconeguda/);
  });
});

describe('filesDeValors', () => {
  it('mapeja les capçaleres conegudes, salta les files buides i avisa de les desconegudes', () => {
    const { files, avisos } = filesDeValors([
      [...CAPS, 'Observacions'],
      [12, 'Anna', 'Vidal', undefined, undefined, undefined, 'anna@example.com'],
      [undefined, null],
      [undefined, 'Gerard', 'Fernández'],
    ]);
    expect(Object.keys(CAPCALERES)).toEqual(CAPS);
    expect(files).toEqual([
      { fila: 2, numeroSoci: 12, nom: 'Anna', cognoms: 'Vidal', poblacio: undefined, codiPostal: undefined, telefon: undefined, correuElectronic: 'anna@example.com', estatPagament: undefined, correuPagament: undefined, dni: undefined, grupWhatsapp: undefined },
      { fila: 4, numeroSoci: undefined, nom: 'Gerard', cognoms: 'Fernández', poblacio: undefined, codiPostal: undefined, telefon: undefined, correuElectronic: undefined, estatPagament: undefined, correuPagament: undefined, dni: undefined, grupWhatsapp: undefined },
    ]);
    expect(avisos).toEqual(['AVÍS: capçalera desconeguda, s\'ignora: «Observacions»']);
  });
});

describe('nomPublic', () => {
  it('és el mateix que el de l\'admin', () => {
    for (const s of [{ nom: 'Anna', cognoms: 'vidal' }, { nom: 'Marc', cognoms: '  ' }, { nom: 'X', cognoms: 'Y', organitzacio: true }]) {
      expect(nomPublic(s)).toBe(calcularNomPublic(s));
    }
  });
});

describe('pla', () => {
  const dades = { socis: [{ id: 's12', ...SOCI_12 }], solicituds: [] };

  it('soci existent per número: només omple els camps buits, mai pagament, període, actiu ni carnet', () => {
    const p = pla([fila(12, 'Anna Maria', 'Vidal', { telefon: '600000000', dni: '1A', poblacio: 'Altafulla' })], dades, DIA);
    expect(p.socis).toEqual([{ fila: 2, accio: 'omplir', id: 's12', numeroSoci: 12, camps: { telefon: '600000000', dni: '1A' } }]);
    expect(p.solicituds).toEqual([]);
  });

  it('soci existent sense res a omplir: saltar', () => {
    const p = pla([fila(12, 'Anna', 'Vidal')], dades, DIA);
    expect(p.socis[0]).toMatchObject({ accio: 'saltar', id: 's12' });
  });

  it('el número pot venir com a text i coincideix igualment', () => {
    const p = pla([fila(' 12 ', 'Anna', 'Vidal')], dades, DIA);
    expect(p.socis[0]).toMatchObject({ accio: 'saltar', id: 's12' });
  });

  it('soci nou: crea amb carnet nou i amb el número com a nombre', () => {
    const p = pla([fila('7', 'Laia', 'Puig', { correuElectronic: 'laia@example.com' })], dades, DIA);
    expect(p.socis).toEqual([expect.objectContaining({ accio: 'crear', numeroSoci: 7 })]);
    expect(p.socis[0].dades).toMatchObject({ numeroSoci: 7, nom: 'Laia', ultimPagament: DIA, dataAlta: DIA, actiu: true });
  });

  it('número nou però mateix DNI, correu o nom complet que un soci existent: conflicte, no es crea', () => {
    const p = pla([
      fila(30, 'Altra', 'Persona', { correuElectronic: ' ANNA@example.com ' }),
      fila(31, 'anna', 'vidal'),
    ], dades, DIA);
    expect(p.socis.map((s) => s.accio)).toEqual(['conflicte', 'conflicte']);
    expect(p.avisos.join('\n')).toMatch(/fila 2.*30.*s12/);
  });

  it('número repetit dins l\'Excel o no vàlid: se salta amb avís', () => {
    const p = pla([fila(7, 'Laia', 'Puig'), fila(7, 'Pere', 'Roig'), fila('abc', 'Joan', 'Mas')], dades, DIA);
    expect(p.socis.map((s) => s.accio)).toEqual(['crear', 'conflicte', 'conflicte']);
    expect(p.avisos.join('\n')).toMatch(/repetit/);
    expect(p.avisos.join('\n')).toMatch(/no vàlid.*abc/);
  });

  it('número duplicat a Firestore: no es toca cap dels dos', () => {
    const p = pla([fila(12, 'Anna', 'Vidal', { telefon: '6' })], { socis: [{ id: 'a', ...SOCI_12 }, { id: 'b', ...SOCI_12 }], solicituds: [] }, DIA);
    expect(p.socis[0].accio).toBe('conflicte');
    expect(p.avisos.join('\n')).toMatch(/duplicat/);
  });

  it('mateix número però un altre nom: conflicte, no s\'omple res', () => {
    const p = pla([fila(12, 'Pere', 'Roig', { telefon: '6' })], dades, DIA);
    expect(p.socis[0]).toMatchObject({ accio: 'conflicte', id: 's12' });
    expect(p.avisos.join('\n')).toMatch(/fila 2.*12.*«Pere Roig».*«Anna Vidal»/);
  });

  it('el nom coincideix sense accents ni majúscules, o si un conté l\'altre paraula per paraula', () => {
    for (const [nom, cognoms] of [['ANNA', 'vídal'], ['Anna Maria', 'Vidal'], ['Anna', 'Vidal Puig']]) {
      expect(pla([fila(12, nom, cognoms, { telefon: '6' })], dades, DIA).socis[0].accio, `${nom} ${cognoms}`).toBe('omplir');
    }
    expect(pla([fila(12, '', '', { telefon: '6' })], dades, DIA).socis[0].accio).toBe('conflicte');
  });

  it('no omple un DNI ni un correu que ja són d\'un altre soci', () => {
    const socis = [
      { id: 's12', ...SOCI_12, correuElectronic: '' },
      { id: 's13', numeroSoci: 13, nom: 'Joan', cognoms: 'Mas', dni: '1A', correuElectronic: 'joan@example.com' },
    ];
    const p = pla([fila(12, 'Anna', 'Vidal', { dni: '1-a', correuElectronic: 'JOAN@example.com', telefon: '6' })], { socis, solicituds: [] }, DIA);
    expect(p.socis[0]).toMatchObject({ accio: 'omplir', camps: { telefon: '6' } });
    expect(p.avisos.join('\n')).toMatch(/dni.*s13/);
    expect(p.avisos.join('\n')).toMatch(/correuElectronic.*s13/);
  });

  it('els socis es planifiquen abans que les sol·licituds: una persona a totes dues files només és sòcia', () => {
    const p = pla([
      fila(undefined, 'Laia', 'Puig', { correuElectronic: 'laia@example.com' }),
      fila(7, 'Laia', 'Puig', { correuElectronic: 'laia@example.com' }),
    ], dades, DIA);
    expect(p.socis.map((s) => s.accio)).toEqual(['crear']);
    expect(p.solicituds).toEqual([{ fila: 2, accio: 'saltar', motiu: 'la fila 3' }]);
  });

  it('sol·licituds: no es dupliquen per correu ni per nom i telèfon, ni si ja és soci', () => {
    const existents = {
      socis: [{ id: 's12', ...SOCI_12 }],
      solicituds: [
        { id: 'q1', nom: 'Gerard', cognoms: 'Fernández', correuElectronic: 'gerard@example.com', estat: 'aprovada' },
        { id: 'q2', nom: 'Jesús', cognoms: 'Bolea', telefon: '611 22 33 44', correuElectronic: '', estat: 'pendent' },
      ],
    };
    const p = pla([
      fila(undefined, 'G.', 'F.', { correuElectronic: 'Gerard@Example.com' }),
      fila(undefined, 'jesus', 'BOLEA', { telefon: '611223344' }),
      fila(undefined, 'Anna', 'Vidal'),
      fila(undefined, 'Nova', 'Persona', { correuElectronic: 'nova@example.com' }),
      fila(undefined, 'Nova', 'Persona', { correuElectronic: 'nova@example.com' }),
      fila(undefined, '', '', {}),
    ], existents, DIA);
    expect(p.solicituds.map((s) => [s.accio, s.motiu ?? null])).toEqual([
      ['saltar', 'q1'], ['saltar', 'q2'], ['saltar', 's12'], ['crear', null], ['saltar', 'fila 5'], ['saltar', null],
    ]);
    expect(p.solicituds[3].dades).toMatchObject({ nom: 'Nova', estat: 'pendent', correuElectronic: 'nova@example.com', importat: true });
  });
});

describe('comprovarCopia', () => {
  it('falla sense la còpia d\'avui', () => expect(() => comprovarCopia(backups(false), AVUI)).toThrow(/còpia de seguretat/));
  it('passa amb la còpia', () => expect(() => comprovarCopia(backups(), AVUI)).not.toThrow());
});

const FILES = [
  fila(12, 'Anna', 'Vidal', { telefon: '600000000' }),
  fila(7, 'Laia', 'Puig', { correuElectronic: 'laia@example.com', estatPagament: 'Al dia' }),
  fila(undefined, 'Gerard', 'Fernández', { correuElectronic: 'gerard@example.com' }),
];

describe('importa', () => {
  it('informe: llegeix i mostra el pla, però no escriu res ni crea el registre', async () => {
    const db = firestoreFals({ socis: { s12: SOCI_12 } });
    const o = base();
    const linies = [];
    const res = await importa({ ...o, db, files: FILES, log: (l) => linies.push(l) });
    expect(db.escriptures).toEqual([]);
    expect(existsSync(join(o.dirBackups, DIA, 'import-excel-registre.json'))).toBe(false);
    const text = linies.join('\n');
    expect(text).toMatch(/MODE INFORME/);
    expect(text).toMatch(/Socis: 1 a crear, 1 a completar, 0 sense canvis, 0 en conflicte/);
    expect(text).toMatch(/Sol·licituds: 1 a crear, 0 saltades/);
    expect(res.pla.socis).toHaveLength(2);
  });

  it('apply sense còpia d\'avui es nega i no toca res', async () => {
    const db = firestoreFals({ socis: { s12: SOCI_12 } });
    await expect(importa({ ...base({ dirBackups: backups(false) }), db, files: FILES, apply: true })).rejects.toThrow(/còpia/);
    expect(db.escriptures).toEqual([]);
  });

  it('apply: crea el soci nou amb carnet i socisPublic, omple buits de l\'existent i crea la sol·licitud', async () => {
    const db = firestoreFals({ socis: { s12: SOCI_12 } });
    const o = base();
    await importa({ ...o, db, files: FILES, apply: true });
    expect(db.cols.socis.get('s12')).toEqual({ ...SOCI_12, telefon: '600000000' });
    const nou = db.cols.socis.get('nou0');
    expect(nou).toMatchObject({ numeroSoci: 7, nom: 'Laia', ultimPagament: DIA, actiu: true, tokenCarnet: 'tok-nou-0' });
    expect(nou.notaImportacio).toContain('Al dia');
    expect(db.cols.socisPublic.get('tok-nou-0')).toEqual({ numeroSoci: 7, nomPublic: 'Laia P.' });
    expect(db.cols.solicituds.get('nou1')).toMatchObject({ nom: 'Gerard', estat: 'pendent', timestamp: 'TS', importat: true });
    const { canvis } = registre(o.dirBackups);
    expect(canvis).toEqual([
      { tipus: 'camp', coleccio: 'socis', id: 's12', camp: 'telefon', abans: '', despres: '600000000' },
      {
        tipus: 'creat', coleccio: 'socis', id: 'nou0', socisPublic: 'tok-nou-0',
        control: { numeroSoci: 7, nom: 'Laia', cognoms: 'Puig', tokenCarnet: 'tok-nou-0', ultimPagament: DIA, inicPeriode: null, actiu: true },
      },
      { tipus: 'creat', coleccio: 'solicituds', id: 'nou1', control: { nom: 'Gerard', correuElectronic: 'gerard@example.com', estat: 'pendent' } },
    ]);
    expect(readdirSync(join(o.dirBackups, DIA)).sort()).toEqual(['import-excel-registre.json', 'manifest.json']);
  });

  it('és idempotent: la segona execució no escriu res', async () => {
    const db = firestoreFals({ socis: { s12: SOCI_12 } });
    const o = base();
    await importa({ ...o, db, files: FILES, apply: true });
    const escrites = db.escriptures.length;
    const linies = [];
    await importa({ ...o, db, files: FILES, apply: true, log: (l) => linies.push(l) });
    expect(db.escriptures).toHaveLength(escrites);
    expect(linies.join('\n')).toMatch(/No hi havia res a canviar/);
  });

  it('mai reactiva ni marca com a pagat un soci existent (desactivat)', async () => {
    const db = firestoreFals({ socis: { s12: SOCI_12 } });
    await importa({ ...base(), db, files: [fila(12, 'Anna', 'Vidal', { telefon: '6', estatPagament: 'Al dia' })], apply: true });
    const soci = db.cols.socis.get('s12');
    expect(soci).toMatchObject({ actiu: false, ultimPagament: '2025-01-10', inicPeriode: '2025-02-01', tokenCarnet: 'tok-12', dataAlta: '2025-01-10' });
    expect(soci.notaImportacio).toBeUndefined();
    expect(db.cols.socisPublic.size).toBe(0);
  });
});

describe('desfer', () => {
  it('desfà un apply: esborra el que va crear i restableix els camps omplerts', async () => {
    const db = firestoreFals({ socis: { s12: SOCI_12 }, solicituds: { q0: { nom: 'Aliena', estat: 'pendent' } } });
    const o = base();
    await importa({ ...o, db, files: FILES, apply: true });
    const fitxer = join(o.dirBackups, DIA, 'import-excel-registre.json');
    const res = await desfer({ fitxer, db, dirBackups: o.dirBackups, avui: AVUI, esborraCamp: () => ESBORRA, log: () => {} });
    expect(res).toEqual({ restablerts: 3, saltats: 0 });
    expect([...db.cols.socis.keys()]).toEqual(['s12']);
    expect(db.cols.socis.get('s12')).toEqual(SOCI_12);
    expect(db.cols.socisPublic.size).toBe(0);
    expect([...db.cols.solicituds.keys()]).toEqual(['q0']);
  });

  it('salta el que ha canviat després de la importació; el soci i el seu socisPublic, tots dos o cap', async () => {
    for (const camp of ['ultimPagament', 'inicPeriode', 'nom', 'cognoms', 'actiu']) {
      const db = firestoreFals({ socis: { s12: SOCI_12 } });
      const o = base();
      await importa({ ...o, db, files: FILES, apply: true });
      db.cols.socis.get('s12').telefon = '699999999';
      db.cols.socis.get('nou0')[camp] = camp === 'actiu' ? false : 'canviat';
      db.cols.solicituds.get('nou1').estat = 'aprovada';
      const linies = [];
      const fitxer = join(o.dirBackups, DIA, 'import-excel-registre.json');
      const res = await desfer({ fitxer, db, dirBackups: o.dirBackups, avui: AVUI, esborraCamp: () => ESBORRA, log: (l) => linies.push(l) });
      expect(res, camp).toEqual({ restablerts: 0, saltats: 3 });
      expect(db.cols.socis.get('s12').telefon).toBe('699999999');
      expect(db.cols.socis.has('nou0')).toBe(true);
      expect(db.cols.socisPublic.get('tok-nou-0'), camp).toEqual({ numeroSoci: 7, nomPublic: 'Laia P.' });
      expect(db.cols.solicituds.has('nou1')).toBe(true);
      const text = linies.join('\n');
      expect(text).toContain('saltat: socis/s12 telefon ha canviat després de la importació');
      expect(text).toContain(`saltat: socis/nou0 (i socisPublic/tok-nou-0) ha canviat després de la importació (${camp})`);
    }
  });

  it('un soci sense canvis s\'esborra encara que el seu socisPublic ja no hi sigui', async () => {
    const db = firestoreFals();
    const o = base();
    await importa({ ...o, db, files: [FILES[1]], apply: true });
    db.cols.socisPublic.delete('tok-nou-0');
    const res = await desfer({ fitxer: join(o.dirBackups, DIA, 'import-excel-registre.json'), db, dirBackups: o.dirBackups, avui: AVUI, esborraCamp: () => ESBORRA, log: () => {} });
    expect(res).toEqual({ restablerts: 1, saltats: 0 });
    expect(db.cols.socis.size).toBe(0);
  });

  it('un camp absent abans de la importació s\'esborra', async () => {
    const { telefon, ...senseTelefon } = SOCI_12;
    expect(telefon).toBe('');
    const db = firestoreFals({ socis: { s12: senseTelefon } });
    const o = base();
    await importa({ ...o, db, files: [fila(12, 'Anna', 'Vidal', { telefon: '6' })], apply: true });
    expect(registre(o.dirBackups).canvis[0]).toMatchObject({ camp: 'telefon', abans: null, absent: true });
    await desfer({ fitxer: join(o.dirBackups, DIA, 'import-excel-registre.json'), db, dirBackups: o.dirBackups, avui: AVUI, esborraCamp: () => ESBORRA, log: () => {} });
    expect(db.cols.socis.get('s12')).toEqual(senseTelefon);
  });

  it('sense còpia d\'avui no toca res', async () => {
    const db = firestoreFals({ socis: { s12: SOCI_12 } });
    const dir = backups(false);
    const fitxer = join(dir, 'r.json');
    writeFileSync(fitxer, JSON.stringify({ canvis: [{ tipus: 'creat', coleccio: 'socis', id: 's12', control: {} }] }));
    await expect(desfer({ fitxer, db, dirBackups: dir, avui: AVUI, esborraCamp: () => ESBORRA, log: () => {} })).rejects.toThrow(/còpia/);
    expect(db.escriptures).toEqual([]);
  });
});
