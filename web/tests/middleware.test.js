import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Les sessions (Firestore) es substitueixen per un mock: el middleware només les llegeix quan una
// petició acaba en 404, per comprovar si és un alias de Hugo.
const { sessionsMock, paginaMock } = vi.hoisted(() => ({ sessionsMock: vi.fn(), paginaMock: vi.fn() }));
vi.mock('../src/lib/sessions.js', () => ({ sessionsPubliques: sessionsMock }));
vi.mock('../src/lib/pagines.js', async (importOriginal) => ({ ...(await importOriginal()), paginaPerSlug: paginaMock }));

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
    paginaMock.mockReset();
    paginaMock.mockResolvedValue(null);
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

  describe('imatges antigues de Hugo', () => {
    const STORAGE = 'https://firebasestorage.googleapis.com/v0/b/cineclub-socis.firebasestorage.app/o/web%2Fsessions%2Fpig%2F';
    const pig = {
      id: 'pig', slug: 'pig', data: '2026-06-25', hora: '19:00', publicada: true,
      publica: { aliases: ['/programacio/25-de-juny-pig/'], cartell: `${STORAGE}poster.jpg?alt=media`, galeria: [`${STORAGE}gallery-1.jpg?alt=media`] },
    };
    beforeEach(() => { sessionsMock.mockResolvedValue([pig]); });

    it('redirigeix amb 301 (URL absoluta de Storage, cache de redirecció) les que donen 404', async () => {
      const { onRequest } = await carrega(true);
      const { CACHE_REDIRECT } = await import('../src/lib/cache.js');
      for (const [cami, desti] of [
        ['/programacio/2026/pig/poster.jpg', pig.publica.cartell],
        ['/programacio/2026/pig/poster_hu123.jpg', pig.publica.cartell],
        ['/programacio/2026/pig/gallery-1.jpg', pig.publica.galeria[0]],
        ['/programacio/2026/pig/gallery-1_hu_da72240e6782de3b.jpg', pig.publica.galeria[0]],
      ]) {
        const res = await onRequest(context(cami), no404);
        expect(res.status, cami).toBe(301);
        expect(res.headers.get('Location')).toBe(desti);
        expect(res.headers.get('Cache-Control')).toBe(CACHE_REDIRECT);
      }
    });

    it('una imatge que no correspon a cap sessió publicada dona el 404 de la web', async () => {
      const { onRequest } = await carrega(true);
      for (const cami of ['/programacio/2026/altra/poster.jpg', '/programacio/2026/pig/gallery-9.jpg', '/programacio/2026/pig/poster.JPG']) {
        const next = vi.fn(no404);
        const res = await onRequest(context(cami), next);
        expect(res.status, cami).toBe(404);
        expect(next).toHaveBeenCalledWith();
      }
    });

    it('fa una sola lectura de sessions per a una imatge que dona 404', async () => {
      const { onRequest } = await carrega(true);
      await onRequest(context('/programacio/2026/pig/gallery-9.jpg'), no404);
      expect(sessionsMock).toHaveBeenCalledTimes(1);
    });

    it('si Firestore falla, la imatge dona 404', async () => {
      sessionsMock.mockRejectedValue(new Error('caigut'));
      const { onRequest } = await carrega(true);
      const res = await onRequest(context('/programacio/2026/pig/poster.jpg'), no404);
      expect(res.status).toBe(404);
    });

    it('no afecta la pàgina de la sessió, el cartell.html ni els aliases', async () => {
      const { onRequest } = await carrega(true);
      const pagina = vi.fn(ok);
      expect((await onRequest(context('/programacio/2026/pig/'), pagina)).status).toBe(200);
      expect(pagina).toHaveBeenCalledWith();
      const cartell = vi.fn(ok);
      expect((await onRequest(context('/programacio/2026/pig/cartell.html'), cartell)).status).toBe(200);
      expect(cartell).toHaveBeenCalledWith('/programacio/2026/pig/cartell.html/');
      const alias = await onRequest(context('/programacio/25-de-juny-pig/'), no404);
      expect(alias.status).toBe(301);
      expect(alias.headers.get('Location')).toBe('/programacio/2026/pig/');
      expect(sessionsMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('imatges antigues de les pàgines de Hugo', () => {
    const portada = { slug: 'portada', imatges: { 'hero-logo.png': 'https://firebasestorage.googleapis.com/v0/b/b/o/web%2Fpagines%2Fhero-logo.png?alt=media' } };
    const socia = { slug: 'fes-te-socia', imatges: { 'foto-public.jpg': 'https://firebasestorage.googleapis.com/v0/b/b/o/web%2Fpagines%2Ffoto-public.jpg?alt=media' } };
    beforeEach(() => {
      paginaMock.mockImplementation(async (slug) => ({ portada, 'fes-te-socia': socia })[slug] ?? null);
    });

    it('redirigeix /<fitxer> (portada) i /<slug>/<fitxer>, també les variants _hu, a la URL absoluta de Storage', async () => {
      const { onRequest } = await carrega(true);
      for (const [cami, desti] of [
        ['/hero-logo.png', portada.imatges['hero-logo.png']],
        ['/hero-logo_hu_4e5f1684bcb60cc8.png', portada.imatges['hero-logo.png']],
        ['/fes-te-socia/foto-public.jpg', socia.imatges['foto-public.jpg']],
        ['/fes-te-socia/foto-public_hu_1621aec05e5e09b6.jpg', socia.imatges['foto-public.jpg']],
      ]) {
        const res = await onRequest(context(cami), no404);
        expect(res.status, cami).toBe(301);
        expect(res.headers.get('Location')).toBe(desti);
      }
      expect(paginaMock.mock.calls.map(([slug]) => slug)).toEqual(['portada', 'portada', 'fes-te-socia', 'fes-te-socia']);
    });

    it('un nom que no és al mapa, una pàgina inexistent o una lectura fallida donen 404', async () => {
      const { onRequest } = await carrega(true);
      for (const cami of ['/hero.png', '/hero-logo.png.png', '/logo.png', '/no-hi-es/foto-public.jpg', '/privacitat/foto-public.jpg', '/hero-logo.PNG']) {
        expect((await onRequest(context(cami), no404)).status, cami).toBe(404);
      }
      paginaMock.mockRejectedValue(new Error('caigut'));
      expect((await onRequest(context('/hero-logo.png'), no404)).status).toBe(404);
      expect(sessionsMock).not.toHaveBeenCalled();
    });

    it('un slug que no és de cap pàgina (inventat o amb caràcters estranys) dona 404 sense llegir res ni escriure al log', async () => {
      const { onRequest } = await carrega(true);
      for (const cami of ['/slug-inventat/foto.jpg', '/__x__/a.png', '/x%2F..%2Fy/a.png', '/api/foto.jpg', '/programacio/x.jpg', '/programacio/abcd/pig/poster.jpg', '/programacio/2026/pig/a/b.jpg']) {
        expect((await onRequest(context(cami), no404)).status, cami).toBe(404);
      }
      expect(paginaMock).not.toHaveBeenCalled();
      expect(sessionsMock).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    });

    it('una imatge de sessió només llegeix les sessions (memoritzades), mai les pàgines', async () => {
      const { onRequest } = await carrega(true);
      await onRequest(context('/programacio/2026/pig/poster.jpg'), no404);
      expect(sessionsMock).toHaveBeenCalledTimes(1);
      expect(paginaMock).not.toHaveBeenCalled();
    });

    it('les rutes que ja responen (estàtics de web/public, /api/img.webp, pàgines) no passen pel redirector', async () => {
      const { onRequest } = await carrega(true);
      for (const cami of ['/apple-touch-icon.png', '/logo-footer.png', '/images/logo.png', '/images/entitats/ateneu-rodenc.jpg', '/api/img.webp', '/fes-te-socia/', '/hero-logo.png']) {
        const res = await onRequest(context(cami), ok);
        expect(res.status, cami).toBe(200);
      }
      expect(paginaMock).not.toHaveBeenCalled();
    });
  });
});

