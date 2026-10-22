import { describe, it, expect, vi, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
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
  const pagines = {
    '/propostes/': () => import('../src/pages/propostes/index.astro'),
    '/propostes/proposar/': () => import('../src/pages/propostes/proposar/index.astro'),
    '/propostes/votar/': () => import('../src/pages/propostes/votar/index.astro'),
  };
  const { default: Pagina } = await pagines[ruta]();
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
    const descripcio = extreuDescripcio(html);
    expect(descripcio).toMatch(/pel·lícules que proposen les persones sòcies/);
    expect(descripcio).toMatch(/👍 o 👎 quan hi ha una tanda oberta/);
    expect(descripcio).not.toMatch(/vota les que vols veure/);
    expect(descripcio.length).toBeLessThanOrEqual(160);
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

  it('la capçalera no porta cap salutació: el DOM és el de Hugo', async () => {
    const { html } = await renderitza('/propostes/');
    expect(html).not.toContain('salutacio');
    expect(html).not.toContain('capcalera-publica');
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

describe('/propostes/votar/ (pàgina per compartir per WhatsApp)', () => {
  afterEach(() => vi.unstubAllEnvs());

  const meta = (html, atribut, nom) => html.match(new RegExp(`<meta ${atribut}="${nom}" content="([^"]*)"`))?.[1];

  it('té el títol, la descripció i el canonical de la pàgina', async () => {
    const { status, html } = await renderitza('/propostes/votar/', { PUBLIC_SITE_URL: 'https://cineclubrodadebera.cat' });
    expect(status).toBe(200);
    expect(extreuTitol(html)).toBe('Vota les propostes · Cineclub Roda de Berà');
    expect(extreuDescripcio(html)).toBe('Escaneja el teu carnet i dona el teu 👍 o 👎 a les pel·lícules proposades per les persones sòcies.');
    expect(extreuCanonical(html)).toBe('https://cineclubrodadebera.cat/propostes/votar/');
  });

  it.each([['true'], ['']])('no s\'indexa mai: noindex,follow amb PUBLIC_INDEXABLE=%j', async (indexable) => {
    const { html } = await renderitza('/propostes/votar/', { PUBLIC_INDEXABLE: indexable });
    expect(html.match(/name="robots"/g)).toHaveLength(1);
    expect(html).toContain('<meta name="robots" content="noindex,follow">');
    expect(html).not.toContain('index,follow,');
  });

  it('porta les etiquetes Open Graph per a la previsualització de WhatsApp, amb URLs absolutes', async () => {
    const { html } = await renderitza('/propostes/votar/', { PUBLIC_SITE_URL: 'https://cineclubrodadebera.cat' });
    expect(meta(html, 'property', 'og:title')).toBe('Vota les propostes · Cineclub Roda de Berà');
    expect(meta(html, 'property', 'og:description')).toBe('Escaneja el teu carnet i dona el teu 👍 o 👎 a les pel·lícules proposades per les persones sòcies.');
    expect(meta(html, 'property', 'og:image')).toBe('https://cineclubrodadebera.cat/images/entitats/cineclub-roda-de-bera.png');
    expect(meta(html, 'property', 'og:url')).toBe('https://cineclubrodadebera.cat/propostes/votar/');
    expect(meta(html, 'property', 'og:type')).toBe('website');
    expect(meta(html, 'property', 'og:locale')).toBe('ca_ES');
    for (const nom of ['og:title', 'og:description', 'og:image', 'og:url', 'og:type', 'og:locale']) {
      expect(html.match(new RegExp(`property="${nom}"`, 'g'))).toHaveLength(1);
    }
    expect(existsSync(new URL('../public/images/entitats/cineclub-roda-de-bera.png', import.meta.url))).toBe(true);
  });

  it('munta l\'illa de React només al client, dins <div class="propostes-app">', async () => {
    const { html } = await renderitza('/propostes/votar/');
    expect(html).toMatch(/<div class="propostes-app">[\s\S]*<astro-island [^>]*component-url="[^"]*IllaVotar[^"]*"[^>]*client="only"[^>]*><\/astro-island><\/div><\/main>/);
    expect(html).not.toContain('IllaPropostes');
  });

  it('carrega Inter 700 com /propostes/ (el «Proposada per» de la fitxa)', async () => {
    const { html } = await renderitza('/propostes/votar/');
    expect(html).toContain('<link href="https://fonts.googleapis.com/css2?family=Inter:wght@700&display=swap" rel="stylesheet">');
  });

  it('no canvia el <head> de /propostes/ ni de /propostes/proposar/ (títol social = títol)', async () => {
    const propostes = (await renderitza('/propostes/')).html;
    expect(meta(propostes, 'property', 'og:title')).toBe('Propostes de programació');
    expect(propostes).toContain('<meta name="twitter:card" content="summary_large_image">');
    const proposar = (await renderitza('/propostes/proposar/')).html;
    expect(meta(proposar, 'property', 'og:title')).toBe('Proposa una pel·lícula');
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

describe('estils de la votació', () => {
  const css = readFileSync(new URL('../src/styles/components/propostes.css', import.meta.url), 'utf8');

  it('la barra de progrés és sticky just sota la capçalera del web i la targeta hi compensa l\'scroll', () => {
    expect(css).toMatch(/\.votacio__capcalera \{[^}]*\bsticky\b[^}]*top-\[var\(--alcada-capcalera/);
    expect(css).toMatch(/\.targeta-vot \{[^}]*scroll-mt-\[calc\(var\(--alcada-capcalera/);
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

describe('estils de /propostes/votar/', () => {
  it('les classes de la pantalla d\'entrada són al CSS (sense Tailwind inline al marcat)', () => {
    const css = readFileSync(new URL('../src/styles/components/propostes.css', import.meta.url), 'utf8');
    for (const classe of ['.votar', '.votar__titol', '.votar__text', '.votar__registre']) {
      expect(css).toContain(`${classe} {`);
    }
    const jsx = readFileSync(new URL('../src/components/propostes/VotarPublic.jsx', import.meta.url), 'utf8');
    expect([...jsx.matchAll(/className="([^"]+)"/g)].map((m) => m[1]).join(' ')).not.toMatch(/\b(flex|mx-auto|text-\w+|px-\d|py-\d)\b/);
  });
});
