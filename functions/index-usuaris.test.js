import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const index = require('./index.js');
const { HttpsError } = require('firebase-functions/v2/https');

const CALLABLES = [
  'llistarUsuarisTaquilla', 'crearUsuariTaquilla', 'editarUsuariTaquilla',
  'canviarEstatUsuariTaquilla', 'restablirContrasenyaUsuariTaquilla', 'eliminarUsuariTaquilla',
];

// Les callables reals d'index.js (sense xarxa: es rebutgen abans de parlar amb Auth o Firestore).
describe('index.js: callables dels usuaris de taquilla', () => {
  it.each(CALLABLES)('%s rebutja qui no ha iniciat la sessió amb un HttpsError', async (nom) => {
    const e = await index[nom].run({ data: {}, rawRequest: {} }).catch((x) => x);
    expect(e).toBeInstanceOf(HttpsError);
    expect(e.code).toBe('unauthenticated');
  });

  it.each(CALLABLES)('%s rebutja un rol que no és admin', async (nom) => {
    const e = await index[nom].run({ auth: { uid: 't1', token: { role: 'taquilla' } }, data: {}, rawRequest: {} }).catch((x) => x);
    expect(e).toBeInstanceOf(HttpsError);
    expect(e.code).toBe('permission-denied');
  });
});
