import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { entradesSitemap, lastmodPagina, lastmodSessio, urlsSitemap, xmlSitemap } from '../src/lib/sitemap.js';
import { sessionsPubliques, trobaSessio } from '../src/lib/sessions.js';
import { termesDe, trobaTerme } from '../src/lib/taxonomies.js';
import { paginaPerSlug, SLUGS_CONTINGUT } from '../src/lib/pagines.js';

function dbFals({ sessions = [], pagines = {}, propostes = [] }) {
  const docs = (llista) => llista.map(({ id, ...dades }) => ({ id, data: () => dades }));
  return {
    collection: (nom) => ({
      get: async () => ({ docs: docs(nom === 'sessions' ? sessions : []) }),
      // Només `where('estat', '==', 'aprovada')` sobre `propostes`.
      where: (camp, op, valor) => ({
        get: async () => ({ docs: docs(nom === 'propostes' ? propostes.filter((p) => p[camp] === valor) : []) }),
      }),
      doc: (id) => ({
        get: async () => {
          const dades = nom === 'pagines' ? pagines[id] : undefined;
          return { exists: dades !== undefined, data: () => dades };
        },
      }),
    }),
  };
}

const sessio = (slug, data, publica, extra = {}) => ({ id: `${slug}-id`, titol: slug, slug, publicada: true, data, hora: '19:00', publica, ...extra });
const sessions = [
  sessio('los-domingos', '2026-09-03', { directors: ['Alauda Ruiz de Azúa'], interprets: ['Miguel Garcés', 'Blanca Soroa'], generes: ['Drama'] }),
  sessio('night-of-the-living-dead', '2025-10-22', { directors: ['George A. Romero'], interprets: ['Duane Jones'], generes: ['Terror', 'Zombis'] }),
  sessio('oculta', '2026-11-05', { directors: ['Director Ocult'], interprets: ['Intèrpret Ocult'], generes: ['Gènere Ocult'] }, { publicada: false }),
  sessio('sense-data', 'no-es-una-data', { directors: ['Director Trencat'] }),
];
const pagines = {
  'preguntes-frequents': { slug: 'preguntes-frequents' },
  privacitat: { slug: 'privacitat' },
  'fes-te-socia': { slug: 'fes-te-socia' },
};
const db = dbFals({ sessions, pagines });

describe('urlsSitemap', () => {
  it('llista portada, programació, sessions publicades, taxonomies, termes i pàgines, amb barra final', async () => {
    const urls = await urlsSitemap(db);
    expect([...urls].sort()).toEqual([
      '/',
      '/directors/',
      '/directors/alauda-ruiz-de-az%C3%BAa/',
      '/directors/george-a.-romero/',
      '/fes-te-socia/',
      '/generes/',
      '/generes/drama/',
      '/generes/terror/',
      '/generes/zombis/',
      '/interprets/',
      '/interprets/blanca-soroa/',
      '/interprets/duane-jones/',
      '/interprets/miguel-garc%C3%A9s/',
      '/preguntes-frequents/',
      '/privacitat/',
      '/programacio/',
      '/programacio/2025/night-of-the-living-dead/',
      '/programacio/2026/los-domingos/',
      '/propostes/',
    ].sort());
    expect(urls.every((u) => u.startsWith('/') && u.endsWith('/'))).toBe(true);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('no hi llista les pàgines que no s\'indexen (/propostes/votar/, /propostes/proposar/)', async () => {
    const urls = await urlsSitemap(db);
    expect(urls).toContain('/propostes/');
    expect(urls).not.toContain('/propostes/votar/');
    expect(urls).not.toContain('/propostes/proposar/');
  });

  it('exclou les sessions no publicades (o sense data vàlida) i els termes que només elles aporten', async () => {
    const urls = (await urlsSitemap(db)).join('\n');
    for (const intrus of ['oculta', 'ocult', 'sense-data', 'trencat']) expect(urls).not.toContain(intrus);
  });

  it('no llista una pàgina de contingut que no existeix a Firestore', async () => {
    const urls = await urlsSitemap(dbFals({ sessions, pagines: { privacitat: {} } }));
    expect(urls).toContain('/privacitat/');
    expect(urls).not.toContain('/preguntes-frequents/');
    expect(urls).not.toContain('/fes-te-socia/');
  });

  it('sense sessions publicades queden la portada, la programació, les taxonomies i les pàgines', async () => {
    const urls = await urlsSitemap(dbFals({ pagines }));
    expect([...urls].sort()).toEqual(['/', '/directors/', '/fes-te-socia/', '/generes/', '/interprets/', '/preguntes-frequents/', '/privacitat/', '/programacio/', '/propostes/'].sort());
  });

  // Cap URL del sitemap pot donar 404: cadascuna es resol amb les mateixes funcions que les pàgines.
  it('cada URL del sitemap es resol amb les funcions de les pàgines', async () => {
    const publiques = await sessionsPubliques(db);
    const termes = { directors: termesDe(publiques, 'directors'), generes: termesDe(publiques, 'generes'), interprets: termesDe(publiques, 'interprets') };
    for (const url of await urlsSitemap(db)) {
      const segments = url.split('/').filter(Boolean).map(decodeURIComponent);
      const [primer, segon, tercer] = segments;
      if (segments.length === 0 || (segments.length === 1 && ['programacio', 'propostes'].includes(primer))) continue;
      if (primer === 'programacio') {
        expect(trobaSessio(publiques, segon, tercer), url).not.toBeNull();
      } else if (termes[primer]) {
        if (segon) expect(trobaTerme(termes[primer], segon), url).not.toBeNull();
      } else {
        expect([...SLUGS_CONTINGUT, 'fes-te-socia'], url).toContain(primer);
        expect(await paginaPerSlug(primer, db), url).not.toBeNull();
      }
    }
  });
});

describe('xmlSitemap', () => {
  const xml = xmlSitemap([
    { cami: '/', lastmod: '2026-08-20T00:00:00+00:00' },
    { cami: '/directors/alauda-ruiz-de-az%C3%BAa/', lastmod: '2026-09-03T19:00:00+02:00' },
    { cami: '/privacitat/' },
  ], 'https://exemple.cat');

  it('és un urlset amb els mateixos espais de noms que el de Hugo i les URL absolutes sobre la base', () => {
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9" xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml">/);
    expect(xml).toContain('<url><loc>https://exemple.cat/</loc><lastmod>2026-08-20T00:00:00+00:00</lastmod></url>');
    expect(xml).toContain('<url><loc>https://exemple.cat/directors/alauda-ruiz-de-az%C3%BAa/</loc><lastmod>2026-09-03T19:00:00+02:00</lastmod></url>');
    expect(xml.trim().endsWith('</urlset>')).toBe(true);
  });

  it('omet el lastmod de les URL que no en tenen (com Hugo)', () => {
    expect(xml).toContain('<url><loc>https://exemple.cat/privacitat/</loc></url>');
  });

  it('escapa els caràcters especials de XML', () => {
    expect(xmlSitemap([{ cami: '/a&b/' }], 'https://exemple.cat')).toContain('<loc>https://exemple.cat/a&amp;b/</loc>');
  });
});

describe('lastmodSessio', () => {
  it('és la data i hora de la sessió amb l\'ofset d\'Europe/Madrid (com Hugo)', () => {
    expect(lastmodSessio({ data: '2026-10-22', hora: '19:00' })).toBe('2026-10-22T19:00:00+02:00');
    expect(lastmodSessio({ data: '2026-03-05', hora: '19:00' })).toBe('2026-03-05T19:00:00+01:00');
  });

  it('publica.actualitzatEl (ISO) té prioritat sobre la data de la sessió', () => {
    const base = { data: '2026-10-22', hora: '19:00' };
    expect(lastmodSessio({ ...base, publica: { actualitzatEl: '2026-10-30T10:15:00+01:00' } })).toBe('2026-10-30T10:15:00+01:00');
    expect(lastmodSessio({ ...base, publica: { actualitzatEl: '2026-10-30' } })).toBe('2026-10-30');
  });

  it('ignora un actualitzatEl que no és una data ISO vàlida', () => {
    const base = { data: '2026-10-22', hora: '19:00' };
    for (const dolent of ['ahir', '', '2026-13-45', 12345, null, '2026-02-30', '2026-10-30T10:15:00', '2026-10-30T10:15', '2026-10-30T25:00:00Z', '2026-10-30T10:15:00+25:00', '2026-10-30 10:15:00Z', '2026-10-30T10:15:00+0100']) {
      expect(lastmodSessio({ ...base, publica: { actualitzatEl: dolent } }), String(dolent)).toBe('2026-10-22T19:00:00+02:00');
    }
  });
});

describe('lastmodSessio: formats acceptats d\'actualitzatEl', () => {
  const base = { data: '2026-10-22', hora: '19:00' };
  it('accepta data sola, o hora amb Z o ofset (amb o sense segons i fracció)', () => {
    for (const bo of ['2026-10-30', '2024-02-29', '2026-10-30T10:15Z', '2026-10-30T10:15:00Z', '2026-10-30T10:15:00.123+01:00', '2026-10-30T10:15:00-05:30']) {
      expect(lastmodSessio({ ...base, publica: { actualitzatEl: bo } }), bo).toBe(bo);
    }
  });
  it('el 29 de febrer d\'un any no de traspàs s\'ignora', () => {
    expect(lastmodSessio({ ...base, publica: { actualitzatEl: '2026-02-29' } })).toBe('2026-10-22T19:00:00+02:00');
  });
});

describe('sitemap: slugs no ASCII', () => {
  it('els camins de sessió surten codificats, com els 301 dels aliases', async () => {
    const accents = [{ id: 'a', titol: 'X', slug: 'esperando-a-dalí', data: '2026-07-23', hora: '19:00', publicada: true, publica: { directors: [], generes: [], interprets: [] } }];
    const llista = await entradesSitemap(dbFals({ sessions: accents, pagines: {} }));
    expect(llista.map((e) => e.cami)).toContain('/programacio/2026/esperando-a-dal%C3%AD/');
    expect(llista.map((e) => e.cami).join()).not.toContain('dalí');
  });
});

describe('lastmodPagina', () => {
  it('una data sense hora és mitjanit UTC, com a Hugo', () => {
    expect(lastmodPagina({ dades: { date: '2026-08-20' } })).toBe('2026-08-20T00:00:00+00:00');
  });
  it('un instant ISO amb Z o mil·lisegons es normalitza al format de Hugo', () => {
    expect(lastmodPagina({ dades: { date: '2026-08-20T10:30:00.000Z' } })).toBe('2026-08-20T10:30:00+00:00');
    expect(lastmodPagina({ dades: { date: '2026-08-20T10:30:00+02:00' } })).toBe('2026-08-20T10:30:00+02:00');
  });
  it('sense data (o pàgina inexistent) no hi ha lastmod', () => {
    expect(lastmodPagina({ dades: {} })).toBeNull();
    expect(lastmodPagina({})).toBeNull();
    expect(lastmodPagina(null)).toBeNull();
    expect(lastmodPagina({ dades: { date: 'no-es-data' } })).toBeNull();
  });
});

describe('entradesSitemap (lastmod)', () => {
  const llistaSessions = [
    sessio('night-of-the-living-dead', '2025-10-22', { directors: ['George A. Romero'], interprets: ['Duane Jones'], generes: ['Terror'] }),
    sessio('los-domingos', '2026-09-03', { directors: ['Alauda Ruiz de Azúa'], interprets: ['Miguel Garcés'], generes: ['Drama'] }),
    sessio('un-altre', '2026-10-08', { directors: ['Alauda Ruiz de Azúa'], interprets: ['Duane Jones'], generes: ['Drama'] }),
    sessio('oculta', '2027-01-05', { directors: ['Alauda Ruiz de Azúa'], interprets: ['Duane Jones'], generes: ['Drama'] }, { publicada: false }),
  ];
  const paginesDades = {
    portada: { dades: { date: '2026-08-20' } },
    programacio: { dades: { date: '2026-08-20' } },
    'preguntes-frequents': { slug: 'preguntes-frequents' },
    privacitat: { slug: 'privacitat' },
    'fes-te-socia': { slug: 'fes-te-socia' },
  };
  const entrades = async (extra = {}, pagines = paginesDades) => {
    const llista = await entradesSitemap(dbFals({ sessions: llistaSessions, pagines, ...extra }));
    return Object.fromEntries(llista.map((e) => [e.cami, e.lastmod ?? null]));
  };

  it('la portada i la programació usen la data del front matter de la seva pàgina', async () => {
    const lm = await entrades();
    expect(lm['/']).toBe('2026-08-20T00:00:00+00:00');
    expect(lm['/programacio/']).toBe('2026-08-20T00:00:00+00:00');
  });

  it('cada sessió, la seva data amb ofset de Madrid', async () => {
    const lm = await entrades();
    expect(lm['/programacio/2025/night-of-the-living-dead/']).toBe('2025-10-22T19:00:00+02:00');
    expect(lm['/programacio/2026/los-domingos/']).toBe('2026-09-03T19:00:00+02:00');
  });

  it('un terme té la data de la sessió publicada més recent i l\'índex de la taxonomia, la més recent de totes', async () => {
    const lm = await entrades();
    expect(lm['/directors/alauda-ruiz-de-az%C3%BAa/']).toBe('2026-10-08T19:00:00+02:00'); // l'oculta (2027) no compta
    expect(lm['/generes/drama/']).toBe('2026-10-08T19:00:00+02:00');
    expect(lm['/generes/terror/']).toBe('2025-10-22T19:00:00+02:00');
    expect(lm['/interprets/duane-jones/']).toBe('2026-10-08T19:00:00+02:00');
    expect(lm['/generes/']).toBe('2026-10-08T19:00:00+02:00');
    expect(lm['/directors/']).toBe('2026-10-08T19:00:00+02:00');
    expect(lm['/interprets/']).toBe('2026-10-08T19:00:00+02:00');
  });

  it('/propostes/ té com a lastmod la proposta aprovada més recent (les pendents no compten)', async () => {
    const data = (iso) => ({ toDate: () => new Date(iso) });
    const lm = await entrades({
      propostes: [
        { id: 'a', estat: 'aprovada', timestamp: data('2026-10-01T10:00:00.000Z') },
        { id: 'b', estat: 'aprovada', timestamp: data('2026-10-20T08:30:15.123Z') },
        { id: 'c', estat: 'pendent', timestamp: data('2026-11-30T00:00:00.000Z') },
        { id: 'd', estat: 'aprovada' },
      ],
    });
    expect(lm['/propostes/']).toBe('2026-10-20T08:30:15Z');
  });

  it('/propostes/ és al sitemap sense lastmod si no hi ha propostes aprovades o la lectura falla', async () => {
    expect((await entrades()).hasOwnProperty('/propostes/')).toBe(true);
    expect((await entrades())['/propostes/']).toBeNull();
    const trencada = dbFals({ sessions: llistaSessions, pagines: paginesDades });
    const original = trencada.collection;
    trencada.collection = (nom) => {
      if (nom === 'propostes') throw new Error('sense permisos');
      return original(nom);
    };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const llista = await entradesSitemap(trencada);
    expect(llista.find((e) => e.cami === '/propostes/')).toEqual({ cami: '/propostes/' });
    error.mockRestore();
  });

  it('les pàgines sense data (privacitat, FAQ, fes-te-socia) no tenen lastmod', async () => {
    const lm = await entrades();
    for (const cami of ['/privacitat/', '/preguntes-frequents/', '/fes-te-socia/']) expect(lm[cami], cami).toBeNull();
  });

  it('sense pàgina portada/programacio a Firestore tampoc no hi ha lastmod (però les URL hi són)', async () => {
    const { portada, programacio, ...resta } = paginesDades;
    const lm = await entrades({}, resta);
    expect(lm['/']).toBeNull();
    expect(lm['/programacio/']).toBeNull();
  });

  it('actualitzatEl d\'una sessió reemplaça la seva data al sitemap, també al terme i a l\'índex', async () => {
    const amb = llistaSessions.map((s) => (s.slug === 'un-altre' ? { ...s, publica: { ...s.publica, actualitzatEl: '2026-11-15T09:00:00+01:00' } } : s));
    const llista = await entradesSitemap(dbFals({ sessions: amb, pagines: paginesDades }));
    const lm = Object.fromEntries(llista.map((e) => [e.cami, e.lastmod ?? null]));
    expect(lm['/programacio/2026/un-altre/']).toBe('2026-11-15T09:00:00+01:00');
    expect(lm['/generes/drama/']).toBe('2026-11-15T09:00:00+01:00');
    expect(lm['/generes/']).toBe('2026-11-15T09:00:00+01:00');
    expect(lm['/programacio/2026/los-domingos/']).toBe('2026-09-03T19:00:00+02:00');
  });
});

describe('sitemap.xml (endpoint)', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => { vi.doUnmock('../src/lib/db.js'); vi.unstubAllEnvs(); });

  it('respon XML amb la caché curta i SITE_URL com a base', async () => {
    vi.stubEnv('PUBLIC_SITE_URL', 'https://cineclubrodadebera.cat');
    vi.doMock('../src/lib/db.js', async (importOriginal) => ({ ...(await importOriginal()), getDb: () => db }));
    const { GET } = await import('../src/pages/sitemap.xml.js');
    const { CACHE_AVUI } = await import('../src/lib/cache.js');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/xml');
    expect(res.headers.get('Cache-Control')).toBe(CACHE_AVUI);
    const text = await res.text();
    expect(text).toContain('<loc>https://cineclubrodadebera.cat/programacio/2026/los-domingos/</loc><lastmod>2026-09-03T19:00:00+02:00</lastmod>');
    expect(text).not.toContain('oculta');
  });
});
