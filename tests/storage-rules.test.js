import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getBytes, getMetadata, getDownloadURL, deleteObject, listAll, list } from 'firebase/storage';

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'cineclub-socis-storage-test',
    storage: {
      rules: readFileSync('storage.rules', 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearStorage();
});

const PATH = 'factures/abc/factura.pdf';
const PDF = { contentType: 'application/pdf' };
const bytes = (mida = 10) => new Uint8Array(mida);

const storageDe = (rol) => (rol
  ? testEnv.authenticatedContext('uid', { role: rol }).storage()
  : testEnv.unauthenticatedContext().storage());

describe('storage.rules — factures', () => {
  it('un visitant anònim no pot pujar ni llegir', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), PATH), bytes(), PDF);
    });
    await assertFails(uploadBytes(ref(storageDe(null), 'factures/x/a.pdf'), bytes(), PDF));
    await assertFails(getBytes(ref(storageDe(null), PATH)));
  });

  it('taquilla no pot pujar ni llegir', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), PATH), bytes(), PDF);
    });
    await assertFails(uploadBytes(ref(storageDe('taquilla'), 'factures/x/a.pdf'), bytes(), PDF));
    await assertFails(getBytes(ref(storageDe('taquilla'), PATH)));
  });

  it('l\'admin pot pujar un PDF, llegir-lo i esborrar-lo', async () => {
    const storage = storageDe('admin');
    await assertSucceeds(uploadBytes(ref(storage, PATH), bytes(), PDF));
    await assertSucceeds(getBytes(ref(storage, PATH)));
    await assertSucceeds(deleteObject(ref(storage, PATH)));
  });

  it('l\'admin pot pujar una imatge', async () => {
    await assertSucceeds(uploadBytes(ref(storageDe('admin'), 'factures/x/tiquet.jpg'), bytes(), { contentType: 'image/jpeg' }));
  });

  it('l\'admin no pot pujar un tipus de fitxer no permès', async () => {
    await assertFails(uploadBytes(ref(storageDe('admin'), 'factures/x/a.txt'), bytes(), { contentType: 'text/plain' }));
  });

  it('l\'admin no pot pujar més de 10 MB', async () => {
    await assertFails(uploadBytes(ref(storageDe('admin'), 'factures/x/gran.pdf'), bytes(10 * 1024 * 1024 + 1), PDF));
  });

  it('no es pot pujar fora de factures/', async () => {
    await assertFails(uploadBytes(ref(storageDe('admin'), 'altres/a.pdf'), bytes(), PDF));
  });
});

describe('storage.rules — web', () => {
  const JPG = { contentType: 'image/jpeg' };
  const CARTELL = 'web/sessions/pig/poster.jpg';

  it('qualsevol visitant pot llegir les imatges de la web', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), CARTELL), bytes(), JPG);
      await uploadBytes(ref(ctx.storage(), 'web/pagines/ajuntament.png'), bytes(), { contentType: 'image/png' });
    });
    await assertSucceeds(getBytes(ref(storageDe(null), CARTELL)));
    await assertSucceeds(getBytes(ref(storageDe(null), 'web/pagines/ajuntament.png')));
  });

  it('un visitant ni taquilla no hi poden pujar ni esborrar', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), CARTELL), bytes(), JPG);
    });
    for (const rol of [null, 'taquilla']) {
      await assertFails(uploadBytes(ref(storageDe(rol), 'web/sessions/pig/gallery-1.jpg'), bytes(), JPG));
      await assertFails(uploadBytes(ref(storageDe(rol), CARTELL), bytes(), JPG));
      await assertFails(deleteObject(ref(storageDe(rol), CARTELL)));
    }
  });

  it('l\'admin hi pot pujar i esborrar', async () => {
    await assertSucceeds(uploadBytes(ref(storageDe('admin'), CARTELL), bytes(), JPG));
    await assertSucceeds(deleteObject(ref(storageDe('admin'), CARTELL)));
  });

  it('un visitant pot obtenir les metadades i l\'URL de descàrrega d\'un fitxer conegut', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), CARTELL), bytes(), JPG);
    });
    await assertSucceeds(getMetadata(ref(storageDe(null), CARTELL)));
    await assertSucceeds(getDownloadURL(ref(storageDe(null), CARTELL)));
  });
});

describe('storage.rules — llistar carpetes', () => {
  const JPG = { contentType: 'image/jpeg' };

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), 'web/sessions/pig/poster.jpg'), bytes(), JPG);
      await uploadBytes(ref(ctx.storage(), 'carteils/p1-1.jpg'), bytes(), JPG);
    });
  });

  it.each(['web', 'web/sessions', 'web/sessions/pig', 'carteils'])(
    'ni un visitant ni taquilla poden llistar %s/', async (carpeta) => {
      for (const rol of [null, 'taquilla']) {
        await assertFails(listAll(ref(storageDe(rol), carpeta)));
        await assertFails(list(ref(storageDe(rol), carpeta), { maxResults: 10 }));
      }
    });

  it('un visitant pot llegir un cartell de proposta per camí conegut', async () => {
    await assertSucceeds(getBytes(ref(storageDe(null), 'carteils/p1-1.jpg')));
  });

  it('un visitant no pot pujar cartells de propostes', async () => {
    await assertFails(uploadBytes(ref(storageDe(null), 'carteils/p2-1.jpg'), bytes(), JPG));
  });

  it.each(['web/sessions', 'carteils'])('l\'admin pot llistar %s/', async (carpeta) => {
    const res = await assertSucceeds(listAll(ref(storageDe('admin'), carpeta)));
    expect(res.items.length + res.prefixes.length).toBe(1);
  });
});
