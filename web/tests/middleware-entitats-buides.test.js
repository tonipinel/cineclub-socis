import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Middleware amb els carregadors reals d'entitats i distribuïdores: només Firestore (getDb) està simulat.
const { dbRef } = vi.hoisted(() => ({ dbRef: { docs: [], distribuidores: [] } }));
vi.mock('../src/lib/db.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({
    collection: (nom) => conWhere({
      get: async () => ({ docs: (nom === 'distribuidores' ? dbRef.distribuidores : dbRef.docs).map((d) => ({ data: () => d })) }),
    }),
  }),
}));

import { onRequest } from '../src/middleware.js';
import { fixaEntitatsDeProva, entitatsCarregades } from '../src/lib/entitats.js';
import { fixaDistribuidoresDeProva, distribuidoresCarregades } from '../src/lib/distribuidores.js';
import { reiniciaMemos } from '../src/lib/memo.js';
import { CACHE_CLIENT, CACHE_OK } from '../src/lib/cache.js';
import { conWhere } from './helpers/firestore.js';

const context = (path) => ({ url: new URL(`http://localhost${path}`) });
const ok = () => Promise.resolve(new Response('<p>hola</p>', { status: 200 }));

describe('middleware amb el catàleg d\'entitats real', () => {
  beforeEach(() => {
    fixaEntitatsDeProva({});
    fixaDistribuidoresDeProva({});
    reiniciaMemos();
    dbRef.docs = [];
    dbRef.distribuidores = [];
  });
  afterEach(() => vi.restoreAllMocks());

  it('amb la col·lecció buida, una pàgina HTML 200 porta la caché curta; amb entitats (i distribuïdores), la normal', async () => {
    dbRef.distribuidores = [{ nom: 'A Contracorriente', logo: '/d.png' }];
    const buida = await onRequest(context('/programacio/2026/pig/'), ok);
    expect(entitatsCarregades()).toBe(false);
    expect(buida.headers.get('Cache-Control')).toBe(CACHE_CLIENT);
    reiniciaMemos();
    dbRef.docs = [{ nom: 'Ateneu Rodenc', logo: '/l.png' }];
    const plena = await onRequest(context('/programacio/2026/pig/'), ok);
    expect(entitatsCarregades()).toBe(true);
    expect(plena.headers.get('Cache-Control')).toBe(CACHE_OK);
  });

  it('amb distribuïdores carregades i entitats buides, la caché és la curta', async () => {
    dbRef.distribuidores = [{ nom: 'A Contracorriente', logo: '/l.png', preu: 12 }];
    const res = await onRequest(context('/programacio/2026/pig/'), ok);
    expect(entitatsCarregades()).toBe(false);
    expect(distribuidoresCarregades()).toBe(true);
    expect(res.headers.get('Cache-Control')).toBe(CACHE_CLIENT);
  });

  it('amb entitats carregades i distribuïdores buides, la caché és la curta', async () => {
    dbRef.docs = [{ nom: 'Ateneu Rodenc', logo: '/l.png' }];
    const res = await onRequest(context('/programacio/2026/pig/'), ok);
    expect(entitatsCarregades()).toBe(true);
    expect(distribuidoresCarregades()).toBe(false);
    expect(res.headers.get('Cache-Control')).toBe(CACHE_CLIENT);
  });

  it('sense cap dels dos catàlegs carregat, la caché és la curta', async () => {
    const res = await onRequest(context('/programacio/2026/pig/'), ok);
    expect(entitatsCarregades()).toBe(false);
    expect(distribuidoresCarregades()).toBe(false);
    expect(res.headers.get('Cache-Control')).toBe(CACHE_CLIENT);
  });
});
