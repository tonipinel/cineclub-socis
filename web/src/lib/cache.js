// Curta a propòsit: no es pot purgar la CDN d'Hosting, i un canvi fet a l'admin ha de ser visible a la web en pocs minuts.
export const CACHE_OK = 'public, max-age=60, s-maxage=300, stale-while-revalidate=60';
// Portada i /programacio/: el mosaic i els «Per determinar» del calendari es calculen amb la data de la petició.
export const CACHE_AVUI = CACHE_OK;
export const CACHE_REDIRECT = 'public, max-age=60, s-maxage=300';
// Perquè una sessió recent publicada no es quedi com a 404 a la CDN.
export const CACHE_NOT_FOUND = 'public, max-age=60, s-maxage=60';
// Errors del client (400, 403, 410...) que no són 404: una cache curta evita martellejar l'origen.
export const CACHE_CLIENT = 'public, max-age=60, s-maxage=60';
export const CACHE_ERROR = 'no-store';

export const cacheControlFor = (status) => {
  if (status >= 500) return CACHE_ERROR;
  if (status === 404) return CACHE_NOT_FOUND;
  if (status >= 300 && status < 400) return CACHE_REDIRECT;
  if (status >= 400) return CACHE_CLIENT;
  return CACHE_OK;
};
