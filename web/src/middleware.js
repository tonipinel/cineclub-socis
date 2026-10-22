import { cacheControlFor } from './lib/cache.js';
import { INDEXABLE } from './lib/env.js';
import { redireccioPer } from './lib/redirects.js';
import { sessionsPubliques } from './lib/sessions.js';

const ERROR_HTML = '<!doctype html><html lang="ca"><head><meta charset="utf-8"><title>Error temporal | Cineclub Roda de Berà</title></head>'
  + '<body style="font-family:sans-serif;text-align:center;padding:80px 16px"><h1>Error temporal</h1>'
  + '<p>Torna-ho a provar d\'aquí a uns minuts.</p></body></html>';

const redirect301 = (desti) => new Response(null, { status: 301, headers: { Location: desti } });

// Els `aliases` de Hugo són tots sota /programacio/: només allà un 404 pot ser un alias d'una
// sessió publicada i només llavors es llegeix Firestore (mai per a /404 ni per a la resta de
// 404). Si la lectura falla es manté el 404.
async function aliasDe(pathname) {
  if (!pathname.startsWith('/programacio/')) return null;
  try {
    return redireccioPer(pathname, await sessionsPubliques());
  } catch (err) {
    console.error('error en comprovar l\'alias', pathname, err);
    return null;
  }
}

export const onRequest = async (context, next) => {
  let response;
  try {
    response = await next();
    if (response.status === 404) {
      const desti = await aliasDe(context.url.pathname);
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
