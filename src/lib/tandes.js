import { estaActiu } from './estatSoci';
import * as ROUTES from '../constants/routes';

export const aData = (valor) => (typeof valor?.toDate === 'function' ? valor.toDate() : valor);

export function validarTanda({ nom, propostes, tanca }, ara) {
  const errors = {};
  if (!nom?.trim()) errors.nom = 'El nom no pot estar en blanc.';
  if (!propostes?.length) errors.propostes = 'Cal triar almenys una proposta.';
  const dataTanca = aData(tanca);
  if (!dataTanca || !(dataTanca > ara)) errors.tanca = 'Cal indicar un tancament futur.';
  return { valid: Object.keys(errors).length === 0, errors };
}

export function tandaOberta(tandes, ara) {
  const obertes = tandes.filter((t) => aData(t.tanca) > ara);
  if (obertes.length === 0) return null;
  return obertes.reduce((a, b) => (aData(b.creada) > aData(a.creada) ? b : a));
}

export const potCrearTanda = (tandes, ara) => tandaOberta(tandes, ara) === null;

// Mateix criteri que el servidor: només compten les propostes de la tanda que existeixen i són aprovades o programades.
const ESTATS_EFECTIUS = ['aprovada', 'programada'];
export const propostesEfectives = (propostesIds, estatsPerId) => (
  propostesIds.filter((id) => ESTATS_EFECTIUS.includes(estatsPerId[id]))
);

export function resumirResultats(votsDocs, propostesIds) {
  const perProposta = Object.fromEntries(propostesIds.map((id) => [id, { likes: 0, dislikes: 0 }]));
  votsDocs.forEach(({ valors = {} }) => {
    propostesIds.forEach((id) => {
      if (valors[id] === 'like') perProposta[id].likes += 1;
      if (valors[id] === 'dislike') perProposta[id].dislikes += 1;
    });
  });
  return { participants: votsDocs.length, perProposta };
}

export const percentatgeLikes = ({ likes, dislikes }) => (
  likes + dislikes === 0 ? null : Math.round((likes / (likes + dislikes)) * 100)
);

// De millor a pitjor: % de 👍 (el mostrat) descendent, més vots totals primer, ordre de la tanda;
// les propostes sense cap vot (sense %) al final, entre elles per l'ordre de la tanda.
export const ordenarPropostesPerResultat = (propostesIds, perProposta) => (
  propostesIds
    .map((id, posicio) => ({ id, posicio, ...perProposta[id] }))
    .sort((a, b) => (
      (percentatgeLikes(b) ?? -1) - (percentatgeLikes(a) ?? -1)
      || (b.likes + b.dislikes) - (a.likes + a.dislikes)
      || a.posicio - b.posicio
    ))
    .map(({ id }) => id)
);

// Primer els que ja han votat del tot, després els que han començat i, al final, els que encara no han votat.
const ORDRE_ESTAT = { completat: 0, 'en-curs': 1, 'sense-comencar': 2 };

const potVotar = (soci) => Boolean(soci.numeroSoci && soci.tokenCarnet && estaActiu(soci));

export function classificarSocis(socis, votsDocs, propostesIds) {
  const votsPerSoci = new Map(votsDocs.map((v) => [String(v.numeroSoci), v.valors ?? {}]));
  const socisPerNumero = new Map(socis.filter((s) => s.numeroSoci).map((s) => [String(s.numeroSoci), s]));
  const numeros = new Set([
    ...socis.filter(potVotar).map((s) => String(s.numeroSoci)),
    ...votsPerSoci.keys(),
  ]);
  const total = propostesIds.length;

  return [...numeros].map((numero) => {
    const soci = socisPerNumero.get(numero);
    const valors = votsPerSoci.get(numero) ?? {};
    const votats = propostesIds.filter((id) => valors[id] === 'like' || valors[id] === 'dislike').length;
    let estat = 'en-curs';
    if (votats === 0) estat = 'sense-comencar';
    else if (votats === total) estat = 'completat';
    return {
      numeroSoci: Number(numero),
      nom: soci ? `${soci.nom} ${soci.cognoms}`.trim() : '',
      estat,
      votats,
      total,
      valors,
      trobat: Boolean(soci),
      elegible: Boolean(soci) && potVotar(soci),
    };
  })
    .filter((fila) => fila.elegible || fila.votats > 0)
    .sort((a, b) => ORDRE_ESTAT[a.estat] - ORDRE_ESTAT[b.estat] || a.numeroSoci - b.numeroSoci);
}

export function comptarEstats(files) {
  const comptadors = {
    tots: files.length, completat: 0, 'en-curs': 0, 'sense-comencar': 0,
  };
  files.forEach(({ estat }) => { comptadors[estat] += 1; });
  return comptadors;
}

// Resum de l'estat d'una votació; l'usen la pàgina de resultats i el dashboard perquè mostrin sempre els mateixos números.
// { [propostaId]: sessionId } a partir de les sessions (docs amb `id`) que tenen una proposta associada.
// Si diverses sessions comparteixen proposta, tria la de `data` més recent i, en empat, la d'id més baix.
export const sessionsPerProposta = (sessions) => {
  const triades = {};
  sessions.filter((s) => s.propostaId).forEach((s) => {
    const actual = triades[s.propostaId];
    const dataS = s.data ?? '';
    const dataA = actual?.data ?? '';
    if (!actual || dataS > dataA || (dataS === dataA && String(s.id) < String(actual.id))) triades[s.propostaId] = s;
  });
  return Object.fromEntries(Object.entries(triades).map(([propostaId, s]) => [propostaId, s.id]));
};

// Una proposta programada amb sessió porta a la sessió; en qualsevol altre cas, a la fitxa de la proposta.
export function destiFitxaProposta({ propostaId, estat }, sessioPerPropostaId = {}) {
  const sessioId = sessioPerPropostaId[propostaId];
  if (estat === 'programada' && sessioId) return ROUTES.SESSIONS_EDITAR.replace(':id', sessioId);
  return ROUTES.PROPOSTES_EDITAR.replace(':id', propostaId);
}

// `propostes` és un objecte { [id]: { titol, estat, imatgeUrl } } amb els documents de les propostes.
export function resumVotacio({
  tanda, vots, socis, propostes, sessions = [],
}) {
  const sessioPerProposta = sessionsPerProposta(sessions);
  const estatsPropostes = Object.fromEntries(Object.entries(propostes).map(([id, p]) => [id, p.estat]));
  const efectives = propostesEfectives(tanda.propostes, estatsPropostes);
  const { perProposta } = resumirResultats(vots, efectives);
  const files = ordenarPropostesPerResultat(efectives, perProposta).map((id) => ({
    id,
    titol: propostes[id]?.titol ?? id,
    imatgeUrl: propostes[id]?.imatgeUrl || null,
    href: destiFitxaProposta({ propostaId: id, estat: propostes[id]?.estat }, sessioPerProposta),
    ...perProposta[id],
    percent: percentatgeLikes(perProposta[id]),
  }));
  const classificacio = classificarSocis(socis, vots, efectives);
  const comptadors = comptarEstats(classificacio);
  const elegibles = comptarEstats(classificacio.filter((f) => f.elegible));
  const pendents = elegibles['sense-comencar'];
  return {
    efectives,
    files,
    classificacio,
    comptadors,
    total: elegibles.tots,
    participants: elegibles.tots - pendents,
    completats: elegibles.completat,
    pendents,
    percentCompletats: elegibles.tots === 0 ? 0 : Math.round((elegibles.completat / elegibles.tots) * 100),
  };
}
