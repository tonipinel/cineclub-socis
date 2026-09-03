import { doc } from 'firebase/firestore';

export function calcularNomPublic(soci) {
  const cognoms = (soci.cognoms ?? '').trim();
  if (!cognoms) return soci.nom;
  return `${soci.nom} ${cognoms.charAt(0).toUpperCase()}.`;
}

export function ordenarPerVots(propostes) {
  return [...propostes].sort((a, b) => (b.vots ?? 0) - (a.vots ?? 0));
}

function millisTimestamp(proposta) {
  return typeof proposta.timestamp?.toDate === 'function' ? proposta.timestamp.toDate().getTime() : 0;
}

export function ordenarPerData(propostes) {
  return [...propostes].sort((a, b) => millisTimestamp(b) - millisTimestamp(a));
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
