export const INICI = '/';
export const MARCA_URL = 'https://cineclubrodadebera.cat';
export const PROPOSTES = '/propostes';
export const PROPOSTES_PROPOSAR = '/propostes/proposar';
export const PROPOSTES_PENDENTS = '/propostes/pendents';
export const PROPOSTES_NOVA = '/propostes/pendents/nova';
export const PROPOSTES_EDITAR = '/propostes/pendents/:id';
export const ACCEDIR = '/accedir';
export const DASHBOARD = '/dashboard';
export const SOCIS = '/socis';
export const SOCIS_NOU = '/socis/nou';
export const SOCIS_EDITAR = '/socis/:id';
export const SOCIS_CARNET = '/socis/:id/carnet';
export const SOCIS_CARNETS = '/socis/carnets';
export const SOCIS_PAGAMENT = '/socis/:id/pagament';
export const SOLICITUDS = '/solicituds';
export const SESSIONS = '/sessions';
export const SESSIONS_NOVA = '/sessions/nova';
export const SESSIONS_EDITAR = '/sessions/:id';
export const TICKETS = '/tickets';
export const TICKETS_LOT = '/tickets/:id';
export const ESCANEIG = '/escaneig';
export const ESCANEIG_LOG = '/escaneig/log';
export const COMPTABILITAT = '/comptabilitat';
export const COMPTABILITAT_NOU = '/comptabilitat/nou';
export const COMPTABILITAT_EDITAR = '/comptabilitat/:id';
export const CONFIGURACIO = '/configuracio';
export const DISTRIBUIDORES = '/distribuidores';
export const DISTRIBUIDORES_NOVA = '/distribuidores/nova';
export const DISTRIBUIDORES_EDITAR = '/distribuidores/:id';
export const TANDES = '/tandes';
export const TANDES_NOVA = '/tandes/nova';
export const TANDES_EDITAR = '/tandes/:id';
export const TANDES_RESULTATS = '/tandes/:id/resultats';

// Al tall (quan cineclubrodadebera.cat serveixi la web nova) es posa a true i
// es desplega l'administració: / i /propostes passen a la web pública.
// NO desplegar-ho a true abans del canvi de DNS: aquesta URL encara serveix Hugo.
export const REDIRIGIR_PROPOSTES = false;
export const URL_PROPOSTES_PUBLIQUES = 'https://cineclubrodadebera.cat/propostes/';
export const URL_PROPOSTES_PROPOSAR_PUBLIQUES = 'https://cineclubrodadebera.cat/propostes/proposar/';
