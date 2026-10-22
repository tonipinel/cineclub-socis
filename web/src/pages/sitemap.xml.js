import { CACHE_AVUI } from '../lib/cache.js';
import { SITE_URL } from '../lib/env.js';
import { entradesSitemap, xmlSitemap } from '../lib/sitemap.js';

// Es genera a cada petició des de Firestore, així que les sessions noves hi surten sense desplegar.
export const GET = async () => new Response(xmlSitemap(await entradesSitemap(), SITE_URL), {
  headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': CACHE_AVUI },
});
