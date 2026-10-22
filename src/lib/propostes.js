import { doc } from 'firebase/firestore';

export const NOM_ORGANITZACIO = 'Organització Cineclub Roda de Berà';

// Les propostes de les persones de l'organització es mostren com a
// proposades per l'associació, no per cap soci en concret.
export function calcularNomPublic(soci) {
  if (soci.organitzacio) return NOM_ORGANITZACIO;
  const cognoms = (soci.cognoms ?? '').trim();
  if (!cognoms) return soci.nom;
  return `${soci.nom} ${cognoms.charAt(0).toUpperCase()}.`;
}

export function sincronitzarSociPublic(batch, db, soci) {
  if (!soci.numeroSoci || !soci.tokenCarnet) return;
  batch.set(doc(db, 'socisPublic', String(soci.tokenCarnet)), {
    numeroSoci: Number(soci.numeroSoci),
    nomPublic: calcularNomPublic(soci),
  });
}

export function esborrarSociPublic(batch, db, tokenCarnet) {
  if (!tokenCarnet) return;
  batch.delete(doc(db, 'socisPublic', String(tokenCarnet)));
}
