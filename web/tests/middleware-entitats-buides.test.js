import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Middleware amb el carregador real d'entitats: només Firestore (getDb) està simulat.
const { dbRef } = vi.hoisted(() => ({ dbRef: { docs: [] } }));
vi.mock('../src/lib/db.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({ collection: () => ({ get: async () => ({ docs: dbRef.docs.map((d) => ({ data: () => d })) }) }) }),
}));

import { onRequest } from '../src/middleware.js';
import { fixaEntitatsDeProva, entitatsCarregades } from '../src/lib/entitats.js';
import { reiniciaMemos } from '../src/lib/memo.js';
import { CACHE_CLIENT, CACHE_OK } from '../src/lib/cache.js';

const context = (path) => ({ url: new URL(`http://localhost${path}`) });
const ok = () => Promise.resolve(new Response('<p>hola</p>', { status: 200 }));

describe('middleware amb el catàleg d\'entitats real', () => {
  beforeEach(() => {
    fixaEntitatsDeProva({});
    reiniciaMemos();
    dbRef.docs = [];
  });
  afterEach(() => vi.restoreAllMocks());

  it('amb la col·lecció buida, una pàgina HTML 200 porta la caché curta; amb entitats, la normal', async () => {
    const buida = await onRequest(context('/programacio/2026/pig/'), ok);
    expect(entitatsCarregades()).toBe(false);
    expect(buida.headers.get('Cache-Control')).toBe(CACHE_CLIENT);
    reiniciaMemos();
    dbRef.docs = [{ nom: 'Ateneu Rodenc', logo: '/l.png' }];
    const plena = await onRequest(context('/programacio/2026/pig/'), ok);
    expect(entitatsCarregades()).toBe(true);
    expect(plena.headers.get('Cache-Control')).toBe(CACHE_OK);
  });
});
