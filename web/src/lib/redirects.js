import { urlSessio, urlSessioCodificada } from './sessio-camps.js';

// Ruta comparable: decodificada, en NFC (Hugo en pot tenir en NFD) i amb barra final.
const normalitza = (ruta) => {
  let decodificada = ruta;
  try {
    decodificada = decodeURIComponent(ruta);
  } catch {
    // percent-encoding malformada: es compara tal qual
  }
  const nfc = decodificada.normalize('NFC');
  return nfc.endsWith('/') ? nfc : `${nfc}/`;
};

// Destinació del 301 si `pathname` és un `alias` d'una sessió publicada (els `aliases` del front
// matter de Hugo, guardats a `publica.aliases`); si no, null.
export function redireccioPer(pathname, sessions) {
  const buscat = normalitza(pathname);
  for (const sessio of sessions) {
    if (sessio.publicada === false) continue;
    const desti = urlSessio(sessio);
    if (normalitza(desti) === buscat) continue;
    if ((sessio.publica?.aliases ?? []).some((alias) => normalitza(alias) === buscat)) return urlSessioCodificada(sessio);
  }
  return null;
}

// Imatges de les sessions al build de Hugo: /programacio/<any>/<slug>/<fitxer>.<ext>.
export const IMATGE_ANTIGA = /^\/programacio\/(\d{4})\/([^/]+)\/([^/]+\.(?:jpg|jpeg|png|webp))$/;
// Imatges de les pàgines al build de Hugo: /<fitxer>.<ext> (portada) i /<slug>/<fitxer>.<ext>.
const IMATGE_PAGINA = /^\/(?:([^/]+)\/)?([^/]+\.(?:jpg|jpeg|png|webp))$/;

const decodifica = (text) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

// Els 301 de les imatges només poden anar a Storage.
const HOSTS_STORAGE = ['firebasestorage.googleapis.com', 'storage.googleapis.com'];
const urlStorage = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && HOSTS_STORAGE.includes(u.hostname);
  } catch {
    return false;
  }
};

// Nom de l'original d'una variant redimensionada de Hugo (`gallery-1_hu_<hex>.jpg` -> `gallery-1.jpg`).
const original = (fitxer) => fitxer.replace(/_hu_?[0-9a-f]+(?=\.[^.]+$)/, '');

// Nom del fitxer d'una URL de Storage (`.../o/web%2Fsessions%2F<slug>%2F<fitxer>?alt=media`).
const nomDeStorage = (url) => {
  try {
    return decodifica(new URL(url).pathname.split('/').pop()).split('/').pop();
  } catch {
    return null;
  }
};

// Destinació (URL absoluta de Storage) del 301 d'una imatge antiga de Hugo d'una sessió publicada: el
// fitxer amb el mateix nom (o el de l'original, si és una variant `_hu`) a la galeria o el cartell;
// qualsevol altre `poster*` és el cartell. Si no, null.
export function imatgeAntigaPer(pathname, sessions) {
  const m = pathname.match(IMATGE_ANTIGA);
  if (!m) return null;
  const [, any, slug, fitxer] = m.map(decodifica);
  const sessio = sessions.find((s) => s.publicada !== false && s.slug === slug && s.data?.startsWith(`${any}-`));
  if (!sessio) return null;
  const { cartell, galeria = [] } = sessio.publica ?? {};
  const imatges = [...galeria, cartell].filter(urlStorage);
  const perNom = (nom) => imatges.find((url) => nomDeStorage(url) === nom);
  return perNom(fitxer) ?? perNom(original(fitxer)) ?? (fitxer.startsWith('poster') && urlStorage(cartell) ? cartell : null);
}

// `{ slug, fitxer }` d'una URL antiga d'imatge d'una pàgina (la portada no té segment de slug), o null si
// el slug no és a `slugs` (així un slug inventat no provoca cap lectura).
export function rutaImatgePagina(pathname, slugs) {
  const m = pathname.match(IMATGE_PAGINA);
  if (!m || m[1] === 'portada') return null;
  const slug = m[1] ? decodifica(m[1]) : 'portada';
  return slugs.includes(slug) ? { slug, fitxer: decodifica(m[2]) } : null;
}

// URL de Storage de `fitxer` (o del seu original, si és una variant `_hu`) al mapa `imatges` de la pàgina.
export function imatgePaginaPer(pagina, fitxer) {
  const imatges = pagina?.imatges ?? {};
  const url = [fitxer, original(fitxer)].map((nom) => (Object.hasOwn(imatges, nom) ? imatges[nom] : null)).find(urlStorage);
  return url ?? null;
}
