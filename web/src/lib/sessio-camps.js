import { urlize } from './format.js';

// Camps derivats d'una sessió de Firestore (`{ titol, data, hora, slug, publica: {...} }`) amb
// la mateixa semàntica que les plantilles de Hugo (`.Title`, `.RelPermalink`, ...).

export const anyDe = (sessio) => sessio.data.slice(0, 4);

// `.Title` de Hugo: el `title` del front matter viu a `publica.titol`; si no hi és, el títol de gestió.
export const titolSessio = (sessio) => sessio.publica?.titol || sessio.titol;

export const urlSessio = (sessio) => `/programacio/${anyDe(sessio)}/${sessio.slug}/`;

// `/directors/alauda-ruiz-de-azúa/`, amb els accents codificats com fa Hugo.
export const urlTerme = (taxonomia, nom) => `/${taxonomia}/${encodeURIComponent(urlize(nom))}/`;

// Descripció de `partials/head.html` per a les pàgines de sessió.
export function descripcioSessio(sessio) {
  const p = sessio.publica ?? {};
  if (p.descripcio) return p.descripcio;
  if (p.hook) return p.hook;
  return `${titolSessio(sessio)} (${p.any}), dirigida per ${(p.directors ?? []).join(', ')}. Sessió del Cineclub Roda de Berà a Roda de Berà.`;
}
