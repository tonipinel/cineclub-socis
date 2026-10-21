export const CACHE_OK = 'public, max-age=300, s-maxage=86400, stale-while-revalidate=86400';
// Portada i /programacio/: el mosaic i els «Per determinar» del calendari es calculen amb la data de la
// petició, així que han de caducar abans que la resta de pàgines.
export const CACHE_AVUI = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=3600';
export const CACHE_REDIRECT = 'public, max-age=300, s-maxage=3600';
export const CACHE_NOT_FOUND = 'public, max-age=60, s-maxage=300';
export const CACHE_ERROR = 'no-store';

export const cacheControlFor = (status) => {
  if (status >= 500) return CACHE_ERROR;
  if (status === 404) return CACHE_NOT_FOUND;
  if (status >= 300 && status < 400) return CACHE_REDIRECT;
  return CACHE_OK;
};
