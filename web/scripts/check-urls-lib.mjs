// Funcions pures de `check-urls.mjs`: extractors d'HTML, lector del sitemap i comparadors.
// Funcionen igual amb l'HTML minificat de Hugo (atributs sense cometes) que amb el d'Astro.

const ENTITATS = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mldr: '…' };
export const decodificaEntitats = (text) => text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (tot, nom) => {
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

export const etiquetes = (html, nom) => [...html.matchAll(ETIQUETA(nom))].map(([, attrs]) => atributs(attrs));
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

// Camins tal com s'escriuen als <loc> (percent-encoded, sense decodificar ni normalitzar): serveixen per
// comparar la codificació exacta que veuen els cercadors.
// No es passa per `new URL` perquè aquest ja codifica els accents i amagaria la diferència.
export const llegeixSitemapBrut = (xml) =>
  [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map(([, loc]) => decodificaEntitats(loc).replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i, '').replace(/[?#].*$/, ''));

// Camins que són a tots dos sitemaps (iguals un cop decodificats i en NFC) però escrits diferent
// (majúscules del percent-encoding, accents sense codificar, NFD...). Els camins que falten en un dels
// dos ja surten com a diferència `sitemap`.
export function comparaSitemapBrut(xmlHugo, xmlNova) {
  const perCami = (xml) => new Map(llegeixSitemapBrut(xml).map((brut) => [cami(brut), brut]));
  const hugo = perCami(xmlHugo);
  const nova = perCami(xmlNova);
  const diferencies = [];
  for (const [clau, brutHugo] of hugo) {
    if (nova.has(clau) && nova.get(clau) !== brutHugo) diferencies.push({ path: brutHugo, camp: 'sitemap-codificacio', hugo: brutHugo, nova: nova.get(clau) });
  }
  return diferencies;
}

// Valor que es mostra com a «nova» d'una resposta: l'estat HTTP o, si la connexió ha fallat, l'error.
export const estatDe = (res) => (res.error ? `error de connexió: ${res.error}` : res.status);

// `fetch` que no llança: un error de xarxa (servidor aturat, temps esgotat) torna una resposta falsa
// d'estat 0 amb `error`, perquè el comprovador ho informi com a diferència en comptes de caure.
export async function demanaSegur(fetchFn, url, opcions) {
  try {
    return await fetchFn(url, opcions);
  } catch (err) {
    const motiu = err?.cause?.code ?? err?.cause?.message ?? err?.message ?? String(err);
    return { status: 0, error: String(motiu), headers: new Headers(), text: async () => '' };
  }
}

// Mapa camí -> `lastmod` (o null si la URL no en té) de cada <url> d'un sitemap.
export function llegeixSitemapLastmod(xml) {
  const mapa = new Map();
  for (const [, bloc] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = bloc.match(/<loc>\s*([^<]+?)\s*<\/loc>/)?.[1];
    if (!loc) continue;
    mapa.set(cami(pathDe(decodificaEntitats(loc))), bloc.match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/)?.[1] ?? null);
  }
  return mapa;
}

// Diferències de `lastmod` (mateix instant, encara que s'escrigui amb un altre ofset) per a les URL
// que són als dos sitemaps; una URL que falta en un dels dos ja surt com a diferència de sitemap.
export function comparaLastmod(hugo, nova) {
  const diferencies = [];
  for (const [path, lastmodHugo] of hugo) {
    if (!nova.has(path)) continue;
    const lastmodNova = nova.get(path);
    const igual = lastmodHugo === null || lastmodNova === null
      ? lastmodHugo === lastmodNova
      : Date.parse(lastmodHugo) === Date.parse(lastmodNova);
    if (!igual) diferencies.push({ path, camp: 'lastmod', hugo: lastmodHugo, nova: lastmodNova });
  }
  return diferencies;
}

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

// Cada clau de `hugo` ha de ser a `nova` amb el mateix valor (recursivament dins d'objectes); `nova`
// pot tenir-ne més. Les llistes i els valors simples s'han de repetir iguals.
const esSuperconjunt = (hugo, nova) => {
  if (hugo && typeof hugo === 'object' && !Array.isArray(hugo)) {
    return !!nova && typeof nova === 'object' && !Array.isArray(nova)
      && Object.keys(hugo).every((clau) => Object.hasOwn(nova, clau) && esSuperconjunt(hugo[clau], nova[clau]));
  }
  return estable(hugo) === estable(nova);
};

const TIPUS_ESDEVENIMENT = ['Event', 'ScreeningEvent'];
const esEsdeveniment = (bloc) => TIPUS_ESDEVENIMENT.includes(bloc?.['@type']);

// Els blocs d'esdeveniment de la web nova poden portar camps recomanats que Hugo no té (descripció,
// imatge, endDate...): n'hi ha prou que siguin un superconjunt del de Hugo. La resta de tipus
// (BreadcrumbList, Organization, FAQPage...) han de ser idèntics.
function jsonLdIgual(blocsHugo, blocsNova) {
  return blocsHugo.length === blocsNova.length && blocsHugo.every((bloc, i) => (esEsdeveniment(bloc)
    ? esSuperconjunt(bloc, blocsNova[i])
    : estable(bloc) === estable(blocsNova[i])));
}

// Diferències de títol, canonical (només el camí), descripció i blocs JSON-LD entre dues pàgines.
export function comparaPagines(htmlHugo, htmlNova) {
  const canonicalHugo = extreuCanonical(htmlHugo);
  const canonicalNova = extreuCanonical(htmlNova);
  const jsonLdHugo = sensOrigen(extreuJsonLd(htmlHugo), origenDe(canonicalHugo));
  const jsonLdNova = sensOrigen(extreuJsonLd(htmlNova), origenDe(canonicalNova));
  const parells = [
    ['title', extreuTitol(htmlHugo), extreuTitol(htmlNova)],
    ['canonical', canonicalHugo && cami(pathDe(canonicalHugo)), canonicalNova && cami(pathDe(canonicalNova))],
    ['description', extreuDescripcio(htmlHugo), extreuDescripcio(htmlNova)],
    // Els valors es mostren tal com són; si són «iguals» es retornen idèntics perquè no surtin al resultat.
    ['jsonld', estable(jsonLdHugo), jsonLdIgual(jsonLdHugo, jsonLdNova) ? estable(jsonLdHugo) : estable(jsonLdNova)],
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

// Títol del canal i, per ordre, títol i camí de cada element d'un feed RSS.
export function llegeixFeed(xml) {
  const [capcalera] = xml.split('<item>');
  const text = (fragment, nom) => decodificaEntitats(fragment.match(new RegExp(`<${nom}>([\\s\\S]*?)</${nom}>`))?.[1] ?? '');
  return {
    titol: text(capcalera, 'title'),
    items: [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => ({
      titol: text(item, 'title'),
      cami: cami(pathDe(text(item, 'link'))),
    })),
  };
}

// Diferències de títol del canal i de la llista d'elements (títol i enllaç, en ordre) entre dos feeds.
export function comparaFeeds(xmlHugo, xmlNova) {
  const hugo = llegeixFeed(xmlHugo);
  const nova = llegeixFeed(xmlNova);
  const diferencies = [];
  if (hugo.titol !== nova.titol) diferencies.push({ camp: 'feed-canal', hugo: hugo.titol, nova: nova.titol });
  const resum = (i) => `${i.titol} ${i.cami}`;
  const primer = hugo.items.findIndex((item, i) => !nova.items[i] || resum(item) !== resum(nova.items[i]));
  if (hugo.items.length !== nova.items.length || primer >= 0) {
    const i = primer >= 0 ? primer : Math.min(hugo.items.length, nova.items.length);
    diferencies.push({
      camp: 'feed-elements',
      hugo: `${hugo.items.length} elements; #${i + 1}: ${hugo.items[i] ? resum(hugo.items[i]) : '(cap)'}`,
      nova: `${nova.items.length} elements; #${i + 1}: ${nova.items[i] ? resum(nova.items[i]) : '(cap)'}`,
    });
  }
  return diferencies;
}

// Separa les diferències en conegudes (amb entrada a la llista de permesos, amb el seu motiu) i
// inesperades. Una entrada `{ path, estat, motiu }` permet que la URL doni aquest estat a la web
// nova (i que falti al seu sitemap); una `{ path, camps: [...], motiu }`, les diferències d'aquests camps.
// `obsoletes` són les entrades que ja no justifiquen cap diferència (el motiu s'ha resolt): s'han de treure.
export function aplicaPermet(diferencies, permet) {
  const conegudes = [];
  const inesperades = [];
  const usades = new Set();
  const coincideix = (p, d) => cami(p.path) === cami(d.path) && (
    (p.estat !== undefined && ((d.camp === 'status' && d.nova === p.estat) || d.camp === 'sitemap'))
    || (p.camps ?? []).includes(d.camp)
  );
  for (const d of diferencies) {
    const entrada = permet.find((p) => coincideix(p, d));
    if (entrada) {
      usades.add(entrada);
      conegudes.push({ ...d, motiu: entrada.motiu });
    } else {
      inesperades.push(d);
    }
  }
  return { conegudes, inesperades, obsoletes: permet.filter((p) => !usades.has(p)) };
}
