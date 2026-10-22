import { estaActiu } from './estatSoci';

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

const ORDRE_ESTAT = { 'en-curs': 0, 'sense-comencar': 1, completat: 2 };

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
