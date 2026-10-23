import distribuidors from '../data/distribuidors.json';
import { getDb, llegir } from './db.js';
import { creaMemo } from './memo.js';

const cerca = (taula, nom) => (Object.hasOwn(taula, nom) ? taula[nom] : null);

const memo = creaMemo();

// Catàleg en memòria `{ [nom]: { logo?, url? } }`. El middleware el carrega (carregaEntitats) abans de
// renderitzar cada pàgina HTML, de manera que els components el poden consultar de forma síncrona.
let entitats = {};

// Un logo o una URL buits es tracten com a absents.
const net = ({ logo, url } = {}) => ({ ...(logo ? { logo } : {}), ...(url ? { url } : {}) });

const catalegDe = (llista) => Object.fromEntries(llista.filter(({ nom }) => typeof nom === 'string' && nom.trim()).map((e) => [e.nom, net(e)]));

export const TIMEOUT_ENTITATS_MS = 3000;
export const ESPERA_REINTENT_MS = 30 * 1000;

let carregades = false;
let reintentaDes = 0;
let ara = Date.now;

// Cert si el catàleg s'ha llegit bé amb almenys una entitat vàlida en aquesta instància.
export const entitatsCarregades = () => carregades;

// Llegeix `entitats` (memoritzat ~60 s, vegeu memo.js) i substitueix el catàleg. Si la lectura falla,
// es manté l'últim catàleg carregat (buit a la primera càrrega), no llança mai i durant
// ESPERA_REINTENT_MS no es torna a llegir: les pàgines no esperen cada vegada un Firestore lent.
export async function carregaEntitats(db) {
  if (ara() < reintentaDes) return;
  try {
    const base = db ?? getDb();
    entitats = await memo.obte(base, 'entitats', async () => {
      const snap = await llegir(base.collection('entitats').get(), TIMEOUT_ENTITATS_MS);
      return catalegDe(snap.docs.map((doc) => doc.data()));
    });
    // Un catàleg buit no compta com a carregat (pàgines sense logos amb caché llarga); un de ple previ es manté.
    if (Object.keys(entitats).length) carregades = true;
  } catch (err) {
    // Les crides simultànies comparteixen la lectura fallida: només es registra una vegada.
    if (ara() >= reintentaDes) {
      console.error('error en llegir el catàleg d\'entitats', err);
      reintentaDes = ara() + ESPERA_REINTENT_MS;
    }
  }
}

// Només per a les proves: substitueix el catàleg sense llegir Firestore i reinicia l'estat
// (mai carregat, sense espera de reintent, rellotge `ara`).
export const fixaEntitatsDeProva = (cataleg, { ara: rellotge = Date.now } = {}) => {
  entitats = catalegDe(Object.entries(cataleg).map(([nom, e]) => ({ ...e, nom })));
  carregades = false;
  reintentaDes = 0;
  ara = rellotge;
};

// { logo?, url? } o null si el nom no existeix.
export const entitatPerNom = (nom) => cerca(entitats, nom);
export const distribuidoraPerNom = (nom) => cerca(distribuidors, nom);
