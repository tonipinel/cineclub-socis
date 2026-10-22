import { cacheControlFor } from './lib/cache.js';
import { INDEXABLE } from './lib/env.js';
import { SLUGS_PAGINES, paginaPerSlug } from './lib/pagines.js';
import {
  IMATGE_ANTIGA, imatgeAntigaPer, imatgePaginaPer, redireccioPer, rutaImatgePagina,
} from './lib/redirects.js';
import { sessionsPubliques } from './lib/sessions.js';

const ERROR_HTML = '<!doctype html><html lang="ca"><head><meta charset="utf-8"><title>Error temporal | Cineclub Roda de Berà</title></head>'
  + '<body style="font-family:sans-serif;text-align:center;padding:80px 16px"><h1>Error temporal</h1>'
  + '<p>Torna-ho a provar d\'aquí a uns minuts.</p></body></html>';

// Astro (trailingSlash: 'always') només casa les pàgines amb barra final, però el cartell de Hugo és
// /programacio/<any>/<slug>/cartell.html: s'hi arriba reescrivint a la ruta amb barra.
const CARTELL = /^\/programacio\/[^/]+\/[^/]+\/cartell\.html$/;

// Qualsevol altre camí d'imatge que doni 404 és un 404 sense cap lectura.
const IMATGE = /\.(?:jpg|jpeg|png|webp)$/;

const redirect301 = (desti) => new Response(null, { status: 301, headers: { Location: desti } });

// Un 404 pot ser una URL antiga de Hugo: un `alias` d'una sessió publicada (tots sota /programacio/), una
// imatge d'una sessió (/programacio/<any>/<slug>/<fitxer>) o una imatge d'una pàgina (/<fitxer> de la
// portada, /<slug>/<fitxer>). Només llavors es llegeix Firestore, i les rutes que ja responen (estàtics de
// web/public, endpoints, pàgines) no hi arriben mai. Si la lectura falla es manté el 404.
async function destiDe404(pathname) {
  try {
    if (IMATGE_ANTIGA.test(pathname)) return imatgeAntigaPer(pathname, await sessionsPubliques());
    const imatgePagina = rutaImatgePagina(pathname, SLUGS_PAGINES);
    if (imatgePagina) return imatgePaginaPer(await paginaPerSlug(imatgePagina.slug), imatgePagina.fitxer);
    if (IMATGE.test(pathname)) return null;
    if (pathname.startsWith('/programacio/')) return redireccioPer(pathname, await sessionsPubliques());
  } catch (err) {
    console.error('error en comprovar la redirecció', pathname, err);
  }
  return null;
}

export const onRequest = async (context, next) => {
  const { pathname } = context.url;
  let response;
  try {
    response = await (CARTELL.test(pathname) ? next(`${pathname}/`) : next());
    if (response.status === 404) {
      const desti = await destiDe404(pathname);
      if (desti) response = redirect301(desti);
    }
  } catch (err) {
    console.error('error de renderitzat', context.url.pathname, err);
    response = new Response(ERROR_HTML, { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  const headers = new Headers(response.headers);
  if (response.status !== 200 || !headers.has('Cache-Control')) headers.set('Cache-Control', cacheControlFor(response.status));
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Security-Policy', "frame-ancestors 'self'");
  if (!INDEXABLE) headers.set('X-Robots-Tag', 'noindex');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};
