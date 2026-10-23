import { describe, it, expect } from 'vitest';
import {
  validarTanda, tandaOberta, potCrearTanda, resumirResultats, classificarSocis, comptarEstats, propostesEfectives,
  ordenarPropostesPerResultat, resumVotacio, destiFitxaProposta, sessionsPerProposta,
} from './tandes';

const ARA = new Date('2026-10-22T12:00:00');
const FUTUR = new Date('2026-10-30T20:00:00');
const PASSAT = new Date('2026-10-01T20:00:00');

describe('validarTanda', () => {
  it('accepta una tanda amb nom, propostes i tancament futur', () => {
    expect(validarTanda({ nom: 'Novembre', propostes: ['a'], tanca: FUTUR }, ARA)).toEqual({ valid: true, errors: {} });
  });

  it('exigeix un nom no buit', () => {
    const { valid, errors } = validarTanda({ nom: '   ', propostes: ['a'], tanca: FUTUR }, ARA);
    expect(valid).toBe(false);
    expect(errors.nom).toBeTruthy();
  });

  it('exigeix almenys una proposta', () => {
    const { valid, errors } = validarTanda({ nom: 'Novembre', propostes: [], tanca: FUTUR }, ARA);
    expect(valid).toBe(false);
    expect(errors.propostes).toBeTruthy();
  });

  it('exigeix un tancament futur', () => {
    const { valid, errors } = validarTanda({ nom: 'Novembre', propostes: ['a'], tanca: PASSAT }, ARA);
    expect(valid).toBe(false);
    expect(errors.tanca).toBeTruthy();
  });

  it('no accepta un tancament absent', () => {
    expect(validarTanda({ nom: 'Novembre', propostes: ['a'], tanca: null }, ARA).errors.tanca).toBeTruthy();
  });
});

describe('tandaOberta i potCrearTanda', () => {
  const stamp = (d) => ({ toDate: () => d });
  const oberta = { id: 'o', tanca: stamp(FUTUR), creada: stamp(new Date('2026-10-20')) };
  const altraOberta = { id: 'o2', tanca: FUTUR, creada: new Date('2026-10-21') };
  const tancada = { id: 't', tanca: stamp(PASSAT), creada: stamp(new Date('2026-09-20')) };

  it('retorna l\'única tanda amb tancament futur', () => {
    expect(tandaOberta([tancada, oberta], ARA)).toBe(oberta);
  });

  it('si n\'hi ha diverses, retorna la creada més recentment', () => {
    expect(tandaOberta([oberta, altraOberta], ARA)).toBe(altraOberta);
  });

  it('retorna null si cap no és oberta', () => {
    expect(tandaOberta([tancada], ARA)).toBeNull();
    expect(tandaOberta([], ARA)).toBeNull();
  });

  it('una tanda oberta impedeix crear-ne una altra', () => {
    expect(potCrearTanda([tancada, oberta], ARA)).toBe(false);
  });

  it('sense tandes obertes es pot crear', () => {
    expect(potCrearTanda([tancada], ARA)).toBe(true);
    expect(potCrearTanda([], ARA)).toBe(true);
  });
});

describe('resumirResultats', () => {
  it('compta likes, dislikes i participants per proposta', () => {
    const vots = [
      { numeroSoci: '1', valors: { a: 'like', b: 'dislike' } },
      { numeroSoci: '2', valors: { a: 'like', b: 'like' } },
      { numeroSoci: '3', valors: { a: 'dislike' } },
    ];
    expect(resumirResultats(vots, ['a', 'b'])).toEqual({
      participants: 3,
      perProposta: { a: { likes: 2, dislikes: 1 }, b: { likes: 1, dislikes: 1 } },
    });
  });

  it('ignora els valors de propostes que no són a la tanda', () => {
    const vots = [{ numeroSoci: '1', valors: { a: 'like', x: 'like' } }];
    const { perProposta } = resumirResultats(vots, ['a']);
    expect(perProposta).toEqual({ a: { likes: 1, dislikes: 0 } });
  });

  it('les propostes sense vots surten a zero i un doc sense valors no peta', () => {
    const resum = resumirResultats([{ numeroSoci: '1' }], ['a']);
    expect(resum).toEqual({ participants: 1, perProposta: { a: { likes: 0, dislikes: 0 } } });
  });
});

describe('classificarSocis', () => {
  const soci = (numeroSoci, extra = {}) => ({
    numeroSoci, nom: `Nom${numeroSoci}`, cognoms: `Cognom${numeroSoci}`, tokenCarnet: `tok${numeroSoci}`, ...extra,
  });
  const vot = (numeroSoci, valors) => ({ numeroSoci: String(numeroSoci), valors });
  const PROPOSTES = ['a', 'b', 'c'];

  it('classifica completat, en curs i sense començar amb els seus comptadors', () => {
    const socis = [soci(1), soci(2), soci(3)];
    const vots = [vot(1, { a: 'like', b: 'dislike', c: 'like' }), vot(2, { a: 'like' })];
    const files = classificarSocis(socis, vots, PROPOSTES);
    const perNumero = Object.fromEntries(files.map((f) => [f.numeroSoci, f]));
    expect(perNumero[1]).toMatchObject({ estat: 'completat', votats: 3, total: 3, elegible: true, nom: 'Nom1 Cognom1' });
    expect(perNumero[2]).toMatchObject({ estat: 'en-curs', votats: 1, total: 3, valors: { a: 'like' } });
    expect(perNumero[3]).toMatchObject({ estat: 'sense-comencar', votats: 0, total: 3, valors: {} });
  });

  it('ordena Completats, En curs i Sense començar, i per número de soci dins de cada estat', () => {
    const socis = [soci(5), soci(2), soci(9), soci(7), soci(1)];
    const vots = [
      vot(5, { a: 'like', b: 'like', c: 'like' }),
      vot(1, { a: 'like', b: 'like', c: 'like' }),
      vot(9, { a: 'like' }),
      vot(2, { b: 'dislike' }),
    ];
    expect(classificarSocis(socis, vots, PROPOSTES).map((f) => f.numeroSoci)).toEqual([1, 5, 2, 9, 7]);
  });

  it('ignora els valors de propostes que ja no són a la tanda i els valors no vàlids', () => {
    const files = classificarSocis([soci(1)], [vot(1, { a: 'like', x: 'like', y: 'dislike', b: 'meh' })], PROPOSTES);
    expect(files[0]).toMatchObject({ estat: 'en-curs', votats: 1, total: 3 });
  });

  it('amb 0 propostes ningú no completa i tothom és sense començar', () => {
    const files = classificarSocis([soci(1)], [vot(1, { x: 'like' })], []);
    expect(files[0]).toMatchObject({ estat: 'sense-comencar', votats: 0, total: 0 });
  });

  it('un doc de vot sense valors compta com a sense començar', () => {
    expect(classificarSocis([soci(1)], [{ numeroSoci: '1' }], PROPOSTES)[0]).toMatchObject({ estat: 'sense-comencar', votats: 0 });
  });

  it('un soci inactiu o sense carnet o sense número i sense vot no apareix', () => {
    const socis = [
      soci(1, { actiu: false }),
      soci(2, { tokenCarnet: undefined }),
      soci(3, { tokenCarnet: '' }),
      { nom: 'Sense', cognoms: 'Número', tokenCarnet: 'x' },
      soci(4),
    ];
    expect(classificarSocis(socis, [], PROPOSTES).map((f) => f.numeroSoci)).toEqual([4]);
  });

  it('un soci inactiu amb vot apareix marcat com a no elegible', () => {
    const files = classificarSocis([soci(1, { actiu: false }), soci(2)], [vot(1, { a: 'like' })], PROPOSTES);
    expect(files.find((f) => f.numeroSoci === 1)).toMatchObject({ elegible: false, estat: 'en-curs', nom: 'Nom1 Cognom1' });
    expect(files.find((f) => f.numeroSoci === 2).elegible).toBe(true);
  });

  it('un no elegible amb doc de vot sense valors vàlids no apareix (ni compta com a pendent)', () => {
    const socis = [soci(1, { actiu: false }), soci(2)];
    const vots = [vot(1, { x: 'like' }), { numeroSoci: '9' }];
    const files = classificarSocis(socis, vots, PROPOSTES);
    expect(files.map((f) => f.numeroSoci)).toEqual([2]);
    expect(comptarEstats(files.filter((f) => f.elegible))['sense-comencar']).toBe(1);
  });

  it('indica si el soci s\'ha trobat a la llista de socis', () => {
    const files = classificarSocis([soci(1, { actiu: false })], [vot(1, { a: 'like' }), vot(77, { a: 'like' })], PROPOSTES);
    expect(files.find((f) => f.numeroSoci === 1).trobat).toBe(true);
    expect(files.find((f) => f.numeroSoci === 77).trobat).toBe(false);
  });

  it('un vot d\'un soci que ja no existeix apareix com a no elegible sense nom', () => {
    const files = classificarSocis([], [vot(77, { a: 'dislike' })], PROPOSTES);
    expect(files).toEqual([expect.objectContaining({ numeroSoci: 77, nom: '', elegible: false, estat: 'en-curs' })]);
  });
});

describe('comptarEstats', () => {
  it('compta el total i cada estat', () => {
    const files = [
      { estat: 'completat' }, { estat: 'completat' }, { estat: 'en-curs' }, { estat: 'sense-comencar' },
    ];
    expect(comptarEstats(files)).toEqual({
      tots: 4, completat: 2, 'en-curs': 1, 'sense-comencar': 1,
    });
  });

  it('sense files tot és zero', () => {
    expect(comptarEstats([])).toEqual({
      tots: 0, completat: 0, 'en-curs': 0, 'sense-comencar': 0,
    });
  });
});

describe('propostesEfectives', () => {
  it('conserva només les propostes existents amb estat aprovada o programada, en l\'ordre de la tanda', () => {
    const estats = { p1: 'aprovada', p2: 'rebutjada', p3: 'programada', p4: 'pendent' };
    expect(propostesEfectives(['p3', 'p1', 'p2', 'p4', 'p9'], estats)).toEqual(['p3', 'p1']);
  });

  it('amb la classificació, un soci que ha votat totes les efectives és completat encara que n\'hi hagi una de retirada', () => {
    const efectives = propostesEfectives(['p1', 'p2', 'p3'], { p1: 'aprovada', p2: 'aprovada' });
    const socis = [{ numeroSoci: 12, nom: 'Anna', cognoms: 'Puig', tokenCarnet: 't' }];
    const [fila] = classificarSocis(socis, [{ numeroSoci: 12, valors: { p1: 'like', p2: 'dislike' } }], efectives);
    expect(fila.estat).toBe('completat');
    expect(fila.total).toBe(2);
  });
});

describe('ordenarPropostesPerResultat', () => {
  const resum = (likes, dislikes) => ({ likes, dislikes });

  it('ordena pel % de 👍 descendent', () => {
    const perProposta = { a: resum(1, 3), b: resum(3, 1), c: resum(1, 1) };
    expect(ordenarPropostesPerResultat(['a', 'b', 'c'], perProposta)).toEqual(['b', 'c', 'a']);
  });

  it('en cas d\'empat de % desempata per vots totals i després per l\'ordre de la tanda', () => {
    const perProposta = {
      a: resum(1, 1), b: resum(3, 3), c: resum(2, 2), d: resum(2, 2),
    };
    expect(ordenarPropostesPerResultat(['a', 'c', 'b', 'd'], perProposta)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('les propostes sense cap vot van al final, entre elles per l\'ordre de la tanda', () => {
    const perProposta = { a: resum(0, 0), b: resum(0, 2), c: resum(0, 0), d: resum(1, 0) };
    expect(ordenarPropostesPerResultat(['a', 'b', 'c', 'd'], perProposta)).toEqual(['d', 'b', 'a', 'c']);
  });

  it('no modifica l\'array d\'entrada', () => {
    const ids = ['a', 'b'];
    ordenarPropostesPerResultat(ids, { a: resum(0, 1), b: resum(1, 0) });
    expect(ids).toEqual(['a', 'b']);
  });
});

describe('resumVotacio', () => {
  const socis = Array.from({ length: 64 }, (_, i) => ({
    numeroSoci: i + 1, nom: `Soci${i + 1}`, cognoms: 'X', tokenCarnet: 't',
  }));
  const propostes = {
    p1: { titol: 'Un ours dans le Jura', estat: 'aprovada', imatgeUrl: '/p1.jpg' },
    p2: { titol: 'My Favourite Cake', estat: 'programada' },
    p3: { titol: 'Cinema Paradiso', estat: 'aprovada', imatgeUrl: '' },
    p4: { titol: 'Rebutjada', estat: 'rebutjada' },
  };
  const tanda = { nom: 'Q4 2026', propostes: ['p1', 'p2', 'p3', 'p4', 'p9'] };
  const vots = [
    ...Array.from({ length: 12 }, (_, i) => ({ numeroSoci: i + 1, valors: { p1: 'like', p2: i === 0 ? 'dislike' : 'like', p3: 'like' } })),
    { numeroSoci: 13, valors: { p1: 'like' } },
  ];

  it('compta elegibles, han votat, completats, pendents i el % de completats', () => {
    const r = resumVotacio({ tanda, vots, socis, propostes });
    expect(r.total).toBe(64);
    expect(r.participants).toBe(13);
    expect(r.completats).toBe(12);
    expect(r.pendents).toBe(51);
    expect(r.percentCompletats).toBe(19);
  });

  it('exclou les propostes no efectives i ordena de millor a pitjor', () => {
    const r = resumVotacio({ tanda, vots, socis, propostes });
    expect(r.efectives).toEqual(['p1', 'p2', 'p3']);
    expect(r.files).toEqual([
      { id: 'p1', titol: 'Un ours dans le Jura', imatgeUrl: '/p1.jpg', href: '/propostes/pendents/p1', likes: 13, dislikes: 0, percent: 100 },
      { id: 'p3', titol: 'Cinema Paradiso', imatgeUrl: null, href: '/propostes/pendents/p3', likes: 12, dislikes: 0, percent: 100 },
      { id: 'p2', titol: 'My Favourite Cake', imatgeUrl: null, href: '/propostes/pendents/p2', likes: 11, dislikes: 1, percent: 92 },
    ]);
  });

  it('sense vots: tot pendent, 0% i propostes sense percentatge en l\'ordre de la tanda', () => {
    const r = resumVotacio({ tanda, vots: [], socis, propostes });
    expect(r).toMatchObject({ total: 64, participants: 0, completats: 0, pendents: 64, percentCompletats: 0 });
    expect(r.files).toEqual([
      { id: 'p1', titol: 'Un ours dans le Jura', imatgeUrl: '/p1.jpg', href: '/propostes/pendents/p1', likes: 0, dislikes: 0, percent: null },
      { id: 'p2', titol: 'My Favourite Cake', imatgeUrl: null, href: '/propostes/pendents/p2', likes: 0, dislikes: 0, percent: null },
      { id: 'p3', titol: 'Cinema Paradiso', imatgeUrl: null, href: '/propostes/pendents/p3', likes: 0, dislikes: 0, percent: null },
    ]);
  });

  it('sense socis elegibles el % és 0', () => {
    const r = resumVotacio({ tanda, vots: [], socis: [], propostes });
    expect(r).toMatchObject({ total: 0, pendents: 0, percentCompletats: 0 });
  });
});

describe('destiFitxaProposta i sessionsPerProposta', () => {
  const sessions = [{ id: 's9', propostaId: 'p2' }, { id: 's8' }];

  it('indexa les sessions per proposta, ignorant les que no en tenen', () => {
    expect(sessionsPerProposta(sessions)).toEqual({ p2: 's9' });
  });

  it('amb diverses sessions per proposta tria la de data més recent i, en empat, l\'id més baix', () => {
    expect(sessionsPerProposta([
      { id: 'a', propostaId: 'p1', data: '2026-01-10' },
      { id: 'b', propostaId: 'p1', data: '2026-03-10' },
      { id: 'c', propostaId: 'p1', data: '2026-02-10' },
    ])).toEqual({ p1: 'b' });
    expect(sessionsPerProposta([
      { id: 'z', propostaId: 'p1', data: '2026-03-10' },
      { id: 'm', propostaId: 'p1', data: '2026-03-10' },
    ])).toEqual({ p1: 'm' });
    expect(sessionsPerProposta([
      { id: 'x', propostaId: 'p1' },
      { id: 'y', propostaId: 'p1', data: '2026-03-10' },
    ])).toEqual({ p1: 'y' });
  });

  it.each([
    ['programada amb sessió', { propostaId: 'p2', estat: 'programada' }, '/sessions/s9'],
    ['programada sense sessió', { propostaId: 'p3', estat: 'programada' }, '/propostes/pendents/p3'],
    ['aprovada (encara que tingui sessió)', { propostaId: 'p2', estat: 'aprovada' }, '/propostes/pendents/p2'],
    ['estat desconegut', { propostaId: 'p1', estat: undefined }, '/propostes/pendents/p1'],
  ])('%s', (_, proposta, esperat) => {
    expect(destiFitxaProposta(proposta, sessionsPerProposta(sessions))).toBe(esperat);
  });

  it('resumVotacio assigna la sessió a la proposta programada amb sessió', () => {
    const propostes = { p1: { estat: 'aprovada' }, p2: { estat: 'programada' } };
    const r = resumVotacio({ tanda: { propostes: ['p1', 'p2'] }, vots: [], socis: [], propostes, sessions });
    expect(r.files.map((f) => f.href)).toEqual(['/propostes/pendents/p1', '/sessions/s9']);
  });
});
