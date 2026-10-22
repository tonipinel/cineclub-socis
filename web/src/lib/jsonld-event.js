import site from '../data/site.json';
import { entitatPerNom } from './entitats.js';
import { dataIso, dataIsoMesMinuts } from './format.js';
import { renderMarkdown } from './markdown.js';
import { titolSessio, urlSessio } from './sessio-camps.js';

// Traducció de partials/jsonld-screening-event.html (les claus de Hugo, amb els mateixos valors) més
// els camps que Google recomana per als resultats enriquits d'esdeveniments. Les claus van en ordre
// alfabètic, com les emet el `jsonify` de Hugo.

const MAX_DESCRIPCIO = 300;

const ENTITATS = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mldr: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', laquo: '«', raquo: '»' };
const decodifica = (text) => text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (tot, nom) => {
  if (nom[0] === '#') return String.fromCodePoint(nom[1].toLowerCase() === 'x' ? parseInt(nom.slice(2), 16) : parseInt(nom.slice(1), 10));
  return ENTITATS[nom.toLowerCase()] ?? tot;
});
// Només `<br>` i les etiquetes de bloc separen amb un espai; les etiquetes en línia (`<em>`, `<a>`...)
// desapareixen sense deixar-lo, perquè no trenquin paraules ni la puntuació enganxada.
const BLOC = /<\/?(?:br|p|div|li|ul|ol|h[1-6]|blockquote|pre|hr|table|thead|tbody|tr|td|th|section|article)(?:\s[^>]*)?\/?>/gi;
const textPlaDe = (html) => decodifica(html.replace(BLOC, ' ').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

function retalla(text) {
  if (text.length <= MAX_DESCRIPCIO) return text;
  const tros = text.slice(0, MAX_DESCRIPCIO - 1);
  const final = tros.lastIndexOf(' ');
  return `${(final > 0 ? tros.slice(0, final) : tros).replace(/[\s,;:.]+$/, '')}…`;
}

// Text pla de la sessió: `sinopsiCartell` (que pot dur `<br/>`) o, si no hi és, el primer paràgraf
// del cos. Sense cap dels dos, cadena buida.
export function descripcioEvent(sessio) {
  const p = sessio.publica ?? {};
  let text = typeof p.sinopsiCartell === 'string' ? textPlaDe(p.sinopsiCartell) : '';
  if (!text) text = textPlaDe(renderMarkdown(p.cos).match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? '');
  return retalla(text);
}

const IDIOMES = {
  català: 'ca', anglès: 'en', castellà: 'es', espanyol: 'es', francès: 'fr', suec: 'sv', basc: 'eu', gallec: 'gl',
  italià: 'it', alemany: 'de', portuguès: 'pt', japonès: 'ja', coreà: 'ko', rus: 'ru',
};

// Codis BCP 47 d'un camp `idioma` com «Castellà, Francès i Català». Si algun dels noms no es
// reconeix (o el text és una nota com «Pel·lícula muda (...)»), no se'n dedueix res: llista buida.
export function idiomesDe(idioma) {
  if (typeof idioma !== 'string' || !idioma.trim()) return [];
  const codis = idioma.split(/\s*,\s*|\s+i\s+/).map((nom) => IDIOMES[nom.trim().toLowerCase()]);
  return codis.every(Boolean) ? [...new Set(codis)] : [];
}

const ordena = (valor) => {
  if (Array.isArray(valor)) return valor.map(ordena);
  if (valor && typeof valor === 'object') return Object.fromEntries(Object.keys(valor).sort().map((k) => [k, ordena(valor[k])]));
  return valor;
};

const absoluta = (url, base) => new URL(url, `${base}/`).href;

function organitzador(organitza, base) {
  if (!organitza || organitza.toLowerCase() === 'cineclub' || organitza === site.title) {
    return { '@type': 'Organization', name: site.title, url: `${base}/` };
  }
  const url = entitatPerNom(organitza)?.url;
  return { '@type': 'Organization', name: organitza, ...(url ? { url } : {}) };
}

export function eventJsonLd(sessio, base) {
  const p = sessio.publica ?? {};
  const titol = titolSessio(sessio);
  const durada = Number(p.durada);
  const descripcio = descripcioEvent(sessio);
  const imatges = [...new Set([p.cartell, p.galeria?.[0]].filter(Boolean).map((u) => absoluta(u, base)))];
  const idiomes = idiomesDe(p.idioma);
  return ordena({
    '@context': 'https://schema.org',
    '@type': 'ScreeningEvent',
    ...(descripcio ? { description: descripcio } : {}),
    ...(durada > 0 ? { endDate: dataIsoMesMinuts(sessio.data, sessio.hora, durada) } : {}),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    ...(imatges.length ? { image: imatges } : {}),
    ...(idiomes.length ? { inLanguage: idiomes.length === 1 ? idiomes[0] : idiomes } : {}),
    location: { '@type': 'Place', address: site.venueAddress, name: site.venueName },
    name: titol,
    offers: {
      '@type': 'Offer',
      availability: 'https://schema.org/InStock',
      ...(p.preu !== undefined && p.preu !== null && p.preu !== '' ? { price: String(p.preu) } : {}),
      priceCurrency: 'EUR',
      url: new URL(urlSessio(sessio), `${base}/`).href,
    },
    organizer: organitzador(p.organitza, base),
    startDate: dataIso(sessio.data, sessio.hora),
    workPresented: { '@type': 'Movie', name: p.titolOriginal || titol },
  });
}
