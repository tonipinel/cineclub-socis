import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { extreuCanonical, extreuDescripcio, extreuTitol } from '../scripts/check-urls-lib.mjs';
import reactServer from '@astrojs/react/server.js';
import menu from '../src/data/menu.json';

// Cada cas carrega els mòduls de nou perquè `INDEXABLE` es fixa en importar-los.
async function renderitza(ruta, env = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const container = await AstroContainer.create();
  container.addServerRenderer({ name: '@astrojs/react', renderer: reactServer });
  container.addClientRenderer({ name: '@astrojs/react', entrypoint: '@astrojs/react/client.js' });
  const { default: Pagina } = await import(ruta === '/propostes/' ? '../src/pages/propostes/index.astro' : '../src/pages/propostes/proposar/index.astro');
  const resposta = await container.renderToResponse(Pagina, { routeType: 'page', request: new Request(`https://cineclub-web.web.app${ruta}`) });
  return { status: resposta.status, html: await resposta.text() };
}

const ROBOTS = '<meta name="robots" content="index,follow,max-image-preview:large">';
const ACTIU_DESKTOP = 'class="site-header__link site-header__link--active" href="/propostes/">Propostes</a>';
const ACTIU_MOBIL = 'class="mobile-menu__link mobile-menu__link--active" href="/propostes/">Propostes</a>';

describe('/propostes/', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('té el títol, la descripció i el canonical de la pàgina', async () => {
    const { status, html } = await renderitza('/propostes/', { PUBLIC_SITE_URL: 'https://cineclubrodadebera.cat' });
    expect(status).toBe(200);
    expect(extreuTitol(html)).toBe('Propostes de programació · Cineclub Roda de Berà');
    expect(extreuDescripcio(html)).toMatch(/pel·lícules proposades per les persones sòcies/);
    expect(extreuCanonical(html)).toBe('https://cineclubrodadebera.cat/propostes/');
  });

  it('és indexable amb PUBLIC_INDEXABLE=true i no té meta robots sense', async () => {
    const indexable = (await renderitza('/propostes/', { PUBLIC_INDEXABLE: 'true' })).html;
    expect(indexable).toContain(ROBOTS);
    expect(indexable).not.toContain('noindex');
    expect((await renderitza('/propostes/', { PUBLIC_INDEXABLE: '' })).html).not.toContain('name="robots"');
  });

  it('munta l\'illa de React només al client, dins <div class="propostes-app"> (els estils de .btn en depenen)', async () => {
    const { html } = await renderitza('/propostes/');
    expect(html).toMatch(/<div class="propostes-app">[\s\S]*<astro-island [^>]*component-url="[^"]*IllaPropostes[^"]*"[^>]*client="only"[^>]*><\/astro-island><\/div><\/main>/);
    expect(html).toMatch(/renderer-url="[^"]+"/);
  });

  it('marca «Propostes» com a activa al menú d\'escriptori i al mòbil', async () => {
    const { html } = await renderitza('/propostes/');
    expect(html).toContain(ACTIU_DESKTOP);
    expect(html).toContain(ACTIU_MOBIL);
    expect(html.match(/--active"/g)).toHaveLength(2);
  });

  it('carrega el script de la salutació (al head) i no afegeix cap element a la capçalera', async () => {
    const { html } = await renderitza('/propostes/');
    expect(html.split('</head>')[0]).toContain('<script type="module" src="/js/salutacio.js"></script>');
    expect(html).not.toContain('capcalera-publica__salutacio');
    expect(html).toContain('</a><nav class="site-header__nav">');
  });
});

describe('/propostes/proposar/', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('té el títol de la pàgina i no s\'indexa mai, ni amb PUBLIC_INDEXABLE=true', async () => {
    const { html } = await renderitza('/propostes/proposar/', { PUBLIC_INDEXABLE: 'true' });
    expect(extreuTitol(html)).toBe('Proposa una pel·lícula · Cineclub Roda de Berà');
    expect(html).toContain('<meta name="robots" content="noindex,follow">');
    expect(html).not.toContain('index,follow,');
  });

  it.each([['true'], ['']])('emet noindex també amb PUBLIC_INDEXABLE=%j', async (indexable) => {
    const { html } = await renderitza('/propostes/proposar/', { PUBLIC_INDEXABLE: indexable });
    expect(html.match(/name="robots"/g)).toHaveLength(1);
    expect(html).toContain('content="noindex,follow"');
  });

  it('munta l\'illa de React només al client, dins <div class="propostes-app">', async () => {
    const { html } = await renderitza('/propostes/proposar/');
    expect(html).toMatch(/<div class="propostes-app">[\s\S]*<astro-island [^>]*component-url="[^"]*IllaProposar[^"]*"[^>]*client="only"[^>]*><\/astro-island><\/div><\/main>/);
  });

  it('marca «Propostes» com a activa al menú', async () => {
    const { html } = await renderitza('/propostes/proposar/');
    expect(html).toContain(ACTIU_DESKTOP);
    expect(html).toContain(ACTIU_MOBIL);
    expect(html.match(/--active"/g)).toHaveLength(2);
  });
});

describe('menú', () => {
  it('«Propostes» apunta a /propostes/ (ja no a l\'administració)', () => {
    expect(menu.find((i) => i.name === 'Propostes').url).toBe('/propostes/');
    expect(JSON.stringify(menu)).not.toContain('associacio.cineclubrodadebera.cat');
  });

  it('a les altres pàgines «Propostes» no és activa i cada entrada manté el comportament exacte de Hugo', async () => {
    const container = await AstroContainer.create();
    const { default: SiteHeader } = await import('../src/components/SiteHeader.astro');
    const actives = async (pathname) => {
      const html = await container.renderToString(SiteHeader, { props: { pathname } });
      return [...html.matchAll(/site-header__link--active" href="([^"]+)"/g)].map((m) => m[1]);
    };
    expect(await actives('/')).toEqual(['/']);
    expect(await actives('/programacio/')).toEqual(['/programacio/']);
    expect(await actives('/programacio/2026/pig/')).toEqual([]);
    expect(await actives('/fes-te-socia/')).toEqual(['/fes-te-socia/']);
    expect(await actives('/propostes/')).toEqual(['/propostes/']);
    expect(await actives('/propostes/proposar/')).toEqual(['/propostes/']);
    expect(await actives('/propostes-altres/')).toEqual([]);
  });
});

describe('estils de l\'illa', () => {
  it('.propostes-app té fons blanc (el body de la web és fosc) i és l\'àmbit de .btn', () => {
    const css = readFileSync(new URL('../src/styles/components/propostes-public.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.propostes-app \{\s*@apply flex-1 bg-white;\s*\}/);
    expect(css).toContain('body:has(.propostes-app)');
    expect(css).toContain(':where(.propostes-app) .btn');
  });
});

describe('script de la salutació', () => {
  it('és el mateix fitxer que carrega el layout i existeix a public/js', () => {
    expect(readFileSync(new URL('../public/js/salutacio.js', import.meta.url), 'utf8')).toContain('identitat-canviada');
  });
});
