import { getApps, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

const PROJECT_ID = 'cineclub-socis';
const BUCKET = 'cineclub-socis.firebasestorage.app';

// Només per llegir originals d'imatges (vegeu `llegirStorage` a resize.js).
export const getBucket = () => {
  if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
  return getStorage().bucket(BUCKET);
};
