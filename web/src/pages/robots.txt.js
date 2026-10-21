import { INDEXABLE, SITE_URL } from '../lib/env.js';

export const prerender = true;

export const GET = () => new Response(
  INDEXABLE ? `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n',
  { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
);
