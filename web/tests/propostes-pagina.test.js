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
    expect(descripcio).toMatch(/persones sòcies .*proposen pel·lícules/);
    expect(descripcio).toMatch(/👍 o 👎 a cada tanda de pel·lícules/);
    expect(descripcio).toMatch(/programació del proper trimestre/);
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
    expect(html).toMatch(/<div class="propostes-app">[\s\S]*<astro-island [^>]*component-url="[^"]*IllaPropostes[^"]*"[^>]*client="only"[^>]*>[\s\S]*?<\/astro-island><\/div><\/main>/);
    expect(html).toMatch(/renderer-url="[^"]+"/);
  });

  it('renderitza al servidor un únic h1 «Propostes de pel·lícules» i l\'explicació de com funcionen les propostes, fora de l\'illa', async () => {
    const { html } = await renderitza('/propostes/');
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toMatch(/<h1 class="propostes-intro__titol">Propostes de pel·lícules<\/h1>/);
    const intro = html.match(/<section class="propostes-intro"[\s\S]*?<\/section>/)?.[0];
    expect(intro).toBeDefined();
    expect(intro).toContain('Les persones sòcies podeu proposar pel·lícules.');
    expect(intro).toMatch(/La junta busca la distribuïdora de cada proposta/);
    expect(intro).toMatch(/pressupost, disponibilitat/);
    expect(intro).toMatch(/propera tanda de pel·lícules/);
    expect(intro).toMatch(/programació del proper trimestre/);
    expect(intro).not.toContain('astro-island');
    // El botó gran el porta l'illa a aquest contenidor, que ja en reserva l'alçada.
    expect(intro).toContain('<div class="propostes-intro__accio" id="propostes-intro-accio"></div>');
    expect(html).not.toMatch(/vota les que vols veure/);
    expect(html.indexOf('class="propostes-intro"')).toBeLessThan(html.indexOf('<astro-island'));
  });

  it('en mode immersiu la intro s\'amaga amb la classe del cos; si ja hi ha identitat, s\'amaga abans de muntar l\'illa', async () => {
    const css = readFileSync(new URL('../src/styles/components/propostes.css', import.meta.url), 'utf8');
    expect(css).toMatch(/body\.propostes-immersiu-body \.propostes-intro\s*\{\s*@apply hidden;/);
    const { html } = await renderitza('/propostes/');
    expect(html).toMatch(/<script>[^<]*sessionStorage\.getItem\('cineclub\.identitat'\)[^<]*classList\.add\('propostes-immersiu-body'\)/);
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
    expect(html).toMatch(/<div class="propostes-app">[\s\S]*<astro-island [^>]*component-url="[^"]*IllaProposar[^"]*"[^>]*client="only"[^>]*>[\s\S]*?<\/astro-island><\/div><\/main>/);
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

  it('té el títol i la descripció de la pàgina, i cap canonical (és noindex; l\'og:url sí que hi és)', async () => {
    const { status, html } = await renderitza('/propostes/votar/', { PUBLIC_SITE_URL: 'https://cineclubrodadebera.cat' });
    expect(status).toBe(200);
    expect(extreuTitol(html)).toBe('Vota les propostes · Cineclub Roda de Berà');
    expect(extreuDescripcio(html)).toBe('Escaneja el teu carnet i dona el teu 👍 o 👎 a les pel·lícules proposades per les persones sòcies.');
    expect(html).not.toContain('rel="canonical"');
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
    expect(meta(html, 'property', 'og:image')).toBe('https://cineclubrodadebera.cat/propostes/votar/og.jpg');
    expect(meta(html, 'property', 'og:image:type')).toBe('image/jpeg');
    expect(meta(html, 'property', 'og:image:width')).toBe('1200');
    expect(meta(html, 'property', 'og:image:height')).toBe('630');
    expect(meta(html, 'name', 'twitter:image')).toBe('https://cineclubrodadebera.cat/propostes/votar/og.jpg');
    expect(meta(html, 'property', 'og:url')).toBe('https://cineclubrodadebera.cat/propostes/votar/');
    expect(meta(html, 'property', 'og:type')).toBe('website');
    expect(meta(html, 'property', 'og:locale')).toBe('ca_ES');
    for (const nom of ['og:title', 'og:description', 'og:image', 'og:image:type', 'og:image:width', 'og:image:height', 'og:url', 'og:type', 'og:locale']) {
      expect(html.match(new RegExp(`property="${nom}"`, 'g'))).toHaveLength(1);
    }
    expect(existsSync(new URL('../public/images/entitats/cineclub-roda-de-bera.png', import.meta.url))).toBe(true);
  });

  it('munta l\'illa de React només al client, dins <div class="propostes-app">', async () => {
    const { html } = await renderitza('/propostes/votar/');
    expect(html).toMatch(/<div class="propostes-app">[\s\S]*<astro-island [^>]*component-url="[^"]*IllaVotar[^"]*"[^>]*client="only"[^>]*>[\s\S]*?<\/astro-island><\/div><\/main>/);
    expect(html).not.toContain('IllaPropostes');
  });

  it('no carrega cap full de Google Fonts: Inter 700 surt de la font autoallotjada', async () => {
    const { html } = await renderitza('/propostes/votar/');
    expect(html).not.toContain('fonts.googleapis.com');
  });

  it('/propostes/ comparteix el collage de la tanda com a og:image; el títol social de /propostes/ i /propostes/proposar/ = títol', async () => {
    const propostes = (await renderitza('/propostes/')).html;
    expect(meta(propostes, 'property', 'og:title')).toBe('Propostes de programació');
    expect(meta(propostes, 'property', 'og:image')).toBe('https://cineclub-web.web.app/propostes/votar/og.jpg');
    expect(meta(propostes, 'property', 'og:image:width')).toBe('1200');
    expect(meta(propostes, 'property', 'og:image:height')).toBe('630');
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

describe('estils de la tanda (aspecte de landing)', () => {
  const css = readFileSync(new URL('../src/styles/components/propostes.css', import.meta.url), 'utf8');
  const regla = (classe) => css.match(new RegExp(`(?:^|\\n)\\${classe} \\{([^}]*)\\}`))?.[1] ?? '';

  it('la intro, el títol i el text de la tanda i el botó de votar són centrats', () => {
    expect(regla('.propostes-intro')).toMatch(/\bitems-center\b[^;]*\btext-center\b/);
    expect(regla('.tanda-publica')).toMatch(/\bitems-center\b/);
    expect(regla('.tanda-publica__titol')).toMatch(/\btext-center\b/);
    expect(regla('.tanda-publica__text')).toMatch(/\btext-center\b/);
    expect(regla('.tanda-publica__votar')).not.toMatch(/self-start/);
  });

  it('la graella és de cartells 2:3, amb el focus del teclat visible, i ja no hi ha targetes ni botons de vot', () => {
    expect(regla('.propostes-public__llista')).toMatch(/\bgrid\b/);
    expect(regla('.cartell-tanda__imatge')).toMatch(/aspect-\[2\/3\][^;]*object-cover/);
    expect(regla('.cartell-tanda__obrir')).toMatch(/focus-visible:outline/);
    expect(css).not.toMatch(/\.proposta-carta__(accio|footer|vot-bloc|sinopsi|data|info)\b/);
    expect(css).not.toContain('.proposta-detall__footer');
  });

  it('el peu del detall queda fix a baix (fora del scroll), centrat, amb el marge de l\'àrea segura i sota el lector', () => {
    const peu = regla('.proposta-detall__peu');
    expect(peu).toMatch(/\bflex-shrink-0\b/);
    expect(peu).toMatch(/\bjustify-center\b/);
    expect(peu).toMatch(/env\(safe-area-inset-bottom\)/);
    expect(peu).toMatch(/\bz-10\b/);
    expect(regla('.propostes-public__overlay')).toMatch(/\bz-40\b/);
    expect(regla('.proposta-detall__votar')).toMatch(/focus-visible:outline/);
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
