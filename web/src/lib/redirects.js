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
