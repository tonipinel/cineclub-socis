import { describe, it, expect } from 'vitest';
import {
  construirFiles, filtrarFiles, ordenarFiles, agruparPerTanda, recompteEstats,
  llegirParametres, escriureParametres, ESTATS, COLUMNES_ORDRE,
} from './propostesLlistat';
import { sessionsPerProposta } from './tandes';

const avui = new Date('2026-10-23T12:00:00Z');
const ts = (iso) => ({ toDate: () => new Date(iso) });

const tandes = [
  { id: 't1', nom: 'Tanda de tardor', propostes: ['p1', 'p2'], creada: ts('2026-10-01T10:00:00Z'), tanca: ts('2026-11-01T10:00:00Z') },
  { id: 't2', nom: 'Tanda d\'estiu', propostes: ['p1'], creada: new Date('2026-06-01T10:00:00Z'), tanca: new Date('2026-07-01T10:00:00Z') },
  { id: 't3', nom: 'Tanda de primavera', propostes: ['p4'], creada: new Date('2026-03-01T10:00:00Z'), tanca: new Date('2026-04-01T10:00:00Z') },
];
const distribuidores = new Map([
  ['d1', { id: 'd1', nom: 'Golem', preu: 150 }],
  ['d2', { id: 'd2', nom: 'Surtsey' }],
]);
const propostes = [
  { id: 'p1', titol: 'Angel', estat: 'aprovada', nomProposant: 'Marta', timestamp: ts('2026-09-10T10:00:00Z') },
  { id: 'p2', titol: 'Çà i allà', estat: 'pendent', nomProposant: 'Pau', timestamp: new Date('2026-09-20T10:00:00Z') },
  { id: 'p3', titol: 'Drive', estat: 'rebutjada' },
  { id: 'p4', titol: 'Dune', estat: 'programada', nomProposant: 'Àngela', timestamp: ts('2026-08-01T10:00:00Z') },
];
const internes = new Map([
  ['p1', { preu: 200, distribuidoraId: 'd1' }],
  ['p2', { preu: null, distribuidoraId: 'd1' }],
  ['p4', { preu: 9, distribuidoraId: 'd2' }],
]);
const sessions = [
  { id: 's9', titol: 'Altra', propostaId: 'x' },
  { id: 's1', titol: 'Sessió Dune', propostaId: 'p4' },
];

const files = construirFiles({ propostes, internes, distribuidores, tandes, sessions, avui });
const fila = (id) => files.find((f) => f.id === id);
const ids = (llista) => llista.map((f) => f.id);

describe('construirFiles', () => {
  it('ordena les tandes de la proposta: oberta primer i després la que tanca més tard', () => {
    expect(fila('p1').tandes).toEqual([
      { id: 't1', nom: 'Tanda de tardor', oberta: true, tanca: new Date('2026-11-01T10:00:00Z') },
      { id: 't2', nom: 'Tanda d\'estiu', oberta: false, tanca: new Date('2026-07-01T10:00:00Z') },
    ]);
  });

  it('ordena dues tandes tancades per tancament descendent encara que vinguin al revés', () => {
    const f = construirFiles({
      propostes: [{ id: 'p4', titol: 'Dune', estat: 'programada' }],
      internes: new Map(),
      distribuidores: new Map(),
      tandes: [
        { id: 'a', nom: 'A', propostes: ['p4'], creada: new Date('2026-01-01'), tanca: new Date('2026-02-01') },
        { id: 'b', nom: 'B', propostes: ['p4'], creada: new Date('2026-03-01'), tanca: new Date('2026-04-01') },
      ],
      sessions: [],
      avui,
    })[0];
    expect(f.tandes.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('troba la sessió per propostaId', () => {
    expect(fila('p4').sessio).toEqual({ id: 's1', titol: 'Sessió Dune' });
    expect(fila('p1').sessio).toBeNull();
  });

  it('si diverses sessions comparteixen proposta, tria la mateixa que sessionsPerProposta (data més recent; empat → id més baix)', () => {
    const fer = (llista) => construirFiles({
      propostes: [{ id: 'p4', titol: 'Dune', estat: 'programada' }],
      internes: new Map(),
      distribuidores: new Map(),
      tandes: [],
      sessions: llista,
      avui,
    })[0].sessio;
    const perData = [
      { id: 'a', titol: 'Antiga', propostaId: 'p4', data: '2026-01-10' },
      { id: 'c', titol: 'Recent', propostaId: 'p4', data: '2026-03-10' },
      { id: 'b', titol: 'Mitjana', propostaId: 'p4', data: '2026-02-10' },
    ];
    expect(fer(perData)).toEqual({ id: 'c', titol: 'Recent' });
    expect(fer(perData).id).toBe(sessionsPerProposta(perData).p4);
    const empat = [
      { id: 'z', titol: 'Zeta', propostaId: 'p4', data: '2026-03-10' },
      { id: 'm', titol: 'Ema', propostaId: 'p4', data: '2026-03-10' },
    ];
    expect(fer(empat)).toEqual({ id: 'm', titol: 'Ema' });
    expect(fer(empat).id).toBe(sessionsPerProposta(empat).p4);
  });

  it('una proposta sense timestamp té data null; amb timestamp la converteix a Date', () => {
    expect(fila('p3').data).toBeNull();
    expect(fila('p1').data).toEqual(new Date('2026-09-10T10:00:00Z'));
    expect(fila('p2').data).toEqual(new Date('2026-09-20T10:00:00Z'));
  });

  it('sense dades internes ni distribuïdora: distribuidora i preu null', () => {
    expect(fila('p3')).toEqual({
      id: 'p3',
      proposta: propostes[2],
      titol: 'Drive',
      estat: 'rebutjada',
      proposant: '',
      distribuidora: null,
      preu: null,
      preuPerDefecte: false,
      tandes: [],
      sessio: null,
      data: null,
    });
  });

  it('una distribuidoraId inexistent dóna distribuidora null', () => {
    const f = construirFiles({
      propostes: [propostes[0]],
      internes: new Map([['p1', { preu: 5, distribuidoraId: 'zzz' }]]),
      distribuidores,
      tandes: [],
      sessions: [],
      avui,
    })[0];
    expect(f.distribuidora).toBeNull();
    expect(f.preu).toBe(5);
  });

  it('el preu propi preval i el per defecte de la distribuïdora s\'aplica si no n\'hi ha', () => {
    expect(fila('p1')).toMatchObject({ preu: 200, preuPerDefecte: false, distribuidora: { id: 'd1', nom: 'Golem' }, proposant: 'Marta' });
    expect(fila('p2')).toMatchObject({ preu: 150, preuPerDefecte: true });
    expect(fila('p4')).toMatchObject({ preu: 9, preuPerDefecte: false, distribuidora: { id: 'd2', nom: 'Surtsey' } });
  });

  it('un preu en text numèric es converteix a número com fa dadesEfectives', () => {
    const f = construirFiles({
      propostes: [propostes[0]],
      internes: new Map([['p1', { preu: '200', distribuidoraId: '' }]]),
      distribuidores,
      tandes: [],
      sessions: [],
      avui,
    })[0];
    expect(f.preu).toBe(200);
  });

  it('un preu en text no numèric («12,5») no dóna NaN: cau al preu per defecte o a null', () => {
    const dona = (distribuidoraId) => construirFiles({
      propostes: [propostes[0]],
      internes: new Map([['p1', { preu: '12,5', distribuidoraId }]]),
      distribuidores,
      tandes: [],
      sessions: [],
      avui,
    })[0];
    expect(dona('d1')).toMatchObject({ preu: 150, preuPerDefecte: true });
    expect(dona('')).toMatchObject({ preu: null, preuPerDefecte: false });
  });

  describe('dades incompletes', () => {
    const construir = (extra) => construirFiles({
      propostes: [{ id: 'p1', titol: 'Angel', estat: 'aprovada' }],
      internes: new Map(),
      distribuidores,
      tandes: [],
      sessions: [],
      avui,
      ...extra,
    });

    it('una tanda sense `propostes` no peta i no conté cap proposta', () => {
      const [f] = construir({ tandes: [{ id: 'tx', nom: 'Sense llista', tanca: new Date('2026-11-01') }] });
      expect(f.tandes).toEqual([]);
    });

    it('una tanda sense `tanca` es tracta com a tancada, amb tanca null, i va darrere de les altres', () => {
      const [f] = construir({
        tandes: [
          { id: 'sense', nom: 'Sense data', propostes: ['p1'] },
          { id: 'vella', nom: 'Vella', propostes: ['p1'], tanca: new Date('2026-01-01') },
          { id: 'oberta', nom: 'Oberta', propostes: ['p1'], tanca: new Date('2026-12-01') },
        ],
      });
      expect(f.tandes.map((t) => t.id)).toEqual(['oberta', 'vella', 'sense']);
      expect(f.tandes[2]).toEqual({ id: 'sense', nom: 'Sense data', oberta: false, tanca: null });
      expect(agruparPerTanda([f]).map((g) => g.clau)).toEqual(['oberta', 'vella', 'sense']);
    });

    it('una proposta sense `estat` es tracta com a pendent', () => {
      const [f] = construir({ propostes: [{ id: 'p9', titol: 'Sense estat' }] });
      expect(f.estat).toBe('pendent');
      expect(recompteEstats([f])).toEqual({ pendent: 1, aprovada: 0, rebutjada: 0, programada: 0 });
    });

    it('`condicions: null` o absents a les dades internes no peten', () => {
      const [f] = construir({ internes: new Map([['p1', { preu: 7, condicions: null, distribuidoraId: 'd1' }]]) });
      expect(f).toMatchObject({ preu: 7, preuPerDefecte: false });
      const [g] = construir({ internes: new Map([['p1', { preu: null, distribuidoraId: 'd1' }]]) });
      expect(g).toMatchObject({ preu: 150, preuPerDefecte: true });
    });
  });
});

describe('filtrarFiles', () => {
  it('sense filtres retorna totes les files', () => {
    expect(ids(filtrarFiles(files, {}))).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('la cerca ignora majúscules i accents: «ÀNGEL» troba «Angel» i «Àngela»', () => {
    expect(ids(filtrarFiles(files, { cerca: 'ÀNGEL' }))).toEqual(['p1', 'p4']);
  });

  it('cerca pel proposant', () => {
    expect(ids(filtrarFiles(files, { cerca: 'pau' }))).toEqual(['p2']);
  });

  it('cerca pel nom de la distribuïdora', () => {
    expect(ids(filtrarFiles(files, { cerca: 'surts' }))).toEqual(['p4']);
  });

  it('estats buit no dona cap resultat; amb estats només els inclosos', () => {
    expect(filtrarFiles(files, { estats: [] })).toEqual([]);
    expect(ids(filtrarFiles(files, { estats: ['aprovada', 'programada'] }))).toEqual(['p1', 'p4']);
  });

  it('tanda «cap» només les files sense tanda', () => {
    expect(ids(filtrarFiles(files, { tanda: 'cap' }))).toEqual(['p3']);
  });

  it('tanda per id només les files que hi són', () => {
    expect(ids(filtrarFiles(files, { tanda: 't2' }))).toEqual(['p1']);
    expect(ids(filtrarFiles(files, { tanda: 't1' }))).toEqual(['p1', 'p2']);
  });

  it('distribuidora «cap» i per id', () => {
    expect(ids(filtrarFiles(files, { distribuidora: 'cap' }))).toEqual(['p3']);
    expect(ids(filtrarFiles(files, { distribuidora: 'd1' }))).toEqual(['p1', 'p2']);
  });

  it('combina tanda, distribuïdora i estat', () => {
    expect(ids(filtrarFiles(files, { tanda: 't1', distribuidora: 'd1', estats: ['pendent'] }))).toEqual(['p2']);
    expect(filtrarFiles(files, { tanda: 't1', distribuidora: 'd2' })).toEqual([]);
  });
});

describe('ordenarFiles', () => {
  const fix = (id, extra) => ({
    id, titol: id, proposant: '', distribuidora: null, preu: null, estat: 'pendent', tandes: [], sessio: null, data: null, ...extra,
  });

  it('ordena text en català sense distingir accents ni majúscules', () => {
    const entrada = [fix('x', { titol: 'Dune' }), fix('y', { titol: 'Çà i allà' }), fix('z', { titol: 'Angel' })];
    expect(ordenarFiles(entrada, { columna: 'titol', direccio: 'asc' }).map((f) => f.titol)).toEqual(['Angel', 'Çà i allà', 'Dune']);
    expect(ordenarFiles(entrada, { columna: 'titol', direccio: 'desc' }).map((f) => f.titol)).toEqual(['Dune', 'Çà i allà', 'Angel']);
  });

  it('ordena el preu numèricament (9 abans de 100)', () => {
    const entrada = [fix('a', { preu: 100 }), fix('b', { preu: 9 })];
    expect(ids(ordenarFiles(entrada, { columna: 'preu', direccio: 'asc' }))).toEqual(['b', 'a']);
    expect(ids(ordenarFiles(entrada, { columna: 'preu', direccio: 'desc' }))).toEqual(['a', 'b']);
  });

  it('per defecte ordena per data descendent', () => {
    expect(ids(ordenarFiles(files, {}))).toEqual(['p2', 'p1', 'p4', 'p3']);
  });

  it('els absents queden al final tant en asc com en desc', () => {
    const entrada = [
      fix('sense', { preu: null }), fix('car', { preu: 50 }), fix('barat', { preu: 5 }),
    ];
    expect(ids(ordenarFiles(entrada, { columna: 'preu', direccio: 'asc' }))).toEqual(['barat', 'car', 'sense']);
    expect(ids(ordenarFiles(entrada, { columna: 'preu', direccio: 'desc' }))).toEqual(['car', 'barat', 'sense']);
    expect(ids(ordenarFiles(files, { columna: 'data', direccio: 'asc' }))).toEqual(['p4', 'p1', 'p2', 'p3']);
    const proposants = [fix('a', { proposant: '' }), fix('b', { proposant: 'Zoe' }), fix('c', { proposant: 'Ada' })];
    expect(ids(ordenarFiles(proposants, { columna: 'proposant', direccio: 'desc' }))).toEqual(['b', 'c', 'a']);
    expect(ids(ordenarFiles(proposants, { columna: 'proposant', direccio: 'asc' }))).toEqual(['c', 'b', 'a']);
  });

  it('ordena per distribuïdora, tanda i sessió amb els absents al final', () => {
    expect(ids(ordenarFiles(files, { columna: 'distribuidora', direccio: 'asc' }))).toEqual(['p1', 'p2', 'p4', 'p3']);
    expect(ids(ordenarFiles(files, { columna: 'distribuidora', direccio: 'desc' }))).toEqual(['p4', 'p1', 'p2', 'p3']);
    // la primera tanda de p1 i p2 és «Tanda de tardor»; p4 té «Tanda de primavera»
    expect(ids(ordenarFiles(files, { columna: 'tanda', direccio: 'asc' }))).toEqual(['p4', 'p1', 'p2', 'p3']);
    expect(ids(ordenarFiles(files, { columna: 'sessio', direccio: 'desc' }))).toEqual(['p4', 'p1', 'p2', 'p3']);
  });

  it('empata pel títol (ascendent) de manera estable en les dues direccions', () => {
    const entrada = [fix('b', { titol: 'Beta', preu: 10 }), fix('a', { titol: 'Alfa', preu: 10 }), fix('c', { titol: 'Gamma', preu: 1 })];
    expect(ids(ordenarFiles(entrada, { columna: 'preu', direccio: 'asc' }))).toEqual(['c', 'a', 'b']);
    expect(ids(ordenarFiles(entrada, { columna: 'preu', direccio: 'desc' }))).toEqual(['a', 'b', 'c']);
  });

  it('no muta l\'entrada', () => {
    const entrada = [fix('b', { titol: 'B' }), fix('a', { titol: 'A' })];
    const resultat = ordenarFiles(entrada, { columna: 'titol', direccio: 'asc' });
    expect(ids(entrada)).toEqual(['b', 'a']);
    expect(resultat).not.toBe(entrada);
  });
});

describe('agruparPerTanda', () => {
  it('una proposta en dues tandes surt als dos grups; ordre oberta, tancades per tanca desc i «cap» al final', () => {
    const grups = agruparPerTanda(files);
    expect(grups.map((g) => g.clau)).toEqual(['t1', 't2', 't3', 'cap']);
    expect(grups.map((g) => ids(g.files))).toEqual([['p1', 'p2'], ['p1'], ['p4'], ['p3']]);
    expect(grups[0].tanda).toEqual({ id: 't1', nom: 'Tanda de tardor', oberta: true, tanca: new Date('2026-11-01T10:00:00Z') });
    expect(grups[1].tanda.oberta).toBe(false);
    expect(grups[3].tanda).toBeNull();
  });

  it('manté l\'ordre d\'entrada de les files dins cada grup', () => {
    const grups = agruparPerTanda([fila('p2'), fila('p1')]);
    expect(ids(grups[0].files)).toEqual(['p2', 'p1']);
  });

  it('omet les tandes sense files i el grup «cap» si no n\'hi ha', () => {
    const grups = agruparPerTanda([fila('p4')]);
    expect(grups.map((g) => g.clau)).toEqual(['t3']);
  });

  it('una tanda tancada que tanca més tard va abans que una que tanca abans, encara que sigui anterior a l\'entrada', () => {
    const grups = agruparPerTanda([fila('p4'), fila('p1')]);
    expect(grups.map((g) => g.clau)).toEqual(['t1', 't2', 't3']);
  });

  it('sense files retorna []', () => {
    expect(agruparPerTanda([])).toEqual([]);
  });
});

describe('recompteEstats', () => {
  it('compta propostes úniques per estat, amb 0 per als estats sense propostes', () => {
    expect(recompteEstats(files)).toEqual({ pendent: 1, aprovada: 1, rebutjada: 1, programada: 1 });
    expect(recompteEstats([fila('p1')])).toEqual({ pendent: 0, aprovada: 1, rebutjada: 0, programada: 0 });
    expect(recompteEstats([])).toEqual({ pendent: 0, aprovada: 0, rebutjada: 0, programada: 0 });
  });

  it('una proposta present a dues files (dos grups de tanda) compta una sola vegada', () => {
    const repetides = [fila('p1'), fila('p1'), fila('p2')];
    expect(recompteEstats(repetides)).toEqual({ pendent: 1, aprovada: 1, rebutjada: 0, programada: 0 });
  });
});

describe('constants', () => {
  it('exposa els estats i les columnes ordenables', () => {
    expect(ESTATS).toEqual(['pendent', 'aprovada', 'rebutjada', 'programada']);
    expect(COLUMNES_ORDRE).toEqual(['titol', 'proposant', 'distribuidora', 'preu', 'estat', 'tanda', 'sessio', 'data']);
  });
});

describe('llegirParametres / escriureParametres', () => {
  const llistes = { tandes, distribuidores };
  const llegir = (q) => llegirParametres(new URLSearchParams(q), llistes);
  const DEFECTES = {
    vista: 'llista', estats: ESTATS, tanda: 'totes', distribuidora: 'totes', cerca: '', ordre: { columna: 'data', direccio: 'desc' },
  };

  it('retorna els valors per defecte quan no hi ha paràmetres', () => {
    expect(llegir('')).toEqual(DEFECTES);
  });

  it('llegeix valors vàlids', () => {
    expect(llegir('vista=tandes&estat=aprovada,programada&tanda=t1&distribuidora=d2&cerca=angel&ordre=preu:asc')).toEqual({
      vista: 'tandes',
      estats: ['aprovada', 'programada'],
      tanda: 't1',
      distribuidora: 'd2',
      cerca: 'angel',
      ordre: { columna: 'preu', direccio: 'asc' },
    });
    expect(llegir('tanda=cap&distribuidora=cap')).toMatchObject({ tanda: 'cap', distribuidora: 'cap' });
  });

  it('ignora estats desconeguts: només xyz torna tots; barrejat conserva els vàlids', () => {
    expect(llegir('estat=xyz').estats).toEqual(ESTATS);
    expect(llegir('estat=xyz,rebutjada').estats).toEqual(['rebutjada']);
  });

  it('tanda o distribuïdora amb id inexistent cauen a «totes»', () => {
    expect(llegir('tanda=esborrada').tanda).toBe('totes');
    expect(llegir('distribuidora=esborrada').distribuidora).toBe('totes');
  });

  it('ordre invàlid cau a data:desc (columna, direcció o format)', () => {
    const per = { columna: 'data', direccio: 'desc' };
    expect(llegir('ordre=foo:bar').ordre).toEqual(per);
    expect(llegir('ordre=preu:amunt').ordre).toEqual(per);
    expect(llegir('ordre=foo:asc').ordre).toEqual(per);
    expect(llegir('ordre=preu').ordre).toEqual(per);
  });

  it('vista invàlida cau a «llista»', () => {
    expect(llegir('vista=x').vista).toBe('llista');
  });

  it('escriu una URL buida quan tot és per defecte', () => {
    expect(escriureParametres(DEFECTES).toString()).toBe('');
  });

  it('escriu només els paràmetres que no són per defecte', () => {
    const q = escriureParametres({
      ...DEFECTES, vista: 'tandes', estats: ['aprovada', 'programada'], tanda: 't1', cerca: 'àngel', ordre: { columna: 'titol', direccio: 'asc' },
    });
    expect(q.get('vista')).toBe('tandes');
    expect(q.get('estat')).toBe('aprovada,programada');
    expect(q.get('tanda')).toBe('t1');
    expect(q.get('cerca')).toBe('àngel');
    expect(q.get('ordre')).toBe('titol:asc');
    expect(q.has('distribuidora')).toBe(false);
  });

  it('fa l\'anada i tornada: escriure(llegir(x)) reprodueix els paràmetres no per defecte', () => {
    const origen = 'vista=tandes&estat=aprovada&tanda=t2&distribuidora=cap&cerca=dune&ordre=preu%3Aasc';
    const valors = llegir(origen);
    expect(Object.fromEntries(escriureParametres(valors))).toEqual(Object.fromEntries(new URLSearchParams(origen)));
    expect(escriureParametres(llegir('estat=xyz&vista=x&ordre=foo:bar')).toString()).toBe('');
  });

  it('accepta uns defaults personalitzats i omet el que hi coincideix', () => {
    const q = escriureParametres({ ...DEFECTES, vista: 'tandes' }, { ...DEFECTES, vista: 'tandes' });
    expect(q.toString()).toBe('');
  });
});
