import * as ROUTES from '../constants/routes';

// Adreça de la web pública equivalent a una ruta de l'administració, conservant
// el hash (#id, #top, #recents). Retorna null si la ruta no es redirigeix.
export function urlPublica(pathname, hash = '') {
  const ruta = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (ruta === ROUTES.INICI || ruta === ROUTES.PROPOSTES) return ROUTES.URL_PROPOSTES_PUBLIQUES + hash;
  if (ruta === ROUTES.PROPOSTES_PROPOSAR) return ROUTES.URL_PROPOSTES_PROPOSAR_PUBLIQUES + hash;
  return null;
}
