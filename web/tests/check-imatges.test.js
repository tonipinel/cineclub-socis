import { describe, it, expect } from 'vitest';
import {
  aplicaConegudes, caminsImatgesHugo, extreuImatges, imatgesFirestore, motiuFallada, perLots, reescriuOrigen,
} from '../scripts/check-imatges-lib.mjs';

const PAGINA = 'https://web.cat/programacio/2026/pig/';

describe('extreuImatges', () => {
  it('troba img, srcset, source, icones, og/twitter, estils url() i JSON-LD, en URL absolutes i úniques', () => {
    const html = `<!doctype html><html><head>
      <link rel="icon" type="image/png" href="/favicon-32x32.png">
      <link rel=apple-touch-icon href=/apple-touch-icon.png>
      <link rel="shortcut icon" href="/favicon.ico">
      <link rel="stylesheet" href="/estil.css">
      <meta property="og:image" content="https://cdn.cat/og.jpg">
      <meta name="twitter:image" content="https://cdn.cat/og.jpg">
      <meta property="og:title" content="no.jpg">
      <script type="application/ld+json">{"@type":"ScreeningEvent","image":["https://cdn.cat/ld.jpg"],"organizer":{"logo":{"@type":"ImageObject","url":"/logo.png"}}}</script>
      <style>.hero{background:url('/images/cinema-pattern.jpg')}</style>
      </head><body>
      <img src="poster.jpg" alt="">
      <img src="/api/img.webp?w=400&amp;u=https%3A%2F%2Fx" srcset="/a.webp 400w, /b.webp 800w,/c.webp 2x">
      <picture><source srcset="/d.avif 1x" type="image/avif"><source src="/e.webp"></picture>
      <div style="background-image: url(&quot;/f.jpg&quot;)"></div>
      <img src="data:image/gif;base64,R0lGOD">
      <a href="/no.jpg">enllaç</a>
      </body></html>`;
    expect(extreuImatges(html, PAGINA).sort()).toEqual([
      'https://cdn.cat/ld.jpg',
      'https://cdn.cat/og.jpg',
      'https://web.cat/a.webp',
      'https://web.cat/api/img.webp?w=400&u=https%3A%2F%2Fx',
      'https://web.cat/apple-touch-icon.png',
      'https://web.cat/b.webp',
      'https://web.cat/c.webp',
      'https://web.cat/d.avif',
      'https://web.cat/e.webp',
      'https://web.cat/f.jpg',
      'https://web.cat/favicon-32x32.png',
      'https://web.cat/favicon.ico',
      'https://web.cat/images/cinema-pattern.jpg',
      'https://web.cat/logo.png',
      'https://web.cat/programacio/2026/pig/poster.jpg',
    ]);
  });

  it('un JSON-LD trencat no fa caure l\'extracció', () => {
    expect(extreuImatges('<script type="application/ld+json">{no</script><img src="/a.png">', PAGINA)).toEqual(['https://web.cat/a.png']);
  });
});

describe('caminsImatgesHugo', () => {
  it('retorna els camins d\'URL (NFC) de les imatges del build, i res més', () => {
    const fitxers = ['favicon.ico', 'index.html', 'images/logo.png', 'programacio/2026/pig/poster_hu_2d2b.jpg', 'icaa/icaa-7.svg',
      'a/b.gif', 'c.webp', 'd.jpeg', 'e.JPG', 'f.css', 'programacio/2026/esperando-a-dali/foto Dalí.jpg'.normalize('NFD')];
    expect(caminsImatgesHugo(fitxers)).toEqual(['/favicon.ico', '/images/logo.png', '/programacio/2026/pig/poster_hu_2d2b.jpg', '/icaa/icaa-7.svg',
      '/a/b.gif', '/c.webp', '/d.jpeg', '/programacio/2026/esperando-a-dali/foto Dalí.jpg']);
  });
});

describe('imatgesFirestore', () => {
  it('llegeix imatgeUrl, publica.cartell i publica.galeria de sessions, imatges de pagines i imatgeUrl de propostes', () => {
    const resultat = imatgesFirestore({
      sessions: [
        { id: 's1', imatgeUrl: 'https://vell.cat/p.jpg', publica: { cartell: 'https://st/c.jpg', galeria: ['https://st/g1.jpg', ''] } },
        { id: 's2', imatgeUrl: '' },
      ],
      pagines: [{ id: 'portada', imatges: { 'hero-logo.png': 'https://st/h.png', buit: null } }],
      propostes: [{ id: 'p1', imatgeUrl: 'https://image.tmdb.org/x.jpg' }, { id: 'p2', imatgeUrl: 'poster.jpg' }],
    });
    expect(resultat).toEqual([
      { url: 'https://vell.cat/p.jpg', origen: 'sessions/s1 imatgeUrl' },
      { url: 'https://st/c.jpg', origen: 'sessions/s1 publica.cartell' },
      { url: 'https://st/g1.jpg', origen: 'sessions/s1 publica.galeria[0]' },
      { url: 'https://st/h.png', origen: 'pagines/portada imatges.hero-logo.png' },
      { url: 'https://image.tmdb.org/x.jpg', origen: 'propostes/p1 imatgeUrl' },
      { url: 'poster.jpg', origen: 'propostes/p2 imatgeUrl' },
    ]);
  });
});

describe('motiuFallada', () => {
  const res = (status, tipus) => ({ status, headers: new Headers(tipus ? { 'content-type': tipus } : {}) });
  it('2xx amb content-type image/* és correcte', () => {
    expect(motiuFallada(res(200, 'image/jpeg'))).toBeNull();
    expect(motiuFallada(res(200, 'image/svg+xml; charset=utf-8'))).toBeNull();
  });
  it('explica la resta de respostes', () => {
    expect(motiuFallada(res(404, 'text/html'))).toBe('HTTP 404 (text/html)');
    expect(motiuFallada(res(200, 'text/html; charset=utf-8'))).toBe('HTTP 200 però content-type text/html; charset=utf-8');
    expect(motiuFallada(res(200))).toBe('HTTP 200 però content-type (cap)');
    expect(motiuFallada({ status: 0, error: 'ENOTFOUND', headers: new Headers() })).toBe('error de connexió: ENOTFOUND');
  });
});

describe('aplicaConegudes', () => {
  it('separa conegudes (per camí exacte o patró) i inesperades, i avisa de les entrades obsoletes', () => {
    const fallades = [
      { url: 'https://web.cat/programacio/2026/pig/gallery-1_hu_da72.jpg', motiu: 'HTTP 404' },
      { url: 'https://web.cat/favicon.ico', motiu: 'HTTP 404' },
      { url: 'https://web.cat/hero-logo.png', motiu: 'HTTP 404' },
    ];
    const permesos = [
      { patro: '_hu_[0-9a-f]+\\.jpg$', motiu: 'variant derivada' },
      { path: '/hero-logo.png', motiu: 'ara a Storage' },
      { path: '/ja-no.png', motiu: 'obsoleta' },
    ];
    const { conegudes, inesperades, obsoletes } = aplicaConegudes(fallades, permesos);
    expect(conegudes.map((f) => [f.url, f.coneguda])).toEqual([
      ['https://web.cat/programacio/2026/pig/gallery-1_hu_da72.jpg', 'variant derivada'],
      ['https://web.cat/hero-logo.png', 'ara a Storage'],
    ]);
    expect(inesperades.map((f) => f.url)).toEqual(['https://web.cat/favicon.ico']);
    expect(obsoletes).toEqual([permesos[2]]);
  });
});

describe('perLots', () => {
  it('processa tots els elements amb la concurrència limitada i en conserva l\'ordre', async () => {
    let actius = 0;
    let maxim = 0;
    const resultat = await perLots([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      actius++;
      maxim = Math.max(maxim, actius);
      await new Promise((r) => setTimeout(r, 5));
      actius--;
      return n * 2;
    });
    expect(resultat).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(maxim).toBe(3);
  });
});

describe('reescriuOrigen', () => {
  it('les URL de l\'origen indicat es comproven contra la base; la resta no canvia', () => {
    expect(reescriuOrigen('https://cineclubrodadebera.cat/programacio/2026/pig/poster.jpg', 'https://cineclubrodadebera.cat', 'http://127.0.0.1:5951'))
      .toBe('http://127.0.0.1:5951/programacio/2026/pig/poster.jpg');
    expect(reescriuOrigen('https://cineclubrodadebera.cat.evil/x.jpg', 'https://cineclubrodadebera.cat', 'http://b')).toBe('https://cineclubrodadebera.cat.evil/x.jpg');
    expect(reescriuOrigen('https://st/x.jpg', 'https://cineclubrodadebera.cat', 'http://b')).toBe('https://st/x.jpg');
    expect(reescriuOrigen('https://st/x.jpg', null, 'http://b')).toBe('https://st/x.jpg');
    expect(reescriuOrigen('poster.jpg', 'https://cineclubrodadebera.cat', 'http://b')).toBe('poster.jpg');
  });
});
