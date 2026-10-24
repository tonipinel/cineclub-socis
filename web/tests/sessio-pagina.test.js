import { describe, it, expect, vi, beforeEach } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import SessioPagina from '../src/components/SessioPagina.astro';
import RutaSessio from '../src/pages/programacio/[any]/[slug].astro';
import Pagina404 from '../src/pages/404.astro';
import { fixaDistribuidoresDeProva } from '../src/lib/distribuidores.js';

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

// El catàleg de distribuïdores el carrega el middleware (Firestore); aquí s'injecta directament.
const LOGO_ACF = 'https://firebasestorage.googleapis.com/v0/b/cineclub-socis.firebasestorage.app/o/distribuidores%2Facf.png?alt=media';
beforeEach(() => fixaDistribuidoresDeProva({
  'A Contracorriente Films': { logo: LOGO_ACF, url: 'https://acontracorrientefilms.com/' },
  'Sense logo': { url: 'https://sense-logo.example/' },
}));

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

  it('escapa la distribuïdora desconeguda i conserva els <br> dels textos fixos', async () => {
    const maliciosa = { ...completa, publica: { ...completa.publica, suportDistribucio: '<img src=x onerror=alert(1)> & Cia' } };
    const html = await render(maliciosa);
    expect(html).not.toContain('<img src=x onerror');
    expect(html).toContain('Distribució i cessió de drets: &lt;img src=x onerror=alert(1)&gt; &amp; Cia');
    expect(html).toContain('Aportació requerida<br>(Gratuït per a socis/es)');
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

  it('pinta el distribuïdor amb logo i enllaç des del catàleg', async () => {
    const html = await render(completa);
    expect(html).toContain(`src="${LOGO_ACF.replaceAll('&', '&amp;')}"`);
    expect(html).toContain('href="https://acontracorrientefilms.com/"');
    expect(html).not.toContain('/images/distribuidors/');
  });

  it('una distribuïdora del catàleg sense logo es pinta en text, com una de desconeguda', async () => {
    const html = await render({ ...completa, publica: { ...completa.publica, suportDistribucio: 'Sense logo' } });
    expect(html).toContain('Distribució i cessió de drets: Sense logo');
    expect(html).not.toContain('https://sense-logo.example/');
    expect(html.match(/class="info-item__logo"/g)).toHaveLength(1); // només la icona d'edat
  });

  describe('distribuïdora per id', () => {
    const LOGO_BT = 'https://firebasestorage.googleapis.com/v0/b/cineclub-socis.firebasestorage.app/o/distribuidores%2Fbt.png?alt=media';
    beforeEach(() => fixaDistribuidoresDeProva({
      'A Contracorriente Films': { logo: LOGO_ACF, url: 'https://acontracorrientefilms.com/' },
      'B-team': { id: 'd2', logo: LOGO_BT, url: 'https://bteampictures.es/' },
      'Nom nou sense logo': { id: 'd3', url: 'https://d3.example/' },
    }));
    const ambDistribucio = (suportDistribucio, suportDistribucioId) => ({
      ...completa, publica: { ...completa.publica, suportDistribucio, suportDistribucioId },
    });

    it('reanomenada: el text de la sessió és vell però el logo surt per l\'id', async () => {
      const html = await render(ambDistribucio('BTeam Pictures', 'd2'));
      expect(html).toContain(`src="${LOGO_BT.replaceAll('&', '&amp;')}"`);
      expect(html).toContain('href="https://bteampictures.es/"');
      expect(html).not.toContain('Distribució i cessió de drets');
    });

    it('l\'id té prioritat sobre el nom', async () => {
      const html = await render(ambDistribucio('A Contracorriente Films', 'd2'));
      expect(html).toContain(`src="${LOGO_BT.replaceAll('&', '&amp;')}"`);
      expect(html).not.toContain(LOGO_ACF.replaceAll('&', '&amp;'));
    });

    it('resolta per id sense logo: el text usa el nom actual del catàleg', async () => {
      const html = await render(ambDistribucio('Nom vell', 'd3'));
      expect(html).toContain('Distribució i cessió de drets: Nom nou sense logo');
      expect(html).not.toContain('Nom vell');
      expect(html).not.toContain('https://d3.example/');
    });

    it('resolta per id encara que la sessió no tingui el nom en text', async () => {
      const html = await render(ambDistribucio(undefined, 'd2'));
      expect(html).toContain(`src="${LOGO_BT.replaceAll('&', '&amp;')}"`);
    });

    it('un id desconegut o heretat torna a resoldre pel nom', async () => {
      for (const id of ['no-hi-es', 'constructor', '__proto__']) {
        const html = await render(ambDistribucio('A Contracorriente Films', id));
        expect(html).toContain(`src="${LOGO_ACF.replaceAll('&', '&amp;')}"`);
        const desconeguda = await render(ambDistribucio('<b>Nom</b>', id));
        expect(desconeguda).toContain('Distribució i cessió de drets: &lt;b&gt;Nom&lt;/b&gt;');
      }
    });

    it('sense id ni nom no es pinta la distribució', async () => {
      const html = await render(ambDistribucio(undefined, undefined));
      expect(html).not.toContain('Distribució i cessió de drets');
      expect(html.match(/class="info-item__logo"/g)).toHaveLength(1); // només la icona d'edat
    });
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

  it('pinta per defecte el banner del cartell, com Hugo', async () => {
    const html = await render(completa);
    expect(html).toContain('session-cartell-banner');
    expect(html).toContain('href="/programacio/2026/pig/cartell.html" target="_blank" rel="noopener"');
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
    const bloc = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema.org","@type":"ScreeningEvent".*?)<\/script>/)[1];
    // Les claus de Hugo, amb els mateixos valors, i els camps recomanats per Google al damunt.
    expect(JSON.parse(bloc)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'ScreeningEvent',
      description: 'En Rob és un xef d’alta cuina.',
      endDate: '2026-06-25T20:32:00+02:00',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      eventStatus: 'https://schema.org/EventScheduled',
      image: [`${STORAGE}poster.jpg?alt=media`, `${STORAGE}gallery-1.jpg?alt=media`],
      inLanguage: 'en',
      location: { '@type': 'Place', address: 'Plaça dels Pins, 6, 43883 Roda de Berà (Tarragona)', name: 'Teatre del Casino Municipal de Roda de Berà' },
      name: 'Pig',
      offers: { '@type': 'Offer', availability: 'https://schema.org/InStock', price: '5', priceCurrency: 'EUR', url: 'https://cineclub-web.web.app/programacio/2026/pig/' },
      organizer: { '@type': 'Organization', name: 'Cineclub Roda de Berà', url: 'https://cineclub-web.web.app/' },
      startDate: '2026-06-25T19:00:00+02:00',
      workPresented: { '@type': 'Movie', name: 'Pig' },
    });
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
