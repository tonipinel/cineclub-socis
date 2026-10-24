import { creaCataleg } from './cataleg.js';

export { ESPERA_REINTENT_MS, TIMEOUT_CATALEG_MS as TIMEOUT_DISTRIBUIDORES_MS } from './cataleg.js';

// La col·lecció `distribuidores` també guarda dades internes (preu, condicions, contacte, correu, web):
// la web només en llegeix el nom, el logo i la URL pública.
const distribuidores = creaCataleg({
  coleccio: 'distribuidores',
  publica: ({ logo, urlPublica }) => ({ logo, url: urlPublica }),
  descripcio: 'de distribuïdores',
});

export const carregaDistribuidores = distribuidores.carrega;
export const distribuidoresCarregades = distribuidores.carregat;
export const fixaDistribuidoresDeProva = distribuidores.fixaDeProva;
// { logo?, url? } o null si el nom no existeix.
export const distribuidoraPerNom = distribuidores.perNom;
// { nom, logo?, url? } o null si l'id del document no existeix.
export const distribuidoraPerId = distribuidores.perId;
