// Dades de gestió que només veu l'organització: no es desen a la proposta (que és pública) sinó a
// `propostesInternes`. La vista i els camps són a la fitxa de proposta (pages/Propostes/pestanyes).

export const INTERNA_BUIDA = { preu: '', condicions: '', distribuidoraId: '' };

// El preu i les condicions d'una pel·lícula són els seus si els té i, si no,
// els per defecte de la distribuïdora.
export function dadesEfectives(interna, distribuidora) {
  const propiPreu = interna.preu === '' ? null : Number(interna.preu);
  const propiesCondicions = interna.condicions.trim();
  return {
    preu: propiPreu ?? distribuidora?.preu ?? null,
    preuPerDefecte: propiPreu === null && distribuidora?.preu != null,
    condicions: propiesCondicions || distribuidora?.condicions || '',
    condicionsPerDefecte: !propiesCondicions && Boolean(distribuidora?.condicions),
  };
}
