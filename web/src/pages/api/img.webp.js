import { resizeRequest, fetchImage, llegirStorage, toWebp } from '../../lib/resize.js';
import { CACHE_REDIRECT } from '../../lib/cache.js';

const CACHE_IMATGE = 'public, max-age=31536000, s-maxage=31536000, immutable';

export const GET = async ({ url }) => {
  const peticio = resizeRequest(url.searchParams);
  if (!peticio) return new Response('Bad request', { status: 400 });
  try {
    // Primer l'Admin SDK (més ràpid); si no hi pot accedir, l'endpoint públic.
    const original = await llegirStorage(peticio.url).catch((e) => {
      console.warn('llegirStorage ha fallat, es fa servir la descàrrega pública:', e?.message);
      return fetchImage(peticio.url);
    });
    if (original) {
      const cos = await toWebp(original, peticio.width);
      return new Response(cos, { headers: { 'Content-Type': 'image/webp', 'Cache-Control': CACHE_IMATGE } });
    }
  } catch (err) {
    console.error('no s\'ha pogut redimensionar la imatge', peticio.url, err);
  }
  // Tot el que no es pot redimensionar es serveix com a original.
  return new Response(null, { status: 302, headers: { Location: peticio.url, 'Cache-Control': CACHE_REDIRECT } });
};
