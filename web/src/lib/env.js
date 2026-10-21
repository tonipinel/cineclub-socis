export const SITE_URL = (import.meta.env.PUBLIC_SITE_URL || 'https://cineclub-web.web.app').replace(/\/$/, '');
// La web nova no s'indexa fins al tall: només es publica amb PUBLIC_INDEXABLE=true.
export const INDEXABLE = import.meta.env.PUBLIC_INDEXABLE === 'true';
// Mentre no hi ha cartell actiu, les pàgines de cartell no s'exposen.
export const CARTELL_ACTIU = import.meta.env.PUBLIC_CARTELL_ACTIU === 'true';
