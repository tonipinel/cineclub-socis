import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/firebase';

// `token` és el del carnet d'un soci (formulari públic); l'admin, que ja
// té sessió, no en necessita.
export async function cercarPellicules(consulta, token) {
  const { data } = await httpsCallable(functions, 'cercarPellicules')({ consulta, token });
  return data;
}

export async function assignarPellicula(propostaId, tmdbId, { sobreescriure = false } = {}) {
  const { data } = await httpsCallable(functions, 'assignarPellicula')({ propostaId, tmdbId, sobreescriure });
  return data;
}

// Escenes de TMDB de la proposta com a galeria de la sessió (vegeu functions/galeria-sessio.js).
export async function importarGaleriaSessio(sessioId) {
  const { data } = await httpsCallable(functions, 'importarGaleriaSessio', { timeout: 70_000 })({ sessioId });
  return data;
}
