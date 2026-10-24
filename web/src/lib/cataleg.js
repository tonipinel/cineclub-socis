import { getDb, llegir } from './db.js';
import { creaMemo } from './memo.js';

export const TIMEOUT_CATALEG_MS = 3000;
export const ESPERA_REINTENT_MS = 30 * 1000;

// Un logo o una URL buits es tracten com a absents; qualsevol altra clau es descarta.
export const net = ({ logo, url } = {}) => ({ ...(logo ? { logo } : {}), ...(url ? { url } : {}) });

// Catàleg en memòria `{ [nom]: { logo?, url? } }` llegit d'una col·lecció de Firestore, indexat també per
// l'id del document (`{ [id]: { nom, logo?, url? } }`). El middleware el carrega abans de renderitzar cada
// pàgina HTML, i els components el consulten de forma síncrona.
// `publica(doc)` tria del document només els camps públics i en retorna `{ logo?, url? }`.
export function creaCataleg({ coleccio, publica, descripcio }) {
  const memo = creaMemo();
  let cataleg = { perNom: {}, perId: {} };
  let carregat = false;
  let reintentaDes = 0;
  let ara = Date.now;

  // `llista`: [{ id?, nom, dades }]. Els documents sense un nom de text no buit s'ignoren en tots dos índexs.
  const catalegDe = (llista) => {
    const valids = llista.filter(({ nom }) => typeof nom === 'string' && nom.trim());
    return {
      perNom: Object.fromEntries(valids.map(({ nom, dades }) => [nom, net(dades)])),
      perId: Object.fromEntries(valids.filter(({ id }) => id).map(({ id, nom, dades }) => [id, { nom, ...net(dades) }])),
    };
  };

  // Llegeix la col·lecció (memoritzat ~60 s, vegeu memo.js) i substitueix el catàleg. Si la lectura
  // falla, es manté l'últim catàleg carregat (buit a la primera càrrega), no llança mai i durant
  // ESPERA_REINTENT_MS no es torna a llegir: les pàgines no esperen cada vegada un Firestore lent.
  async function carrega(db) {
    if (ara() < reintentaDes) return;
    try {
      const base = db ?? getDb();
      cataleg = await memo.obte(base, coleccio, async () => {
        const snap = await llegir(base.collection(coleccio).get(), TIMEOUT_CATALEG_MS);
        return catalegDe(snap.docs.map((doc) => {
          const dades = doc.data();
          return { id: doc.id, nom: dades.nom, dades: publica(dades) };
        }));
      });
      // Un catàleg buit no compta com a carregat (pàgines sense logos amb caché llarga); un de ple previ es manté.
      if (Object.keys(cataleg.perNom).length) carregat = true;
    } catch (err) {
      // Les crides simultànies comparteixen la lectura fallida: només es registra una vegada.
      if (ara() >= reintentaDes) {
        console.error(`error en llegir el catàleg ${descripcio}`, err);
        reintentaDes = ara() + ESPERA_REINTENT_MS;
      }
    }
  }

  return {
    carrega,
    // Cert si el catàleg s'ha llegit bé amb almenys un element vàlid en aquesta instància.
    carregat: () => carregat,
    // { logo?, url? } o null si el nom no existeix.
    perNom: (nom) => (Object.hasOwn(cataleg.perNom, nom) ? cataleg.perNom[nom] : null),
    // { nom, logo?, url? } o null si l'id del document no existeix.
    perId: (id) => (Object.hasOwn(cataleg.perId, id) ? cataleg.perId[id] : null),
    // Només per a les proves: substitueix el catàleg (forma pública `{ [nom]: { id?, logo?, url? } }`; les
    // entrades amb `id` s'indexen també per id) sense llegir Firestore i reinicia l'estat (mai carregat,
    // sense espera de reintent, rellotge `ara`).
    fixaDeProva: (valors, { ara: rellotge = Date.now } = {}) => {
      cataleg = catalegDe(Object.entries(valors).map(([nom, { id, ...dades }]) => ({ id, nom, dades })));
      carregat = false;
      reintentaDes = 0;
      ara = rellotge;
    },
  };
}
