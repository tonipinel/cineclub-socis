import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import porta from './socis-porta.js';
import {
  calcularEstatSoci, calcularVenciment, diesFinsVenciment, estaActiu, inicPeriodeEnEscanejar,
} from '../src/lib/estatSoci.js';

const { CAMPS_PORTA, hashTokenCarnet, idPorta, docPorta, sincronitzarSociPorta } = porta;

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

// Fitxa completa amb totes les dades personals que la porta NO ha de veure.
const SOCI_COMPLET = {
  numeroSoci: 12,
  nom: 'Anna',
  cognoms: 'Vidal',
  dni: '12345678Z',
  telefon: '+34 600 00 00 00',
  correuElectronic: 'anna@example.com',
  adreça: 'Carrer Major, 1',
  adreca: 'Carrer Major, 1',
  poblacio: 'Roda de Berà',
  codiPostal: '43883',
  comentaris: 'Al·lèrgica als gats',
  organitzacio: 'Ateneu',
  grupWhatsapp: true,
  dataAlta: '2024-01-01',
  notaImportacio: 'Excel 2025',
  dataDesactivacio: '2026-02-01',
  reiniciQuota: true,
  tokenCarnet: 'b1946ac9-2f0d-4f2a-9c1e-7d1a2b3c4d5e',
  actiu: false,
  motiuDesactivacio: 'Baixa voluntària',
  ultimPagament: '2026-01-10',
  vigenciaDes: '2026-01-10',
  inicPeriode: '2026-01-20',
  modeVigencia: 'primer-escaneig',
  estatManual: null,
};

describe('hashTokenCarnet', () => {
  it('és el SHA-256 en hexadecimal del token (el mateix que calcula el navegador)', () => {
    expect(hashTokenCarnet('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hashTokenCarnet(SOCI_COMPLET.tokenCarnet)).toBe(sha256(SOCI_COMPLET.tokenCarnet));
  });

  it.each([undefined, null, '', 12, {}])('sense token vàlid (%s) dona null', (token) => {
    expect(hashTokenCarnet(token)).toBeNull();
  });
});

describe('idPorta', () => {
  it.each([[12, '12'], ['41', '41'], [' 7 ', '7']])('el número %j dona l\'id %j', (numeroSoci, id) => {
    expect(idPorta({ numeroSoci })).toBe(id);
  });

  it.each([undefined, null, '', 0, -3, 1.5, 'abc', '12/3'])('sense número vàlid (%j) no hi ha id', (numeroSoci) => {
    expect(idPorta({ numeroSoci })).toBeNull();
  });

  it('sense soci no hi ha id', () => {
    expect(idPorta(null)).toBeNull();
    expect(idPorta(undefined)).toBeNull();
  });
});

describe('docPorta (llista blanca)', () => {
  it('només copia els camps de la llista blanca i el hash del token', () => {
    expect(docPorta(SOCI_COMPLET)).toEqual({
      numeroSoci: 12,
      nom: 'Anna',
      cognoms: 'Vidal',
      actiu: false,
      motiuDesactivacio: 'Baixa voluntària',
      ultimPagament: '2026-01-10',
      vigenciaDes: '2026-01-10',
      inicPeriode: '2026-01-20',
      modeVigencia: 'primer-escaneig',
      estatManual: null,
      tokenHash: sha256(SOCI_COMPLET.tokenCarnet),
    });
  });

  it('cap camp fora de la llista blanca no hi arriba, ni el token en clar', () => {
    const resultat = docPorta(SOCI_COMPLET);
    expect(Object.keys(resultat).sort()).toEqual([...CAMPS_PORTA, 'tokenHash'].sort());
    for (const camp of ['dni', 'telefon', 'correuElectronic', 'adreça', 'adreca', 'poblacio', 'codiPostal', 'comentaris',
      'organitzacio', 'grupWhatsapp', 'dataAlta', 'notaImportacio', 'dataDesactivacio', 'reiniciQuota', 'tokenCarnet']) {
      expect(resultat).not.toHaveProperty(camp);
    }
    expect(JSON.stringify(resultat)).not.toContain(SOCI_COMPLET.tokenCarnet);
    expect(JSON.stringify(resultat)).not.toContain(SOCI_COMPLET.dni);
  });

  it('la llista blanca és exactament la que necessiten estatSoci i la pantalla de la porta', () => {
    expect([...CAMPS_PORTA].sort()).toEqual([
      'actiu', 'cognoms', 'estatManual', 'inicPeriode', 'modeVigencia', 'motiuDesactivacio', 'nom', 'numeroSoci',
      'ultimPagament', 'vigenciaDes',
    ]);
  });

  it('no inventa els camps que la fitxa no té (es comporten igual que a la fitxa)', () => {
    expect(docPorta({ numeroSoci: 3, nom: 'Joan', tokenCarnet: 't' })).toEqual({
      numeroSoci: 3, nom: 'Joan', tokenHash: sha256('t'),
    });
  });

  it('desa el número sempre com a número', () => {
    expect(docPorta({ numeroSoci: '41' }).numeroSoci).toBe(41);
  });

  it('sense token, tokenHash és null', () => {
    expect(docPorta({ numeroSoci: 3 }).tokenHash).toBeNull();
  });

  it('sense número de soci no hi ha document de porta', () => {
    expect(docPorta({ ...SOCI_COMPLET, numeroSoci: '' })).toBeNull();
    expect(docPorta(null)).toBeNull();
  });
});

// La porta calcula l'estat amb les mateixes funcions que l'admin, però sobre el document de porta.
describe('docPorta: mateix estat i venciment que la fitxa sencera', () => {
  const AVUIS = [new Date(2026, 0, 5), new Date(2026, 0, 15), new Date(2026, 5, 1), new Date(2027, 0, 19), new Date(2027, 0, 25)];
  const CASOS = {
    'alta amb activació': SOCI_COMPLET,
    'alta sense activar': { ...SOCI_COMPLET, actiu: true, inicPeriode: undefined },
    'activació d\'una quota anterior': { ...SOCI_COMPLET, actiu: true, inicPeriode: '2025-03-01' },
    encadenada: { ...SOCI_COMPLET, actiu: true, modeVigencia: 'encadenada', inicPeriode: null },
    'dades d\'abans (sense vigenciaDes ni mode)': { numeroSoci: 5, nom: 'A', ultimPagament: '2025-06-01', inicPeriode: '2025-06-20' },
    'pendent manual': { ...SOCI_COMPLET, actiu: true, estatManual: 'pendent' },
    'renovació anticipada': { ...SOCI_COMPLET, actiu: true, vigenciaDes: '2026-06-01', inicPeriode: '2025-05-01' },
    'número en text': { numeroSoci: '9', ultimPagament: '2026-01-01' },
  };

  it.each(Object.entries(CASOS))('%s', (_, soci) => {
    const mirall = docPorta(soci);
    expect(estaActiu(mirall)).toBe(estaActiu(soci));
    for (const avui of AVUIS) {
      const dataAvui = avui.toLocaleDateString('sv-SE');
      expect(inicPeriodeEnEscanejar(mirall, dataAvui)).toEqual(inicPeriodeEnEscanejar(soci, dataAvui));
      const ambActivacio = (s) => ({ ...s, inicPeriode: inicPeriodeEnEscanejar(s, dataAvui) });
      expect(calcularEstatSoci(ambActivacio(mirall), avui)).toBe(calcularEstatSoci(ambActivacio(soci), avui));
      expect(calcularVenciment(ambActivacio(mirall))).toEqual(calcularVenciment(ambActivacio(soci)));
      expect(diesFinsVenciment(ambActivacio(mirall), avui)).toBe(diesFinsVenciment(ambActivacio(soci), avui));
    }
  });
});

// Firestore fals amb la forma de l'Admin SDK: transaccions amb lectures abans d'escriptures.
function firestoreFals(inicial = {}) {
  const docs = new Map(Object.entries(inicial));
  const escriptures = [];
  const ref = (path) => ({ path });
  const snap = (path) => ({
    exists: docs.has(path),
    data: () => (docs.has(path) ? structuredClone(docs.get(path)) : undefined),
    get: (camp) => docs.get(path)?.[camp],
  });
  return {
    docs,
    escriptures,
    doc: ref,
    runTransaction: async (fn) => {
      const pendents = [];
      let escrit = false;
      const t = {
        get: async (r) => {
          if (escrit) throw new Error('lectura després d\'escriptura');
          return snap(r.path);
        },
        set: (r, dades) => { escrit = true; pendents.push(() => docs.set(r.path, structuredClone(dades))); },
        delete: (r) => { escrit = true; pendents.push(() => docs.delete(r.path)); },
      };
      const resultat = await fn(t);
      pendents.forEach((p) => p());
      escriptures.push(...pendents);
      return resultat;
    },
  };
}

const logger = () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() });

describe('sincronitzarSociPorta', () => {
  const soci = { ...SOCI_COMPLET, actiu: true };

  it('crea el document de porta d\'un soci nou', async () => {
    const db = firestoreFals({ 'socis/a': soci });
    await sincronitzarSociPorta({ id: 'a', abans: null, despres: soci, db, logger: logger() });
    expect(db.docs.get('socisPorta/12')).toEqual(docPorta(soci));
  });

  it('l\'actualitza amb l\'estat ACTUAL de la fitxa (els disparadors poden arribar desordenats)', async () => {
    const actual = { ...soci, ultimPagament: '2026-09-01', vigenciaDes: '2026-09-01' };
    const db = firestoreFals({ 'socis/a': actual, 'socisPorta/12': docPorta(soci) });
    await sincronitzarSociPorta({ id: 'a', abans: { ...soci, nom: 'Vell' }, despres: soci, db, logger: logger() });
    expect(db.docs.get('socisPorta/12')).toEqual(docPorta(actual));
  });

  it('és idempotent: repetir el mateix esdeveniment dona el mateix resultat', async () => {
    const db = firestoreFals({ 'socis/a': soci });
    const esdeveniment = { id: 'a', abans: null, despres: soci, db, logger: logger() };
    await sincronitzarSociPorta(esdeveniment);
    const primer = structuredClone(Object.fromEntries(db.docs));
    await sincronitzarSociPorta(esdeveniment);
    expect(Object.fromEntries(db.docs)).toEqual(primer);
  });

  it('si només canvien dades que la porta no veu (telèfon, DNI…), no escriu res', async () => {
    const db = firestoreFals({ 'socis/a': soci, 'socisPorta/12': docPorta(soci) });
    db.runTransaction = vi.fn();
    const resultat = await sincronitzarSociPorta({
      id: 'a', abans: { ...soci, telefon: '1' }, despres: { ...soci, telefon: '2', dni: 'X' }, db, logger: logger(),
    });
    expect(db.runTransaction).not.toHaveBeenCalled();
    expect(resultat).toBeNull();
  });

  it('regenerar el token canvia el hash (el carnet antic deixa de valdre a la porta)', async () => {
    const nou = { ...soci, tokenCarnet: 'token-nou' };
    const db = firestoreFals({ 'socis/a': nou, 'socisPorta/12': docPorta(soci) });
    await sincronitzarSociPorta({ id: 'a', abans: soci, despres: nou, db, logger: logger() });
    expect(db.docs.get('socisPorta/12').tokenHash).toBe(sha256('token-nou'));
  });

  it('en esborrar el soci, esborra el seu document de porta', async () => {
    const db = firestoreFals({ 'socisPorta/12': docPorta(soci) });
    await sincronitzarSociPorta({ id: 'a', abans: soci, despres: null, db, logger: logger() });
    expect(db.docs.has('socisPorta/12')).toBe(false);
  });

  it('si el soci perd el número, esborra el document de porta', async () => {
    const senseNumero = { ...soci, numeroSoci: '' };
    const db = firestoreFals({ 'socis/a': senseNumero, 'socisPorta/12': docPorta(soci) });
    await sincronitzarSociPorta({ id: 'a', abans: soci, despres: senseNumero, db, logger: logger() });
    expect([...db.docs.keys()]).toEqual(['socis/a']);
  });

  it('si canvia el número, esborra el document antic i crea el nou', async () => {
    const nou = { ...soci, numeroSoci: 13 };
    const db = firestoreFals({ 'socis/a': nou, 'socisPorta/12': docPorta(soci) });
    await sincronitzarSociPorta({ id: 'a', abans: soci, despres: nou, db, logger: logger() });
    expect(db.docs.has('socisPorta/12')).toBe(false);
    expect(db.docs.get('socisPorta/13')).toEqual(docPorta(nou));
  });

  it('no esborra el document de porta d\'un ALTRE soci amb el mateix número (número repetit)', async () => {
    const altre = { numeroSoci: 12, nom: 'Marc', tokenCarnet: 'token-del-marc' };
    const db = firestoreFals({ 'socisPorta/12': docPorta(altre) });
    await sincronitzarSociPorta({ id: 'a', abans: soci, despres: null, db, logger: logger() });
    expect(db.docs.get('socisPorta/12')).toEqual(docPorta(altre));
  });

  it('un soci que mai ha tingut número no toca res', async () => {
    const db = firestoreFals({ 'socis/a': { nom: 'Nou' } });
    db.runTransaction = vi.fn();
    await sincronitzarSociPorta({ id: 'a', abans: null, despres: { nom: 'Nou' }, db, logger: logger() });
    expect(db.runTransaction).not.toHaveBeenCalled();
  });

  it('si falla, ho registra només amb l\'id del soci i el codi d\'error (cap dada personal) i llança perquè es reintenti', async () => {
    const db = firestoreFals();
    const error = Object.assign(new Error('unavailable: Anna Vidal'), { code: 14, dades: soci });
    db.runTransaction = vi.fn().mockRejectedValue(error);
    const log = logger();
    await expect(sincronitzarSociPorta({ id: 'a', abans: null, despres: soci, db, logger: log })).rejects.toBe(error);
    expect(log.error).toHaveBeenCalledWith('No s\'ha pogut actualitzar socisPorta', { sociId: 'a', codi: 14 });
    expect(JSON.stringify(log.error.mock.calls)).not.toContain('Anna');
  });

  it('el reintent del mateix esdeveniment repara el document que l\'execució fallida havia deixat desfasat', async () => {
    const pagat = { ...soci, ultimPagament: '2026-10-25', vigenciaDes: '2026-10-25' };
    const db = firestoreFals({ 'socis/a': pagat, 'socisPorta/12': docPorta(soci) });
    const transaccio = db.runTransaction;
    db.runTransaction = vi.fn().mockRejectedValueOnce(Object.assign(new Error('aborted'), { code: 10 }))
      .mockImplementation(transaccio);
    const esdeveniment = { id: 'a', abans: soci, despres: pagat, db, logger: logger() };
    await expect(sincronitzarSociPorta(esdeveniment)).rejects.toThrow('aborted');
    expect(db.docs.get('socisPorta/12')).toEqual(docPorta(soci));
    await sincronitzarSociPorta(esdeveniment);
    expect(db.docs.get('socisPorta/12')).toEqual(docPorta(pagat));
  });
});
