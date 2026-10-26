import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { componCollage, componNomesLogo } from './collage.js';
import { urlCartell } from './propostes/imatge-og.js';
import { fetchImage, llegirStorage, urlStorage } from './resize.js';
import { urlSessioCodificada } from './sessio-camps.js';

const LOGO = '/images/entitats/cineclub-roda-de-bera.png';
// Com els cartells de la tanda (imatge-og.js): una imatge per a xarxes no val 10 s ni 40 MB.
const CARTELL = { timeoutMs: 4000, maxBytes: 5 * 1024 * 1024 };
const MAX_ENTRADES = 20;

// Versió de l'og:image: canvia amb el cartell, perquè les xarxes (que guarden la imatge per URL) i el
// CDN no continuïn mostrant l'antic.
export const versioOg = (cartell) => createHash('sha1').update(String(cartell)).digest('hex').slice(0, 10);

// Camí (percent-encoded) de l'og:image d'una sessió amb cartell, amb `?v=<versió>`.
export const camiOgSessio = (sessio) => `${urlSessioCodificada(sessio)}og.jpg?v=${versioOg(sessio.publica.cartell)}`;

// El logo viatja amb la funció (`web/public`) i es llegeix del directori de treball (`web/`).
const llegeixLogo = () => readFile(join(process.cwd(), 'public', LOGO));

// El cartell: del nostre Storage amb l'Admin SDK (o l'endpoint públic si falla); d'un altre host permès
// (TMDB), descarregat. Qualsevol altra adreça no es baixa.
async function baixaCartell(cartell) {
  const storage = urlStorage(cartell);
  if (storage) return llegirStorage(storage, undefined, CARTELL).catch(() => fetchImage(storage, fetch, CARTELL));
  const altre = urlCartell(cartell);
  return altre ? fetchImage(altre, fetch, CARTELL) : null;
}

// JPEG en memòria per sessió i versió del document (`id|modificadaEl|cartell`), amb poques entrades: el
// CDN en guarda la resta. Les peticions simultànies d'una mateixa clau comparteixen la generació en curs.
// Els resultats nuls i els errors no es guarden.
const generades = new Map();

export function imatgeOgSessio(sessio) {
  const cartell = sessio.publica?.cartell;
  if (!cartell) return Promise.resolve(null);
  const clau = `${sessio.id}|${sessio.modificadaEl ?? ''}|${cartell}`;
  if (generades.has(clau)) return generades.get(clau);
  const promesa = (async () => {
    const original = await baixaCartell(cartell);
    return original ? componCollage([original], await llegeixLogo()) : null;
  })();
  generades.set(clau, promesa);
  while (generades.size > MAX_ENTRADES) generades.delete(generades.keys().next().value);
  promesa.then((jpeg) => { if (!jpeg) generades.delete(clau); }, () => generades.delete(clau));
  return promesa;
}

// Reserva: 1200 × 630 JPEG només amb el logo (mateixes mides que declara la pàgina). Es genera un sol cop.
let reserva;
export function imatgeOgReserva() {
  reserva ??= llegeixLogo().then(componNomesLogo);
  reserva.catch(() => { reserva = undefined; });
  return reserva;
}

export const buidaMemoriaOg = () => { generades.clear(); reserva = undefined; };
