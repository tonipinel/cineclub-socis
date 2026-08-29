import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'cineclub-socis-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8181,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

const SOLICITUD_VALIDA = {
  nom: 'Anna',
  cognoms: 'Vidal',
  poblacio: 'Roda de Berà',
  codiPostal: '43883',
  telefon: '600000000',
  acceptaPrivacitat: true,
  acceptaDadesPersonals: true,
};

describe('firestore.rules — solicituds', () => {
  it('permet crear una sol·licitud a un visitant no autenticat', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(setDoc(doc(db, 'solicituds/1'), SOLICITUD_VALIDA));
  });

  it('impedeix llegir sol·licituds a un visitant no autenticat', async () => {
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await setDoc(doc(adminDb, 'solicituds/1'), SOLICITUD_VALIDA);
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonDb, 'solicituds/1')));
  });

  it('permet a un admin llegir i esborrar sol·licituds', async () => {
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await setDoc(doc(adminDb, 'solicituds/1'), SOLICITUD_VALIDA);
    await assertSucceeds(getDoc(doc(adminDb, 'solicituds/1')));
    await assertSucceeds(deleteDoc(doc(adminDb, 'solicituds/1')));
  });
});

describe('firestore.rules — socis', () => {
  it('impedeix a un visitant no autenticat llegir socis', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonDb, 'socis/1')));
  });

  it('permet a un admin llegir i escriure socis', async () => {
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await assertSucceeds(setDoc(doc(adminDb, 'socis/1'), { nom: 'Test' }));
    await assertSucceeds(getDoc(doc(adminDb, 'socis/1')));
  });
});
