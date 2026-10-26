import { camiOgSessio, imatgeOgReserva, imatgeOgSessio } from '../../../../lib/og-sessio.js';
import { sessionsPubliques, trobaSessio } from '../../../../lib/sessions.js';

const CACHE_OG = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400';
// Fallada o sessió sense cartell: un 200 (el middleware només reescriu la caché dels no-200), però curt.
const CACHE_RESERVA = 'public, max-age=60, s-maxage=60';

const jpeg = (cos, cache) => new Response(cos, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': cache } });

// Imatge Open Graph d'una sessió (1200 × 630, JPEG): el logo i el cartell, com el collage de
// /propostes/votar/og.jpg. L'única consulta acceptada és `?v=<versió del cartell>`; una altra forma del camí
// (percent-encoded diferent) o una versió antiga fan un 301 a l'adreça actual, i qualsevol altre paràmetre, un
// 400. Una sessió que no existeix és un 404.
export const GET = async ({ params, url }) => {
  const claus = [...url.searchParams.keys()];
  if (claus.some((k) => k !== 'v') || claus.length > 1) return new Response('Bad request', { status: 400 });
  const sessions = /^\d{4}$/.test(params.any ?? '') ? await sessionsPubliques() : [];
  const sessio = trobaSessio(sessions, params.any, params.slug);
  if (!sessio) return new Response('Not found', { status: 404 });
  if (sessio.publica?.cartell) {
    const cami = camiOgSessio(sessio);
    if (`${url.pathname}${url.search}` !== cami) return new Response(null, { status: 301, headers: { Location: cami } });
    try {
      const cos = await imatgeOgSessio(sessio);
      if (cos) return jpeg(cos, CACHE_OG);
    } catch (err) {
      console.error('no s\'ha pogut generar la imatge OG de la sessió', sessio.id, err);
    }
  }
  return jpeg(await imatgeOgReserva(), CACHE_RESERVA);
};
