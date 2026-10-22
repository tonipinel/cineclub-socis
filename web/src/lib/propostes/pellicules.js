import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase/client.js';

// `token` és el del carnet d'un soci (formulari públic); l'admin, que ja
// té sessió, no en necessita.
export async function cercarPellicules(consulta, token) {
  const { data } = await httpsCallable(functions, 'cercarPellicules')({ consulta, token });
  return data;
}

export async function assignarPellicula(propostaId, tmdbId) {
  const { data } = await httpsCallable(functions, 'assignarPellicula')({ propostaId, tmdbId });
  return data;
}
