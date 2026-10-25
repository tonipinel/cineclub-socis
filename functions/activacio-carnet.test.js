import { describe, it, expect, vi } from 'vitest';
import activacio from './activacio-carnet.js';
import * as admin from '../src/lib/estatSoci.js';

const { iniciVigencia, inicPeriodeEnEscanejar, dataMadrid, dataEntrada, activarCarnet } = activacio;

// Paritat amb src/lib/estatSoci.js: la funció en fa una còpia (CommonJS) i ha de donar el mateix en tots els casos.
describe('paritat amb src/lib/estatSoci.js', () => {
  const SOCIS = {
    'alta sense activar': { vigenciaDes: '2026-01-10', ultimPagament: '2026-01-10', modeVigencia: 'primer-escaneig' },
    'alta activada': { vigenciaDes: '2026-01-10', modeVigencia: 'primer-escaneig', inicPeriode: '2026-01-20' },
    'activació d\'una quota anterior': { vigenciaDes: '2026-01-10', modeVigencia: 'primer-escaneig', inicPeriode: '2025-03-01' },
    encadenada: { vigenciaDes: '2026-01-10', modeVigencia: 'encadenada', inicPeriode: null },
    'dades d\'abans sense activar': { ultimPagament: '2026-01-10' },
    'dades d\'abans activades': { ultimPagament: '2026-01-10', inicPeriode: '2026-02-01' },
    'inicPeriode buit': { ultimPagament: '2026-01-10', inicPeriode: '' },
    'sense cap data': { numeroSoci: 3 },
  };
  const DATES = ['2025-12-31', '2026-01-09', '2026-01-10', '2026-01-15', '2026-01-20', '2026-03-01', '2027-02-01'];

  it.each(Object.entries(SOCIS))('%s', (_, soci) => {
    expect(iniciVigencia(soci)).toBe(admin.iniciVigencia(soci));
    for (const data of DATES) expect(inicPeriodeEnEscanejar(soci, data)).toEqual(admin.inicPeriodeEnEscanejar(soci, data));
  });

});

// Matriu generada: inicis al voltant dels canvis d'hora (DST) i de final de mes/any, totes les modalitats i formes
// d'inicPeriode, i dates d'escaneig a ±1 dia de cada data rellevant.
describe('paritat amb src/lib/estatSoci.js (matriu generada)', () => {
  const desplaca = (iso, dies) => {
    const [a, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d + dies)).toISOString().slice(0, 10);
  };
  const INICIS = ['2026-03-29', '2026-10-25', '2026-02-28', '2028-02-29', '2025-12-31', '2026-01-01'];
  const MODES = [undefined, null, 'primer-escaneig', 'encadenada'];
  const socis = [];
  for (const inici of INICIS) {
    const activacions = [undefined, null, '', desplaca(inici, -40), desplaca(inici, -1), inici, desplaca(inici, 1), desplaca(inici, 200)];
    for (const modeVigencia of MODES) {
      for (const inicPeriode of activacions) {
        socis.push({ vigenciaDes: inici, ultimPagament: desplaca(inici, -3), modeVigencia, inicPeriode });
        socis.push({ ultimPagament: inici, modeVigencia, inicPeriode });
      }
    }
  }
  socis.push({}, { vigenciaDes: '', ultimPagament: '' }, { inicPeriode: '2026-01-01' });

  it(`${socis.length} socis × dates al voltant de cada data`, () => {
    let comprovacions = 0;
    for (const soci of socis) {
      const base = [soci.vigenciaDes, soci.ultimPagament, soci.inicPeriode].filter(Boolean);
      const dates = base.flatMap((d) => [-1, 0, 1, 366].map((n) => desplaca(d, n)));
      expect(iniciVigencia(soci)).toBe(admin.iniciVigencia(soci));
      for (const data of [...dates, '2026-03-29', '2026-10-25']) {
        expect(inicPeriodeEnEscanejar(soci, data)).toEqual(admin.inicPeriodeEnEscanejar(soci, data));
        comprovacions += 1;
      }
    }
    expect(comprovacions).toBeGreaterThan(2000);
  });
});

const ts = (iso) => ({ toDate: () => new Date(iso) });

describe('dataMadrid / dataEntrada', () => {
  it('fa servir el dia a Espanya, no a UTC', () => {
    expect(dataMadrid(new Date('2026-07-01T22:30:00Z'))).toBe('2026-07-02');
    expect(dataMadrid(new Date('2026-01-01T22:30:00Z'))).toBe('2026-01-01');
    expect(dataMadrid(new Date('2026-01-01T23:30:00Z'))).toBe('2026-01-02');
  });

  const entrada = { tipus: 'soci', numeroSoci: 7, timestamp: ts('2026-03-01T19:00:00Z'), escanejatPer: 'u1' };

  it('una entrada de soci dona la seva data', () => {
    expect(dataEntrada(entrada)).toBe('2026-03-01');
  });

  it.each([
    ['genèrica', { ...entrada, tipus: 'generic' }],
    ['importada de l\'històric', { ...entrada, escanejatPer: 'importacio-historica' }],
    ['sense número', { ...entrada, numeroSoci: undefined }],
    ['número no vàlid', { ...entrada, numeroSoci: 'abc' }],
    ['número zero', { ...entrada, numeroSoci: 0 }],
    ['sense timestamp', { ...entrada, timestamp: null }],
    ['timestamp no vàlid', { ...entrada, timestamp: { toDate: () => new Date('x') } }],
    ['buida', null],
  ])('%s: no activa res', (_, e) => {
    expect(dataEntrada(e)).toBeNull();
  });

  it('un timestamp posterior a la creació del document no compta: es fa servir la creació', () => {
    const futur = { ...entrada, timestamp: ts('2027-01-01T10:00:00Z') };
    expect(dataEntrada(futur, ts('2026-03-01T19:00:01Z'))).toBe('2026-03-01');
  });
});

// Firestore fals amb la forma de l'Admin SDK i concurrència optimista: si una fitxa llegida canvia abans de confirmar,
// la transacció es torna a executar (com a Firestore).
function firestoreFals(socis = {}) {
  const docs = new Map(Object.entries(socis).map(([id, d]) => [id, { dades: structuredClone(d), versio: 0 }]));
  const actualitzacions = [];
  const ref = (id) => ({ id, path: `socis/${id}` });
  const db = {
    docs,
    actualitzacions,
    intents: 0,
    collection: (nom) => {
      expect(nom).toBe('socis');
      const q = { filtres: [], limit: null };
      const api = {
        where: (camp, op, valor) => { q.filtres.push({ camp, op, valor }); return api; },
        limit: (n) => { q.limit = n; return api; },
        q,
      };
      return api;
    },
    runTransaction: async (fn) => {
      for (;;) {
        db.intents += 1;
        const llegits = new Map();
        const pendents = [];
        const t = {
          get: async ({ q }) => {
            await Promise.resolve();
            const [{ camp, op, valor }] = q.filtres;
            expect(op).toBe('in');
            expect(q.limit).toBe(2);
            const trobats = [...docs].filter(([, d]) => valor.includes(d.dades[camp])).slice(0, q.limit);
            trobats.forEach(([id, d]) => llegits.set(id, d.versio));
            return {
              empty: trobats.length === 0,
              docs: trobats.map(([id, d]) => ({ id, ref: ref(id), data: () => structuredClone(d.dades) })),
            };
          },
          update: (r, canvis) => pendents.push([r.id, canvis]),
        };
        const resultat = await fn(t);
        await Promise.resolve();
        if ([...llegits].some(([id, versio]) => docs.get(id).versio !== versio)) continue;
        for (const [id, canvis] of pendents) {
          const d = docs.get(id);
          d.dades = { ...d.dades, ...canvis };
          d.versio += 1;
          actualitzacions.push([id, canvis]);
        }
        return resultat;
      }
    },
  };
  return db;
}

const logger = () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() });
const ALTA = { numeroSoci: 7, nom: 'Anna', ultimPagament: '2026-01-10', vigenciaDes: '2026-01-10', modeVigencia: 'primer-escaneig' };
const entradaDe = (iso, extra = {}) => ({ tipus: 'soci', numeroSoci: 7, timestamp: ts(iso), escanejatPer: 'taquilla', metode: 'qr', ...extra });
const activar = (db, entrada, id = 'e1') => activarCarnet({ id, entrada, creada: null, db, logger: logger() });

describe('activarCarnet', () => {
  it('primer escaneig d\'una alta: fixa inicPeriode a la data de l\'entrada', async () => {
    const db = firestoreFals({ s7: ALTA });
    await expect(activar(db, entradaDe('2026-02-03T19:00:00Z'))).resolves.toEqual({ sociId: 's7', inicPeriode: '2026-02-03' });
    expect(db.docs.get('s7').dades.inicPeriode).toBe('2026-02-03');
  });

  it('soci d\'abans sense modeVigencia: també s\'activa al primer escaneig', async () => {
    const db = firestoreFals({ s7: { numeroSoci: 7, ultimPagament: '2026-01-10' } });
    await activar(db, entradaDe('2026-02-03T19:00:00Z'));
    expect(db.docs.get('s7').dades.inicPeriode).toBe('2026-02-03');
  });

  it('troba una fitxa antiga amb el número desat en text', async () => {
    const db = firestoreFals({ s7: { ...ALTA, numeroSoci: '7' } });
    await activar(db, entradaDe('2026-02-03T19:00:00Z'));
    expect(db.docs.get('s7').dades.inicPeriode).toBe('2026-02-03');
  });

  it('fa servir el dia a Espanya: un escaneig a les 00:30 del dia 4 (22:30 UTC del 3) és el dia 4', async () => {
    const db = firestoreFals({ s7: ALTA });
    await activar(db, entradaDe('2026-06-03T22:30:00Z'));
    expect(db.docs.get('s7').dades.inicPeriode).toBe('2026-06-04');
  });

  it('ja activat (p. ex. per l\'admin) abans: no escriu res', async () => {
    const db = firestoreFals({ s7: { ...ALTA, inicPeriode: '2026-01-20' } });
    await expect(activar(db, entradaDe('2026-02-03T19:00:00Z'))).resolves.toBeNull();
    expect(db.actualitzacions).toEqual([]);
  });

  it('una activació d\'una quota anterior es substitueix', async () => {
    const db = firestoreFals({ s7: { ...ALTA, inicPeriode: '2025-02-01' } });
    await activar(db, entradaDe('2026-02-03T19:00:00Z'));
    expect(db.docs.get('s7').dades.inicPeriode).toBe('2026-02-03');
  });

  it('quota encadenada o entrada d\'abans de vigenciaDes: no escriu res', async () => {
    const db = firestoreFals({ s7: { ...ALTA, modeVigencia: 'encadenada' }, s8: { ...ALTA, numeroSoci: 8 } });
    await activar(db, entradaDe('2026-02-03T19:00:00Z'));
    await activar(db, entradaDe('2026-01-09T19:00:00Z', { numeroSoci: 8 }));
    expect(db.actualitzacions).toEqual([]);
  });

  it('entrada fora d\'ordre: un cop desada l\'activació, cap entrada no la mou (ni anterior ni posterior)', async () => {
    const db = firestoreFals({ s7: ALTA });
    await activar(db, entradaDe('2026-02-10T19:00:00Z'), 'e2');
    await activar(db, entradaDe('2026-02-03T19:00:00Z'), 'e1');
    await activar(db, entradaDe('2026-02-20T19:00:00Z'), 'e3');
    expect(db.docs.get('s7').dades.inicPeriode).toBe('2026-02-10');
    expect(db.actualitzacions).toEqual([['s7', { inicPeriode: '2026-02-10' }]]);
  });

  it('dues fitxes amb el mateix número: avisa sense dades personals i no escriu', async () => {
    const db = firestoreFals({ s7: ALTA, s7b: { ...ALTA, numeroSoci: '7', nom: 'Altra' } });
    const log = logger();
    await expect(activarCarnet({ id: 'e1', entrada: entradaDe('2026-02-03T19:00:00Z'), db, logger: log })).resolves.toBeNull();
    expect(db.actualitzacions).toEqual([]);
    expect(log.warn).toHaveBeenCalledWith(expect.any(String), { entradaId: 'e1', numeroSoci: 7 });
  });

  it.each([
    ['genèrica', { tipus: 'generic', codiTiquet: 'T-000001' }],
    ['sense número de soci', { numeroSoci: null }],
    ['importada de l\'històric', { escanejatPer: 'importacio-historica' }],
  ])('entrada %s: no llegeix ni escriu res', async (_, extra) => {
    const db = firestoreFals({ s7: ALTA });
    db.runTransaction = vi.fn();
    await expect(activar(db, entradaDe('2026-02-03T19:00:00Z', extra))).resolves.toBeNull();
    expect(db.runTransaction).not.toHaveBeenCalled();
  });

  // El mode prova de la porta no desa cap entrada a l'accessLog (EscaneigPage.test.jsx): no hi ha res a disparar.

  it('sense fitxa per a aquest número, o soci desactivat: no escriu res', async () => {
    const db = firestoreFals({ s8: { ...ALTA, numeroSoci: 8, actiu: false } });
    await expect(activar(db, entradaDe('2026-02-03T19:00:00Z'))).resolves.toBeNull();
    await expect(activar(db, entradaDe('2026-02-03T19:00:00Z', { numeroSoci: 8 }))).resolves.toBeNull();
    expect(db.actualitzacions).toEqual([]);
  });

  it('idempotent: el mateix esdeveniment repetit només escriu una vegada', async () => {
    const db = firestoreFals({ s7: ALTA });
    const e = entradaDe('2026-02-03T19:00:00Z');
    await activar(db, e);
    await activar(db, e);
    expect(db.actualitzacions).toEqual([['s7', { inicPeriode: '2026-02-03' }]]);
  });

  it('concurrència: dues entrades alhora escriuen una sola activació (la de la primera que confirma)', async () => {
    const db = firestoreFals({ s7: ALTA });
    await Promise.all([
      activar(db, entradaDe('2026-02-10T19:00:00Z'), 'e2'),
      activar(db, entradaDe('2026-02-03T19:00:00Z'), 'e1'),
    ]);
    expect(db.actualitzacions).toHaveLength(1);
    expect(['2026-02-03', '2026-02-10']).toContain(db.docs.get('s7').dades.inicPeriode);
    expect(db.intents).toBeGreaterThan(2);
  });

  it('si la transacció falla, ho registra sense dades personals i llança (perquè es reintenti)', async () => {
    const db = firestoreFals({ s7: ALTA });
    const error = Object.assign(new Error('aborted'), { code: 10 });
    db.runTransaction = vi.fn().mockRejectedValue(error);
    const log = logger();
    await expect(activarCarnet({ id: 'e1', entrada: entradaDe('2026-02-03T19:00:00Z'), db, logger: log })).rejects.toBe(error);
    expect(log.error).toHaveBeenCalledWith(expect.any(String), { entradaId: 'e1', numeroSoci: 7, codi: 10 });
  });
});
