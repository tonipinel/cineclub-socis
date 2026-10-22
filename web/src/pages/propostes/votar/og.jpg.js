import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { imatgeOgDeLaTanda } from '../../../lib/propostes/imatge-og.js';

const LOGO = '/images/entitats/cineclub-roda-de-bera.png';
const CACHE_OG = 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400';
const CACHE_FALLBACK = 'public, max-age=60, s-maxage=60';

// El logo viatja amb la funció (`web/public`) i es llegeix del directori de treball, que és `web/`
// tant a `astro dev` com a la Cloud Function.
const llegeixLogo = () => readFile(join(process.cwd(), 'public', LOGO));

// Imatge de previsualització de /propostes/votar/ per a WhatsApp: collage dels cartells de la tanda.
// No accepta paràmetres (cada variant de la URL seria una entrada nova al CDN i una generació nova).
export const GET = async ({ url }) => {
  if ([...url.searchParams.keys()].length > 0) return new Response('Bad request', { status: 400 });
  let logo;
  try {
    logo = await llegeixLogo();
    const jpeg = await imatgeOgDeLaTanda(logo);
    if (jpeg) return new Response(jpeg, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': CACHE_OG } });
  } catch (err) {
    console.error('no s\'ha pogut generar la imatge de la tanda', err);
  }
  if (logo) return new Response(logo, { headers: { 'Content-Type': 'image/png', 'Cache-Control': CACHE_FALLBACK } });
  return new Response(null, { status: 302, headers: { Location: LOGO, 'Cache-Control': CACHE_FALLBACK } });
};
