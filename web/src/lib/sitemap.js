import { getDb } from './db.js';
import { SLUGS_CONTINGUT, paginaPerSlug } from './pagines.js';
import { urlSessio, urlTerme } from './sessio-camps.js';
import { sessionsPubliques } from './sessions.js';
import { termesDe } from './taxonomies.js';

const TAXONOMIES = ['directors', 'generes', 'interprets'];
const PAGINES = [...SLUGS_CONTINGUT, 'fes-te-socia'];

// Camins (amb barra final i percent-encoded, com els de Hugo) del sitemap. Surten de les mateixes
// funcions que les pàgines (`sessionsPubliques`, `termesDe`, `paginaPerSlug`): una URL que aquí
// apareix també es resol allà, i un terme sense sessions publicades no hi apareix.
export async function urlsSitemap(db = getDb()) {
  const [sessions, pagines] = await Promise.all([
    sessionsPubliques(db),
    Promise.all(PAGINES.map((slug) => paginaPerSlug(slug, db))),
  ]);
  return [
    '/',
    '/programacio/',
    ...sessions.map(urlSessio),
    ...TAXONOMIES.flatMap((taxonomia) => [
      `/${taxonomia}/`,
      ...termesDe(sessions, taxonomia).map((terme) => urlTerme(taxonomia, terme.nom)),
    ]),
    ...PAGINES.filter((_, i) => pagines[i]).map((slug) => `/${slug}/`),
  ];
}

const escapaXml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Hugo hi afegeix un `lastmod` que és la data de la sessió (no la de modificació); aquí s'omet.
export const xmlSitemap = (camins, base) => '<?xml version="1.0" encoding="UTF-8"?>\n'
  + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  + camins.map((cami) => `<url><loc>${escapaXml(base + cami)}</loc></url>\n`).join('')
  + '</urlset>\n';
