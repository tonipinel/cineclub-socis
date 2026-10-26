import sharp from 'sharp';
import { FORMATS_PERMESOS, MAX_PIXELS } from './resize.js';

export const CANVAS = { width: 1200, height: 630 };

const MARGE = 20;
const SEPARACIO = 8;
const ARRODONIMENT = 8;
const LOGO_AMPLE = 276;
const SEPARACIO_LOGO = 40;
const RATIO_LOGO = 1220 / 784;
const MAX_BYTES = 300 * 1024;
const QUALITATS = [82, 74, 66, 58];

// Files i columnes que fan els cartells (2:3) més grans dins de l'àrea. Amb empat, menys files.
function millorGraella(n, ample, alt) {
  let millor = null;
  for (let files = 1; files <= n; files += 1) {
    const cols = Math.ceil(n / files);
    const h = Math.min((alt - (files - 1) * SEPARACIO) / files, ((ample - (cols - 1) * SEPARACIO) / cols) * 1.5);
    if (!millor || h > millor.h) millor = { cols, files: Math.ceil(n / cols), h: Math.floor(h) };
  }
  return millor;
}

// Logo a l'esquerra i graella de cartells (2:3) a la dreta; el conjunt queda centrat al llenç.
export function calcularLayoutCollage(n) {
  const logoH = Math.round(LOGO_AMPLE / RATIO_LOGO);
  const logoY = Math.round((CANVAS.height - logoH) / 2);
  if (n === 0) {
    const w = 600;
    const h = Math.round(w / RATIO_LOGO);
    return { cells: [], logo: { x: (CANVAS.width - w) / 2, y: Math.round((CANVAS.height - h) / 2), w, h } };
  }
  const ample = CANVAS.width - 2 * MARGE - LOGO_AMPLE - SEPARACIO_LOGO;
  const { cols, files, h } = millorGraella(n, ample, CANVAS.height - 2 * MARGE);
  const w = Math.floor((h * 2) / 3);
  const ampleGraella = cols * w + (cols - 1) * SEPARACIO;
  const alcadaGraella = files * h + (files - 1) * SEPARACIO;
  const x0 = Math.floor((CANVAS.width - (LOGO_AMPLE + SEPARACIO_LOGO + ampleGraella)) / 2);
  const xGraella = x0 + LOGO_AMPLE + SEPARACIO_LOGO;
  const cells = [];
  for (let i = 0; i < n; i += 1) {
    const fila = Math.floor(i / cols);
    const enFila = Math.min(cols, n - fila * cols);
    const ampleFila = enFila * w + (enFila - 1) * SEPARACIO;
    cells.push({
      x: xGraella + Math.floor((ampleGraella - ampleFila) / 2) + (i - fila * cols) * (w + SEPARACIO),
      y: Math.floor((CANVAS.height - alcadaGraella) / 2) + fila * (h + SEPARACIO),
      w,
      h,
    });
  }
  return { cells, logo: { x: x0, y: logoY, w: LOGO_AMPLE, h: logoH } };
}

const opcionsEntrada = { failOn: 'none', limitInputPixels: MAX_PIXELS };

// Només ràster (el `content-type` ja s'ha comprovat, però el format real és el que compta).
async function esRaster(buffer) {
  try {
    const { format } = await sharp(buffer, opcionsEntrada).metadata();
    return FORMATS_PERMESOS.includes(format);
  } catch {
    return false;
  }
}

// Cartell a la mida de la cel·la i amb les cantonades arrodonides.
function peca(buffer, { w, h }) {
  const mascara = Buffer.from(`<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${ARRODONIMENT}" ry="${ARRODONIMENT}"/></svg>`);
  return sharp(buffer, opcionsEntrada)
    .rotate()
    .resize(w, h, { fit: 'cover' })
    .composite([{ input: mascara, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

// JPEG opac de 1200 × 630 (fons negre) amb els cartells en graella i el logo a l'esquerra, sense text.
// Els buffers que no són una imatge ràster es salten; retorna null si no en queda cap.
export async function componCollage(cartells, logo) {
  const valids = (await Promise.all(cartells.map(async (buffer) => ((await esRaster(buffer)) ? buffer : null)))).filter(Boolean);
  if (valids.length === 0) return null;
  return compon(valids, logo);
}

// El mateix llenç només amb el logo centrat: la imatge de reserva quan no hi ha cap cartell.
export const componNomesLogo = (logo) => compon([], logo);

async function compon(valids, logo) {
  const { cells, logo: lloc } = calcularLayoutCollage(valids.length);
  const peces = await Promise.all(valids.map((buffer, i) => peca(buffer, cells[i])));
  const capes = [
    ...peces.map((input, i) => ({ input, left: cells[i].x, top: cells[i].y })),
    { input: await sharp(logo).resize({ width: lloc.w }).png().toBuffer(), left: lloc.x, top: lloc.y },
  ];
  let jpeg;
  for (const quality of QUALITATS) {
    jpeg = await sharp({ create: { width: CANVAS.width, height: CANVAS.height, channels: 3, background: '#000' } })
      .composite(capes)
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    if (jpeg.length <= MAX_BYTES) break;
  }
  return jpeg;
}
