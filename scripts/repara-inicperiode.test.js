// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  llegirOpcions, planificar, comprovarCopia, executar, desfer,
} from './repara-inicperiode.mjs';

const AVUI = new Date('2026-10-25T10:00:00Z');
const ESBORRAR = Symbol('esborrar');
const ts = (iso) => ({ toDate: () => new Date(iso) });

// Firestore fals amb la forma de l'Admin SDK per a `socis` i `accessLog`.
function firestoreFals({ socis = {}, accessLog = {} } = {}) {
  const estat = { socis: structuredClone(socis), accessLog, escriptures: 0, consultes: [] };
  const docsDe = (nom) => Object.entries(estat[nom]).map(([id, dades]) => ({
    id, data: () => (nom === 'socis' ? structuredClone(dades) : dades), createTime: dades.creada ?? null,
  }));
  const col = (nom) => {
    const api = {
      where: (camp, op, valor) => { estat.consultes.push({ nom, camp, op, valor }); return api; },
      select: () => api,
      get: async () => {
        const docs = docsDe(nom);
        const filtre = estat.consultes.findLast((c) => c.nom === nom);
        return { docs: filtre ? docs.filter((d) => d.data()[filtre.camp] === filtre.valor) : docs };
      },
      doc: (id) => ({
        nom, id, get: async () => ({ exists: id in estat[nom], data: () => structuredClone(estat[nom][id]) }),
      }),
    };
    return api;
  };
  return {
    estat,
    collection: col,
    batch: () => {
      const ops = [];
      const b = {
        update: (r, canvis) => {
          ops.push(() => {
            for (const [k, v] of Object.entries(canvis)) {
              if (v === ESBORRAR) delete estat[r.nom][r.id][k];
              else estat[r.nom][r.id][k] = v;
            }
          });
          return b;
        },
        commit: async () => { ops.forEach((op) => { op(); estat.escriptures += 1; }); },
      };
      return b;
    },
  };
}

const SOCIS = {
  // Alta escanejada per la taquilla el 2026-02-03 (i després): s'ha d'activar.
  a: { numeroSoci: 12, nom: 'Anna', dni: '12345678Z', ultimPagament: '2026-01-10', vigenciaDes: '2026-01-10', modeVigencia: 'primer-escaneig' },
  // Soci d'abans (sense modeVigencia) amb una activació d'una quota anterior: també.
  b: { numeroSoci: 13, nom: 'Marc', ultimPagament: '2025-09-01', inicPeriode: '2024-09-10' },
  // Ja activat (per l'admin) el mateix dia de la primera entrada: no es toca.
  c: { numeroSoci: 14, ultimPagament: '2026-01-10', vigenciaDes: '2026-01-10', modeVigencia: 'primer-escaneig', inicPeriode: '2026-02-03' },
  // Activat més tard que la primera entrada: informatiu, no es toca.
  d: { numeroSoci: 15, ultimPagament: '2026-01-10', vigenciaDes: '2026-01-10', modeVigencia: 'primer-escaneig', inicPeriode: '2026-03-01' },
  // Encadenada: no té activació.
  e: { numeroSoci: 16, ultimPagament: '2026-01-10', vigenciaDes: '2026-01-10', modeVigencia: 'encadenada' },
  // Només entrades d'abans de la quota: no es toca.
  f: { numeroSoci: 17, ultimPagament: '2026-05-01', vigenciaDes: '2026-05-01', modeVigencia: 'primer-escaneig' },
  // Desactivat.
  g: { numeroSoci: 18, ultimPagament: '2026-01-10', vigenciaDes: '2026-01-10', modeVigencia: 'primer-escaneig', actiu: false },
  // Número repetit.
  h1: { numeroSoci: 19, ultimPagament: '2026-01-10', vigenciaDes: '2026-01-10', modeVigencia: 'primer-escaneig' },
  h2: { numeroSoci: '19', ultimPagament: '2026-01-10' },
  // Sense número.
  i: { numeroSoci: null, ultimPagament: '2026-01-10' },
};

const entrada = (numeroSoci, iso, extra = {}) => ({
  tipus: 'soci', numeroSoci, timestamp: ts(iso), escanejatPer: 'taquilla', ...extra,
});

const ACCESS_LOG = {
  l1: entrada(12, '2026-02-10T19:00:00Z'),
  l2: entrada(12, '2026-02-03T19:00:00Z'),
  l3: entrada(12, '2026-01-05T19:00:00Z'),
  l4: entrada(12, '2026-01-12T19:00:00Z', { escanejatPer: 'importacio-historica' }),
  l5: { tipus: 'generic', codiTiquet: 'T-000001', timestamp: ts('2026-01-11T19:00:00Z') },
  l6: entrada(13, '2025-08-20T19:00:00Z'),
  l7: entrada(13, '2025-10-01T22:30:00Z'), // 00:30 del 2 d'octubre a Espanya
  l8: entrada(14, '2026-02-03T19:00:00Z'),
  l9: entrada(15, '2026-02-03T19:00:00Z'),
  l10: entrada(16, '2026-02-03T19:00:00Z'),
  l11: entrada(17, '2026-04-01T19:00:00Z'),
  l12: entrada(18, '2026-02-03T19:00:00Z'),
  l13: entrada(19, '2026-02-03T19:00:00Z'),
};

function copiaDAvui() {
  const dir = mkdtempSync(join(tmpdir(), 'backups-'));
  mkdirSync(join(dir, '2026-10-25'));
  writeFileSync(join(dir, '2026-10-25', 'manifest.json'), '{}');
  return dir;
}

const registreDe = (dir) => join(dir, '2026-10-25', 'repara-inicperiode.json');
const silenci = () => {};
const docs = (objecte) => Object.entries(objecte).map(([id, dades]) => ({ id, data: () => dades, createTime: null }));

describe('llegirOpcions', () => {
  it('per defecte és informe', () => expect(llegirOpcions([])).toEqual({ apply: false, desfer: null }));
  it('--apply i --desfer', () => {
    expect(llegirOpcions(['--apply'])).toEqual({ apply: true, desfer: null });
    expect(llegirOpcions(['--desfer', 'f.json'])).toEqual({ apply: false, desfer: 'f.json' });
  });
  it('rebutja opcions desconegudes, incompletes o combinades', () => {
    expect(() => llegirOpcions(['--x'])).toThrow();
    expect(() => llegirOpcions(['--desfer'])).toThrow();
    expect(() => llegirOpcions(['--apply', '--desfer', 'f'])).toThrow();
  });
});

describe('planificar', () => {
  const pla = planificar(docs(SOCIS), docs(ACCESS_LOG), AVUI);

  it('llista només els socis afectats, amb la primera entrada vàlida des de l\'inici de la quota', () => {
    expect(pla.corregir.map(({ id, numeroSoci, inicPeriode, anterior }) => ({ id, numeroSoci, inicPeriode, anterior }))).toEqual([
      { id: 'a', numeroSoci: 12, inicPeriode: '2026-02-03', anterior: { absent: true } },
      { id: 'b', numeroSoci: 13, inicPeriode: '2025-10-02', anterior: { valor: '2024-09-10' } },
    ]);
  });

  it('dona la diferència de venciment en dies i si passa a vençut', () => {
    expect(pla.corregir[0]).toMatchObject({ vencimentAbans: '2027-01-10', vencimentDespres: '2027-02-03', dies: 24, passaAVencut: false });
    expect(pla.corregir[1]).toMatchObject({ vencimentAbans: '2026-09-01', vencimentDespres: '2026-10-02', dies: 31, passaAVencut: false });
  });

  it('informa (sense tocar-los) dels activats més tard que la primera entrada, i separa desactivats i duplicats', () => {
    expect(pla.posteriors).toEqual([{ id: 'd', numeroSoci: 15, dies: -26 }]);
    expect(pla.desactivats).toBe(1);
    expect(pla.duplicats).toEqual([19]);
  });
});

describe('comprovarCopia', () => {
  it('sense la còpia d\'avui falla', () => {
    expect(() => comprovarCopia(mkdtempSync(join(tmpdir(), 'b-')), AVUI)).toThrow(/còpia de seguretat/);
  });
});

describe('executar', () => {
  it('per defecte només informa: no escriu res i l\'informe no porta dades personals', async () => {
    const db = firestoreFals({ socis: SOCIS, accessLog: ACCESS_LOG });
    const linies = [];
    const resum = await executar({ db, avui: AVUI, log: (l) => linies.push(l), dirBackups: mkdtempSync(join(tmpdir(), 'b-')) });
    expect(resum).toMatchObject({ corregir: 2, escrit: false });
    expect(db.estat.escriptures).toBe(0);
    const text = linies.join('\n');
    expect(text).toContain('soci 12: inicPeriode 2026-02-03');
    expect(text).not.toMatch(/Anna|Marc|12345678Z/);
    expect(db.estat.consultes).toContainEqual({ nom: 'accessLog', camp: 'tipus', op: '==', valor: 'soci' });
  });

  it('--apply sense la còpia d\'avui no escriu res', async () => {
    const db = firestoreFals({ socis: SOCIS, accessLog: ACCESS_LOG });
    const dir = mkdtempSync(join(tmpdir(), 'b-'));
    await expect(executar({ db, apply: true, avui: AVUI, log: silenci, dirBackups: dir })).rejects.toThrow(/còpia/);
    expect(db.estat.escriptures).toBe(0);
    expect(existsSync(registreDe(dir))).toBe(false);
  });

  it('--apply amb la còpia escriu, deixa el registre i és idempotent', async () => {
    const db = firestoreFals({ socis: SOCIS, accessLog: ACCESS_LOG });
    const dir = copiaDAvui();
    await expect(executar({ db, apply: true, avui: AVUI, log: silenci, dirBackups: dir })).resolves.toMatchObject({ escrit: true });
    expect(db.estat.socis.a.inicPeriode).toBe('2026-02-03');
    expect(db.estat.socis.b.inicPeriode).toBe('2025-10-02');
    expect(db.estat.socis.d.inicPeriode).toBe('2026-03-01');
    expect(db.estat.socis.e.inicPeriode).toBeUndefined();
    const registre = JSON.parse(readFileSync(registreDe(dir), 'utf8'));
    expect(registre.execucions[0].canvis).toEqual([
      { id: 'a', numeroSoci: 12, anterior: { absent: true }, escrit: '2026-02-03' },
      { id: 'b', numeroSoci: 13, anterior: { valor: '2024-09-10' }, escrit: '2025-10-02' },
    ]);
    const escriptures = db.estat.escriptures;
    await expect(executar({ db, apply: true, avui: AVUI, log: silenci, dirBackups: dir })).resolves.toMatchObject({ corregir: 0, escrit: false });
    expect(db.estat.escriptures).toBe(escriptures);
  });
});

describe('desfer', () => {
  it('torna al valor anterior (o esborra el camp) només les fitxes que no han canviat', async () => {
    const db = firestoreFals({ socis: SOCIS, accessLog: ACCESS_LOG });
    const dir = copiaDAvui();
    await executar({ db, apply: true, avui: AVUI, log: silenci, dirBackups: dir });
    db.estat.socis.b.inicPeriode = null; // un pagament nou l'ha netejat
    const resultat = await desfer({ fitxer: registreDe(dir), db, esborrarCamp: ESBORRAR, avui: AVUI, log: silenci, dirBackups: dir });
    expect(resultat).toEqual({ desfets: 1, saltats: 1 });
    expect('inicPeriode' in db.estat.socis.a).toBe(false);
    expect(db.estat.socis.b.inicPeriode).toBeNull();
  });

  it('restaura un valor anterior', async () => {
    const db = firestoreFals({ socis: SOCIS, accessLog: ACCESS_LOG });
    const dir = copiaDAvui();
    await executar({ db, apply: true, avui: AVUI, log: silenci, dirBackups: dir });
    await desfer({ fitxer: registreDe(dir), db, esborrarCamp: ESBORRAR, avui: AVUI, log: silenci, dirBackups: dir });
    expect(db.estat.socis.b.inicPeriode).toBe('2024-09-10');
  });

  it('sense la còpia d\'avui no fa res', async () => {
    const db = firestoreFals({ socis: SOCIS });
    await expect(desfer({ fitxer: 'x.json', db, esborrarCamp: ESBORRAR, avui: AVUI, log: silenci, dirBackups: mkdtempSync(join(tmpdir(), 'b-')) }))
      .rejects.toThrow(/còpia/);
  });
});
