import { describe, it, expect } from 'vitest';
import {
  llegeixSitemap,
  extreuTitol,
  extreuCanonical,
  extreuDescripcio,
  extreuJsonLd,
  comparaPagines,
  pathDe,
  llegeixAliases,
  aplicaPermet,
  llegeixSitemapLastmod,
  comparaLastmod,
  llegeixFeed,
  comparaFeeds,
  llegeixSitemapBrut,
  comparaSitemapBrut,
  estatDe,
  demanaSegur,
} from '../scripts/check-urls-lib.mjs';

// HTML minificat com el de Hugo (atributs sense cometes) i HTML com el d'Astro (amb cometes).
const hugo = '<!doctype html><html lang=ca><head><title>Pig · Cineclub Roda de Berà</title>'
  + '<meta name=description content="Una història d\'un cuiner &amp; el seu porc.">'
  + '<link rel=canonical href=https://cineclubrodadebera.cat/programacio/2026/pig/>'
  + '<script type=application/ld+json>{"@type":"Event","name":"Pig","url":"https://cineclubrodadebera.cat/programacio/2026/pig/","a":1,"b":2}</script>'
  + '<script type=application/ld+json>{"@type":"BreadcrumbList"}</script></head><body></body></html>';
const nova = `<!DOCTYPE html><html lang="ca"><head>
<meta charset="utf-8">
<title>Pig · Cineclub Roda de Berà</title>
<meta name="description" content="Una història d&#39;un cuiner &amp; el seu porc.">
<link rel="canonical" href="https://cineclub-web.web.app/programacio/2026/pig/">
<script type="application/ld+json">{"b":2,"a":1,"url":"https://cineclub-web.web.app/programacio/2026/pig/","name":"Pig","@type":"Event"}</script>
<script type="application/ld+json">{"@type":"BreadcrumbList"}</script>
</head><body></body></html>`;

describe('extractors', () => {
  it('extreuTitol', () => {
    expect(extreuTitol(hugo)).toBe('Pig · Cineclub Roda de Berà');
    expect(extreuTitol(nova)).toBe('Pig · Cineclub Roda de Berà');
    expect(extreuTitol('<p>res</p>')).toBeNull();
    expect(extreuTitol('<title>Tom &amp; Jerry</title>')).toBe('Tom & Jerry');
  });

  it('extreuCanonical retorna l\'href, amb o sense cometes', () => {
    expect(extreuCanonical(hugo)).toBe('https://cineclubrodadebera.cat/programacio/2026/pig/');
    expect(extreuCanonical(nova)).toBe('https://cineclub-web.web.app/programacio/2026/pig/');
    expect(extreuCanonical('<link rel="icon" href="/x.ico">')).toBeNull();
  });

  it('extreuDescripcio decodifica les entitats i no es confon amb og:description', () => {
    expect(extreuDescripcio(hugo)).toBe('Una història d\'un cuiner & el seu porc.');
    expect(extreuDescripcio(nova)).toBe('Una història d\'un cuiner & el seu porc.');
    expect(extreuDescripcio('<meta property="og:description" content="x">')).toBeNull();
  });

  it('extreuJsonLd retorna cada bloc parsejat, en ordre', () => {
    expect(extreuJsonLd(hugo)).toEqual([
      { '@type': 'Event', name: 'Pig', url: 'https://cineclubrodadebera.cat/programacio/2026/pig/', a: 1, b: 2 },
      { '@type': 'BreadcrumbList' },
    ]);
    expect(extreuJsonLd('<p>res</p>')).toEqual([]);
  });

  it('extreuJsonLd marca els blocs que no són JSON vàlid', () => {
    const [bloc] = extreuJsonLd('<script type="application/ld+json">{trencat</script>');
    expect(bloc).toEqual({ __errorJson: '{trencat' });
  });

  it('pathDe treu l\'origen i conserva el camí tal com ve', () => {
    expect(pathDe('https://cineclubrodadebera.cat/directors/alauda-ruiz-de-az%C3%BAa/')).toBe('/directors/alauda-ruiz-de-az%C3%BAa/');
    expect(pathDe('/programacio/')).toBe('/programacio/');
  });
});

describe('llegeixSitemap', () => {
  it('retorna el camí de cada <loc>, amb o sense <lastmod>', () => {
    const xml = '<?xml version="1.0"?><urlset><url><loc>https://cineclubrodadebera.cat/</loc><lastmod>2026-08-20T00:00:00+00:00</lastmod></url>'
      + '<url><loc>https://cineclubrodadebera.cat/generes/%C3%A8poca/</loc></url></urlset>';
    expect(llegeixSitemap(xml)).toEqual(['/', '/generes/%C3%A8poca/']);
  });
  it('desescapa &amp; dels <loc>', () => {
    expect(llegeixSitemap('<urlset><url><loc>https://x.cat/a&amp;b/</loc></url></urlset>')).toEqual(['/a&b/']);
  });
});

describe('comparaPagines', () => {
  it('no troba diferències entre equivalents (orígens diferents, ordre de claus, entitats)', () => {
    expect(comparaPagines(hugo, nova)).toEqual([]);
  });

  it('detecta títol, canonical, descripció i JSON-LD diferents', () => {
    const diferent = nova
      .replace('<title>Pig', '<title>Porc')
      .replace('programacio/2026/pig/">\n<script', 'programacio/pig/">\n<script')
      .replace('cuiner', 'xef')
      .replace('"name":"Pig"', '"name":"Porc"');
    const camps = comparaPagines(hugo, diferent).map((d) => d.camp);
    expect(camps).toEqual(['title', 'canonical', 'description', 'jsonld']);
  });

  it('el canonical es compara pel camí, no per l\'origen, i amb els accents normalitzats', () => {
    const a = '<link rel=canonical href=https://a.cat/directors/alauda-ruiz-de-az%C3%BAa/>';
    const b = '<link rel="canonical" href="https://b.cat/directors/alauda-ruiz-de-azúa/">';
    expect(comparaPagines(a, b)).toEqual([]);
  });

  it('detecta un bloc JSON-LD que falta o sobra', () => {
    const senseBreadcrumb = nova.replace('<script type="application/ld+json">{"@type":"BreadcrumbList"}</script>', '');
    const [d] = comparaPagines(hugo, senseBreadcrumb);
    expect(d.camp).toBe('jsonld');
  });

  it('un camp que falta a un costat és una diferència', () => {
    expect(comparaPagines(hugo, '<title>Pig · Cineclub Roda de Berà</title>').map((d) => d.camp)).toEqual(['canonical', 'description', 'jsonld']);
  });
});

describe('llegeixAliases', () => {
  it('troba les pàgines de redirecció de Hugo (meta refresh)', () => {
    const fitxers = {
      'programacio/25-de-juny-pig/index.html': '<!doctype html><html lang=ca><head><title>https://cineclubrodadebera.cat/programacio/2026/pig/</title><link rel=canonical href=https://cineclubrodadebera.cat/programacio/2026/pig/><meta charset=utf-8><meta http-equiv=refresh content="0; url=https://cineclubrodadebera.cat/programacio/2026/pig/"></head></html>',
      'programacio/5-de-març-the-artist/index.html': '<meta http-equiv="refresh" content="0; url=https://cineclubrodadebera.cat/programacio/2026/the-artist/">',
      'programacio/2026/pig/index.html': hugo,
    };
    expect(llegeixAliases(fitxers)).toEqual([
      { alias: '/programacio/25-de-juny-pig/', desti: '/programacio/2026/pig/' },
      { alias: '/programacio/5-de-març-the-artist/', desti: '/programacio/2026/the-artist/' },
    ]);
  });
});

describe('aplicaPermet', () => {
  const permet = [
    { path: '/interprets/judith-odea/', estat: 404, motiu: 'Sessió Xarxa no migrada' },
    { path: '/programacio/2026/x/', camps: ['description'], motiu: 'Descripció diferent a propòsit' },
  ];

  it('un estat esperat convertit en coneguda s\'etiqueta amb el motiu', () => {
    const r = aplicaPermet([{ path: '/interprets/judith-odea/', camp: 'status', hugo: 200, nova: 404 }], permet);
    expect(r.inesperades).toEqual([]);
    expect(r.conegudes).toEqual([{ path: '/interprets/judith-odea/', camp: 'status', hugo: 200, nova: 404, motiu: 'Sessió Xarxa no migrada' }]);
  });

  it('un altre estat al mateix camí és inesperat', () => {
    const r = aplicaPermet([{ path: '/interprets/judith-odea/', camp: 'status', hugo: 200, nova: 500 }], permet);
    expect(r.inesperades).toHaveLength(1);
  });

  it('només permet els camps llistats', () => {
    const r = aplicaPermet([
      { path: '/programacio/2026/x/', camp: 'description', hugo: 'a', nova: 'b' },
      { path: '/programacio/2026/x/', camp: 'title', hugo: 'a', nova: 'b' },
    ], permet);
    expect(r.conegudes.map((d) => d.camp)).toEqual(['description']);
    expect(r.inesperades.map((d) => d.camp)).toEqual(['title']);
  });

  it('diferències sense entrada al permet són inesperades', () => {
    const r = aplicaPermet([{ path: '/altra/', camp: 'title', hugo: 'a', nova: 'b' }], permet);
    expect(r.conegudes).toEqual([]);
    expect(r.inesperades).toHaveLength(1);
  });
});

describe('llegeixSitemapLastmod / comparaLastmod', () => {
  const hugoXml = '<urlset><url><loc>https://cineclubrodadebera.cat/</loc><lastmod>2026-08-20T00:00:00+00:00</lastmod></url>'
    + '<url><loc>https://cineclubrodadebera.cat/generes/%C3%A8poca/</loc><lastmod>2026-08-06T19:00:00+02:00</lastmod></url>'
    + '<url><loc>https://cineclubrodadebera.cat/privacitat/</loc></url></urlset>';

  it('llegeix el lastmod de cada camí (null si no en té)', () => {
    expect([...llegeixSitemapLastmod(hugoXml)]).toEqual([
      ['/', '2026-08-20T00:00:00+00:00'],
      ['/generes/època/', '2026-08-06T19:00:00+02:00'],
      ['/privacitat/', null],
    ]);
  });

  it('no troba diferències quan els lastmod són el mateix instant (tot i escriure\'s diferent)', () => {
    const nou = '<urlset><url><loc>https://x.cat/</loc><lastmod>2026-08-20T02:00:00+02:00</lastmod></url>'
      + '<url><loc>https://x.cat/generes/%C3%A8poca/</loc><lastmod>2026-08-06T19:00:00+02:00</lastmod></url>'
      + '<url><loc>https://x.cat/privacitat/</loc></url></urlset>';
    expect(comparaLastmod(llegeixSitemapLastmod(hugoXml), llegeixSitemapLastmod(nou))).toEqual([]);
  });

  it('detecta un lastmod diferent, que falta o que sobra', () => {
    const nou = '<urlset><url><loc>https://x.cat/</loc><lastmod>2026-08-21T00:00:00+00:00</lastmod></url>'
      + '<url><loc>https://x.cat/generes/%C3%A8poca/</loc></url>'
      + '<url><loc>https://x.cat/privacitat/</loc><lastmod>2026-01-01</lastmod></url></urlset>';
    expect(comparaLastmod(llegeixSitemapLastmod(hugoXml), llegeixSitemapLastmod(nou))).toEqual([
      { path: '/', camp: 'lastmod', hugo: '2026-08-20T00:00:00+00:00', nova: '2026-08-21T00:00:00+00:00' },
      { path: '/generes/època/', camp: 'lastmod', hugo: '2026-08-06T19:00:00+02:00', nova: null },
      { path: '/privacitat/', camp: 'lastmod', hugo: null, nova: '2026-01-01' },
    ]);
  });

  it('una URL que no és al sitemap nou no es compara (ja surt com a diferència de sitemap)', () => {
    expect(comparaLastmod(llegeixSitemapLastmod(hugoXml), new Map())).toEqual([]);
  });
});

describe('comparaPagines: JSON-LD d\'esdeveniment com a superconjunt', () => {
  const ldHugo = (obj) => `<link rel=canonical href=https://cineclubrodadebera.cat/p/><script type=application/ld+json>${JSON.stringify(obj)}</script>`;
  const ldNova = (obj) => `<link rel="canonical" href="https://cineclub-web.web.app/p/"><script type="application/ld+json">${JSON.stringify(obj)}</script>`;
  const event = {
    '@context': 'https://schema.org', '@type': 'ScreeningEvent', name: 'Pig', startDate: '2026-06-25T19:00:00+02:00',
    offers: { '@type': 'Offer', price: '5', url: 'https://cineclubrodadebera.cat/programacio/2026/pig/' },
    workPresented: { '@type': 'Movie', name: 'Pig' },
  };
  const jsonld = (hugo, nova) => comparaPagines(ldHugo(hugo), ldNova(nova)).filter((d) => d.camp === 'jsonld');
  const enriquit = {
    ...event,
    description: 'Un text',
    image: ['https://x/poster.jpg'],
    eventStatus: 'https://schema.org/EventScheduled',
    offers: { ...event.offers, url: 'https://cineclub-web.web.app/programacio/2026/pig/', availability: 'https://schema.org/InStock' },
  };

  it('accepta claus addicionals (també dins d\'objectes imbricats) i l\'origen diferent', () => {
    expect(jsonld(event, enriquit)).toEqual([]);
  });

  it('falla si falta una clau de Hugo', () => {
    const { startDate, ...sense } = enriquit;
    expect(jsonld(event, sense)).toHaveLength(1);
  });

  it('falla si falta una clau imbricada de Hugo', () => {
    const { price, ...ofertaSensePreu } = enriquit.offers;
    expect(jsonld(event, { ...enriquit, offers: ofertaSensePreu })).toHaveLength(1);
  });

  it('falla si una clau de Hugo canvia de valor', () => {
    expect(jsonld(event, { ...enriquit, name: 'Porc' })).toHaveLength(1);
    expect(jsonld(event, { ...enriquit, offers: { ...enriquit.offers, price: '6' } })).toHaveLength(1);
    expect(jsonld(event, { ...enriquit, workPresented: { '@type': 'Movie', name: 'Altre' } })).toHaveLength(1);
  });

  it('falla si el nombre de blocs JSON-LD no coincideix', () => {
    const dosBlocs = (h) => `${h}<script type="application/ld+json">{"@type":"BreadcrumbList"}</script>`;
    expect(comparaPagines(ldHugo(event), dosBlocs(ldNova(enriquit))).map((d) => d.camp)).toContain('jsonld');
  });

  it('els altres tipus (BreadcrumbList, Organization...) continuen sent estrictament iguals', () => {
    const breadcrumb = { '@type': 'BreadcrumbList', itemListElement: [{ position: 1 }] };
    expect(jsonld(breadcrumb, breadcrumb)).toEqual([]);
    expect(jsonld(breadcrumb, { ...breadcrumb, extra: 1 })).toHaveLength(1);
    const org = { '@type': 'Organization', name: 'Cineclub' };
    expect(jsonld(org, { ...org, description: 'afegit' })).toHaveLength(1);
  });

  it('un Event (no ScreeningEvent) també és superconjunt, i un bloc amb JSON trencat no', () => {
    expect(jsonld({ '@type': 'Event', name: 'X' }, { '@type': 'Event', name: 'X', image: ['a'] })).toEqual([]);
    expect(comparaPagines('<script type=application/ld+json>{trencat</script>', '<script type="application/ld+json">{trencat</script>')).toEqual([]);
  });

  it('un valor de Hugo que és una llista continua sent estrictament igual', () => {
    expect(jsonld({ '@type': 'Event', sameAs: ['a', 'b'] }, { '@type': 'Event', sameAs: ['a', 'b', 'c'] })).toHaveLength(1);
  });
});

describe('llegeixFeed / comparaFeeds', () => {
  const feed = (titol, items) => `<?xml version="1.0"?><rss version="2.0"><channel><title>${titol}</title><link>https://cineclubrodadebera.cat/x/</link>`
    + `<description>Recent content</description>${items.map(([t, l]) => `<item><title>${t}</title><link>${l}</link><guid>${l}</guid><description>&lt;p&gt;x&lt;/p&gt;</description></item>`).join('')}</channel></rss>`;

  it('llegeix el títol del canal i els títols i camins dels elements (desescapant)', () => {
    const f = llegeixFeed(feed('Secrets &amp; Lies on X', [['Secrets &amp; Lies', 'https://x.cat/programacio/2026/s/'], ['B', 'https://x.cat/a/%C3%A8/']]));
    expect(f).toEqual({ titol: 'Secrets & Lies on X', items: [{ titol: 'Secrets & Lies', cami: '/programacio/2026/s/' }, { titol: 'B', cami: '/a/è/' }] });
  });

  it('no troba diferències entre feeds equivalents (orígens diferents)', () => {
    const items = [['A', 'https://cineclubrodadebera.cat/a/'], ['B', 'https://cineclubrodadebera.cat/b/']];
    expect(comparaFeeds(feed('T', items), feed('T', items.map(([t, l]) => [t, l.replace('cineclubrodadebera.cat', 'localhost:4400')])))).toEqual([]);
  });

  it('detecta un títol de canal diferent', () => {
    const [d] = comparaFeeds(feed('T', []), feed('U', []));
    expect(d).toEqual({ camp: 'feed-canal', hugo: 'T', nova: 'U' });
  });

  it('detecta elements que falten, sobren, canvien de títol o d\'ordre', () => {
    const base = [['A', 'https://x.cat/a/'], ['B', 'https://x.cat/b/']];
    expect(comparaFeeds(feed('T', base), feed('T', base.slice(0, 1))).map((d) => d.camp)).toEqual(['feed-elements']);
    expect(comparaFeeds(feed('T', base), feed('T', [...base, ['C', 'https://x.cat/c/']])).map((d) => d.camp)).toEqual(['feed-elements']);
    expect(comparaFeeds(feed('T', base), feed('T', [['A', 'https://x.cat/a/'], ['Bé', 'https://x.cat/b/']])).map((d) => d.camp)).toEqual(['feed-elements']);
    expect(comparaFeeds(feed('T', base), feed('T', [...base].reverse())).map((d) => d.camp)).toEqual(['feed-elements']);
  });
});

describe('aplicaPermet: entrades obsoletes', () => {
  const permet = [
    { path: '/a/', estat: 404, motiu: 'm1' },
    { path: '/b/', camps: ['title'], motiu: 'm2' },
  ];

  it('una entrada que no justifica cap diferència és obsoleta', () => {
    const r = aplicaPermet([{ path: '/a/', camp: 'status', hugo: 200, nova: 404 }], permet);
    expect(r.obsoletes).toEqual([permet[1]]);
  });

  it('sense diferències totes les entrades són obsoletes; amb una llista buida no n\'hi ha', () => {
    expect(aplicaPermet([], permet).obsoletes).toEqual(permet);
    expect(aplicaPermet([], []).obsoletes).toEqual([]);
  });

  it('una entrada que només coincideix en el camí però no en l\'estat/camp continua obsoleta', () => {
    const r = aplicaPermet([{ path: '/a/', camp: 'status', hugo: 200, nova: 500 }, { path: '/b/', camp: 'description', hugo: 'a', nova: 'b' }], permet);
    expect(r.obsoletes).toEqual(permet);
  });
});

describe('diferencies-conegudes.json', () => {
  it('registra /propostes/ (nova a la web, absent de Hugo) com a diferència coneguda de sitemap, amb motiu', async () => {
    const { readFileSync } = await import('node:fs');
    const { permesos } = JSON.parse(readFileSync(new URL('../scripts/diferencies-conegudes.json', import.meta.url), 'utf8'));
    const r = aplicaPermet([
      { path: '/propostes/', camp: 'sitemap', hugo: 'no hi és', nova: 'hi és' },
      { path: '/propostes-altres/', camp: 'sitemap', hugo: 'no hi és', nova: 'hi és' },
    ], permesos);
    expect(r.conegudes).toHaveLength(1);
    expect(r.conegudes[0].path).toBe('/propostes/');
    expect(r.conegudes[0].motiu).toMatch(/Pàgina nova/);
    expect(r.inesperades.map((d) => d.path)).toEqual(['/propostes-altres/']);
  });
});

const sitemapDe = (...locs) => `<urlset>${locs.map((l) => `<url><loc>${l}</loc></url>`).join('')}</urlset>`;

describe('llegeixSitemapBrut / comparaSitemapBrut', () => {
  it('llegeix els camins sense decodificar', () => {
    expect(llegeixSitemapBrut(sitemapDe('https://x.cat/directors/az%C3%BAa/', 'https://x.cat/a/')))
      .toEqual(['/directors/az%C3%BAa/', '/a/']);
  });
  it('no troba diferències si la codificació és idèntica', () => {
    const xml = sitemapDe('https://x.cat/directors/az%C3%BAa/');
    expect(comparaSitemapBrut(xml, sitemapDe('https://nou.web/directors/az%C3%BAa/'))).toEqual([]);
  });
  it('detecta el mateix camí escrit diferent (accent sense codificar, hexadecimal en minúscula, NFD)', () => {
    const hugoXml = sitemapDe('https://x.cat/directors/az%C3%BAa/', 'https://x.cat/b/');
    expect(comparaSitemapBrut(hugoXml, sitemapDe('https://n.web/directors/azúa/', 'https://n.web/b/')))
      .toEqual([{ path: '/directors/az%C3%BAa/', camp: 'sitemap-codificacio', hugo: '/directors/az%C3%BAa/', nova: '/directors/azúa/' }]);
    expect(comparaSitemapBrut(hugoXml, sitemapDe('https://n.web/directors/az%c3%baa/', 'https://n.web/b/'))).toHaveLength(1);
    expect(comparaSitemapBrut(hugoXml, sitemapDe('https://n.web/directors/azu%CC%81a/', 'https://n.web/b/'))).toHaveLength(1);
  });
  it('un camí que falta en un dels dos no es compta aquí (ja és una diferència de sitemap)', () => {
    expect(comparaSitemapBrut(sitemapDe('https://x.cat/a/'), sitemapDe('https://n.web/b/'))).toEqual([]);
  });
});

describe('connexió fallida', () => {
  it('demanaSegur torna la resposta quan fetch va bé', async () => {
    const res = new Response('x', { status: 200 });
    expect(await demanaSegur(async () => res, 'http://x')).toBe(res);
  });
  it('demanaSegur converteix un error de xarxa en una resposta d\'estat 0, sense llançar', async () => {
    const cau = async () => { throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }); };
    const res = await demanaSegur(cau, 'http://x');
    expect(res.status).toBe(0);
    expect(res.error).toBe('ECONNREFUSED');
    expect(res.headers.get('location')).toBeNull();
    expect(await res.text()).toBe('');
  });
  it('estatDe mostra l\'estat o l\'error de connexió', () => {
    expect(estatDe({ status: 404 })).toBe(404);
    expect(estatDe({ status: 0, error: 'ECONNREFUSED' })).toBe('error de connexió: ECONNREFUSED');
  });
  it('l\'error de connexió no coincideix amb cap entrada de permesos per estat', () => {
    const d = [{ path: '/a/', camp: 'status', hugo: 200, nova: estatDe({ status: 0, error: 'x' }) }];
    expect(aplicaPermet(d, [{ path: '/a/', estat: 404, motiu: 'm' }]).inesperades).toEqual(d);
  });
});
