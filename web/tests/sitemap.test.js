import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { urlsSitemap, xmlSitemap } from '../src/lib/sitemap.js';
import { sessionsPubliques, trobaSessio } from '../src/lib/sessions.js';
import { termesDe, trobaTerme } from '../src/lib/taxonomies.js';
import { paginaPerSlug, SLUGS_CONTINGUT } from '../src/lib/pagines.js';

function dbFals({ sessions = [], pagines = {} }) {
  return {
    collection: (nom) => ({
      get: async () => ({ docs: (nom === 'sessions' ? sessions : []).map(({ id, ...dades }) => ({ id, data: () => dades })) }),
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
    ].sort());
    expect(urls.every((u) => u.startsWith('/') && u.endsWith('/'))).toBe(true);
    expect(new Set(urls).size).toBe(urls.length);
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
    expect([...urls].sort()).toEqual(['/', '/directors/', '/fes-te-socia/', '/generes/', '/interprets/', '/preguntes-frequents/', '/privacitat/', '/programacio/'].sort());
  });

  // Cap URL del sitemap pot donar 404: cadascuna es resol amb les mateixes funcions que les pàgines.
  it('cada URL del sitemap es resol amb les funcions de les pàgines', async () => {
    const publiques = await sessionsPubliques(db);
    const termes = { directors: termesDe(publiques, 'directors'), generes: termesDe(publiques, 'generes'), interprets: termesDe(publiques, 'interprets') };
    for (const url of await urlsSitemap(db)) {
      const segments = url.split('/').filter(Boolean).map(decodeURIComponent);
      const [primer, segon, tercer] = segments;
      if (segments.length === 0 || (segments.length === 1 && primer === 'programacio')) continue;
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
  const xml = xmlSitemap(['/', '/directors/alauda-ruiz-de-az%C3%BAa/'], 'https://exemple.cat');

  it('és un urlset amb les URL absolutes sobre la base', () => {
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
    expect(xml).toContain('<url><loc>https://exemple.cat/</loc></url>');
    expect(xml).toContain('<url><loc>https://exemple.cat/directors/alauda-ruiz-de-az%C3%BAa/</loc></url>');
    expect(xml.trim().endsWith('</urlset>')).toBe(true);
  });

  it('escapa els caràcters especials de XML', () => {
    expect(xmlSitemap(['/a&b/'], 'https://exemple.cat')).toContain('<loc>https://exemple.cat/a&amp;b/</loc>');
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
    expect(text).toContain('<loc>https://cineclubrodadebera.cat/programacio/2026/los-domingos/</loc>');
    expect(text).not.toContain('oculta');
  });
});
