import { describe, it, expect } from 'vitest';
import modul from './proposta.js';

const { crearPropostaAmbDependencies, LIMIT_PER_SOCI_DIA, LIMIT_GLOBAL_DIA } = modul;

const ara = new Date('2026-11-01T10:00:00Z');
const faHores = (h) => new Date(ara.getTime() - h * 60 * 60 * 1000);
const MARCA = 'SERVER_TIMESTAMP';

const ms = (valor) => (valor instanceof Date ? valor.getTime() : valor);

function firestoreFals(inicial = {}) {
  const dades = new Map(Object.entries(inicial));
  let comptador = 0;
  const instantania = (ruta) => ({ id: ruta.split('/').pop(), exists: dades.has(ruta), data: () => dades.get(ruta) });
  const comparar = {
    '==': (a, b) => a === b,
    '>=': (a, b) => a != null && ms(a) >= ms(b),
    in: (a, b) => b.includes(a),
  };
  const consultes = [];
  const consulta = (ruta, filtres = [], maxim = Infinity) => ({
    where: (camp, op, valor) => consulta(ruta, [...filtres, { camp, op, valor }], maxim),
    limit: (n) => consulta(ruta, filtres, n),
    doc: () => ({ ruta: `${ruta}/auto${++comptador}`, id: `auto${comptador}` }),
    get: async () => {
      consultes.push({ ruta, filtres, maxim });
      return {
        docs: [...dades.keys()]
          .filter((clau) => clau.startsWith(`${ruta}/`) && !clau.slice(ruta.length + 1).includes('/'))
          .filter((clau) => filtres.every(({ camp, op, valor }) => comparar[op](dades.get(clau)[camp], valor)))
          .slice(0, maxim)
          .map(instantania),
      };
    },
  });
  return {
    dades,
    consultes,
    doc: (ruta) => ({ ruta, get: async () => instantania(ruta) }),
    collection: (ruta) => consulta(ruta),
    runTransaction: async (funcio) => {
      const escriptures = [];
      const t = {
        get: (q) => q.get(),
        create: (ref, valor) => escriptures.push([ref.ruta, valor]),
      };
      const resultat = await funcio(t);
      for (const [ruta, valor] of escriptures) {
        if (dades.has(ruta)) throw new Error('Ja existeix.');
        dades.set(ruta, valor);
      }
      return resultat;
    },
  };
}

const escenari = (extra = {}) => firestoreFals({
  'socisPublic/tok': { numeroSoci: 7, nomPublic: 'Isabel M.' },
  ...extra,
});

const crear = (db, dades) => crearPropostaAmbDependencies({ db, marcaTemps: () => MARCA }, dades, ara);
const VALIDA = { token: 'tok', titol: "L'endemà", any: '1990', tmdbId: 11, comentari: ' Una joia ' };

const propostesDe = (db) => [...db.dades].filter(([ruta]) => ruta.startsWith('propostes/'));
const activitatDe = (db) => [...db.dades].filter(([ruta]) => ruta.startsWith('propostesActivitat/'));

async function codiError(promesa) {
  try {
    await promesa;
  } catch (error) {
    return error.codi;
  }
  return 'cap error';
}

describe('crearProposta: identitat', () => {
  it.each([
    ['sense token', undefined],
    ['token buit', ''],
    ['token desconegut', 'altre'],
    ['token amb barra', 'socisPublic/tok'],
    ['token que no és text', { a: 1 }],
  ])('rebutja %s', async (_, token) => {
    const db = escenari();
    expect(await codiError(crear(db, { ...VALIDA, token }))).toBe('permission-denied');
    expect(propostesDe(db)).toEqual([]);
  });

  it('rebutja un soci desactivat (sense document a socisPublic)', async () => {
    const db = firestoreFals({ 'socisPublic/vell': { nomPublic: 'Sense número' } });
    expect(await codiError(crear(db, { ...VALIDA, token: 'vell' }))).toBe('permission-denied');
  });

  it('el número de soci i el nom surten de socisPublic, no del client', async () => {
    const db = escenari();
    const { id } = await crear(db, { ...VALIDA, numeroSoci: 99, nomProposant: 'Algú altre' });
    expect(db.dades.get(`propostes/${id}`)).toMatchObject({ numeroSoci: 7, nomProposant: 'Isabel M.' });
  });
});

describe('crearProposta: document desat', () => {
  it('desa la mateixa forma que escrivia el client i registra l\'activitat', async () => {
    const db = escenari();
    const { id } = await crear(db, VALIDA);
    expect(db.dades.get(`propostes/${id}`)).toEqual({
      titol: "L'endemà", any: '1990', tmdbId: 11, comentari: 'Una joia', numeroSoci: 7, nomProposant: 'Isabel M.',
      estat: 'pendent', timestamp: MARCA,
    });
    expect(activitatDe(db).map(([, valor]) => valor)).toEqual([
      { tipus: 'proposta_creada', propostaId: id, numeroSoci: 7, timestamp: MARCA },
    ]);
  });

  it('ignora els camps que no són de la proposta (estat, imatges, campsEditats...)', async () => {
    const db = escenari();
    const { id } = await crear(db, {
      ...VALIDA, estat: 'aprovada', imatgeUrl: 'https://dolent', trailerUrl: 'x', campsEditats: ['titol'], timestamp: 1,
    });
    const desada = db.dades.get(`propostes/${id}`);
    expect(desada.estat).toBe('pendent');
    expect(desada.timestamp).toBe(MARCA);
    expect(Object.keys(desada).sort()).toEqual(
      ['any', 'comentari', 'estat', 'nomProposant', 'numeroSoci', 'timestamp', 'titol', 'tmdbId']
    );
  });

  it('sense tmdbId ni comentari, accepta un títol i un enllaç http(s)', async () => {
    const db = escenari();
    const { id } = await crear(db, { token: 'tok', titol: '  Una pel·lícula  ', enllac: 'https://example.com/fitxa' });
    expect(db.dades.get(`propostes/${id}`)).toEqual({
      titol: 'Una pel·lícula', comentari: '', enllac: 'https://example.com/fitxa', numeroSoci: 7,
      nomProposant: 'Isabel M.', estat: 'pendent', timestamp: MARCA,
    });
  });
});

describe('crearProposta: validació', () => {
  it.each([
    ['sense títol', { titol: undefined }],
    ['títol buit', { titol: '   ' }],
    ['títol que no és text', { titol: 42 }],
    ['títol massa llarg', { titol: 'a'.repeat(201) }],
    ['comentari massa llarg', { comentari: 'a'.repeat(1001) }],
    ['comentari que no és text', { comentari: ['x'] }],
    ['any que no és de 4 xifres', { any: '19900' }],
    ['any numèric', { any: 1990 }],
    ['enllaç javascript:', { enllac: 'javascript:alert(1)' }],
    ['enllaç data:', { enllac: 'data:text/html,hola' }],
    ['enllaç que no és URL', { enllac: 'no és un enllaç' }],
    ['enllaç massa llarg', { enllac: `https://x.com/${'a'.repeat(500)}` }],
  ])('rebutja %s', async (_, canvi) => {
    const db = escenari();
    expect(await codiError(crear(db, { ...VALIDA, ...canvi }))).toBe('invalid-argument');
    expect(propostesDe(db)).toEqual([]);
  });

  it.each([
    ['ruta relativa', '../x'],
    ['paràmetres', '1?x=2'],
    ['text numèric', '11'],
    ['decimal', 1.5],
    ['zero', 0],
    ['negatiu', -3],
    ['enorme', 1e12],
    ['no segur', Number.MAX_SAFE_INTEGER + 2],
    ['objecte', { id: 1 }],
  ])('rebutja un tmdbId %s', async (_, tmdbId) => {
    const db = escenari();
    expect(await codiError(crear(db, { ...VALIDA, tmdbId }))).toBe('invalid-argument');
    expect(propostesDe(db)).toEqual([]);
  });
});

describe('crearProposta: límits', () => {
  const propostesRecents = (n, numeroSoci, hores = 1) => Object.fromEntries(
    Array.from({ length: n }, (_, i) => [`propostes/r${numeroSoci}-${i}`,
      { titol: `Altra ${numeroSoci}-${i}`, numeroSoci, estat: 'rebutjada', timestamp: faHores(hores) }])
  );

  it(`un soci no pot fer més de ${LIMIT_PER_SOCI_DIA} propostes en 24 hores`, async () => {
    const db = escenari(propostesRecents(LIMIT_PER_SOCI_DIA, 7));
    expect(await codiError(crear(db, VALIDA))).toBe('resource-exhausted');
    expect(activitatDe(db)).toEqual([]);
  });

  it('les propostes de fa més de 24 hores no compten', async () => {
    const db = escenari(propostesRecents(LIMIT_PER_SOCI_DIA, 7, 25));
    await expect(crear(db, VALIDA)).resolves.toHaveProperty('id');
  });

  it('les propostes d\'altres socis no compten per al límit del soci', async () => {
    const db = escenari(propostesRecents(LIMIT_PER_SOCI_DIA, 8));
    await expect(crear(db, VALIDA)).resolves.toHaveProperty('id');
  });

  it(`entre tots no es poden fer més de ${LIMIT_GLOBAL_DIA} propostes en 24 hores`, async () => {
    const extra = {};
    for (let soci = 100; Object.keys(extra).length < LIMIT_GLOBAL_DIA; soci += 1) Object.assign(extra, propostesRecents(1, soci));
    const db = escenari(extra);
    expect(await codiError(crear(db, VALIDA))).toBe('resource-exhausted');
  });

  it('la consulta del límit global llegeix com a molt un document més del límit', async () => {
    const extra = {};
    for (let soci = 100; Object.keys(extra).length < LIMIT_GLOBAL_DIA + 10; soci += 1) Object.assign(extra, propostesRecents(1, soci));
    const db = escenari(extra);
    expect(await codiError(crear(db, VALIDA))).toBe('resource-exhausted');
    const global = db.consultes.find(({ filtres }) => filtres.some(({ camp }) => camp === 'timestamp'));
    expect(global.maxim).toBe(LIMIT_GLOBAL_DIA + 1);
  });

  it('per sota del límit global es pot proposar', async () => {
    const extra = {};
    for (let soci = 100; Object.keys(extra).length < LIMIT_GLOBAL_DIA - 1; soci += 1) Object.assign(extra, propostesRecents(1, soci));
    await expect(crear(escenari(extra), VALIDA)).resolves.toHaveProperty('id');
  });
});

describe('crearProposta: duplicats', () => {
  it.each(['pendent', 'aprovada'])('rebutja la mateixa pel·lícula de TMDB si ja n\'hi ha una %s', async (estat) => {
    const db = escenari({ 'propostes/p1': { titol: 'Títol diferent', tmdbId: 11, estat, timestamp: faHores(100) } });
    expect(await codiError(crear(db, VALIDA))).toBe('already-exists');
  });

  it('rebutja el mateix títol normalitzat (majúscules, accents, puntuació), també el títol local', async () => {
    const db = escenari({
      'propostes/p1': { titol: 'Altre', titolLocal: "L'ENDEMA!", estat: 'pendent', timestamp: faHores(100) },
    });
    expect(await codiError(crear(db, { ...VALIDA, tmdbId: undefined }))).toBe('already-exists');
  });

  it('dues pel·lícules amb el mateix títol però tmdbId diferent no són duplicades (Dune 1984 i Dune 2021)', async () => {
    const db = escenari({ 'propostes/p1': { titol: 'Dune', any: '1984', tmdbId: 841, estat: 'aprovada', timestamp: faHores(100) } });
    await expect(crear(db, { ...VALIDA, titol: 'Dune', any: '2021', tmdbId: 438631 })).resolves.toHaveProperty('id');
  });

  it('si una de les dues no té tmdbId, compara el títol normalitzat', async () => {
    const senseTmdb = escenari({ 'propostes/p1': { titol: 'DUNE', estat: 'pendent', timestamp: faHores(100) } });
    expect(await codiError(crear(senseTmdb, { ...VALIDA, titol: 'Dune', tmdbId: 438631 }))).toBe('already-exists');
    const ambTmdb = escenari({ 'propostes/p1': { titol: 'Dune', tmdbId: 841, estat: 'pendent', timestamp: faHores(100) } });
    const { tmdbId, ...senseId } = VALIDA;
    expect(tmdbId).toBe(11);
    expect(await codiError(crear(ambTmdb, { ...senseId, titol: 'dune' }))).toBe('already-exists');
  });

  it.each(['rebutjada', 'programada'])('permet tornar a proposar una pel·lícula %s', async (estat) => {
    const db = escenari({ 'propostes/p1': { titol: "L'endemà", tmdbId: 11, estat, timestamp: faHores(100) } });
    await expect(crear(db, VALIDA)).resolves.toHaveProperty('id');
  });
});
