export const SITE_URL = (import.meta.env.PUBLIC_SITE_URL || 'https://cineclub-web.web.app').replace(/\/$/, '');
// La web nova no s'indexa fins al tall: només es publica amb PUBLIC_INDEXABLE=true.
export const INDEXABLE = import.meta.env.PUBLIC_INDEXABLE === 'true';
// El banner del cartell de les sessions és actiu per defecte, com a Hugo; es desactiva amb PUBLIC_CARTELL_ACTIU=false.
export const CARTELL_ACTIU = import.meta.env.PUBLIC_CARTELL_ACTIU !== 'false';
