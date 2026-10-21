import { onRequest } from 'firebase-functions/v2/https';
import compression from 'compression';
import { handler } from './dist/server/entry.mjs';

// Firebase Hosting serveix l'HTML de la funció tal com surt, així que es comprimeix aquí (gzip/br).
const compress = compression();

export const web = onRequest(
  {
    region: 'europe-west1',
    memory: '512MiB',
    timeoutSeconds: 60,
    maxInstances: 10,
  },
  (req, res) => compress(req, res, () => handler(req, res)),
);
