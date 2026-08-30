import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';

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

describe('firestore.rules — sessions', () => {
  it('impedeix a un visitant no autenticat llegir sessions', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonDb, 'sessions/1')));
  });

  it('permet a taquilla llegir sessions però no escriure-hi', async () => {
    const taquillaDb = testEnv.authenticatedContext('taquilla-uid', { role: 'taquilla' }).firestore();
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await setDoc(doc(adminDb, 'sessions/1'), { titol: 'Test', activa: true });
    await assertSucceeds(getDoc(doc(taquillaDb, 'sessions/1')));
    await assertFails(setDoc(doc(taquillaDb, 'sessions/1'), { titol: 'Hackejat' }));
  });

  it('permet a un admin llegir i escriure sessions', async () => {
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await assertSucceeds(setDoc(doc(adminDb, 'sessions/1'), { titol: 'Test', activa: false }));
    await assertSucceeds(getDoc(doc(adminDb, 'sessions/1')));
  });
});

describe('firestore.rules — accessLog', () => {
  it('impedeix a un visitant no autenticat crear ni llegir accessLog', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(anonDb, 'accessLog/1'), { sessionId: 's1', tipus: 'soci' }));
    await assertFails(getDoc(doc(anonDb, 'accessLog/1')));
  });

  it('permet a taquilla crear i llegir accessLog', async () => {
    const taquillaDb = testEnv.authenticatedContext('taquilla-uid', { role: 'taquilla' }).firestore();
    await assertSucceeds(setDoc(doc(taquillaDb, 'accessLog/1'), { sessionId: 's1', tipus: 'soci', numeroSoci: 7 }));
    await assertSucceeds(getDoc(doc(taquillaDb, 'accessLog/1')));
  });

  it('impedeix actualitzar o esborrar accessLog fins i tot a un admin', async () => {
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await setDoc(doc(adminDb, 'accessLog/1'), { sessionId: 's1', tipus: 'soci', numeroSoci: 7 });
    await assertFails(updateDoc(doc(adminDb, 'accessLog/1'), { tipus: 'generic' }));
    await assertFails(deleteDoc(doc(adminDb, 'accessLog/1')));
  });
});

describe('firestore.rules — socis (Fase 2)', () => {
  it('permet a taquilla llegir socis però no escriure-hi', async () => {
    const taquillaDb = testEnv.authenticatedContext('taquilla-uid', { role: 'taquilla' }).firestore();
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await setDoc(doc(adminDb, 'socis/1'), { nom: 'Test', numeroSoci: 7 });
    await assertSucceeds(getDoc(doc(taquillaDb, 'socis/1')));
    await assertFails(updateDoc(doc(taquillaDb, 'socis/1'), { nom: 'Hackejat' }));
  });
});

describe('firestore.rules — moviments', () => {
  it('impedeix a un visitant no autenticat llegir o escriure moviments', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonDb, 'moviments/1')));
    await assertFails(setDoc(doc(anonDb, 'moviments/1'), { tipus: 'ingres', total: 10 }));
  });

  it('impedeix a taquilla llegir o escriure moviments', async () => {
    const taquillaDb = testEnv.authenticatedContext('taquilla-uid', { role: 'taquilla' }).firestore();
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await setDoc(doc(adminDb, 'moviments/1'), { tipus: 'ingres', total: 10 });
    await assertFails(getDoc(doc(taquillaDb, 'moviments/1')));
    await assertFails(setDoc(doc(taquillaDb, 'moviments/2'), { tipus: 'ingres', total: 5 }));
  });

  it('permet a un admin crear, llegir, actualitzar i esborrar moviments', async () => {
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await assertSucceeds(setDoc(doc(adminDb, 'moviments/1'), { tipus: 'ingres', total: 10 }));
    await assertSucceeds(getDoc(doc(adminDb, 'moviments/1')));
    await assertSucceeds(updateDoc(doc(adminDb, 'moviments/1'), { total: 20 }));
    await assertSucceeds(deleteDoc(doc(adminDb, 'moviments/1')));
  });
});
