export const NOM_ORGANITZACIO = 'Organització Cineclub Roda de Berà';

// Les propostes de les persones de l'organització es mostren com a
// proposades per l'associació, no per cap soci en concret.
export function calcularNomPublic(soci) {
  if (soci.organitzacio) return NOM_ORGANITZACIO;
  const cognoms = (soci.cognoms ?? '').trim();
  if (!cognoms) return soci.nom;
  return `${soci.nom} ${cognoms.charAt(0).toUpperCase()}.`;
}

function millisTimestamp(proposta) {
  return typeof proposta.timestamp?.toDate === 'function' ? proposta.timestamp.toDate().getTime() : 0;
}

export function ordenarPerData(propostes) {
  return [...propostes].sort((a, b) => millisTimestamp(b) - millisTimestamp(a));
}
