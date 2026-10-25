import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc, updateDoc, deleteDoc, collection, getDocs, query, where, serverTimestamp, limit,
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

// Exactament el que envia `web/public/js/fes-te-socia-form.js` (camps del formulari + timestamp i estat).
function solicitudDelFormulari(canvis = {}) {
  return {
    nom: 'Anna',
    cognoms: 'Vidal',
    dni: '12345678Z',
    poblacio: 'Roda de Berà',
    codiPostal: '43883',
    telefon: '+34 600 00 00 00',
    correuElectronic: 'anna@example.com',
    comentaris: 'Vull fer-me sòcia.',
    acceptaPrivacitat: true,
    acceptaDadesPersonals: true,
    timestamp: serverTimestamp(),
    estat: 'pendent',
    ...canvis,
  };
}

const SOLICITUD_VALIDA = solicitudDelFormulari();

function sense(dades, camp) {
  const copia = { ...dades };
  delete copia[camp];
  return copia;
}

describe('firestore.rules — solicituds', () => {
  const anon = () => testEnv.unauthenticatedContext().firestore();
  const crear = (dades) => setDoc(doc(anon(), 'solicituds/1'), dades);

  it('permet crear una sol·licitud a un visitant no autenticat', async () => {
    await assertSucceeds(crear(SOLICITUD_VALIDA));
  });

  it('accepta la sol·licitud de qui marca que no té correu (correu i comentaris buits)', async () => {
    await assertSucceeds(crear(solicitudDelFormulari({ correuElectronic: '', comentaris: '' })));
  });

  it('accepta que falti qualsevol camp opcional (dni, correu, comentaris)', async () => {
    let dades = SOLICITUD_VALIDA;
    for (const camp of ['dni', 'correuElectronic', 'comentaris']) dades = sense(dades, camp);
    await assertSucceeds(crear(dades));
  });

  it('accepta els valors als límits de mida', async () => {
    await assertSucceeds(crear(solicitudDelFormulari({
      nom: 'a'.repeat(80), cognoms: 'b'.repeat(80), poblacio: 'c'.repeat(80), codiPostal: '1'.repeat(10),
      dni: 'D'.repeat(20), telefon: '6'.repeat(25), comentaris: 'x'.repeat(2000),
      correuElectronic: `${'a'.repeat(242)}@example.com`,
    })));
  });

  it('rebutja un camp que el formulari no envia', async () => {
    await assertFails(crear(solicitudDelFormulari({ notes: 'x' })));
    await assertFails(crear(solicitudDelFormulari({ aprovat: true })));
    // `importat` només el posa l'script d'importació (Admin SDK): fa que no s'enviïn correus.
    await assertFails(crear(solicitudDelFormulari({ importat: true })));
  });

  it('rebutja que falti un camp obligatori', async () => {
    for (const camp of ['nom', 'cognoms', 'poblacio', 'codiPostal', 'telefon', 'acceptaPrivacitat',
      'acceptaDadesPersonals', 'estat', 'timestamp']) {
      await assertFails(crear(sense(SOLICITUD_VALIDA, camp)));
    }
  });

  it('rebutja camps que no són text', async () => {
    await assertFails(crear(solicitudDelFormulari({ nom: 42 })));
    await assertFails(crear(solicitudDelFormulari({ cognoms: ['Vidal'] })));
    await assertFails(crear(solicitudDelFormulari({ dni: { a: 1 } })));
    await assertFails(crear(solicitudDelFormulari({ comentaris: true })));
    await assertFails(crear(solicitudDelFormulari({ telefon: 600000000 })));
  });

  it('rebutja camps obligatoris buits', async () => {
    await assertFails(crear(solicitudDelFormulari({ nom: '' })));
    await assertFails(crear(solicitudDelFormulari({ cognoms: '' })));
  });

  it('rebutja camps massa llargs', async () => {
    await assertFails(crear(solicitudDelFormulari({ nom: 'a'.repeat(81) })));
    await assertFails(crear(solicitudDelFormulari({ cognoms: 'a'.repeat(81) })));
    await assertFails(crear(solicitudDelFormulari({ poblacio: 'a'.repeat(81) })));
    await assertFails(crear(solicitudDelFormulari({ codiPostal: '1'.repeat(11) })));
    await assertFails(crear(solicitudDelFormulari({ dni: 'D'.repeat(21) })));
    await assertFails(crear(solicitudDelFormulari({ telefon: '6'.repeat(26) })));
    await assertFails(crear(solicitudDelFormulari({ comentaris: 'x'.repeat(2001) })));
    await assertFails(crear(solicitudDelFormulari({ correuElectronic: `${'a'.repeat(243)}@example.com` })));
  });

  it('rebutja un telèfon amb caràcters estranys', async () => {
    await assertFails(crear(solicitudDelFormulari({ telefon: '<a href=x>600</a>' })));
  });

  it('rebutja un correu que no és un sol text amb format de correu', async () => {
    await assertFails(crear(solicitudDelFormulari({ correuElectronic: ['a@example.com', 'b@example.com'] })));
    await assertFails(crear(solicitudDelFormulari({ correuElectronic: { to: 'a@example.com' } })));
    await assertFails(crear(solicitudDelFormulari({ correuElectronic: 'no-es-un-correu' })));
    await assertFails(crear(solicitudDelFormulari({ correuElectronic: 'a@example.com, b@example.com' })));
    await assertFails(crear(solicitudDelFormulari({ correuElectronic: 'a@example.com,b' })));
    await assertFails(crear(solicitudDelFormulari({ correuElectronic: 'Nom <a@example.com>' })));
    await assertFails(crear(solicitudDelFormulari({ correuElectronic: 'a@example.com\nBcc: b@example.com' })));
  });

  it('rebutja els consentiments si no són exactament true', async () => {
    await assertFails(crear(solicitudDelFormulari({ acceptaPrivacitat: false })));
    await assertFails(crear(solicitudDelFormulari({ acceptaDadesPersonals: false })));
    await assertFails(crear(solicitudDelFormulari({ acceptaPrivacitat: 'true' })));
  });

  it('rebutja un estat que no sigui pendent', async () => {
    await assertFails(crear(solicitudDelFormulari({ estat: 'aprovada' })));
    await assertFails(crear(solicitudDelFormulari({ estat: 'descartada' })));
  });

  it('rebutja un timestamp posat pel client', async () => {
    await assertFails(crear(solicitudDelFormulari({ timestamp: new Date('2020-01-01') })));
    await assertFails(crear(solicitudDelFormulari({ timestamp: 'ara' })));
  });

  it('impedeix a un visitant no autenticat modificar o esborrar una sol·licitud', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'solicituds/1'), { ...SOLICITUD_VALIDA, timestamp: new Date() });
    });
    await assertFails(updateDoc(doc(anon(), 'solicituds/1'), { estat: 'aprovada' }));
    await assertFails(deleteDoc(doc(anon(), 'solicituds/1')));
  });

  it('impedeix llegir sol·licituds a un visitant no autenticat', async () => {
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await setDoc(doc(adminDb, 'solicituds/1'), SOLICITUD_VALIDA);
    await assertFails(getDoc(doc(anon(), 'solicituds/1')));
  });

  it('permet a un admin llegir, aprovar i esborrar sol·licituds', async () => {
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await setDoc(doc(adminDb, 'solicituds/1'), SOLICITUD_VALIDA);
    await assertSucceeds(getDoc(doc(adminDb, 'solicituds/1')));
    await assertSucceeds(updateDoc(doc(adminDb, 'solicituds/1'), { estat: 'aprovada' }));
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

// La porta (taquilla) ja no llegeix `socis` (DNI, contacte, token del carnet): només `socisPorta`.
describe('firestore.rules — socis: taquilla no hi té accés', () => {
  it('impedeix a taquilla llegir (get i list) i escriure socis', async () => {
    const taquillaDb = testEnv.authenticatedContext('taquilla-uid', { role: 'taquilla' }).firestore();
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await setDoc(doc(adminDb, 'socis/1'), { nom: 'Test', numeroSoci: 7, tokenCarnet: 'tok' });
    await assertFails(getDoc(doc(taquillaDb, 'socis/1')));
    await assertFails(getDocs(collection(taquillaDb, 'socis')));
    await assertFails(getDocs(query(collection(taquillaDb, 'socis'), where('numeroSoci', '==', 7), limit(1))));
    await assertFails(getDocs(query(collection(taquillaDb, 'socis'), where('tokenCarnet', '==', 'tok'))));
    await assertFails(updateDoc(doc(taquillaDb, 'socis/1'), { nom: 'Hackejat' }));
  });

  it('un usuari identificat sense rol tampoc no pot llegir socis', async () => {
    const senseRol = testEnv.authenticatedContext('qualsevol-uid', {}).firestore();
    await assertFails(getDoc(doc(senseRol, 'socis/1')));
  });

  it('l\'admin encara pot llistar i consultar socis', async () => {
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await setDoc(doc(adminDb, 'socis/1'), { nom: 'Test', numeroSoci: 7 });
    await assertSucceeds(getDocs(collection(adminDb, 'socis')));
    await assertSucceeds(getDocs(query(collection(adminDb, 'socis'), where('numeroSoci', '==', 7))));
  });
});

// Projecció mínima per a la porta, escrita només per la Cloud Function `sincronitzarSociPorta` (Admin SDK).
describe('firestore.rules — socisPorta', () => {
  const PORTA = { numeroSoci: 7, nom: 'Anna', cognoms: 'Vidal', actiu: true, tokenHash: 'h7', ultimPagament: '2026-01-01' };
  const taquilla = () => testEnv.authenticatedContext('taquilla-uid', { role: 'taquilla' }).firestore();
  const admin = () => testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'socisPorta/7'), PORTA);
      await setDoc(doc(ctx.firestore(), 'socisPorta/8'), { ...PORTA, numeroSoci: 8, tokenHash: 'h8' });
    });
  });

  it('taquilla pot fer get d\'un document pel número', async () => {
    await assertSucceeds(getDoc(doc(taquilla(), 'socisPorta/7')));
  });

  it('taquilla pot consultar pel hash del token o pel número amb limit(1)', async () => {
    const col = collection(taquilla(), 'socisPorta');
    await assertSucceeds(getDocs(query(col, where('tokenHash', '==', 'h7'), limit(1))));
    await assertSucceeds(getDocs(query(col, where('numeroSoci', '==', 7), limit(1))));
  });

  it('taquilla no pot llistar sense límit ni amb un límit més gran que 1', async () => {
    const col = collection(taquilla(), 'socisPorta');
    await assertFails(getDocs(col));
    await assertFails(getDocs(query(col, where('tokenHash', '==', 'h7'))));
    await assertFails(getDocs(query(col, limit(2))));
    await assertFails(getDocs(query(col, where('actiu', '==', true), limit(50))));
  });

  it('ningú no hi pot escriure des del client, ni l\'admin', async () => {
    for (const db of [taquilla(), admin()]) {
      await assertFails(setDoc(doc(db, 'socisPorta/9'), PORTA));
      await assertFails(updateDoc(doc(db, 'socisPorta/7'), { actiu: true }));
      await assertFails(deleteDoc(doc(db, 'socisPorta/7')));
    }
  });

  it('un visitant anònim o sense rol no hi pot llegir res', async () => {
    for (const db of [testEnv.unauthenticatedContext().firestore(), testEnv.authenticatedContext('x', {}).firestore()]) {
      await assertFails(getDoc(doc(db, 'socisPorta/7')));
      await assertFails(getDocs(query(collection(db, 'socisPorta'), where('tokenHash', '==', 'h7'), limit(1))));
    }
  });

  it('l\'admin hi pot llegir (get i consulta amb limit(1))', async () => {
    await assertSucceeds(getDoc(doc(admin(), 'socisPorta/7')));
    await assertSucceeds(getDocs(query(collection(admin(), 'socisPorta'), where('numeroSoci', '==', 7), limit(1))));
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

  it('el comptador de números de soci només el pot llegir i avançar un admin', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    const taquillaDb = testEnv.authenticatedContext('taquilla-uid', { role: 'taquilla' }).firestore();
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await assertSucceeds(setDoc(doc(adminDb, 'configuracio/socis'), { ultimNumeroSoci: 41 }));
    await assertSucceeds(getDoc(doc(adminDb, 'configuracio/socis')));
    await assertSucceeds(updateDoc(doc(adminDb, 'configuracio/socis'), { ultimNumeroSoci: 42 }));
    for (const altreDb of [anonDb, taquillaDb]) {
      await assertFails(getDoc(doc(altreDb, 'configuracio/socis')));
      await assertFails(updateDoc(doc(altreDb, 'configuracio/socis'), { ultimNumeroSoci: 1 }));
    }
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
  it('impedeix a un visitant no autenticat crear una proposta (la web passa per la Cloud Function)', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(anonDb, 'propostes/1'), PROPOSTA_VALIDA));
    await assertFails(setDoc(doc(anonDb, 'propostes/2'), { ...PROPOSTA_VALIDA, tmdbId: 10 }));
  });

  it('impedeix a un usuari autenticat que no és admin crear una proposta', async () => {
    const taquillaDb = testEnv.authenticatedContext('t-uid', { role: 'taquilla' }).firestore();
    await assertFails(setDoc(doc(taquillaDb, 'propostes/1'), PROPOSTA_VALIDA));
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

  it('permet a un visitant no autenticat llegir una proposta programada', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'propostes/1'), { ...PROPOSTA_VALIDA, estat: 'programada' });
    });
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anonDb, 'propostes/1')));
  });

  it('impedeix a un visitant o a taquilla llegir una proposta rebutjada', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'propostes/1'), { ...PROPOSTA_VALIDA, estat: 'rebutjada', comentari: 'Privat' });
    });
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'propostes/1')));
    await assertFails(getDoc(doc(testEnv.authenticatedContext('t-uid', { role: 'taquilla' }).firestore(), 'propostes/1')));
  });

  it('impedeix llegir una proposta amb qualsevol altre estat (llista blanca)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'propostes/1'), { ...PROPOSTA_VALIDA, estat: 'arxivada' });
      await setDoc(doc(ctx.firestore(), 'propostes/2'), { titol: 'Sense estat', numeroSoci: 7 });
    });
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonDb, 'propostes/1')));
    await assertFails(getDoc(doc(anonDb, 'propostes/2')));
  });

  describe('consultes públiques', () => {
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'propostes/a'), { ...PROPOSTA_VALIDA, estat: 'aprovada' });
        await setDoc(doc(db, 'propostes/p'), { ...PROPOSTA_VALIDA, estat: 'programada' });
        await setDoc(doc(db, 'propostes/r'), { ...PROPOSTA_VALIDA, estat: 'rebutjada' });
        await setDoc(doc(db, 'propostes/n'), PROPOSTA_VALIDA);
      });
    });
    const anonDb = () => testEnv.unauthenticatedContext().firestore();

    it("permet la consulta de la web (estat in ['aprovada', 'programada'])", async () => {
      const snap = await assertSucceeds(getDocs(query(collection(anonDb(), 'propostes'),
        where('estat', 'in', ['aprovada', 'programada']))));
      expect(snap.docs.map((d) => d.id).sort()).toEqual(['a', 'p']);
    });

    it("permet la consulta estat == 'aprovada'", async () => {
      await assertSucceeds(getDocs(query(collection(anonDb(), 'propostes'), where('estat', '==', 'aprovada'))));
    });

    it('denega llistar sense filtre, amb estat != pendent o demanant les rebutjades', async () => {
      await assertFails(getDocs(collection(anonDb(), 'propostes')));
      await assertFails(getDocs(query(collection(anonDb(), 'propostes'), where('estat', '!=', 'pendent'))));
      await assertFails(getDocs(query(collection(anonDb(), 'propostes'), where('estat', '==', 'rebutjada'))));
      await assertFails(getDocs(query(collection(anonDb(), 'propostes'),
        where('estat', 'in', ['aprovada', 'rebutjada']))));
    });

    it("permet a l'admin llistar-les totes", async () => {
      const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
      const snap = await assertSucceeds(getDocs(collection(adminDb, 'propostes')));
      expect(snap.size).toBe(4);
    });
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

  it('impedeix a un visitant crear una proposta amb campsEditats', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(anonDb, 'propostes/1'), { ...PROPOSTA_VALIDA, tmdbId: 10, campsEditats: ['titol'] }));
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

  // Només l'escriu la Cloud Function `crearProposta` (Admin SDK); aquí es prepara sense regles.
  const crearAmbAdminSdk = () => testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'propostesActivitat/1'), ACTIVITAT);
  });

  it("impedeix a qualsevol client crear un registre d'activitat (anònim, taquilla i admin)", async () => {
    await assertFails(setDoc(doc(testEnv.unauthenticatedContext().firestore(), 'propostesActivitat/1'), ACTIVITAT));
    await assertFails(setDoc(doc(testEnv.authenticatedContext('t-uid', { role: 'taquilla' }).firestore(), 'propostesActivitat/1'), ACTIVITAT));
    await assertFails(setDoc(doc(testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore(), 'propostesActivitat/1'), ACTIVITAT));
  });

  it("impedeix a un visitant no autenticat llegir l'activitat", async () => {
    await crearAmbAdminSdk();
    const anonDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonDb, 'propostesActivitat/1')));
  });

  it("permet a un admin llegir l'activitat", async () => {
    await crearAmbAdminSdk();
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
    await assertSucceeds(getDoc(doc(adminDb, 'propostesActivitat/1')));
  });

  it("impedeix modificar o esborrar l'activitat fins i tot a un admin", async () => {
    await crearAmbAdminSdk();
    const adminDb = testEnv.authenticatedContext('admin-uid', { role: 'admin' }).firestore();
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
