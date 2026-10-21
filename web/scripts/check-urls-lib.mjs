// Funcions pures de `check-urls.mjs`: extractors d'HTML, lector del sitemap i comparadors.
// Funcionen igual amb l'HTML minificat de Hugo (atributs sense cometes) que amb el d'Astro.

const ENTITATS = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mldr: '…' };
const decodificaEntitats = (text) => text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (tot, nom) => {
  if (nom[0] === '#') {
    const codi = nom[1].toLowerCase() === 'x' ? parseInt(nom.slice(2), 16) : parseInt(nom.slice(1), 10);
    return String.fromCodePoint(codi);
  }
  return ENTITATS[nom.toLowerCase()] ?? tot;
});

const ATRIBUT = /([^\s=/>]+)(?:=("[^"]*"|'[^']*'|[^\s>]+))?/g;
const ETIQUETA = (nom) => new RegExp(`<${nom}((?:\\s+[^\\s=>]+(?:=(?:"[^"]*"|'[^']*'|[^\\s>]+))?)*)\\s*/?>`, 'gi');

const atributs = (text) => Object.fromEntries([...text.matchAll(ATRIBUT)].map(([, clau, valor]) => [
  clau.toLowerCase(),
  valor === undefined ? '' : decodificaEntitats(valor.replace(/^["']|["']$/g, '')),
]));

const etiquetes = (html, nom) => [...html.matchAll(ETIQUETA(nom))].map(([, attrs]) => atributs(attrs));
const espais = (text) => text.replace(/\s+/g, ' ').trim();

export const extreuTitol = (html) => {
  const m = html.match(/<title>([\s\S]*?)<\/title>/i);
  return m ? espais(decodificaEntitats(m[1])) : null;
};

export const extreuCanonical = (html) =>
  etiquetes(html, 'link').find((a) => a.rel?.toLowerCase() === 'canonical')?.href ?? null;

export const extreuDescripcio = (html) => {
  const meta = etiquetes(html, 'meta').find((a) => a.name?.toLowerCase() === 'description');
  return meta && meta.content !== undefined ? espais(meta.content) : null;
};

export function extreuJsonLd(html) {
  const blocs = [];
  for (const [, attrs, cos] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/application\/ld\+json/i.test(attrs)) continue;
    try {
      blocs.push(JSON.parse(cos));
    } catch {
      blocs.push({ __errorJson: cos });
    }
  }
  return blocs;
}

// Camí (percent-encoded tal com ve) d'una URL absoluta o relativa.
export const pathDe = (url) => new URL(url, 'http://exemple.invalid').pathname;

// Forma comparable d'un camí: decodificat i en NFC.
export const cami = (ruta) => {
  let decodificat = ruta;
  try {
    decodificat = decodeURIComponent(ruta);
  } catch {
    // percent-encoding malformada: es compara tal qual
  }
  return decodificat.normalize('NFC');
};

export const llegeixSitemap = (xml) =>
  [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map(([, loc]) => pathDe(decodificaEntitats(loc)));

const origenDe = (url) => {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
};

// Substitueix l'origen propi de cada web per `{BASE}`, perquè Hugo (cineclubrodadebera.cat) i la web
// nova (SITE_URL provisional) es puguin comparar abans del tall.
const sensOrigen = (valor, origen) => {
  if (typeof valor === 'string') return origen ? valor.split(origen).join('{BASE}') : valor;
  if (Array.isArray(valor)) return valor.map((v) => sensOrigen(v, origen));
  if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, sensOrigen(v, origen)]));
  return valor;
};

const estable = (valor) => {
  if (Array.isArray(valor)) return `[${valor.map(estable).join(',')}]`;
  if (valor && typeof valor === 'object') {
    return `{${Object.keys(valor).sort().map((k) => `${JSON.stringify(k)}:${estable(valor[k])}`).join(',')}}`;
  }
  return JSON.stringify(valor);
};

// Diferències de títol, canonical (només el camí), descripció i blocs JSON-LD entre dues pàgines.
export function comparaPagines(htmlHugo, htmlNova) {
  const canonicalHugo = extreuCanonical(htmlHugo);
  const canonicalNova = extreuCanonical(htmlNova);
  const parells = [
    ['title', extreuTitol(htmlHugo), extreuTitol(htmlNova)],
    ['canonical', canonicalHugo && cami(pathDe(canonicalHugo)), canonicalNova && cami(pathDe(canonicalNova))],
    ['description', extreuDescripcio(htmlHugo), extreuDescripcio(htmlNova)],
    ['jsonld',
      estable(sensOrigen(extreuJsonLd(htmlHugo), origenDe(canonicalHugo))),
      estable(sensOrigen(extreuJsonLd(htmlNova), origenDe(canonicalNova)))],
  ];
  return parells.filter(([, a, b]) => a !== b).map(([camp, hugo, nova]) => ({ camp, hugo, nova }));
}

// `fitxers`: { 'ruta/relativa/index.html': contingut } del build de Hugo. Els `aliases` de Hugo són
// pàgines amb un `meta refresh` cap a la URL nova.
export function llegeixAliases(fitxers) {
  const aliases = [];
  for (const [ruta, contingut] of Object.entries(fitxers)) {
    if (!/http-equiv=["']?refresh/i.test(contingut)) continue;
    const desti = contingut.match(/url=([^"'>\s]+)/i)?.[1];
    if (!desti) continue;
    const alias = `/${ruta.replace(/index\.html$/, '')}`.normalize('NFC');
    aliases.push({ alias, desti: pathDe(desti).normalize('NFC') });
  }
  return aliases;
}

// Separa les diferències en conegudes (amb entrada a la llista de permesos, amb el seu motiu) i
// inesperades. Una entrada `{ path, estat, motiu }` permet que la URL doni aquest estat a la web
// nova (i que falti al seu sitemap); una `{ path, camps: [...], motiu }`, les diferències d'aquests camps.
export function aplicaPermet(diferencies, permet) {
  const conegudes = [];
  const inesperades = [];
  for (const d of diferencies) {
    const entrada = permet.find((p) => cami(p.path) === cami(d.path) && (
      (p.estat !== undefined && ((d.camp === 'status' && d.nova === p.estat) || d.camp === 'sitemap'))
      || (p.camps ?? []).includes(d.camp)
    ));
    if (entrada) conegudes.push({ ...d, motiu: entrada.motiu });
    else inesperades.push(d);
  }
  return { conegudes, inesperades };
}
