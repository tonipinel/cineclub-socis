import sharp from 'sharp';
import { STORAGE_PREFIX, RESIZE_WIDTHS } from './images.js';

const MAX_BYTES = 40 * 1024 * 1024;
// Límit de píxels d'entrada (25 MP): una bomba de descompressió petita en bytes no omple la memòria.
const MAX_PIXELS = 25 * 1000 * 1000;
const FORMATS_PERMESOS = ['jpeg', 'png', 'webp', 'gif', 'avif'];
// Només ràster: l'SVG pot portar scripts i sharp no el necessita.
const TIPUS_PERMESOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

// Retorna l'adreça NORMALITZADA (la que farà servir `fetch` i `Location`) si és un fitxer del nostre
// Storage, o null. Es parseja amb `new URL` i es compara l'`href` normalitzat amb el prefix: així
// no hi passen altres hosts disfressats (credencials, port, esquema) ni `..` / `%2e` que escapin
// de `web/`. El parser també treu els salts de línia i tabuladors, que no poden arribar a una capçalera.
export const urlStorage = (valor) => {
  let url;
  try {
    url = new URL(valor);
  } catch {
    return null;
  }
  if (!url.href.startsWith(STORAGE_PREFIX)) return null;
  try {
    // Nom de l'objecte (`web%2Fsessions%2F...`) ja decodificat: cap segment pot ser `.` ni `..`.
    const nom = decodeURIComponent(url.pathname.split('/o/')[1] ?? '');
    if (nom.split('/').some((tros) => tros === '.' || tros === '..')) return null;
  } catch {
    return null;
  }
  // Només es conserva el camí validat i els paràmetres `alt` i `token`: res més arriba a Storage.
  const net = new URL(url.origin + url.pathname);
  for (const nom of ['alt', 'token']) {
    if (url.searchParams.has(nom)) net.searchParams.set(nom, url.searchParams.get(nom));
  }
  return net.href;
};

// Els fitxers són públics: l'adreça canònica només porta `?alt=media`, sense `token` ni res més.
const esCanonica = (valor) => {
  try {
    const url = new URL(valor);
    return url.hash === '' && url.search === '?alt=media';
  } catch {
    return false;
  }
};

// Els paràmetres han de ser exactament `w` i `u` (cap d'extra, cap de repetit) perquè cada imatge
// tingui una sola adreça al CDN i no es pugui omplir de variants.
const nomesWiU = (searchParams) => {
  const claus = [...searchParams.keys()].sort();
  return claus.length === 2 && claus[0] === 'u' && claus[1] === 'w';
};

// L'origen ha de ser un fitxer públic del nostre Storage i l'ample un dels fixos: així
// l'endpoint no serveix de proxy obert ni omple el CDN de variants.
export const resizeRequest = (searchParams) => {
  if (!nomesWiU(searchParams) || !esCanonica(searchParams.get('u'))) return null;
  const url = urlStorage(searchParams.get('u'));
  const brut = searchParams.get('w') ?? '';
  const width = /^\d+$/.test(brut) ? Number(brut) : NaN;
  if (!url || String(width) !== brut || !RESIZE_WIDTHS.includes(width)) return null;
  return { url, width };
};

// Aplica la rotació EXIF i no amplia mai.
// Llança si el format real (no el `content-type`) no és ràster o si passa del límit de píxels.
export const toWebp = async (buffer, width) => {
  // Una sola imatge alhora i un fil: la memòria i la CPU de la funció són limitades.
  sharp.concurrency(1);
  const { format } = await sharp(buffer, { failOn: 'none', limitInputPixels: MAX_PIXELS }).metadata();
  if (!FORMATS_PERMESOS.includes(format)) throw new Error(`format d'imatge no permès: ${format}`);
  return sharp(buffer, { failOn: 'none', limitInputPixels: MAX_PIXELS })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();
};

// Llegeix el cos tallant en passar del límit, perquè un content-length absent o fals no ompli la memòria.
async function llegirAmbLimit(res) {
  if (!res.body) return null;
  const trossos = [];
  let total = 0;
  for await (const tros of res.body) {
    total += tros.length;
    if (total > MAX_BYTES) {
      await res.body.cancel?.().catch(() => {});
      return null;
    }
    trossos.push(tros);
  }
  return Buffer.concat(trossos);
}

export const fetchImage = async (url, fetchFn = fetch) => {
  const res = await fetchFn(url, { signal: AbortSignal.timeout(10000), redirect: 'error' });
  if (!res.ok) return null;
  const tipus = String(res.headers.get('content-type')).split(';')[0].trim().toLowerCase();
  if (!TIPUS_PERMESOS.includes(tipus)) return null;
  const declarat = res.headers.get('content-length');
  if (declarat !== null && !(Number(declarat) <= MAX_BYTES)) return null;
  return llegirAmbLimit(res);
};
