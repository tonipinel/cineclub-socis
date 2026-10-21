import { describe, it, expect, vi } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import SessioPagina from '../src/components/SessioPagina.astro';
import RutaSessio from '../src/pages/programacio/[any]/[slug].astro';
import Pagina404 from '../src/pages/404.astro';

vi.mock('../src/lib/db.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => globalThis.__dbFals,
}));

const STORAGE = 'https://firebasestorage.googleapis.com/v0/b/cineclub-socis.firebasestorage.app/o/web%2Fsessions%2Fpig%2F';

const completa = {
  id: 'pig-id',
  titol: 'Pig',
  slug: 'pig',
  publicada: true,
  data: '2026-06-25',
  hora: '19:00',
  publica: {
    titol: 'Pig',
    titolOriginal: 'Pig',
    titolTraduit: 'Porc',
    titolEspanya: 'Pig',
    trailerYoutubeId: 'TGOcqxU-_l8',
    directors: ['Michael Sarnoski'],
    guio: 'Michael Sarnoski i Vanessa Block',
    pais: 'Estats Units',
    any: 2021,
    durada: 92,
    idioma: 'Anglès',
    generes: ['Drama', 'Drama psicològic'],
    interprets: ['Nicolas Cage', 'Alex Wolff'],
    versioTipus: 'vose',
    preu: 5,
    queInclou: 'La sessió inclou projecció i col·loqui.',
    edatMinimaRecomanada: 7,
    suportDistribucio: 'A Contracorriente Films',
    seccio: 'cartellera',
    organitza: 'cineclub',
    participa: [],
    collabora: [],
    cartell: `${STORAGE}poster.jpg?alt=media`,
    galeria: [`${STORAGE}gallery-1.jpg?alt=media`, `${STORAGE}gallery-2.jpg?alt=media`],
    cos: "## Sinopsi\n\nEn Rob és un xef d'alta cuina.\n",
  },
};

// Sessió sense tràiler, durada, galeria ni cartell.
const minima = {
  id: 'min-id',
  titol: 'Una altra',
  slug: 'una-altra',
  publicada: true,
  data: '2026-11-05',
  hora: '19:00',
  publica: { titolOriginal: 'Una altra', directors: ['A B'], pais: 'França', any: 2000, idioma: 'Francès', preu: 0, seccio: 'cartellera', organitza: 'cineclub', cos: 'Text.' },
};

const render = async (sessio, sessions = [completa, minima]) => {
  const container = await AstroContainer.create();
  return container.renderToString(SessioPagina, { props: { sessio, sessions } });
};

describe('pàgina de sessió', () => {
  it('pinta el hero amb la data i la insígnia de secció', async () => {
    const html = await render(completa);
    expect(html).toContain('<h1 class="session-hero__title">Pig</h1>');
    expect(html).toContain('<p class="session-hero__subtitle">Porc</p>');
    expect(html).toContain('<span class="date-ca__main">Dijous 25 de juny</span><span class="date-ca__rest"> 2026 - 19:00h</span>');
    expect(html).toMatch(/<span class="section-badge section-badge--hero" data-seccio="cartellera" style="background-color: #bf9000;">Cartellera<\/span>/);
  });

  it('mostra Gratuït o l\'aportació segons el preu', async () => {
    expect(await render(completa)).toContain('<span class="info-item__price">5€</span>');
    const gratis = await render(minima);
    expect(gratis).toContain('<span class="info-item__price">0€</span>');
    expect(gratis).toContain('Entrada gratuïta');
    expect(gratis).not.toContain('Aportació requerida');
  });

  it('pinta el col·loqui només si hi ha queInclou', async () => {
    expect(await render(completa)).toContain('Col·loqui després<br/> de la projecció');
    expect(await render(minima)).not.toContain('Col·loqui');
  });

  it('pinta la icona d\'edat, la versió i els enllaços de taxonomies', async () => {
    const html = await render(completa);
    expect(html).toContain('src="/images/icaa/icaa-7.svg"');
    expect(html).toContain('No recomanada per a menors de 7 anys');
    expect(html).toContain('<span class="info-item__icon info-item__icon--text">V.O.S.E.</span>');
    expect(html).toContain('<a class="session-fitxa__taxonomy-link" href="/directors/michael-sarnoski/">Michael Sarnoski</a>');
    expect(html).toContain('href="/generes/drama-psicol%C3%B2gic/">Drama psicològic</a>');
    expect(html).toContain('href="/interprets/nicolas-cage/">Nicolas Cage</a>, <a');
  });

  it('serveix el cartell i la galeria pel redimensionador amb els amples de Hugo', async () => {
    const html = await render(completa);
    const imatge = (src, w) => `/api/img.webp?w=${w}&amp;u=${encodeURIComponent(src)}`;
    expect(html).toContain(`class="session-fitxa__poster" src="${imatge(completa.publica.cartell, 400)}"`);
    expect(html).toContain(`class="poster-modal__image" src="${imatge(completa.publica.cartell, 1400)}"`);
    expect(html).toContain(`class="session-gallery__image" src="${imatge(completa.publica.galeria[0], 800)}" alt="Fotograma de Pig"`);
    expect(html.match(/session-gallery__dot"?[ >]/g).length).toBeGreaterThan(0);
    expect(html).toContain('class="session-gallery__prev"');
  });

  it('pinta el distribuïdor amb logo i enllaç', async () => {
    const html = await render(completa);
    expect(html).toContain('src="/images/distribuidors/a-contracorriente.png"');
    expect(html).toContain('href="https://acontracorrientefilms.com/"');
  });

  it('pinta el tràiler només si hi ha trailerYoutubeId', async () => {
    expect(await render(completa)).toContain('src="https://www.youtube-nocookie.com/embed/TGOcqxU-_l8" title="Tràiler de Pig"');
    expect(await render(minima)).not.toContain('session-trailer');
  });

  it('renderitza una sessió sense tràiler, durada ni galeria sense aquests blocs', async () => {
    const html = await render(minima);
    expect(html).not.toContain('session-trailer');
    expect(html).not.toContain('session-gallery');
    expect(html).not.toContain('<dt class="session-fitxa__label">Durada</dt>');
    expect(html).not.toContain('session-fitxa__poster');
    expect(html).toContain('<h1 class="session-hero__title">Una altra</h1>');
    expect(html).toContain('<div class="session-body prose-ca"><p>Text.</p>');
  });

  it('no pinta el banner del cartell mentre CARTELL_ACTIU sigui fals', async () => {
    const html = await render(completa);
    expect(html).not.toContain('session-cartell-banner');
    expect(html).not.toContain('cartell.html');
  });

  it('renderitza el cos en Markdown i les sessions relacionades', async () => {
    const html = await render(completa);
    expect(html).toContain('<h2 id="sinopsi"><span class="prose-heading__icon">');
    expect(html).toContain('xef d&rsquo;alta cuina');
    expect(html).toContain('<h2 class="related-sessions__title">Sessions relacionades</h2>');
    expect(html).toContain('href="/programacio/2026/una-altra/"');
  });

  it('porta el títol, la descripció, la canònica i l\'og:image de head.html', async () => {
    const html = await render(completa);
    expect(html).toContain('<title>Pig · Cineclub Roda de Berà</title>');
    expect(html).toContain('<meta name="description" content="Pig (2021), dirigida per Michael Sarnoski. Sessió del Cineclub Roda de Berà a Roda de Berà.">');
    expect(html).toContain('<link rel="canonical" href="https://cineclub-web.web.app/programacio/2026/pig/">');
    expect(html).toContain(`<meta property="og:image" content="${completa.publica.cartell}">`);
    const senseCartell = await render(minima);
    expect(senseCartell).toContain('<meta property="og:image" content="https://cineclub-web.web.app/images/entitats/cineclub-roda-de-bera.png">');
  });

  it('usa el hook o la descripció com a descripció quan hi són', async () => {
    const amb = { ...minima, publica: { ...minima.publica, hook: 'Un hook.' } };
    expect(await render(amb)).toContain('<meta name="description" content="Un hook.">');
  });

  it('emet el JSON-LD de l\'esdeveniment i de les molles de pa amb l\'ordre de Hugo', async () => {
    const html = await render(completa);
    expect(html).toContain('<script type="application/ld+json">{"@context":"https://schema.org","@type":"ScreeningEvent","location":{"@type":"Place","address":"Plaça dels Pins, 6, 43883 Roda de Berà (Tarragona)","name":"Teatre del Casino Municipal de Roda de Berà"},"name":"Pig","offers":{"@type":"Offer","price":"5","priceCurrency":"EUR","url":"https://cineclub-web.web.app/programacio/2026/pig/"},"startDate":"2026-06-25T19:00:00+02:00","workPresented":{"@type":"Movie","name":"Pig"}}</script>');
    expect(html).toContain('"itemListElement":[{"@type":"ListItem","item":"https://cineclub-web.web.app/","name":"Inici","position":1},{"@type":"ListItem","item":"https://cineclub-web.web.app/programacio/","name":"Programació","position":2},{"@type":"ListItem","item":"https://cineclub-web.web.app/programacio/2026/pig/","name":"Pig","position":3}]');
  });
});

// Db fals: només `collection('sessions').get()`, com el que fa el codi real.
const ambDb = (docs) => {
  globalThis.__dbFals = {
    collection: () => ({
      get: async () => ({ docs: docs.map(({ id, ...dades }) => ({ id, data: () => dades })) }),
    }),
  };
};
const demana = async (params) => {
  const container = await AstroContainer.create();
  container.insertPageRoute('/404', Pagina404);
  return container.renderToResponse(RutaSessio, { params, routeType: 'page' });
};

describe('ruta /programacio/<any>/<slug>/', () => {
  it('serveix una sessió publicada', async () => {
    ambDb([completa, minima]);
    const resposta = await demana({ any: '2026', slug: 'pig' });
    expect(resposta.status).toBe(200);
    expect(await resposta.text()).toContain('session-hero__title');
  });

  it('retorna 404 per a una sessió no publicada', async () => {
    ambDb([{ ...completa, publicada: false }, minima]);
    const resposta = await demana({ any: '2026', slug: 'pig' });
    expect(resposta.status).toBe(404);
    expect(await resposta.text()).toContain('Pàgina no trobada');
  });

  it('retorna 404 per a una sessió inexistent o d\'un altre any', async () => {
    ambDb([completa]);
    expect((await demana({ any: '2026', slug: 'no-existeix' })).status).toBe(404);
    expect((await demana({ any: '2025', slug: 'pig' })).status).toBe(404);
    expect((await demana({ any: 'abc', slug: 'pig' })).status).toBe(404);
  });
});
