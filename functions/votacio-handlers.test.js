import { describe, it, expect } from 'vitest';
import handlers from './votacio-handlers.js';

const { gestionarEstat, gestionarVot, gestionarRanking } = handlers;

function ms(valor) {
  if (valor?.toDate) return valor.toDate().getTime();
  if (valor instanceof Date) return valor.getTime();
  return valor;
}

function clonar(valor) {
  if (!valor || typeof valor !== 'object' || valor instanceof Date || valor.toDate) return valor;
  if (Array.isArray(valor)) return valor.map(clonar);
  return Object.fromEntries(Object.entries(valor).map(([clau, v]) => [clau, clonar(v)]));
}

function fusionar(destinacio, origen) {
  const resultat = { ...destinacio };
  for (const [clau, valor] of Object.entries(origen)) {
    const objecte = valor && typeof valor === 'object' && !(valor instanceof Date) && !valor.toDate;
    resultat[clau] = objecte ? fusionar(resultat[clau] ?? {}, valor) : valor;
  }
  return resultat;
}

function firestoreFals(inicial = {}) {
  const dades = new Map(Object.entries(inicial));
  const instantania = (ruta) => ({
    id: ruta.split('/').pop(),
    exists: dades.has(ruta),
    data: () => (dades.has(ruta) ? clonar(dades.get(ruta)) : undefined),
  });
  const consulta = (ruta, filtres = [], ordres = [], maxim = Infinity) => ({
    where: (camp, op, valor) => consulta(ruta, [...filtres, { camp, op, valor }], ordres, maxim),
    orderBy: (camp, direccio = 'asc') => consulta(ruta, filtres, [...ordres, { camp, direccio }], maxim),
    limit: (n) => consulta(ruta, filtres, ordres, n),
    get: async () => {
      const comparar = { '>': (a, b) => a > b, '<': (a, b) => a < b, '==': (a, b) => a === b };
      let docs = [...dades.keys()]
        .filter((clau) => clau.startsWith(`${ruta}/`) && !clau.slice(ruta.length + 1).includes('/'))
        .filter((clau) =>
          filtres.every(({ camp, op, valor }) => comparar[op](ms(dades.get(clau)[camp]), ms(valor)))
        );
      for (const { camp, direccio } of [...ordres].reverse()) {
        const signe = direccio === 'desc' ? -1 : 1;
        docs.sort((a, b) => signe * (ms(dades.get(a)[camp]) - ms(dades.get(b)[camp])));
      }
      docs = docs.slice(0, maxim);
      return { empty: docs.length === 0, docs: docs.map(instantania) };
    },
  });
  const versions = new Map();
  const referencia = (ruta) => {
    if (ruta.split('/').some((segment) => segment === '.' || segment === '..' || /^__.*__$/.test(segment))) {
      throw new Error('Ruta no vàlida a Firestore.');
    }
    return {
    ruta,
    get: async () => instantania(ruta),
    set: async (valor, { merge = false } = {}) => {
      dades.set(ruta, merge && dades.has(ruta) ? fusionar(dades.get(ruta), valor) : clonar(valor));
      versions.set(ruta, (versions.get(ruta) ?? 0) + 1);
    },
    };
  };
  const db = {
    dades,
    despresDeLlegir: null,
    doc: referencia,
    collection: (ruta) => consulta(ruta),
    runTransaction: async (funcio) => {
      for (let intent = 0; intent < 5; intent += 1) {
        const llegits = new Map();
        const escriptures = [];
        const t = {
          get: async (ref) => {
            if (escriptures.length) throw new Error('Les lectures han d\'anar abans de les escriptures.');
            llegits.set(ref.ruta, versions.get(ref.ruta) ?? 0);
            const snap = await ref.get();
            if (db.despresDeLlegir && intent === 0) {
              const accio = db.despresDeLlegir;
              db.despresDeLlegir = null;
              await accio();
            }
            return snap;
          },
          set: (ref, valor, opcions) => escriptures.push(() => ref.set(valor, opcions)),
        };
        const resultat = await funcio(t);
        if ([...llegits].every(([ruta, versio]) => (versions.get(ruta) ?? 0) === versio)) {
          for (const escriure of escriptures) await escriure();
          return resultat;
        }
      }
      throw new Error('Massa reintents.');
    },
  };
  return db;
}

const ara = new Date('2026-11-01T10:00:00Z');
const dema = new Date('2026-11-02T10:00:00Z');
const ahir = new Date('2026-10-31T10:00:00Z');
const timestamp = (data) => ({ toDate: () => data });

function escenari(extra = {}) {
  return firestoreFals({
    'socisPublic/tok': { numeroSoci: 7 },
    'propostes/p1': { estat: 'aprovada' },
    'propostes/p2': { estat: 'aprovada' },
    'propostes/p3': { estat: 'aprovada' },
    'propostes/p4': { estat: 'pendent' },
    'tandes/t1': {
      nom: 'Tanda 1',
      propostes: ['p1', 'p2', 'p3', 'p4', 'esborrada'],
      tanca: timestamp(dema),
      creada: timestamp(ahir),
    },
    ...extra,
  });
}

const vot = (valors, bloquejat = false) => ({ valors, bloquejat, actualitzat: ahir });

async function codi(promesa) {
  try {
    await promesa;
  } catch (error) {
    return error.codi;
  }
  return null;
}

describe('token', () => {
  it.each([
    ['inexistent', { token: 'nope' }],
    ['absent', {}],
    ['amb barres', { token: 'a/b' }],
    ['punt', { token: '.' }],
    ['dos punts', { token: '..' }],
    ['reservat', { token: '__x__' }],
    ['sense numeroSoci', { token: 'buit' }],
  ])('%s -> permission-denied als tres gestors', async (_, dades) => {
    const db = escenari({ 'socisPublic/buit': {} });
    const complet = { ...dades, tandaId: 't1', propostaId: 'p1', valor: 'like' };
    expect(await codi(gestionarEstat(db, complet, ara))).toBe('permission-denied');
    expect(await codi(gestionarVot(db, complet, ara))).toBe('permission-denied');
    expect(await codi(gestionarRanking(db, complet, ara))).toBe('permission-denied');
  });
});

describe('gestionarEstat', () => {
  it('retorna {tanda: null} si no existeix cap tanda', async () => {
    const db = firestoreFals({ 'socisPublic/tok': { numeroSoci: 7 } });
    expect(await gestionarEstat(db, { token: 'tok' }, ara)).toEqual({ tanda: null });
  });

  it('retorna la tanda oberta amb les propostes efectives, els vots i completa', async () => {
    const db = escenari({ 'tandes/t1/vots/7': vot({ p1: 'like', p4: 'dislike' }) });
    expect(await gestionarEstat(db, { token: 'tok' }, ara)).toEqual({
      tanda: { id: 't1', nom: 'Tanda 1', tanca: dema.toISOString(), tancada: false, propostes: ['p1', 'p2', 'p3'] },
      valors: { p1: 'like' },
      bloquejat: false,
      completa: false,
    });
  });

  it('sense vot previ retorna valors buits', async () => {
    const estat = await gestionarEstat(escenari(), { token: 'tok' }, ara);
    expect(estat).toMatchObject({ valors: {}, bloquejat: false, completa: false });
  });

  it('completa és true quan totes les efectives tenen vot, i reflecteix bloquejat', async () => {
    const db = escenari({ 'tandes/t1/vots/7': vot({ p1: 'like', p2: 'dislike', p3: 'like' }, true) });
    expect(await gestionarEstat(db, { token: 'tok' }, ara)).toMatchObject({ bloquejat: true, completa: true });
  });

  it('si n\'hi ha dues d\'obertes tria la de creada més recent', async () => {
    const db = escenari({
      'tandes/t2': { nom: 'Tanda 2', propostes: ['p1'], tanca: timestamp(dema), creada: timestamp(ara) },
      'tandes/t0': { nom: 'Tanda 0', propostes: ['p1'], tanca: timestamp(dema), creada: timestamp(new Date('2026-10-01')) },
    });
    expect((await gestionarEstat(db, { token: 'tok' }, ara)).tanda.id).toBe('t2');
  });

  it('prefereix la oberta encara que n\'hi hagi una de tancada més recent', async () => {
    const db = escenari({
      'tandes/t2': { nom: 'Tanda 2', propostes: ['p1'], tanca: timestamp(ahir), creada: timestamp(ara) },
    });
    expect((await gestionarEstat(db, { token: 'tok' }, ara)).tanda.id).toBe('t1');
  });

  it('sense cap oberta retorna la darrera tancada amb tancada: true', async () => {
    const db = firestoreFals({
      'socisPublic/tok': { numeroSoci: 7 },
      'propostes/p1': { estat: 'aprovada' },
      'tandes/vella': { nom: 'Vella', propostes: ['p1'], tanca: timestamp(new Date('2026-09-01')), creada: timestamp(new Date('2026-08-01')) },
      'tandes/recent': { nom: 'Recent', propostes: ['p1'], tanca: timestamp(ahir), creada: timestamp(new Date('2026-10-01')) },
      'tandes/recent/vots/7': vot({ p1: 'like' }),
    });
    expect(await gestionarEstat(db, { token: 'tok' }, ara)).toEqual({
      tanda: { id: 'recent', nom: 'Recent', tanca: ahir.toISOString(), tancada: true, propostes: ['p1'] },
      valors: { p1: 'like' },
      bloquejat: false,
      completa: true,
    });
  });
});

describe('gestionarVot', () => {
  const dades = { token: 'tok', tandaId: 't1', propostaId: 'p1', valor: 'like' };

  it('desa el vot a tandes/{id}/vots/{numeroSoci} i retorna el progrés', async () => {
    const db = escenari();
    expect(await gestionarVot(db, dades, ara)).toEqual({ votats: 1, total: 3, completa: false });
    expect(db.dades.get('tandes/t1/vots/7')).toEqual({ valors: { p1: 'like' }, bloquejat: false, actualitzat: ara });
  });

  it('el doble clic no duplica i es poden acumular vots i canviar-los', async () => {
    const db = escenari();
    await gestionarVot(db, dades, ara);
    expect(await gestionarVot(db, dades, ara)).toEqual({ votats: 1, total: 3, completa: false });
    await gestionarVot(db, { ...dades, propostaId: 'p2', valor: 'dislike' }, ara);
    const darrer = await gestionarVot(db, { ...dades, propostaId: 'p1', valor: 'dislike' }, ara);
    expect(darrer).toEqual({ votats: 2, total: 3, completa: false });
    expect(db.dades.get('tandes/t1/vots/7').valors).toEqual({ p1: 'dislike', p2: 'dislike' });
  });

  it('retorna completa en votar l\'última efectiva', async () => {
    const db = escenari({ 'tandes/t1/vots/7': vot({ p1: 'like', p2: 'like' }) });
    expect(await gestionarVot(db, { ...dades, propostaId: 'p3' }, ara)).toEqual({ votats: 3, total: 3, completa: true });
  });

  it('tanda tancada -> failed-precondition', async () => {
    const db = escenari();
    expect(await codi(gestionarVot(db, dades, dema))).toBe('failed-precondition');
    expect(db.dades.has('tandes/t1/vots/7')).toBe(false);
  });

  it('vot bloquejat -> failed-precondition', async () => {
    const db = escenari({ 'tandes/t1/vots/7': vot({ p1: 'like' }, true) });
    expect(await codi(gestionarVot(db, { ...dades, valor: 'dislike' }, ara))).toBe('failed-precondition');
    expect(db.dades.get('tandes/t1/vots/7').valors).toEqual({ p1: 'like' });
  });

  it('proposta fora de la tanda, retirada o valor invàlid -> invalid-argument', async () => {
    const db = escenari();
    expect(await codi(gestionarVot(db, { ...dades, propostaId: 'altra' }, ara))).toBe('invalid-argument');
    expect(await codi(gestionarVot(db, { ...dades, propostaId: 'p4' }, ara))).toBe('invalid-argument');
    expect(await codi(gestionarVot(db, { ...dades, valor: 'meh' }, ara))).toBe('invalid-argument');
  });

  it('tanda inexistent -> not-found; tandaId malformat -> invalid-argument', async () => {
    const db = escenari();
    expect(await codi(gestionarVot(db, { ...dades, tandaId: 'zzz' }, ara))).toBe('not-found');
    for (const tandaId of ['a/b', undefined, '.', '..', '__x__']) {
      expect(await codi(gestionarVot(db, { ...dades, tandaId }, ara))).toBe('invalid-argument');
    }
  });

  it('un bloqueig que arriba entre la lectura i l\'escriptura fa rebutjar el vot', async () => {
    const db = escenari({ 'tandes/t1/vots/7': vot({ p1: 'like', p2: 'like', p3: 'like' }) });
    db.despresDeLlegir = () => db.doc('tandes/t1/vots/7').set({ bloquejat: true }, { merge: true });
    expect(await codi(gestionarVot(db, { ...dades, valor: 'dislike' }, ara))).toBe('failed-precondition');
    expect(db.dades.get('tandes/t1/vots/7').valors.p1).toBe('like');
  });
});

describe('gestionarRanking', () => {
  const dades = { token: 'tok', tandaId: 't1' };
  const complet = vot({ p1: 'like', p2: 'like', p3: 'like' });

  it('oberta i incompleta -> permission-denied sense bloquejar', async () => {
    const db = escenari({ 'tandes/t1/vots/7': vot({ p1: 'like' }) });
    expect(await codi(gestionarRanking(db, dades, ara))).toBe('permission-denied');
    expect(db.dades.get('tandes/t1/vots/7').bloquejat).toBe(false);
  });

  it('oberta i sense cap vot -> permission-denied', async () => {
    expect(await codi(gestionarRanking(escenari(), dades, ara))).toBe('permission-denied');
  });

  it('oberta i completa retorna files i bloqueja els vots (idempotent)', async () => {
    const db = escenari({ 'tandes/t1/vots/7': complet });
    const resposta = await gestionarRanking(db, dades, ara);
    expect(resposta).toEqual({
      tancada: false,
      files: [
        { propostaId: 'p1', percentatge: null },
        { propostaId: 'p2', percentatge: null },
        { propostaId: 'p3', percentatge: null },
      ],
    });
    expect(db.dades.get('tandes/t1/vots/7')).toEqual({ ...complet, bloquejat: true });
    expect(await gestionarRanking(db, dades, ara)).toEqual(resposta);
    expect(db.dades.get('tandes/t1/vots/7').bloquejat).toBe(true);
    expect(await codi(gestionarVot(db, { ...dades, propostaId: 'p1', valor: 'dislike' }, ara))).toBe('failed-precondition');
  });

  it('tancada retorna files encara que sigui incompleta, sense bloquejar ni crear el vot', async () => {
    const db = escenari({ 'tandes/t1/vots/7': vot({ p1: 'like' }) });
    const resposta = await gestionarRanking(db, dades, dema);
    expect(resposta.tancada).toBe(true);
    expect(resposta.files).toHaveLength(3);
    expect(db.dades.get('tandes/t1/vots/7').bloquejat).toBe(false);
    const sense = escenari();
    expect((await gestionarRanking(sense, dades, dema)).tancada).toBe(true);
    expect(sense.dades.has('tandes/t1/vots/7')).toBe(false);
  });

  it('llegeix tots els vots de la tanda i només rànquing de les propostes efectives', async () => {
    const vots = {};
    for (let soci = 1; soci <= 6; soci += 1) {
      const like = soci <= 4;
      vots[`tandes/t1/vots/${soci}`] = vot({ p1: like ? 'like' : 'dislike', p2: 'dislike', p4: 'like' });
    }
    vots['tandes/t1/vots/9'] = { bloquejat: true, actualitzat: ahir };
    const db = escenari({ ...vots, 'tandes/t1/vots/7': complet });
    const { files } = await gestionarRanking(db, dades, ara);
    expect(files).toEqual([
      { propostaId: 'p1', percentatge: 71 },
      { propostaId: 'p2', percentatge: 14 },
      { propostaId: 'p3', percentatge: null },
    ]);
  });

  it('oberta sense propostes efectives i sense vot: rànquing buit i vot bloquejat', async () => {
    const db = escenari({
      'tandes/t1': { nom: 'Buida', propostes: ['p4'], tanca: timestamp(dema), creada: timestamp(ahir) },
    });
    expect(await gestionarRanking(db, dades, ara)).toEqual({ tancada: false, files: [] });
    expect(db.dades.get('tandes/t1/vots/7')).toEqual({ valors: {}, bloquejat: true, actualitzat: ara });
  });

  it('tanda inexistent -> not-found', async () => {
    expect(await codi(gestionarRanking(escenari(), { ...dades, tandaId: 'zzz' }, ara))).toBe('not-found');
  });
});
