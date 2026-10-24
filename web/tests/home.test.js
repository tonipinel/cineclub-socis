import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import Portada from '../src/pages/index.astro';
import Programacio from '../src/pages/programacio/index.astro';
import { CACHE_AVUI } from '../src/lib/cache.js';

vi.mock('../src/lib/db.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => globalThis.__dbFals,
}));

const ST = 'https://firebasestorage.googleapis.com/v0/b/cineclub-socis.firebasestorage.app/o/web%2F';
const sessio = (id, data, publica = {}, extra = {}) => ({
  id: `${id}-id`,
  titol: id,
  slug: id,
  publicada: true,
  data,
  hora: '19:00',
  publica: { seccio: 'cartellera', organitza: 'cineclub', cartell: `${ST}sessions%2F${id}%2Fposter.jpg?alt=media`, ...publica },
  ...extra,
});

const sessions = [
  sessio('the-artist', '2026-03-05', { titolTraduit: "L'artista" }),
  sessio('pig', '2026-06-25'),
  sessio('abejas', '2026-10-08'),
  sessio('night', '2026-10-22', { seccio: 'extra' }),
  sessio('esborrany', '2026-11-12', {}, { publicada: false }),
  sessio('antiga', '2025-05-01', { seccio: 'xarxa' }),
];

const portada = {
  slug: 'portada',
  titol: 'Cineclub Roda de Berà',
  dades: {
    features: [
      { titol: "Suport de l'Ajuntament", text: 'Comptem amb el suport.', imatge: 'ajuntament.png' },
      { titol: 'Un projecte participatiu', text: 'El cineclub és participatiu.', imatge: 'participatiu.png' },
      { titol: 'Creixement de futur', text: 'Si el projecte creix.', imatge: 'creix.png' },
    ],
    membership_benefits: ['Un mínim de 12 projeccions anuals', 'Programació anunciada amb antelació'],
  },
  cos: "## Un nou espai de cinema a Roda de Berà\n\nRoda de Berà és municipi de cinema.",
  imatges: Object.fromEntries(['ajuntament', 'participatiu', 'creix', 'fes-te-socia', 'hero-logo', 'neix-espai'].map((n) => [`${n}.png`, `${ST}pagines%2F${n}.png?alt=media`])),
};
const programacio = {
  slug: 'programacio',
  titol: 'Programació',
  dades: { description: 'Consulta totes les pel·lícules programades.' },
  cos: 'Descobreix quines pel·lícules programem.',
  imatges: {},
};

const ambDb = (pagines = { portada, programacio }) => {
  globalThis.__dbFals = {
    collection: (nom) => ({
      get: async () => ({ docs: (nom === 'sessions' ? sessions : []).map(({ id, ...dades }) => ({ id, data: () => dades })) }),
      doc: (id) => ({ get: async () => ({ exists: nom === 'pagines' && !!pagines[id], data: () => pagines[id] }) }),
    }),
  };
};
const renderitza = async (Pagina, ruta) => {
  const container = await AstroContainer.create();
  const resposta = await container.renderToResponse(Pagina, { routeType: 'page', request: new Request(`https://cineclub-web.web.app${ruta}`) });
  return { status: resposta.status, html: await resposta.text(), headers: resposta.headers };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-21T12:00:00+02:00'));
  ambDb();
});
afterEach(() => vi.useRealTimers());

describe('portada', () => {
  it('pinta el hero, el títol del web i el menú «Inici» actiu', async () => {
    const { status, html } = await renderitza(Portada, '/');
    expect(status).toBe(200);
    expect(html).toContain('<title>Cineclub Roda de Berà</title>');
    expect(html).toContain('<span class="hero__tagline--white">Un espai per viure i compartir </span><br>');
    expect(html).toContain('<span class="hero__tagline--gold">cinema durant tot l&#39;any!</span>');
    expect(html).toContain('class="site-header__link site-header__link--active" href="/">Inici</a>');
    expect(html).toContain('<a class="btn btn--outline" href="/propostes/">Veure propostes</a>');
    expect(html).not.toContain('associacio.cineclubrodadebera.cat');
    expect(html).toContain('<link rel="canonical" href="https://cineclub-web.web.app/">');
  });

  it('inclou el JSON-LD de l\'organització', async () => {
    const { html } = await renderitza(Portada, '/');
    expect(html).toContain('<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","email":"cineclub.rodadebera@gmail.com","logo":"https://cineclub-web.web.app/images/entitats/cineclub-roda-de-bera.png","name":"Cineclub Roda de Berà","sameAs":["https://www.instagram.com/cineclub.rodadebera","https://www.facebook.com/cineclub.rodadebera"],"url":"https://cineclub-web.web.app/"}</script>');
  });

  it('serveix les imatges de la pàgina redimensionades (600, 500, 200 i 160)', async () => {
    const { html } = await renderitza(Portada, '/');
    const url = (nom, w) => `/api/img.webp?w=${w}&amp;u=${encodeURIComponent(`${ST}pagines%2F${nom}.png?alt=media`)}`;
    expect(html).toContain(`<img class="hero__logo" src="${url('hero-logo', 600)}" alt="Cineclub Roda de Berà">`);
    expect(html).toContain(`<img class="intro__poster" src="${url('neix-espai', 500)}" alt="">`);
    expect(html).toContain(`<img class="features__icon" src="${url('ajuntament', 200)}" alt="">`);
    expect(html).toContain(`<img class="membership-teaser__icon" src="${url('fes-te-socia', 160)}" alt="">`);
  });

  it('pinta les tres targetes de features i els beneficis', async () => {
    const { html } = await renderitza(Portada, '/');
    expect(html.match(/class="features__item"/g)).toHaveLength(3);
    expect(html).toContain('<h2 class="features__title">Suport de l&#39;Ajuntament</h2>');
    expect(html).toContain('<h2 class="features__title">Creixement de futur</h2>');
    expect(html).toContain('<li>Un mínim de 12 projeccions anuals</li>');
    expect(html).toContain('<li>Programació anunciada amb antelació</li>');
  });

  it('el botó Fes-te sòcia/soci apunta a /fes-te-socia/', async () => {
    const { html } = await renderitza(Portada, '/');
    expect(html.match(/<a class="btn" href="\/fes-te-socia\/">Fes-te sòcia\/soci<\/a>/g)).toHaveLength(2);
  });

  it('renderitza el cos en Markdown amb el títol especial', async () => {
    const { html } = await renderitza(Portada, '/');
    expect(html).toContain('<h2 id="un-nou-espai-de-cinema-a-roda-de-berà">Un nou espai de cinema<br><span class="text-gold">A Roda de Berà</span></h2>');
  });

  it('«Properes sessions» emet totes les publicades amagades, amb la data ISO, i no les no publicades', async () => {
    const { html } = await renderitza(Portada, '/');
    const dates = [...html.matchAll(/class="next-session__item" data-session-date="([^"]+)" hidden/g)].map((m) => m[1]);
    // De la més nova a la més antiga (com Hugo), també les passades: filtra el script del navegador.
    expect(dates).toEqual([
      '2026-10-22T19:00:00+02:00',
      '2026-10-08T19:00:00+02:00',
      '2026-06-25T19:00:00+02:00',
      '2026-03-05T19:00:00+01:00',
      '2025-05-01T19:00:00+02:00',
    ]);
    expect(html).not.toContain('esborrany');
    expect(html).toContain('<div class="next-session-wrapper" data-next-session-wrapper hidden>');
    expect(html).toContain('var upcoming = items');
  });

  it('el mosaic porta fins a 9 cartells a 300: la resta en ordre descendent i les properes al final', async () => {
    const { html } = await renderitza(Portada, '/');
    const mosaic = html.split('<div class="programming__mosaic">')[1].split('</div>')[0];
    const ids = [...mosaic.matchAll(/sessions%252F([^%]+)%252F/g)].map((m) => m[1]);
    expect(ids).toEqual(['abejas', 'pig', 'the-artist', 'antiga', 'night']);
    expect(mosaic).toContain('class="programming__mosaic-img"');
    expect(mosaic).toContain('w=300');
  });
});

describe('/programacio/', () => {
  it('té el títol, la descripció i la introducció de pagines/programacio', async () => {
    const { status, html } = await renderitza(Programacio, '/programacio/');
    expect(status).toBe(200);
    expect(html).toContain('<title>Programació · Cineclub Roda de Berà</title>');
    expect(html).toContain('<meta name="description" content="Consulta totes les pel·lícules programades.">');
    expect(html).toContain('<h1 class="page-hero__title">Programació</h1>');
    expect(html).toContain('<div class="page-hero__hook"><p>Descobreix quines pel·lícules programem.</p>\n</div>');
    expect(html).toContain('class="site-header__link site-header__link--active" href="/programacio/">Programació</a>');
  });

  it('agrupa per any (descendent), cada any de la sessió més antiga a la més nova', async () => {
    const { html } = await renderitza(Programacio, '/programacio/');
    expect([...html.matchAll(/programacio-year__title">(\d+)</g)].map((m) => m[1])).toEqual(['2026', '2025']);
    const grid2026 = html.split('<div class="session-grid">')[1];
    const urls = [...grid2026.split('programacio-year')[0].matchAll(/session-card__link" href="([^"]+)"/g)].map((m) => m[1]);
    expect(urls).toEqual(['/programacio/2026/the-artist/', '/programacio/2026/pig/', '/programacio/2026/abejas/', '/programacio/2026/night/']);
    expect(html).not.toContain('esborrany');
  });

  it('el filtre de seccions segueix l\'ordre alfabètic de claus de Hugo', async () => {
    const { html } = await renderitza(Programacio, '/programacio/');
    expect([...html.matchAll(/data-filter-value="([^"]+)"/g)].map((m) => m[1])).toEqual(['all', 'cartellera', 'extra', 'xarxa']);
    expect(html).toContain('<button type="button" class="section-filter__btn" data-filter-value="xarxa" style="--filter-color: #2f6f76;">Xarxa</button>');
  });

  it('el calendari llista les sessions i 3 «Per determinar»', async () => {
    const { html } = await renderitza(Programacio, '/programacio/');
    expect(html).toContain('<li class="calendar__item" data-calendar-date="2026-06-25T19:00:00+02:00">');
    expect(html).toContain('<a class="calendar__link" href="/programacio/2026/pig/">');
    expect(html.match(/calendar__title calendar__title--pending">Per determinar</g)).toHaveLength(3);
    expect(html).toContain('data-calendar-date="2026-11-05T19:00:00+01:00"');
  });

  it('inclou els mateixos «Properes sessions» que la portada', async () => {
    const { html } = await renderitza(Programacio, '/programacio/');
    expect(html).toContain('data-session-date="2026-10-22T19:00:00+02:00"');
  });

  it('sense pagines/programacio cau en el títol per defecte', async () => {
    ambDb({});
    const { status, html } = await renderitza(Programacio, '/programacio/');
    expect(status).toBe(200);
    expect(html).toContain('<h1 class="page-hero__title">Programació</h1>');
  });
});

describe('robustesa davant de dades de Firestore absents o nul·les', () => {
  it('la portada sense pagines/portada es renderitza (sense features, beneficis ni imatges)', async () => {
    ambDb({});
    const { status, html } = await renderitza(Portada, '/');
    expect(status).toBe(200);
    expect(html).toContain('<title>Cineclub Roda de Berà</title>');
    expect(html).not.toContain('class="features__item"');
    expect(html).not.toContain('hero__logo');
    expect(html).toContain('<ul class="membership-teaser__list"></ul>');
  });

  it('la portada tolera `features` i `membership_benefits` nuls, `cos` nul i `imatges` nul', async () => {
    ambDb({ portada: { ...portada, dades: { features: null, membership_benefits: null }, cos: null, imatges: null } });
    const { status, html } = await renderitza(Portada, '/');
    expect(status).toBe(200);
    expect(html).not.toContain('class="features__item"');
    expect(html).not.toContain('<li>');
  });

  it('la portada tolera `dades` buides o nul·les', async () => {
    ambDb({ portada: { ...portada, dades: null } });
    expect((await renderitza(Portada, '/')).status).toBe(200);
    ambDb({ portada: { ...portada, dades: {} } });
    expect((await renderitza(Portada, '/')).status).toBe(200);
  });

  it('/programacio/ amb descripció buida usa la del web, com l\'`if` de Hugo', async () => {
    ambDb({ programacio: { ...programacio, dades: { description: '' } } });
    const { html } = await renderitza(Programacio, '/programacio/');
    expect(html).toContain('<meta name="description" content="Un espai per viure i compartir cinema durant tot l\'any!">');
  });

  it('/programacio/ amb títol buit cau en «Programació»', async () => {
    ambDb({ programacio: { ...programacio, titol: '' } });
    const { html } = await renderitza(Programacio, '/programacio/');
    expect(html).toContain('<h1 class="page-hero__title">Programació</h1>');
  });
});

describe('caché curta de les pàgines que depenen de la data d\'avui', () => {
  it('la portada i /programacio/ envien CACHE_AVUI', async () => {
    expect((await renderitza(Portada, '/')).headers.get('cache-control')).toBe(CACHE_AVUI);
    expect((await renderitza(Programacio, '/programacio/')).headers.get('cache-control')).toBe(CACHE_AVUI);
  });
});
