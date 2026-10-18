import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../firebase/firebase';

export const MIDA_MAXIMA_ADJUNT = 10 * 1024 * 1024;

export const ACCEPT_ADJUNT = 'application/pdf,image/*';

export function validarAdjunt(fitxer) {
  if (fitxer.type !== 'application/pdf' && !fitxer.type.startsWith('image/')) {
    return 'El document ha de ser un PDF o una imatge.';
  }
  if (fitxer.size > MIDA_MAXIMA_ADJUNT) {
    return 'El document no pot ocupar més de 10 MB.';
  }
  return null;
}

// El camí no depèn del moviment (encara pot no existir quan es puja), sinó
// d'un identificador aleatori: així el fitxer es pot pujar abans de desar
// el moviment i no es pisa mai amb un altre de mateix nom.
export async function pujarAdjunt(fitxer) {
  const path = `factures/${crypto.randomUUID()}/${fitxer.name}`;
  await uploadBytes(ref(storage, path), fitxer, { contentType: fitxer.type });
  return { path, nom: fitxer.name };
}

export function urlAdjunt(path) {
  return getDownloadURL(ref(storage, path));
}

// Esborrar un fitxer és sempre "best effort": si falla, el pitjor cas és un
// fitxer orfe a Storage, però mai no volem bloquejar el flux del moviment.
export async function eliminarAdjunt(path) {
  try {
    await deleteObject(ref(storage, path));
  } catch {
    // Res més a fer.
  }
}
