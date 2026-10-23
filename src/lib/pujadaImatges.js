// Pujada d'imatges de la sessió a Storage i lògica pura de la galeria (pages/Sessions/pestanyes/MitjansSessio.jsx).
import { camiImatge, urlStorage, validarImatge } from './sessioPublica';

const ERROR_PUJADA = "No s'ha pogut pujar la imatge. Torna-ho a provar.";

// Cada fitxer es valida i es puja per separat: un error en un no atura els altres.
// `pujarFitxer(cami, fitxer)` és injectable (el real fa `uploadBytes`).
export async function pujarImatges(fitxers, {
  slug, tipus, bucket, pujarFitxer, instant = Date.now(), onProgres = () => {},
}) {
  let n = 0;
  return Promise.all(fitxers.map(async (fitxer) => {
    const error = validarImatge(fitxer);
    if (error) {
      onProgres(fitxer, 'error');
      return { fitxer, error };
    }
    n += 1;
    const cami = camiImatge(slug, tipus, fitxer, instant, tipus === 'gallery' ? n : undefined);
    onProgres(fitxer, 'pujant');
    try {
      await pujarFitxer(cami, fitxer);
    } catch {
      onProgres(fitxer, 'error');
      return { fitxer, error: ERROR_PUJADA };
    }
    onProgres(fitxer, 'ok');
    return { fitxer, url: urlStorage(bucket, cami) };
  }));
}

// Les URL són l'id de cada ítem per arrossegar: mai n'hi pot haver de repetides.
export function afegirUrls(galeria, noves) {
  const resultat = [...galeria];
  for (const url of noves) if (!resultat.includes(url)) resultat.push(url);
  return resultat;
}

export function reordenar(llista, de, a) {
  const resultat = [...llista];
  const dinsRang = (i) => Number.isInteger(i) && i >= 0 && i < llista.length;
  if (de === a || !dinsRang(de) || !dinsRang(a)) return resultat;
  const [element] = resultat.splice(de, 1);
  resultat.splice(a, 0, element);
  return resultat;
}

// Sense cap mena d'esdeveniment de punter ni tàctil, la galeria mostra els botons ↑ ↓.
export const arrossegamentDisponible = () => 'PointerEvent' in window || 'ontouchstart' in window;
