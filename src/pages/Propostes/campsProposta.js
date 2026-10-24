import { CAMPS_PELLICULA } from '../../lib/fitxaProposta';

// Pestanyes de la fitxa de proposta i a quina pertany cada camp del formulari.
// L'id de l'input de cada camp és el mateix nom del camp (per al focus en un error de validació).

export const PESTANYES = ['resum', 'pellicula', 'gestio', 'mitjans'];

export const ETIQUETA_PESTANYA = {
  resum: 'Resum', pellicula: 'Pel·lícula', gestio: 'Gestió', mitjans: 'Mitjans',
};

export const CAMPS_GESTIO = ['soci', 'estat', 'comentari', 'preu', 'condicions', 'distribuidoraId'];
export const CAMPS_INTERNS = ['preu', 'condicions', 'distribuidoraId'];

export const PESTANYA_DEL_CAMP = {
  ...Object.fromEntries(CAMPS_PELLICULA.map((camp) => [camp, 'pellicula'])),
  trailerUrl: 'mitjans',
  imatgeUrl: 'mitjans',
  ...Object.fromEntries(CAMPS_GESTIO.map((camp) => [camp, 'gestio'])),
};

export const ESTATS = [
  ['pendent', 'Pendent'],
  ['aprovada', 'Aprovada'],
  ['rebutjada', 'Rebutjada'],
  ['programada', 'Programada'],
];

export const CLASSE_ESTAT = {
  pendent: 'badge--pendent', aprovada: 'badge--al-dia', rebutjada: 'badge--vencut', programada: 'badge--nou-registre',
};

export const etiquetaEstat = (estat) => ESTATS.find(([valor]) => valor === estat)?.[1] ?? estat;
