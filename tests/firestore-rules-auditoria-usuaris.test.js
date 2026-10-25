import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, query, where,
} from 'firebase/firestore';

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'cineclub-socis-test-auditoria',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8181 },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

const REGISTRE = {
  accio: 'crear', actorUid: 'admin-uid', actorCorreu: 'admin@example.com', objectiuUid: 't1', objectiuCorreu: 't1@example.com', timestamp: new Date(),
};

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Com la Cloud Function (Admin SDK): sense passar per les regles.
  await testEnv.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'auditoriaUsuaris/a1'), REGISTRE));
});

describe('firestore.rules — auditoriaUsuaris', () => {
  const adminDb = () => testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
  const taquillaDb = () => testEnv.authenticatedContext('t1', { role: 'taquilla' }).firestore();
  const senseRolDb = () => testEnv.authenticatedContext('x').firestore();
  const anonDb = () => testEnv.unauthenticatedContext().firestore();

  it("l'admin el pot llegir (document i consulta per usuari)", async () => {
    await assertSucceeds(getDoc(doc(adminDb(), 'auditoriaUsuaris/a1')));
    await assertSucceeds(getDocs(query(collection(adminDb(), 'auditoriaUsuaris'), where('objectiuUid', '==', 't1'))));
  });

  it.each([['taquilla', taquillaDb], ['sense rol', senseRolDb], ['anònim', anonDb]])('%s no el pot llegir', async (_nom, db) => {
    await assertFails(getDoc(doc(db(), 'auditoriaUsuaris/a1')));
    await assertFails(getDocs(query(collection(db(), 'auditoriaUsuaris'), where('objectiuUid', '==', 't1'))));
  });

  it.each([['admin', adminDb], ['taquilla', taquillaDb], ['anònim', anonDb]])('%s no hi pot escriure, modificar ni esborrar', async (_nom, db) => {
    await assertFails(setDoc(doc(db(), 'auditoriaUsuaris/a2'), REGISTRE));
    await assertFails(addDoc(collection(db(), 'auditoriaUsuaris'), REGISTRE));
    await assertFails(updateDoc(doc(db(), 'auditoriaUsuaris/a1'), { accio: 'eliminar' }));
    await assertFails(deleteDoc(doc(db(), 'auditoriaUsuaris/a1')));
  });
});
