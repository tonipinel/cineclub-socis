// Els callables de la votació llancen HttpsError: el SDK exposa el codi com a `functions/<codi>`.
export const esCarnetNoValid = (error) => error?.code === 'functions/permission-denied';

export function missatgeError(error, accio = 'vot') {
  switch (error?.code) {
    case 'functions/permission-denied':
      return accio === 'ranking'
        ? 'Cal votar totes les propostes (i tenir un carnet vàlid) per veure el rànquing.'
        : 'Aquest carnet no és vàlid. Torna a escanejar-lo.';
    case 'functions/failed-precondition':
      return 'La tanda és tancada o els teus vots ja estan bloquejats: ja no es poden canviar.';
    case 'functions/invalid-argument':
    case 'functions/not-found':
      return 'Aquesta proposta o tanda ja no està disponible. Recarrega la pàgina.';
    default:
      return "No s'ha pogut completar l'operació. Torna-ho a provar.";
  }
}
