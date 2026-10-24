import { creaCataleg } from './cataleg.js';

export { ESPERA_REINTENT_MS, TIMEOUT_CATALEG_MS as TIMEOUT_ENTITATS_MS } from './cataleg.js';

const entitats = creaCataleg({ coleccio: 'entitats', publica: ({ logo, url }) => ({ logo, url }), descripcio: 'd\'entitats' });

export const carregaEntitats = entitats.carrega;
export const entitatsCarregades = entitats.carregat;
export const fixaEntitatsDeProva = entitats.fixaDeProva;
// { logo?, url? } o null si el nom no existeix.
export const entitatPerNom = entitats.perNom;
