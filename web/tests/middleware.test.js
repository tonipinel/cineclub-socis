import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Les sessions (Firestore) es substitueixen per un mock: el middleware només les llegeix quan una
// petició acaba en 404, per comprovar si és un alias de Hugo.
const {
  sessionsMock, paginaMock, entitatsMock, carregadesMock, distribuidoresMock, distribuidoresCarregadesMock,
} = vi.hoisted(() => ({
  sessionsMock: vi.fn(),
  paginaMock: vi.fn(),
  entitatsMock: vi.fn(),
  carregadesMock: vi.fn(),
  distribuidoresMock: vi.fn(),
  distribuidoresCarregadesMock: vi.fn(),
}));
vi.mock('../src/lib/sessions.js', () => ({ sessionsPubliques: sessionsMock }));
// El catàleg d'entitats es carrega (Firestore) abans de renderitzar cada pàgina HTML.
vi.mock('../src/lib/entitats.js', () => ({ carregaEntitats: entitatsMock, entitatsCarregades: carregadesMock }));
// I també el de distribuïdores (logo de la fitxa de la sessió).
vi.mock('../src/lib/distribuidores.js', () => ({ carregaDistribuidores: distribuidoresMock, distribuidoresCarregades: distribuidoresCarregadesMock }));
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
    entitatsMock.mockReset();
    entitatsMock.mockResolvedValue(undefined);
    carregadesMock.mockReset();
    carregadesMock.mockReturnValue(true);
    distribuidoresMock.mockReset();
    distribuidoresMock.mockResolvedValue(undefined);
    distribuidoresCarregadesMock.mockReset();
    distribuidoresCarregadesMock.mockReturnValue(true);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('afegeix les capçaleres de seguretat a totes les respostes (200, 400, 404, 500)', async () => {
    const { onRequest } = await carrega(true);
    const trencat = () => Promise.reject(new Error('caiguda'));
    const dolenta = () => Promise.resolve(new Response('x', { status: 400 }));
    const respostes = [
      await onRequest(context(), ok),
      await onRequest(context('/x'), no404),
      await onRequest(context('/api/img.webp'), dolenta),
      await onRequest(context(), trencat),
    ];
    expect(respostes.map((r) => r.status)).toEqual([200, 404, 400, 500]);
    for (const res of respostes) {
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('Content-Security-Policy')).toBe("frame-ancestors 'self'");
      expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(res.headers.get('Permissions-Policy')).toBe('camera=(self), microphone=(), geolocation=(), payment=()');
      expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=31536000');
    }
  });

  it('les capçaleres de seguretat no toquen el Cache-Control', async () => {
    const { onRequest } = await carrega(true);
    const ambCache = () => Promise.resolve(new Response('x', { status: 200, headers: { 'Cache-Control': 'public, max-age=1' } }));
    expect((await onRequest(context('/robots.txt'), ambCache)).headers.get('Cache-Control')).toBe('public, max-age=1');
    expect((await onRequest(context('/x'), no404)).headers.get('Cache-Control')).toBe('public, max-age=60, s-maxage=300');
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

  describe('catàleg d\'entitats', () => {
    it('es carrega abans de next() per a les pàgines HTML', async () => {
      const { onRequest } = await carrega(true);
      const ordre = [];
      entitatsMock.mockImplementation(async () => { ordre.push('entitats'); });
      for (const cami of ['/', '/programacio/2026/pig/', '/programacio/2026/pig/cartell.html', '/fes-te-socia/']) {
        await onRequest(context(cami), () => { ordre.push('next'); return ok(); });
      }
      expect(ordre).toEqual(['entitats', 'next', 'entitats', 'next', 'entitats', 'next', 'entitats', 'next']);
    });

    it('si la càrrega rebutja, la pàgina HTML retorna la resposta de next() amb el seu estat', async () => {
      const { onRequest } = await carrega(true);
      entitatsMock.mockRejectedValue(new Error('caiguda'));
      const res = await onRequest(context('/programacio/'), ok);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('<p>hola</p>');
      const res404 = await onRequest(context('/no-existeix/'), no404);
      expect(res404.status).toBe(404);
      expect(entitatsMock).toHaveBeenCalledTimes(2);
    });

    it('si el catàleg no s\'ha carregat mai, una pàgina HTML 200 porta una caché curta amb el mateix estat i cos', async () => {
      const { onRequest } = await carrega(true);
      const { CACHE_CLIENT, CACHE_OK, CACHE_AVUI, CACHE_NOT_FOUND, CACHE_REDIRECT } = await import('../src/lib/cache.js');
      carregadesMock.mockReturnValue(false);
      distribuidoresCarregadesMock.mockReturnValue(false);
      entitatsMock.mockRejectedValue(new Error('caiguda'));
      distribuidoresMock.mockRejectedValue(new Error('caiguda'));
      const res = await onRequest(context('/programacio/2026/pig/'), ok);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('<p>hola</p>');
      expect(res.headers.get('Cache-Control')).toBe(CACHE_CLIENT);
      const avui = await onRequest(context('/'), () => Promise.resolve(new Response('a', { status: 200, headers: { 'Cache-Control': CACHE_AVUI } })));
      expect(avui.headers.get('Cache-Control')).toBe(CACHE_CLIENT);
      expect((await onRequest(context('/no-existeix/'), no404)).headers.get('Cache-Control')).toBe(CACHE_NOT_FOUND);
      sessionsMock.mockResolvedValue([{ id: 'pig', slug: 'pig', data: '2026-06-25', hora: '19:00', publicada: true, publica: { aliases: ['/programacio/25-de-juny-pig/'] } }]);
      const alias = await onRequest(context('/programacio/25-de-juny-pig/'), no404);
      expect(alias.status).toBe(301);
      expect(alias.headers.get('Cache-Control')).toBe(CACHE_REDIRECT);
      // Una imatge (no HTML) conserva la seva caché encara que el catàleg no s'hagi carregat.
      expect((await onRequest(context('/api/img.webp'), ok)).headers.get('Cache-Control')).toBe(CACHE_OK);
    });

    it('un cop carregat el catàleg, la pàgina HTML porta la caché normal', async () => {
      const { onRequest } = await carrega(true);
      const { CACHE_OK, CACHE_AVUI } = await import('../src/lib/cache.js');
      carregadesMock.mockReturnValue(true);
      expect((await onRequest(context('/programacio/2026/pig/'), ok)).headers.get('Cache-Control')).toBe(CACHE_OK);
      const avui = await onRequest(context('/'), () => Promise.resolve(new Response('a', { status: 200, headers: { 'Cache-Control': CACHE_AVUI } })));
      expect(avui.headers.get('Cache-Control')).toBe(CACHE_AVUI);
    });

    it('les imatges, els estàtics i els endpoints de dades no la criden', async () => {
      const { onRequest } = await carrega(true);
      for (const cami of ['/apple-touch-icon.png', '/images/entitats/ateneu-rodenc.jpg', '/api/img.webp', '/index.xml', '/programacio/index.xml', '/sitemap.xml', '/robots.txt', '/propostes/votar/og.jpg', '/favicon.ico']) {
        await onRequest(context(cami), ok);
      }
      expect(entitatsMock).not.toHaveBeenCalled();
      expect(distribuidoresMock).not.toHaveBeenCalled();
    });
  });

  describe('catàleg de distribuïdores', () => {
    it('es carrega, amb el d\'entitats, abans de next() per a les pàgines HTML', async () => {
      const { onRequest } = await carrega(true);
      const ordre = [];
      entitatsMock.mockImplementation(async () => { ordre.push('entitats'); });
      distribuidoresMock.mockImplementation(async () => { ordre.push('distribuidores'); });
      for (const cami of ['/', '/programacio/2026/pig/cartell.html']) {
        await onRequest(context(cami), () => { ordre.push('next'); return ok(); });
      }
      expect(ordre).toEqual(['entitats', 'distribuidores', 'next', 'entitats', 'distribuidores', 'next']);
    });

    it('la fallada d\'un catàleg no afecta la resposta ni la càrrega de l\'altre', async () => {
      const { onRequest } = await carrega(true);
      distribuidoresMock.mockRejectedValue(new Error('caiguda'));
      const res = await onRequest(context('/programacio/2026/pig/'), ok);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('<p>hola</p>');
      expect(entitatsMock).toHaveBeenCalledTimes(1);
      entitatsMock.mockRejectedValue(new Error('caiguda'));
      distribuidoresMock.mockResolvedValue(undefined);
      const res2 = await onRequest(context('/programacio/2026/pig/'), ok);
      expect(res2.status).toBe(200);
      expect(distribuidoresMock).toHaveBeenCalledTimes(2);
    });

    it('la caché normal només s\'aplica si els dos catàlegs s\'han carregat; si en falta un, la curta', async () => {
      const { onRequest } = await carrega(true);
      const { CACHE_CLIENT, CACHE_OK } = await import('../src/lib/cache.js');
      const cache = async (entitats, distribuidores) => {
        carregadesMock.mockReturnValue(entitats);
        distribuidoresCarregadesMock.mockReturnValue(distribuidores);
        return (await onRequest(context('/programacio/2026/pig/'), ok)).headers.get('Cache-Control');
      };
      expect(await cache(true, true)).toBe(CACHE_OK);
      expect(await cache(true, false)).toBe(CACHE_CLIENT);
      expect(await cache(false, true)).toBe(CACHE_CLIENT);
      expect(await cache(false, false)).toBe(CACHE_CLIENT);
    });
  });
});

