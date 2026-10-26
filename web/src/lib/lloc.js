import site from '../data/site.json';
import { SITE_URL } from './env.js';

// Lloc de les projeccions (Teatre del Casino) i identitat del Cineclub als JSON-LD.
export const MAPS_URL = `https://www.google.com/maps/search/?api=1&${new URLSearchParams({ query: `${site.venueName}, ${site.venueAddress}` })}`;

export const idOrganitzacio = (base = SITE_URL) => `${base}/#organitzacio`;

export const llocJsonLd = () => ({
  '@type': 'Place',
  address: { '@type': 'PostalAddress', ...site.venuePostal },
  name: site.venueName,
});
