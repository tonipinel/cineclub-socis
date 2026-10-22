import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Les sessions (Firestore) es substitueixen per un mock: el middleware només les llegeix quan una
// petició acaba en 404, per comprovar si és un alias de Hugo.
const { sessionsMock } = vi.hoisted(() => ({ sessionsMock: vi.fn() }));
vi.mock('../src/lib/sessions.js', () => ({ sessionsPubliques: sessionsMock }));

const carrega = async (indexable) => {
  vi.resetModules();
  vi.stubEnv('PUBLIC_INDEXABLE', indexable ? 'true' : '');
  return import('../src/middleware.js');
};
const context = (path = '/') => ({ url: new URL(`http://localhost${path}`) });
const no404 = () => Promise.resolve(new Response('x', { status: 404 }));
const ok = () => Promise.resolve(new Response('<p>hola</p>', { status: 200 }));

describe('middleware', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sessionsMock.mockReset();
    sessionsMock.mockResolvedValue([]);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('afegeix nosniff i frame-ancestors a totes les respostes (200, 404, 500)', async () => {
    const { onRequest } = await carrega(true);
    const trencat = () => Promise.reject(new Error('caiguda'));
    for (const res of [await onRequest(context(), ok), await onRequest(context('/x'), no404), await onRequest(context(), trencat)]) {
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('Content-Security-Policy')).toBe("frame-ancestors 'self'");
    }
  });

  it('serveix /programacio/<any>/<slug>/cartell.html (sense barra final) reescrivint a la ruta del cartell', async () => {
    const { onRequest } = await carrega(true);
    const next = vi.fn(ok);
    await onRequest(context('/programacio/2026/pig/cartell.html'), next);
    expect(next).toHaveBeenCalledWith('/programacio/2026/pig/cartell.html/');
    const altres = vi.fn(ok);
    await onRequest(context('/programacio/2026/pig/'), altres);
    await onRequest(context('/programacio/2026/pig/cartell.html/'), altres);
    await onRequest(context('/cartell.html'), altres);
    for (const cami of ['/programacio/2026/pig/cartell.html.map', '/programacio/2026/pig/Cartell.html', '/programacio/2026/cartell.html', '/programacio/2026/a/b/cartell.html', '//']) {
      await onRequest(context(cami), altres);
    }
    expect(altres.mock.calls.every((crida) => crida.length === 0)).toBe(true);
  });

  it('afegeix X-Robots-Tag: noindex quan INDEXABLE és fals', async () => {
    const { onRequest } = await carrega(false);
    const res = await onRequest(context(), ok);
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
  });

  it('no afegeix X-Robots-Tag quan INDEXABLE és cert', async () => {
    const { onRequest } = await carrega(true);
    const res = await onRequest(context(), ok);
    expect(res.headers.has('X-Robots-Tag')).toBe(false);
  });

  it('aplica Cache-Control segons l\'estat', async () => {
    const { onRequest } = await carrega(true);
    const { CACHE_OK, CACHE_NOT_FOUND } = await import('../src/lib/cache.js');
    expect((await onRequest(context(), ok)).headers.get('Cache-Control')).toBe(CACHE_OK);
    const res = await onRequest(context('/no/'), () => Promise.resolve(new Response('x', { status: 404 })));
    expect(res.headers.get('Cache-Control')).toBe(CACHE_NOT_FOUND);
  });

  it('una resposta 200 que ja porta Cache-Control el conserva', async () => {
    const { onRequest } = await carrega(true);
    const res = await onRequest(context(), () => Promise.resolve(new Response('x', { status: 200, headers: { 'Cache-Control': 'public, max-age=5' } })));
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=5');
  });

  it('si next() llança, respon 500 sense caché i amb «Error temporal»', async () => {
    const { onRequest } = await carrega(true);
    const res = await onRequest(context(), () => Promise.reject(new Error('Firestore caigut')));
    expect(res.status).toBe(500);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(await res.text()).toContain('Error temporal');
  });

  describe('aliases de Hugo', () => {
    const pig = { id: 'pig', slug: 'pig', data: '2026-06-25', hora: '19:00', publicada: true, publica: { aliases: ['/programacio/25-de-juny-pig/'] } };

    it('redirigeix amb 301 un alias que dona 404', async () => {
      sessionsMock.mockResolvedValue([pig]);
      const { onRequest } = await carrega(true);
      const res = await onRequest(context('/programacio/25-de-juny-pig/'), no404);
      expect(res.status).toBe(301);
      expect(res.headers.get('Location')).toBe('/programacio/2026/pig/');
    });

    it('un 404 que no és alias continua sent 404', async () => {
      sessionsMock.mockResolvedValue([pig]);
      const { onRequest } = await carrega(true);
      const res = await onRequest(context('/programacio/altra/'), no404);
      expect(res.status).toBe(404);
    });

    it('només comprova aliases sota /programacio/: la resta de 404 no toquen Firestore', async () => {
      const { onRequest } = await carrega(true);
      for (const ruta of ['/foo.xml', '//evil.com', '/404', '/_astro/vell.abc123.js', '/directors/no-hi-es/', '/programacio']) {
        const res = await onRequest(context(ruta), no404);
        expect(res.status, ruta).toBe(404);
      }
      expect(sessionsMock).not.toHaveBeenCalled();
    });

    it('una ruta sota /programacio/ que no és alias fa una sola lectura per petició', async () => {
      const { onRequest } = await carrega(true);
      const res = await onRequest(context('/programacio/altra/'), no404);
      expect(res.status).toBe(404);
      expect(sessionsMock).toHaveBeenCalledTimes(1);
    });

    it('no llegeix sessions si la resposta no és un 404', async () => {
      const { onRequest } = await carrega(true);
      await onRequest(context('/programacio/25-de-juny-pig/'), ok);
      expect(sessionsMock).not.toHaveBeenCalled();
    });

    it('si Firestore falla en comprovar l\'alias, es manté el 404', async () => {
      sessionsMock.mockRejectedValue(new Error('caigut'));
      const { onRequest } = await carrega(true);
      const res = await onRequest(context('/programacio/25-de-juny-pig/'), no404);
      expect(res.status).toBe(404);
    });
  });
});
