// Les fotos de Storage (`web/...` i `carteils/...`) es serveixen per /api/img.webp, que les redimensiona a WebP i
// deixa que el CDN les guardi. Qualsevol altra URL es deixa tal qual.
export const STORAGE_PREFIX = 'https://firebasestorage.googleapis.com/v0/b/cineclub-socis.firebasestorage.app/o/web%2F';
// Cartells de les propostes (`carteils/<fitxer>`, plans): públics i també redimensionables.
export const CARTELLS_PREFIX = 'https://firebasestorage.googleapis.com/v0/b/cineclub-socis.firebasestorage.app/o/carteils%2F';
export const PREFIXOS_STORAGE = [STORAGE_PREFIX, CARTELLS_PREFIX];
export const RESIZE_WIDTHS = [160, 200, 300, 400, 500, 600, 700, 800, 1400];

// Els GIF conserven l'animació, així que no es redimensionen.
const esRedimensionable = (src) => typeof src === 'string' && PREFIXOS_STORAGE.some((p) => src.startsWith(p))
  && !/\.gif$/i.test(src.split('?')[0]);

// L'endpoint només accepta l'adreça canònica (`?alt=media`, sense `token`: els fitxers són públics).
const canonica = (src) => `${src.split(/[?#]/)[0]}?alt=media`;

export const resizedUrl = (src, width) => (
  esRedimensionable(src) && RESIZE_WIDTHS.includes(width)
    ? `/api/img.webp?w=${width}&u=${encodeURIComponent(canonica(src))}`
    : src
);

export const srcsetOf = (src, widths) => (
  esRedimensionable(src) ? widths.map((w) => `${resizedUrl(src, w)} ${w}w`).join(', ') : undefined
);
