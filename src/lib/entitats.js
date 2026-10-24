// Lògica pura del catàleg d'entitats (organitzadors i col·laboradors: nom, logo, URL).
import { generarSlug, EXTENSIONS_IMATGE } from './sessioPublica';

const normalitzar = (nom) => String(nom ?? '').trim().toLowerCase();

const urlValida = (url) => {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
};

export function validarEntitat({ nom, url }, altres, idPropi) {
  const errors = {};
  const net = normalitzar(nom);
  if (!net) errors.nom = 'El nom no pot estar en blanc.';
  else if (net.includes(',')) errors.nom = 'El nom no pot contenir comes.';
  else if (altres.some((a) => a.id !== idPropi && normalitzar(a.nom) === net)) {
    errors.nom = 'Ja hi ha una entitat amb aquest nom.';
  }
  const u = String(url ?? '').trim();
  if (u && !urlValida(u)) errors.url = "L'adreça ha de començar per http:// o https://.";
  return { valid: Object.keys(errors).length === 0, errors };
}

export const camiLogoEntitat = (nom, fitxer, instant) =>
  `web/entitats/${generarSlug(nom)}-${instant}.${EXTENSIONS_IMATGE[fitxer.type]}`;

export const llistaDeText = (text) => String(text ?? '').split(',').map((v) => v.trim()).filter(Boolean);

export const textDeLlista = (noms) => noms.join(', ');

// La web tracta «cineclub» (valor antic de Hugo) com «Cineclub Roda de Berà».
const ALIES = { cineclub: 'Cineclub Roda de Berà' };

// Nom del catàleg que correspon a `nom` (ell mateix o el seu àlies), o null si no n'hi ha cap.
export function nomAlCataleg(nom, noms) {
  if (noms.includes(nom)) return nom;
  const alies = ALIES[String(nom ?? '').trim().toLowerCase()];
  return alies && noms.includes(alies) ? alies : null;
}

// Un camp de llista pot ser un array o un escalar (la web el normalitza a llista d'un element).
const comLlista = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : []);

export function sessionsQueUsen(nom, sessions) {
  return sessions
    .filter(({ publica: p }) => [p?.organitza, ...comLlista(p?.participa), ...comLlista(p?.collabora)].includes(nom))
    .map(({ id, titol }) => ({ id, titol }));
}
