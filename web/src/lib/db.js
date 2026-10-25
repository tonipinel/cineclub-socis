import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'cineclub-socis';

let db;
// Accés només de lectura: aquest mòdul no escriu mai a Firestore ni a Storage.
export const getDb = () => {
  if (!db) {
    if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
    db = getFirestore();
    // REST en lloc de gRPC: la primera lectura d'una instància freda no ha d'obrir cap canal gRPC.
    db.settings({ preferRest: true });
  }
  return db;
};

export const READ_TIMEOUT_MS = 10000;

// Rebutja si la lectura triga més de `ms`, perquè una pàgina no es quedi penjada.
export const llegir = (promise, ms = READ_TIMEOUT_MS) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Firestore read timeout')), ms);
    promise.then(
      (valor) => { clearTimeout(timer); resolve(valor); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
