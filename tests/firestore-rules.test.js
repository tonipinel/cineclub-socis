import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc, updateDoc, deleteDoc, collection, getDocs, query, where,
} from 'firebase/firestore';

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

describe('firestore.rules — escaneigErrors', () => {
  it('impedeix a un visitant no autenticat crear ni llegir escaneigErrors', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(anonDb, 'escaneigErrors/1'), { motiu: 'codi-desconegut', codi: 'XYZ' }));
    await assertFails(getDoc(doc(anonDb, 'escaneigErrors/1')));
  });

  it('permet a taquilla crear i llegir escaneigErrors', async () => {
    const taquillaDb = testEnv.authenticatedContext('taquilla-uid', { role: 'taquilla' }).firestore();
    await assertSucceeds(setDoc(doc(taquillaDb, 'escaneigErrors/1'), { motiu: 'codi-desconegut', codi: 'XYZ' }));
    await assertSucceeds(getDoc(doc(taquillaDb, 'escaneigErrors/1')));
  });

  it('impedeix actualitzar o esborrar escaneigErrors fins i tot a un admin', async () => {
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await setDoc(doc(adminDb, 'escaneigErrors/1'), { motiu: 'codi-desconegut', codi: 'XYZ' });
    await assertFails(updateDoc(doc(adminDb, 'escaneigErrors/1'), { motiu: 'excepcio' }));
    await assertFails(deleteDoc(doc(adminDb, 'escaneigErrors/1')));
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

describe('firestore.rules — configuracio', () => {
  it('impedeix a un visitant no autenticat llegir o escriure la configuració', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonDb, 'configuracio/tiquets')));
    await assertFails(setDoc(doc(anonDb, 'configuracio/tiquets'), { seguentNumero: 1 }));
  });

  it('impedeix a taquilla llegir o escriure la configuració', async () => {
    const taquillaDb = testEnv.authenticatedContext('taquilla-uid', { role: 'taquilla' }).firestore();
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await setDoc(doc(adminDb, 'configuracio/tiquets'), { seguentNumero: 1 });
    await assertFails(getDoc(doc(taquillaDb, 'configuracio/tiquets')));
    await assertFails(setDoc(doc(taquillaDb, 'configuracio/tiquets'), { seguentNumero: 999 }));
  });

  it('permet a un admin llegir i actualitzar el comptador de tiquets', async () => {
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await assertSucceeds(setDoc(doc(adminDb, 'configuracio/tiquets'), { seguentNumero: 1 }));
    await assertSucceeds(getDoc(doc(adminDb, 'configuracio/tiquets')));
    await assertSucceeds(updateDoc(doc(adminDb, 'configuracio/tiquets'), { seguentNumero: 151 }));
  });
});

describe('firestore.rules — lotsTiquets', () => {
  it('impedeix a un visitant no autenticat llegir o escriure lots de tiquets', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonDb, 'lotsTiquets/1')));
    await assertFails(setDoc(doc(anonDb, 'lotsTiquets/1'), { numeroInicial: 1, quantitat: 150 }));
  });

  it('permet a taquilla llegir lots de tiquets però no escriure-hi', async () => {
    const taquillaDb = testEnv.authenticatedContext('taquilla-uid', { role: 'taquilla' }).firestore();
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await setDoc(doc(adminDb, 'lotsTiquets/1'), { numeroInicial: 1, quantitat: 150 });
    await assertSucceeds(getDoc(doc(taquillaDb, 'lotsTiquets/1')));
    await assertFails(updateDoc(doc(taquillaDb, 'lotsTiquets/1'), { impres: true }));
  });

  it('permet a un admin crear, llegir i actualitzar lots de tiquets', async () => {
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await assertSucceeds(setDoc(doc(adminDb, 'lotsTiquets/1'), { numeroInicial: 1, quantitat: 150, impres: false }));
    await assertSucceeds(getDoc(doc(adminDb, 'lotsTiquets/1')));
    await assertSucceeds(updateDoc(doc(adminDb, 'lotsTiquets/1'), { impres: true, dataImpressio: '2026-08-31' }));
  });
});

describe('firestore.rules — socisPublic', () => {
  it('permet a un visitant no autenticat llegir socisPublic pel token', async () => {
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await setDoc(doc(adminDb, 'socisPublic/tok-abc123'), { numeroSoci: 7, nomPublic: 'Anna V.' });
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anonDb, 'socisPublic/tok-abc123')));
  });

  it('impedeix a un visitant no autenticat llistar tot socisPublic', async () => {
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await setDoc(doc(adminDb, 'socisPublic/tok-abc123'), { numeroSoci: 7, nomPublic: 'Anna V.' });
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(anonDb, 'socisPublic')));
    await assertFails(getDocs(query(collection(anonDb, 'socisPublic'), where('numeroSoci', '==', 7))));
  });

  it('impedeix a un visitant no autenticat escriure socisPublic', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(anonDb, 'socisPublic/tok-abc123'), { numeroSoci: 7, nomPublic: 'Hackejat' }));
  });

  it('permet a un admin escriure socisPublic', async () => {
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await assertSucceeds(setDoc(doc(adminDb, 'socisPublic/tok-abc123'), { numeroSoci: 7, nomPublic: 'Anna V.' }));
  });
});

const PROPOSTA_VALIDA = { titol: 'El padrí', numeroSoci: 7, estat: 'pendent' };

describe('firestore.rules — propostes', () => {
  it('permet a un visitant no autenticat crear una proposta pendent', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(setDoc(doc(anonDb, 'propostes/1'), PROPOSTA_VALIDA));
  });

  it('impedeix crear una proposta sense titol, numeroSoci o estat', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(anonDb, 'propostes/1'), { titol: 'Sense soci', estat: 'pendent' }));
  });

  it('impedeix crear una proposta que no sigui pendent', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(anonDb, 'propostes/1'), { ...PROPOSTA_VALIDA, estat: 'aprovada' }));
  });

  it('impedeix a un visitant no autenticat llegir una proposta pendent', async () => {
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await setDoc(doc(adminDb, 'propostes/1'), PROPOSTA_VALIDA);
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonDb, 'propostes/1')));
  });

  it('permet a un visitant no autenticat llegir una proposta aprovada', async () => {
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await setDoc(doc(adminDb, 'propostes/1'), PROPOSTA_VALIDA);
    await updateDoc(doc(adminDb, 'propostes/1'), { estat: 'aprovada' });
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anonDb, 'propostes/1')));
  });

  it('impedeix a un visitant no autenticat actualitzar o esborrar una proposta', async () => {
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await setDoc(doc(adminDb, 'propostes/1'), PROPOSTA_VALIDA);
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(updateDoc(doc(anonDb, 'propostes/1'), { estat: 'aprovada' }));
    await assertFails(deleteDoc(doc(anonDb, 'propostes/1')));
  });

  it('permet a un admin llegir, actualitzar i esborrar qualsevol proposta', async () => {
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await setDoc(doc(adminDb, 'propostes/1'), PROPOSTA_VALIDA);
    await assertSucceeds(getDoc(doc(adminDb, 'propostes/1')));
    await assertSucceeds(updateDoc(doc(adminDb, 'propostes/1'), { estat: 'aprovada', imatgeUrl: 'https://x' }));
    await assertSucceeds(deleteDoc(doc(adminDb, 'propostes/1')));
  });

  it("permet a un admin crear una proposta pendent en nom d'un soci", async () => {
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await assertSucceeds(setDoc(doc(adminDb, 'propostes/1'), PROPOSTA_VALIDA));
  });

  it('impedeix crear una proposta amb campsEditats', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(anonDb, 'propostes/1'), { ...PROPOSTA_VALIDA, tmdbId: 10, campsEditats: ['titol'] }));
  });

  it('permet a un visitant crear una proposta pendent amb tmdbId', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(setDoc(doc(anonDb, 'propostes/1'), { ...PROPOSTA_VALIDA, tmdbId: 10 }));
  });

  it('permet a un admin actualitzar campsEditats', async () => {
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await setDoc(doc(adminDb, 'propostes/1'), PROPOSTA_VALIDA);
    await assertSucceeds(updateDoc(doc(adminDb, 'propostes/1'), { directors: ['Meu'], campsEditats: ['directors'] }));
  });
});

describe('firestore.rules — propostes/{id}/vots (sistema antic, tancat)', () => {
  const VOT_ANTIC = { timestamp: new Date(), token: 'tok-abc123' };

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'socisPublic/tok-abc123'), { numeroSoci: 7, nomPublic: 'Anna V.' });
      await setDoc(doc(ctx.firestore(), 'propostes/1/vots/7'), VOT_ANTIC);
    });
  });

  it('impedeix a un visitant llegir, votar (amb token vàlid) i desvotar', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonDb, 'propostes/1/vots/7')));
    await assertFails(setDoc(doc(anonDb, 'propostes/1/vots/7'), VOT_ANTIC));
    await assertFails(setDoc(doc(anonDb, 'propostes/1/vots/8'), VOT_ANTIC));
    await assertFails(deleteDoc(doc(anonDb, 'propostes/1/vots/7')));
  });

  it('impedeix també a un admin llegir i escriure (només l\'Admin SDK de l\'script d\'esborrat hi accedeix)', async () => {
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await assertFails(getDoc(doc(adminDb, 'propostes/1/vots/7')));
    await assertFails(setDoc(doc(adminDb, 'propostes/1/vots/9'), VOT_ANTIC));
    await assertFails(deleteDoc(doc(adminDb, 'propostes/1/vots/7')));
  });
});

describe('firestore.rules — tandes/{id}/vots', () => {
  const VOT = { valors: { p1: 'like' }, bloquejat: false };
  const sembra = () => testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'tandes/t1/vots/12'), VOT);
  });

  it('permet a un admin llegir i esborrar un vot', async () => {
    await sembra();
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await assertSucceeds(getDoc(doc(adminDb, 'tandes/t1/vots/12')));
    await assertSucceeds(deleteDoc(doc(adminDb, 'tandes/t1/vots/12')));
  });

  it('impedeix a un admin crear o modificar un vot (només les Cloud Functions n\'escriuen)', async () => {
    await sembra();
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await assertFails(setDoc(doc(adminDb, 'tandes/t1/vots/13'), VOT));
    await assertFails(updateDoc(doc(adminDb, 'tandes/t1/vots/12'), { bloquejat: true }));
  });

  it('impedeix a un visitant llegir, esborrar o escriure vots', async () => {
    await sembra();
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonDb, 'tandes/t1/vots/12')));
    await assertFails(deleteDoc(doc(anonDb, 'tandes/t1/vots/12')));
    await assertFails(setDoc(doc(anonDb, 'tandes/t1/vots/13'), VOT));
  });
});

describe('firestore.rules — propostesActivitat', () => {
  const ACTIVITAT = { tipus: 'vot', propostaId: '1', numeroSoci: 7, timestamp: new Date() };

  it("permet a un visitant no autenticat crear un registre d'activitat", async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(setDoc(doc(anonDb, 'propostesActivitat/1'), ACTIVITAT));
  });

  it("impedeix a un visitant no autenticat llegir l'activitat", async () => {
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await setDoc(doc(adminDb, 'propostesActivitat/1'), ACTIVITAT);
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonDb, 'propostesActivitat/1')));
  });

  it("permet a un admin llegir l'activitat", async () => {
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await setDoc(doc(adminDb, 'propostesActivitat/1'), ACTIVITAT);
    await assertSucceeds(getDoc(doc(adminDb, 'propostesActivitat/1')));
  });

  it("impedeix modificar o esborrar l'activitat fins i tot a un admin", async () => {
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await setDoc(doc(adminDb, 'propostesActivitat/1'), ACTIVITAT);
    await assertFails(updateDoc(doc(adminDb, 'propostesActivitat/1'), { tipus: 'desvot' }));
    await assertFails(deleteDoc(doc(adminDb, 'propostesActivitat/1')));
  });
});

describe('firestore.rules — propostesInternes i distribuidores', () => {
  const adminDb = () => testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();

  it.each(['propostesInternes/p1', 'distribuidores/d1'])('%s: només l\'admin hi pot llegir i escriure', async (cami) => {
    await assertSucceeds(setDoc(doc(adminDb(), cami), { preu: 100 }));
    await assertSucceeds(getDoc(doc(adminDb(), cami)));
    await assertSucceeds(updateDoc(doc(adminDb(), cami), { preu: 120 }));
    await assertSucceeds(deleteDoc(doc(adminDb(), cami)));
  });

  it.each(['propostesInternes/p1', 'distribuidores/d1'])('%s: ni un visitant ni taquilla hi tenen accés', async (cami) => {
    await setDoc(doc(adminDb(), cami), { preu: 100 });
    const anonDb = testEnv.unauthenticatedContext().firestore();
    const taquillaDb = testEnv.authenticatedContext('taquilla-uid', { role: 'taquilla' }).firestore();
    await assertFails(getDoc(doc(anonDb, cami)));
    await assertFails(setDoc(doc(anonDb, cami), { preu: 1 }));
    await assertFails(getDoc(doc(taquillaDb, cami)));
    await assertFails(setDoc(doc(taquillaDb, cami), { preu: 1 }));
    await assertFails(deleteDoc(doc(taquillaDb, cami)));
  });

  it('les dades internes no es filtren encara que la proposta sigui pública', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'propostes/p1'), { titol: 'La Haine', numeroSoci: 7, estat: 'aprovada' });
      await setDoc(doc(ctx.firestore(), 'propostesInternes/p1'), { preu: 350, condicions: 'Només 35mm' });
    });
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anonDb, 'propostes/p1')));
    await assertFails(getDoc(doc(anonDb, 'propostesInternes/p1')));
  });
});

describe('firestore.rules — pagines', () => {
  const PAGINA = { slug: 'privacitat', tipus: 'contingut', titol: 'Política de privacitat', dades: {}, cos: '', imatges: {} };
  const adminDb = () => testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();

  it('només l\'admin hi pot llegir i escriure', async () => {
    await assertSucceeds(setDoc(doc(adminDb(), 'pagines/privacitat'), PAGINA));
    await assertSucceeds(getDoc(doc(adminDb(), 'pagines/privacitat')));
    await assertSucceeds(updateDoc(doc(adminDb(), 'pagines/privacitat'), { cos: 'Nou text' }));
    await assertSucceeds(deleteDoc(doc(adminDb(), 'pagines/privacitat')));
  });

  it('ni un visitant ni taquilla hi tenen accés', async () => {
    await setDoc(doc(adminDb(), 'pagines/privacitat'), PAGINA);
    const anonDb = testEnv.unauthenticatedContext().firestore();
    const taquillaDb = testEnv.authenticatedContext('taquilla-uid', { role: 'taquilla' }).firestore();
    await assertFails(getDoc(doc(anonDb, 'pagines/privacitat')));
    await assertFails(getDocs(collection(anonDb, 'pagines')));
    await assertFails(setDoc(doc(anonDb, 'pagines/nova'), PAGINA));
    await assertFails(getDoc(doc(taquillaDb, 'pagines/privacitat')));
    await assertFails(updateDoc(doc(taquillaDb, 'pagines/privacitat'), { cos: 'x' }));
    await assertFails(deleteDoc(doc(taquillaDb, 'pagines/privacitat')));
  });
});

describe('firestore.rules — entitats', () => {
  const adminDb = () => testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();

  it('només l\'admin hi pot llegir i escriure', async () => {
    await assertSucceeds(setDoc(doc(adminDb(), 'entitats/x'), { nom: 'Foo' }));
    await assertSucceeds(getDoc(doc(adminDb(), 'entitats/x')));
    await assertSucceeds(updateDoc(doc(adminDb(), 'entitats/x'), { url: 'https://x.cat' }));
    await assertSucceeds(deleteDoc(doc(adminDb(), 'entitats/x')));
  });

  it('ni un visitant ni un usuari no admin hi tenen accés', async () => {
    await setDoc(doc(adminDb(), 'entitats/x'), { nom: 'Foo' });
    const anonDb = testEnv.unauthenticatedContext().firestore();
    const taquillaDb = testEnv.authenticatedContext('taquilla-uid', { role: 'taquilla' }).firestore();
    await assertFails(getDoc(doc(anonDb, 'entitats/x')));
    await assertFails(setDoc(doc(anonDb, 'entitats/y'), { nom: 'Bar' }));
    await assertFails(getDoc(doc(taquillaDb, 'entitats/x')));
    await assertFails(setDoc(doc(taquillaDb, 'entitats/y'), { nom: 'Bar' }));
  });
});
