import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import Portada from '../src/pages/index.astro';
import Programacio from '../src/pages/programacio/index.astro';
import RutaSessio from '../src/pages/programacio/[any]/[slug].astro';
import IndexGeneres from '../src/pages/generes/index.astro';
import TermeGeneres from '../src/pages/generes/[terme].astro';
import IndexInterprets from '../src/pages/interprets/index.astro';
import TermeDirectors from '../src/pages/directors/[terme].astro';
import Pagina404 from '../src/pages/404.astro';
import { sessionsPubliques } from '../src/lib/sessions.js';
import { descripcioSessio, sessionsLlistables } from '../src/lib/sessio-camps.js';
import { entradesSitemap, xmlSitemap } from '../src/lib/sitemap.js';
import { feedPortada, feedProgramacio, feedTerme, xmlFeed } from '../src/lib/feeds.js';
import { CACHE_AVUI } from '../src/lib/cache.js';

// Un document de sessió editat a mà a l'admin pot dur `null` o un tipus equivocat a qualsevol camp
// de `publica`: cap pàgina ha de caure ni pintar «undefined»; només s'omet el camp dolent.

vi.mock('../src/lib/db.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => globalThis.__dbFals,
}));

const ST = 'https://firebasestorage.googleapis.com/v0/b/cineclub-socis.firebasestorage.app/o/web%2Fsessions%2F';
const sessio = (id, data, publica, extra = {}) => ({
  id: `${id}-id`,
  titol: id,
  slug: id,
  publicada: true,
  data,
  hora: '19:00',
  publica: {
    seccio: 'cartellera', organitza: 'cineclub', cartell: `${ST}${id}%2Fposter.jpg?alt=media`, any: 2021,
    directors: ['Michael Sarnoski'], generes: ['Drama'], interprets: ['Nicolas Cage'], ...publica,
  },
  ...extra,
});

const pig = sessio('pig', '2026-06-25', { titol: 'Pig' });
const abejas = sessio('abejas', '2026-10-22', { titol: '20.000 especies de abejas', directors: ['Estibaliz Urresola Solaguren'] });
// Tots els camps de `publica` amb un valor nul o d'un tipus que no toca.
const trencada = {
  id: 'trencada-id',
  titol: 'La trencada',
  slug: 'la-trencada',
  publicada: true,
  data: '2026-04-02',
  hora: 19,
  publica: {
    titol: { es: 'x' }, titolOriginal: null, titolTraduit: false, titolEspanya: ['x'],
    directors: null, interprets: 'Actriu Única', generes: [null, 3, ' Drama ', '', { nom: 'x' }],
    participa: null, collabora: [{ nom: 'Entitat' }], organitza: { nom: 'x' }, aliases: 5,
    galeria: [null, 'http://[', 42], cartell: 123,
    any: null, durada: 'molt', preu: 'gratis', edatMinimaRecomanada: -3,
    idioma: null, versioTipus: 'vo', pais: [], guio: Number.NaN, queInclou: null, fotografia: {},
    seccio: 7, descripcio: null, hook: '', cos: null, sinopsiCartell: {},
    trailerYoutubeId: '"><script>', suportDistribucio: null, suportDistribucioId: 5, actualitzatEl: 'ahir',
  },
};
// `publica` absent o que no és un objecte.
const sensePublica = { id: 'sense-publica-id', titol: 'Sense publica', slug: 'sense-publica', publicada: true, data: '2026-05-07', hora: '19:00', publica: null };
const publicaText = { id: 'publica-text-id', titol: 'Publica text', slug: 'publica-text', publicada: true, data: '2026-05-14', hora: '19:00', publica: 'hola' };
// Ni títol de gestió ni de `publica`: el slug fa de títol.
const senseTitol = { id: 'sense-titol-id', titol: null, slug: 'sense-titol', publicada: true, data: '2026-05-21', hora: '19:00', publica: { titol: '   ' } };
// Slugs que trencarien les URL: la sessió no es pot publicar.
const slugDolent = { ...sessio('x', '2026-05-28'), id: 'slug-dolent-id', slug: 'amb espai/i barra' };
const slugNumero = { ...sessio('y', '2026-05-29'), id: 'slug-numero-id', slug: 42 };

const docs = [pig, abejas, trencada, sensePublica, publicaText, senseTitol, slugDolent, slugNumero];
const pagines = {
  portada: { slug: 'portada', titol: 'Cineclub Roda de Berà', dades: {}, cos: 'Text.', imatges: {} },
  programacio: { slug: 'programacio', titol: 'Programació', dades: {}, cos: 'Text.', imatges: {} },
};

const ambDb = (llista = docs) => {
  globalThis.__dbFals = {
    collection: (nom) => ({
      get: async () => ({ docs: (nom === 'sessions' ? llista : []).map(({ id, ...dades }) => ({ id, data: () => dades })) }),
      doc: (id) => ({ get: async () => ({ exists: nom === 'pagines' && !!pagines[id], data: () => pagines[id] }) }),
      where: () => ({ get: async () => ({ docs: [] }) }),
    }),
  };
  return globalThis.__dbFals;
};

const renderitza = async (Pagina, ruta, params = {}) => {
  const container = await AstroContainer.create();
  container.insertPageRoute('/404', Pagina404);
  const resposta = await container.renderToResponse(Pagina, { routeType: 'page', params, request: new Request(`https://cineclub-web.web.app${ruta}`) });
  return { status: resposta.status, html: await resposta.text(), headers: resposta.headers };
};

// Restes típiques d'un valor absent o mal tipat interpolat en un text.
const RESTES = /\bundefined\b|\bNaN\b|\[object Object\]|dirigida per \.|>null<|"null"/;

let avisos;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-21T12:00:00+02:00'));
  avisos = vi.spyOn(console, 'warn').mockImplementation(() => {});
  ambDb();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('normalització de les sessions a sessionsPubliques', () => {
  const llegeix = async () => Object.fromEntries((await sessionsPubliques(ambDb())).map((s) => [s.id, s]));

  it('dona a cada camp de `publica` el tipus que esperen les plantilles i omet només el que no hi encaixa', async () => {
    const s = (await llegeix())['trencada-id'];
    expect(s.titol).toBe('La trencada');
    expect(s.hora).toBe('00:00');
    expect(s.publica).toEqual({
      directors: [],
      interprets: ['Actriu Única'],
      generes: ['Drama'],
      participa: [],
      collabora: [],
      aliases: [],
      galeria: [],
      versioTipus: 'vo',
      // és un text: el valida el sitemap (`lastmodSessio`), que l'ignora
      actualitzatEl: 'ahir',
    });
  });

  it('accepta els valors bons tal com són i converteix els que tenen un equivalent clar', async () => {
    const bona = sessio('bona', '2026-06-01', {
      titol: 1917, titolOriginal: '  Pig  ', any: '2021', durada: '92', preu: '0', edatMinimaRecomanada: 12,
      queInclou: true, trailerYoutubeId: 'TGOcqxU-_l8', galeria: [`${ST}g.jpg`, '/images/p.jpg', '//fora.example/x.jpg'],
      cos: '    codi\n', actualitzatEl: '2026-06-02',
    });
    ambDb([bona]);
    const [s] = await sessionsPubliques(globalThis.__dbFals);
    expect(s.publica).toMatchObject({
      titol: '1917', titolOriginal: 'Pig', any: '2021', durada: 92, preu: 0, edatMinimaRecomanada: 12, queInclou: true,
      trailerYoutubeId: 'TGOcqxU-_l8', galeria: [`${ST}g.jpg`, '/images/p.jpg'], cos: '    codi\n', actualitzatEl: '2026-06-02',
      directors: ['Michael Sarnoski'], seccio: 'cartellera', organitza: 'cineclub',
    });
  });

  it('tracta `publica` nul o que no és un objecte com a buit', async () => {
    const totes = await llegeix();
    expect(totes['sense-publica-id'].publica).toMatchObject({ directors: [], galeria: [] });
    expect(totes['publica-text-id'].publica).toMatchObject({ directors: [], galeria: [] });
  });

  it('sense cap títol, el slug fa de títol', async () => {
    expect((await llegeix())['sense-titol-id'].titol).toBe('sense-titol');
  });

  it('descarta les sessions amb un slug que no pot anar a una URL', async () => {
    const totes = await llegeix();
    expect(totes['slug-dolent-id']).toBeUndefined();
    expect(totes['slug-numero-id']).toBeUndefined();
  });

  it('registra cada sessió publicada que es descarta, amb l\'id i el motiu però sense els valors', async () => {
    ambDb([...docs, { ...sessio('z', '2026-05-30'), id: 'data-dolenta-id', data: '2026-02-31' }, { ...sessio('w', 'aviat'), id: 'esborrany-id', publicada: false, slug: '' }]);
    await sessionsPubliques(globalThis.__dbFals);
    const linies = avisos.mock.calls.map((c) => c.join(' '));
    expect(linies.find((l) => l.includes('slug-dolent-id'))).toMatch(/descartada: slug invàlid/);
    expect(linies.find((l) => l.includes('slug-numero-id'))).toMatch(/descartada: slug invàlid/);
    expect(linies.find((l) => l.includes('data-dolenta-id'))).toMatch(/descartada: data invàlida/);
    expect(linies.join(' ')).not.toContain('amb espai');
    expect(linies.join(' ')).not.toContain('2026-02-31');
    // les no publicades no són cap error
    expect(linies.some((l) => l.includes('esborrany-id'))).toBe(false);
  });

  it('registra quins camps s\'han ignorat amb l\'id de la sessió, però no els valors', async () => {
    await llegeix();
    const linies = avisos.mock.calls.map((c) => c.join(' '));
    const linia = linies.find((l) => l.includes('trencada-id'));
    expect(linia).toContain('titol');
    expect(linia).toContain('cartell');
    expect(linia).not.toContain('script');
    // els `null` són camps buits, no errors
    expect(linies.some((l) => l.includes('sense-publica-id'))).toBe(false);
  });
});

describe('descripcioSessio sense dades', () => {
  it('omet l\'any i els directors quan no hi són', () => {
    expect(descripcioSessio({ titol: 'X', publica: {} })).toBe('X. Sessió del Cineclub Roda de Berà a Roda de Berà.');
    expect(descripcioSessio({ titol: 'X', publica: { any: 2021 } })).toBe('X (2021). Sessió del Cineclub Roda de Berà a Roda de Berà.');
    expect(descripcioSessio({ titol: 'X', publica: { directors: ['A', 'B'] } })).toBe('X, dirigida per A, B. Sessió del Cineclub Roda de Berà a Roda de Berà.');
    expect(descripcioSessio({ titol: 'X', publica: { any: 2021, directors: ['A'] } })).toBe('X (2021), dirigida per A. Sessió del Cineclub Roda de Berà a Roda de Berà.');
  });
});

describe('sessionsLlistables', () => {
  it('omet (i registra) la sessió que no es pot pintar com a targeta i manté les altres', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bona = { id: 'b', titol: 'B', slug: 'b', data: '2026-01-01', hora: '19:00', publica: {} };
    const dolenta = { id: 'd', titol: 'D', slug: 'd', data: null, hora: '19:00', publica: {} };
    expect(sessionsLlistables([bona, dolenta])).toEqual([bona]);
    expect(errors.mock.calls.flat().join(' ')).toContain('d');
  });
});

describe('pàgines amb una sessió dolenta', () => {
  it('la portada es pinta sencera, amb les sessions bones i sense restes de valors buits', async () => {
    const { status, html, headers } = await renderitza(Portada, '/');
    expect(status).toBe(200);
    expect(headers.get('Cache-Control')).toBe(CACHE_AVUI);
    expect(html).toContain('<h3 class="session-card__title">Pig</h3>');
    expect(html).toContain('<h3 class="session-card__title">20.000 especies de abejas</h3>');
    expect(html).toContain('<h3 class="session-card__title">La trencada</h3>');
    expect(html).toContain('</html>');
    expect(html).not.toMatch(RESTES);
  });

  it('/programacio/ es pinta sencera i sense restes de valors buits', async () => {
    const { status, html } = await renderitza(Programacio, '/programacio/');
    expect(status).toBe(200);
    for (const titol of ['Pig', '20.000 especies de abejas', 'La trencada', 'Sense publica', 'sense-titol']) {
      expect(html).toContain(`<h3 class="session-card__title">${titol}</h3>`);
    }
    expect(html).toContain('</html>');
    expect(html).not.toMatch(RESTES);
  });

  it('la pàgina de la sessió dolenta es pinta sense els camps dolents', async () => {
    const { status, html } = await renderitza(RutaSessio, '/programacio/2026/la-trencada/', { any: '2026', slug: 'la-trencada' });
    expect(status).toBe(200);
    expect(html).toContain('<title>La trencada · Cineclub Roda de Berà</title>');
    expect(html).toContain('<meta name="description" content="La trencada. Sessió del Cineclub Roda de Berà a Roda de Berà.">');
    expect(html).toContain('<h1 class="session-hero__title">La trencada</h1>');
    expect(html).toContain('Versió Original');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('session-gallery');
    expect(html).toContain('</html>');
    expect(html).not.toMatch(RESTES);
    const blocs = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const esdeveniment = blocs.find((b) => b['@type'] === 'ScreeningEvent');
    expect(esdeveniment.name).toBe('La trencada');
    expect(esdeveniment.organizer.name).toBe('Cineclub Roda de Berà');
    expect(esdeveniment).not.toHaveProperty('image');
    expect(esdeveniment).not.toHaveProperty('endDate');
    expect(esdeveniment.offers).not.toHaveProperty('price');
  });

  it('les pàgines de les sessions sense `publica` també es pinten', async () => {
    for (const slug of ['sense-publica', 'publica-text', 'sense-titol']) {
      const { status, html } = await renderitza(RutaSessio, `/programacio/2026/${slug}/`, { any: '2026', slug });
      expect(status).toBe(200);
      expect(html).toContain('</html>');
      expect(html).not.toMatch(RESTES);
    }
  });

  it('les taxonomies només compten els noms de text, ja nets', async () => {
    const generes = await renderitza(IndexGeneres, '/generes/');
    expect(generes.status).toBe(200);
    expect(generes.html).toMatch(/href="\/generes\/drama\/">Drama<\/a>\s*<span class="taxonomy-list__count">3<\/span>/);
    expect(generes.html).not.toMatch(RESTES);
    const interprets = await renderitza(IndexInterprets, '/interprets/');
    expect(interprets.html).toContain('>Actriu Única</a>');
    const terme = await renderitza(TermeGeneres, '/generes/drama/', { terme: 'drama' });
    expect(terme.status).toBe(200);
    expect(terme.html).toContain('<h3 class="session-card__title">La trencada</h3>');
    expect(terme.html).toContain('<h3 class="session-card__title">Pig</h3>');
    expect(terme.html).not.toMatch(RESTES);
  });

  it('el sitemap inclou la sessió dolenta amb un lastmod vàlid', async () => {
    const xml = xmlSitemap(await entradesSitemap(globalThis.__dbFals), 'https://cineclubrodadebera.cat');
    expect(xml).toContain('<loc>https://cineclubrodadebera.cat/programacio/2026/la-trencada/</loc><lastmod>2026-04-02T00:00:00+02:00</lastmod>');
    expect(xml).not.toContain('amb%20espai');
    expect(xml).not.toMatch(RESTES);
  });

  it('els feeds inclouen totes les sessions publicables, sense restes', async () => {
    const portada = xmlFeed(await feedPortada(globalThis.__dbFals), 'https://cineclubrodadebera.cat');
    expect(portada).toContain('<title>La trencada</title>');
    expect(portada).toContain('<title>Pig</title>');
    expect(portada).not.toMatch(RESTES);
    const programacio = xmlFeed(await feedProgramacio(globalThis.__dbFals), 'https://cineclubrodadebera.cat');
    expect(programacio).toContain('<title>sense-titol</title>');
    expect(programacio).not.toMatch(RESTES);
    const terme = xmlFeed(await feedTerme('generes', 'drama', globalThis.__dbFals), 'https://cineclubrodadebera.cat');
    expect(terme).toContain('<title>La trencada</title>');
  });
});

describe('textos SEO de les taxonomies', () => {
  it('els índexs tenen el títol i la descripció en català', async () => {
    const generes = await renderitza(IndexGeneres, '/generes/');
    expect(generes.html).toContain('<title>Gèneres · Cineclub Roda de Berà</title>');
    expect(generes.html).toContain('<meta name="description" content="Tots els gèneres de les pel·lícules programades pel Cineclub Roda de Berà.">');
    const interprets = await renderitza(IndexInterprets, '/interprets/');
    expect(interprets.html).toContain('<title>Intèrprets · Cineclub Roda de Berà</title>');
  });

  it('cada terme té una descripció pròpia amb el nombre de sessions i els títols', async () => {
    ambDb([pig]);
    const { html } = await renderitza(TermeDirectors, '/directors/michael-sarnoski/', { terme: 'michael-sarnoski' });
    expect(html).toContain('<meta name="description" content="Pel·lícules dirigides per Michael Sarnoski programades pel Cineclub Roda de Berà (1 sessió): Pig (2021).">');
  });

  it('la descripció del terme es retalla a 160 caràcters en una paraula sencera', async () => {
    const moltes = Array.from({ length: 12 }, (_, i) => sessio(`peli-${i}`, `2026-0${(i % 9) + 1}-1${i % 9}`, { titol: `Una pel·lícula amb un títol llarg ${i}` }));
    ambDb(moltes);
    const { html } = await renderitza(TermeGeneres, '/generes/drama/', { terme: 'drama' });
    const descripcio = html.match(/<meta name="description" content="([^"]*)">/)[1];
    expect(descripcio.length).toBeLessThanOrEqual(160);
    expect(descripcio).toMatch(/^Sessions de gènere Drama programades pel Cineclub Roda de Berà \(12 sessions\): Una pel·lícula/);
    expect(descripcio.endsWith('…')).toBe(true);
  });
});

describe('textos sense dades', () => {
  const renderComponent = async (Component, props) => (await AstroContainer.create()).renderToString(Component, { props });

  it('la targeta no deixa una coma o un «i» sense nom quan no hi ha organitzador', async () => {
    const { default: SessionCard } = await import('../src/components/SessionCard.astro');
    const html = await renderComponent(SessionCard, { sessio: { ...pig, publica: { participa: ['Entitat A'], collabora: null } } });
    expect(html).toContain('<span class="session-card__badge">Entitat A.</span>');
  });

  it('la franja de col·laboradors no mostra «Organitza» buit', async () => {
    const { default: CollabStrip } = await import('../src/components/CollabStrip.astro');
    const html = await renderComponent(CollabStrip, { sessio: { publica: { participa: ['Entitat A'] } } });
    expect(html).toContain('Entitat A');
    expect(html).not.toContain('>Organitza<');
    expect(await renderComponent(CollabStrip, { sessio: { publica: { participa: null, collabora: null } } })).toBe('');
  });

  it('la V.O. sense idioma no diu «en undefined» i una edat sense icona ICAA va en text', async () => {
    const { default: SessioInfo } = await import('../src/components/SessioInfo.astro');
    const html = await renderComponent(SessioInfo, { sessio: { publica: { versioTipus: 'vo', edatMinimaRecomanada: 13 } } });
    expect(html).toContain('Versió Original');
    expect(html).not.toMatch(RESTES);
    expect(html).not.toContain('icaa-13.svg');
    expect(html).toContain('+13');
    expect(html).toContain('No recomanada per a menors de 13 anys');
  });
});
