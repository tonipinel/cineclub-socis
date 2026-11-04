import { CACHE_ERROR, CACHE_OK } from '../../../lib/cache.js';
import { flyerActiu, flyerPerId, teClau } from '../../../lib/flyers.js';

const PREFIX_STORAGE = 'https://firebasestorage.googleapis.com/v0/b/';

const noTrobat = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': CACHE_ERROR } });

const encaraNoDisponible = () => new Response('El PDF encara s\'està preparant', {
  status: 404,
  headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': CACHE_ERROR },
});

// /flyer/<id>/flyer.pdf?variant=simple|impremta&clau=. Serveix el PDF que ha generat la Cloud Function (la URL amb token
// surt només del document del flyer, mai de la petició; es descarrega al servidor i mai es redirigeix ni es mostra). Mateixes regles d'accés que /flyer/<id>/imprimir/: un flyer
// no actiu (esborrany, o publicat amb alguna sessió sense publicar o esborrada) i la variant `impremta` demanen la `clau`;
// sense accés, el mateix 404 que un flyer inexistent. Els PDF desats porten TOTES les sessions del flyer, publicades o no:
// per això, sense `clau`, només se serveixen d'un flyer actiu.
export const GET = async ({ params, url }) => {
  const clau = url.searchParams.get('clau') ?? '';
  const variant = url.searchParams.get('variant') === 'impremta' ? 'impremta' : 'simple';
  const flyer = await flyerPerId(params.id);
  const ambClau = Boolean(flyer) && teClau(flyer, clau);
  if (!flyer || (variant === 'impremta' && !ambClau)) return noTrobat();
  const actiu = await flyerActiu(flyer);
  if (!actiu && !ambClau) return noTrobat();
  // Sense clau, només un PDF pintat amb sessions que encara són totes del flyer (actiu: publicades). Un PDF antic sense
  // `sessionsIds`, o pintat amb una sessió que ja s'ha tret, s'espera a la regeneració.
  const pintades = flyer.pdfs?.[variant]?.sessionsIds;
  const actuals = new Set(flyer.sessionsIds ?? []);
  if (!ambClau && !(Array.isArray(pintades) && pintades.every((sessionId) => actuals.has(sessionId)))) return encaraNoDisponible();
  const urlPdf = flyer.pdfs?.[variant]?.url;
  if (typeof urlPdf !== 'string' || !urlPdf.startsWith(PREFIX_STORAGE)) return encaraNoDisponible();
  let cos;
  try {
    const resposta = await fetch(urlPdf, { redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!resposta.ok) {
      resposta.body?.cancel();
      console.error('no s\'ha pogut llegir el PDF del flyer', flyer.id, resposta.status);
      return encaraNoDisponible();
    }
    cos = await resposta.arrayBuffer();
  } catch {
    console.error('no s\'ha pogut llegir el PDF del flyer', flyer.id);
    return encaraNoDisponible();
  }
  return new Response(cos, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="flyer-cineclub.pdf"',
      // Una URL amb la clau no es cacheja mai.
      'Cache-Control': actiu && !ambClau && variant === 'simple' ? CACHE_OK : CACHE_ERROR,
    },
  });
};
