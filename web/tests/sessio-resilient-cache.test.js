import { describe, it, expect, vi, beforeEach } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import Portada from '../src/pages/index.astro';
import Programacio from '../src/pages/programacio/index.astro';
import RutaSessio from '../src/pages/programacio/[any]/[slug].astro';
import TermeGeneres from '../src/pages/generes/[terme].astro';
import TermeDirectors from '../src/pages/directors/[terme].astro';
import TermeInterprets from '../src/pages/interprets/[terme].astro';
import Pagina404 from '../src/pages/404.astro';
import { CACHE_AVUI, CACHE_CLIENT } from '../src/lib/cache.js';
import { conWhere } from './helpers/firestore.js';

// Si un llistat ha hagut d'ometre una sessió que no es podia pintar, la resposta no es pot quedar un
// dia al CDN: la pàgina va amb la caché curta dels errors del client.

vi.mock('../src/lib/db.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => globalThis.__dbFals,
}));
// Simula una sessió que falla en pintar-se com a targeta (amb les dades normalitzades no passa).
vi.mock('../src/lib/sessio-camps.js', async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, sessionsLlistables: (sessions) => sessions.filter((s) => s.id !== globalThis.__omesa) };
});

const sessio = (id, data, publica = {}) => ({
  id: `${id}-id`, titol: id, slug: id, publicada: true, data, hora: '19:00',
  publica: { seccio: 'cartellera', organitza: 'cineclub', generes: ['Drama'], ...publica },
});
const docs = [
  sessio('pig', '2026-06-25', { directors: ['Michael Sarnoski'], interprets: ['Nicolas Cage'], generes: ['Drama', 'Thriller'] }),
  sessio('abejas', '2026-10-22'),
];

beforeEach(() => {
  globalThis.__omesa = null;
  globalThis.__dbFals = {
    collection: (nom) => conWhere({
      get: async () => ({ docs: (nom === 'sessions' ? docs : []).map(({ id, ...dades }) => ({ id, data: () => dades })) }),
      doc: () => ({ get: async () => ({ exists: false }) }),
    }),
  };
});

const renderitza = async (Pagina, ruta, params = {}) => {
  const container = await AstroContainer.create();
  container.insertPageRoute('/404', Pagina404);
  const resposta = await container.renderToResponse(Pagina, { routeType: 'page', params, request: new Request(`https://cineclub-web.web.app${ruta}`) });
  return { status: resposta.status, html: await resposta.text(), cache: resposta.headers.get('Cache-Control') };
};

describe('caché de les pàgines amb una sessió omesa', () => {
  it.each([
    ['portada', Portada, '/', {}, CACHE_AVUI],
    ['programació', Programacio, '/programacio/', {}, CACHE_AVUI],
    ['sessió', RutaSessio, '/programacio/2026/abejas/', { any: '2026', slug: 'abejas' }, null],
    ['terme', TermeGeneres, '/generes/drama/', { terme: 'drama' }, null],
  ])('%s: caché normal si no se n\'omet cap i curta si se n\'omet una', async (_, Pagina, ruta, params, normal) => {
    expect((await renderitza(Pagina, ruta, params)).cache).toBe(normal);
    globalThis.__omesa = 'pig-id';
    const { status, html, cache } = await renderitza(Pagina, ruta, params);
    expect(status).toBe(200);
    expect(cache).toBe(CACHE_CLIENT);
    expect(html).not.toContain('href="/programacio/2026/pig/"');
  });
});

describe('terme sense cap sessió llistable', () => {
  it.each([
    ['directors', TermeDirectors, 'michael-sarnoski'],
    ['interprets', TermeInterprets, 'nicolas-cage'],
    ['generes', TermeGeneres, 'thriller'],
  ])('/%s/<terme>/ dona el 404 de la web si la seva única sessió no es pot pintar', async (taxonomia, Pagina, terme) => {
    const ruta = `/${taxonomia}/${terme}/`;
    expect((await renderitza(Pagina, ruta, { terme })).status).toBe(200);
    globalThis.__omesa = 'pig-id';
    const { status, html } = await renderitza(Pagina, ruta, { terme });
    expect(status).toBe(404);
    expect(html).not.toContain('(0 sessions)');
  });

});
