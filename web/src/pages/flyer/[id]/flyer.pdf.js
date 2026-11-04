import { getBucket } from '../../../lib/storage.js';
import { CACHE_ERROR, CACHE_OK } from '../../../lib/cache.js';
import { flyerPerId, potVeure } from '../../../lib/flyers.js';

const encaraNoDisponible = () => new Response('El PDF encara s\'està preparant', {
  status: 404,
  headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': CACHE_ERROR },
});

// /flyer/<id>/flyer.pdf?variant=simple|impremta&clau=. Serveix el PDF que ha generat la Cloud Function (la ruta surt
// només del document del flyer, mai de la petició). Mateixes regles d'accés que /flyer/<id>/imprimir/: un esborrany i
// la variant `impremta` demanen la `clau`; sense accés, el mateix 404 que un flyer inexistent.
export const GET = async ({ params, url }) => {
  const clau = url.searchParams.get('clau') ?? '';
  const variant = url.searchParams.get('variant') === 'impremta' ? 'impremta' : 'simple';
  const flyer = await flyerPerId(params.id);
  if (!flyer || !potVeure(flyer, clau) || (variant === 'impremta' && !(clau && clau === flyer.clauPrevia))) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': CACHE_ERROR } });
  }
  const cami = flyer.pdfs?.[variant]?.path;
  if (!cami) return encaraNoDisponible();
  let cos;
  try {
    [cos] = await getBucket().file(cami).download();
  } catch (err) {
    console.error('no s\'ha pogut llegir el PDF del flyer', flyer.id, err);
    return encaraNoDisponible();
  }
  return new Response(cos, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="flyer-cineclub.pdf"',
      'Cache-Control': flyer.estat === 'publicat' && variant === 'simple' ? CACHE_OK : CACHE_ERROR,
    },
  });
};
