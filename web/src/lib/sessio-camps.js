import { dataCaCurtaHtml, dataIso, retalla, urlize } from './format.js';
import { resizedUrl } from './images.js';

// Camps derivats d'una sessió de Firestore (`{ titol, data, hora, slug, publica: {...} }`) amb
// la mateixa semàntica que les plantilles de Hugo (`.Title`, `.RelPermalink`, ...).

export const anyDe = (sessio) => sessio.data.slice(0, 4);

// `.Title` de Hugo: el `title` del front matter viu a `publica.titol`; si no hi és, el títol de gestió.
export const titolSessio = (sessio) => sessio.publica?.titol || sessio.titol;

export const urlSessio = (sessio) => `/programacio/${anyDe(sessio)}/${sessio.slug}/`;

// Camí amb el slug codificat (només ASCII), com el de Hugo al sitemap i el dels 301 dels aliases.
export const urlSessioCodificada = (sessio) => urlSessio(sessio).split('/').map(encodeURIComponent).join('/');

// `/directors/alauda-ruiz-de-azúa/`, amb els accents codificats com fa Hugo.
export const urlTerme = (taxonomia, nom) => `/${taxonomia}/${encodeURIComponent(urlize(nom))}/`;

const llista = (valor) => (Array.isArray(valor) ? valor : []);

// Descripció de `partials/head.html` per a les pàgines de sessió. Sense any o sense directors,
// la frase els omet.
export function descripcioSessio(sessio) {
  const p = sessio.publica ?? {};
  if (p.descripcio) return p.descripcio;
  if (p.hook) return p.hook;
  const any = p.any ? ` (${p.any})` : '';
  const directors = llista(p.directors).length ? `, dirigida per ${p.directors.join(', ')}` : '';
  return `${titolSessio(sessio)}${any}${directors}. Sessió del Cineclub Roda de Berà a Roda de Berà.`;
}

// Descripció d'una pàgina de terme: `text` (qui o què és el terme), el nombre de sessions i els
// títols de la més nova a la més antiga, retallat a 160 caràcters.
export function descripcioTerme(text, sessions) {
  const n = sessions.length;
  const titols = [...sessions].reverse().map((s) => `${titolSessio(s)}${s.publica?.any ? ` (${s.publica.any})` : ''}`);
  return retalla(`${text} (${n} ${n === 1 ? 'sessió' : 'sessions'}): ${titols.join(', ')}.`, 160);
}

// Tot el que pinta una targeta de sessió (partials/session-card.html, cartell a 600 d'ample).
export function targetaSessio(sessio) {
  const { seccio, cartell, titolOriginal, titolTraduit, organitza } = sessio.publica ?? {};
  const participa = llista(sessio.publica?.participa);
  const collabora = llista(sessio.publica?.collabora);
  const titol = titolSessio(sessio);
  const entitats = [organitza, ...participa, ...collabora].filter(Boolean);
  const noms = entitats.length > 1 ? `${entitats.slice(0, -1).join(', ')} i ${entitats.at(-1)}` : entitats[0];
  const colabora = participa.length > 0 || collabora.length > 0;
  return {
    seccio,
    clau: seccio || 'cartellera',
    url: urlSessio(sessio),
    imatge: cartell ? resizedUrl(cartell, 600) : '',
    alt: titolOriginal || titol,
    dataHtml: dataCaCurtaHtml(sessio.data, sessio.hora),
    dataIso: dataIso(sessio.data, sessio.hora || '00:00'),
    titol,
    titolTraduit,
    insignia: colabora ? `${noms}.` : organitza && organitza !== 'cineclub' ? `Amb ${organitza}` : '',
  };
}

// Les sessions que es poden pintar com a targeta. Amb les dades ja normalitzades no n'hauria de
// fallar cap; si una falla, s'omet del llistat (i es registra) en lloc de tallar la pàgina a mitges.
export function sessionsLlistables(sessions) {
  return sessions.filter((sessio) => {
    try {
      targetaSessio(sessio);
      return true;
    } catch (err) {
      console.error(`sessió ${sessio?.id} omesa dels llistats: ${err?.message}`);
      return false;
    }
  });
}
