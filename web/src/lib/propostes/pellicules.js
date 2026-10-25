import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase/client.js';

// `token` és el del carnet d'un soci (formulari públic); l'admin, que ja
// té sessió, no en necessita.
export async function cercarPellicules(consulta, token) {
  const { data } = await httpsCallable(functions, 'cercarPellicules')({ consulta, token });
  return data;
}

// La proposta la desa la Cloud Function: el número de soci i el nom surten del carnet (`token`), no d'aquí.
export async function crearProposta(token, { titol, any, tmdbId, comentari }) {
  const { data } = await httpsCallable(functions, 'crearProposta')({ token, titol, any, tmdbId, comentari });
  return data;
}

// Codis de `crearProposta`: el SDK els exposa com a `functions/<codi>`.
export function missatgeErrorProposta(error) {
  switch (error?.code) {
    case 'functions/permission-denied':
      return 'Aquest carnet no és vàlid. Torna a escanejar-lo.';
    case 'functions/already-exists':
      return "Aquesta pel·lícula ja està proposada. Tria'n una altra.";
    case 'functions/resource-exhausted':
      return "S'han enviat massa propostes en poc temps. Torna-ho a provar demà.";
    case 'functions/invalid-argument':
      return 'Revisa les dades de la proposta: alguna no és vàlida.';
    default:
      return "No s'ha pogut enviar la proposta. Torna-ho a provar.";
  }
}

export async function assignarPellicula(propostaId, tmdbId) {
  const { data } = await httpsCallable(functions, 'assignarPellicula')({ propostaId, tmdbId });
  return data;
}
