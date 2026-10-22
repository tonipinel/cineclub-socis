import site from '../data/site.json';
import { CACHE_AVUI } from './cache.js';
import { getDb } from './db.js';
import { SITE_URL } from './env.js';
import { dataIso } from './format.js';
import { renderMarkdown } from './markdown.js';
import { SLUGS_CONTINGUT, paginaPerSlug } from './pagines.js';
import { urlSessio, urlTerme, titolSessio } from './sessio-camps.js';
import { sessionsDescendents, sessionsPubliques } from './sessions.js';
import { paramTermeValid, termesDe, trobaTerme } from './taxonomies.js';
import { escapaXml } from './xml.js';

// Feeds RSS 2.0 equivalents als que genera Hugo (`index.xml` de la portada, de /programacio/, de
// cada taxonomia i de cada terme). Un feed és `{ titolCanal, descripcio, cami, items: [{ titol, cami,
// data?, hora?, descripcio? }] }`; `xmlFeed` el serialitza. Les funcions `feed*` tornen null quan
// el terme o la taxonomia no existeixen (404) i només hi consideren les sessions publicades.

const TAXONOMIES = ['directors', 'generes', 'interprets'];
const DIES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MESOS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// `pubDate` de Hugo (RFC 822 amb ofset numèric): «Thu, 22 Oct 2026 19:00:00 +0200».
export function rfc822(data, hora) {
  const [any, mes, dia] = data.slice(0, 10).split('-').map(Number);
  const [, hh, mm, ss, signe, oh, om] = dataIso(data, hora).match(/T(\d{2}):(\d{2}):(\d{2})([+-])(\d{2}):(\d{2})$/);
  const diaSetmana = DIES[new Date(Date.UTC(any, mes - 1, dia)).getUTCDay()];
  return `${diaSetmana}, ${String(dia).padStart(2, '0')} ${MESOS[mes - 1]} ${any} ${hh}:${mm}:${ss} ${signe}${oh}${om}`;
}

// `.Summary` de Hugo sense divisor: es recorren les etiquetes i els textos comptant les «paraules»
// (separades per espais) de CADA fragment, atributs de les etiquetes inclosos, i el resum acaba al
// primer `</p>` un cop arribat a 70. Així, un encapçalament amb la icona SVG ja n'aporta més de 70 i
// el resum d'una sessió és l'encapçalament «Sinopsi» amb el seu primer paràgraf (contrastat amb els
// 14 feeds de Hugo). Hugo deixa un salt de línia després de la icona de l'encapçalament.
export function resumHtml(html, minim = 70) {
  let paraules = 0;
  let resum = '';
  for (const fragment of html.split(/(<[^>]*>)/)) {
    if (!fragment) continue;
    resum += fragment;
    paraules += fragment.split(/\s+/).filter(Boolean).length;
    if (fragment === '</p>' && paraules >= minim) break;
  }
  return resum.trimEnd().replace('</svg></span>', '</svg>\n</span>');
}

const resumDe = (cos) => resumHtml(renderMarkdown(cos));
const sessioItem = (s) => ({ titol: titolSessio(s), cami: urlSessio(s), data: s.data, hora: s.hora, descripcio: resumDe(s.publica?.cos) });
const ultimaSessio = (sessions) => sessionsDescendents(sessions)[0];

// Portada: sessions (de la més nova a la més antiga) i després les pàgines de contingut per títol.
export async function feedPortada(db = getDb()) {
  const slugs = [...SLUGS_CONTINGUT, 'fes-te-socia'];
  const [sessions, pagines] = await Promise.all([sessionsPubliques(db), Promise.all(slugs.map((slug) => paginaPerSlug(slug, db)))]);
  const items = pagines
    .map((pagina, i) => pagina && { titol: pagina.titol, cami: `/${slugs[i]}/`, descripcio: resumDe(pagina.cos) })
    .filter(Boolean)
    .sort((a, b) => a.titol.localeCompare(b.titol, 'ca'));
  return {
    titolCanal: site.title,
    descripcio: `Recent content on ${site.title}`,
    cami: '/',
    items: [...sessionsDescendents(sessions).map(sessioItem), ...items],
  };
}

export async function feedProgramacio(db = getDb()) {
  const [pagina, sessions] = await Promise.all([paginaPerSlug('programacio', db), sessionsPubliques(db)]);
  const titol = pagina?.titol || 'Programació';
  return {
    titolCanal: `${titol} on ${site.title}`,
    descripcio: `Recent content in ${titol} on ${site.title}`,
    cami: '/programacio/',
    items: sessionsDescendents(sessions).map(sessioItem),
  };
}

// Índex d'una taxonomia: un element per terme, el de la sessió més recent primer (a igualtat, per nom).
export async function feedTaxonomia(taxonomia, db = getDb()) {
  if (!TAXONOMIES.includes(taxonomia)) return null;
  const termes = termesDe(await sessionsPubliques(db), taxonomia);
  const items = termes
    .map((terme) => ({ terme, ultima: ultimaSessio(terme.sessions) }))
    .sort((a, b) => (a.ultima.data + a.ultima.hora < b.ultima.data + b.ultima.hora ? 1 : a.ultima.data + a.ultima.hora > b.ultima.data + b.ultima.hora ? -1 : 0))
    .map(({ terme, ultima }) => ({ titol: terme.nom, cami: urlTerme(taxonomia, terme.nom), data: ultima.data, hora: ultima.hora }));
  return {
    titolCanal: `${taxonomia} on ${site.title}`,
    descripcio: `Recent content in ${taxonomia} on ${site.title}`,
    cami: `/${taxonomia}/`,
    items,
  };
}

// `param` és el segment de la URL ja decodificat (com a les pàgines de terme).
export async function feedTerme(taxonomia, param, db = getDb()) {
  if (!TAXONOMIES.includes(taxonomia) || !paramTermeValid(param)) return null;
  const terme = trobaTerme(termesDe(await sessionsPubliques(db), taxonomia), param);
  if (!terme) return null;
  return {
    titolCanal: `${terme.nom} on ${site.title}`,
    descripcio: `Recent content in ${terme.nom} on ${site.title}`,
    cami: urlTerme(taxonomia, terme.nom),
    items: sessionsDescendents(terme.sessions).map(sessioItem),
  };
}

// Mateixa estructura que el feed de Hugo (sense l'element `generator`). Els elements sense data
// (les pàgines de contingut) no porten `pubDate`; Hugo hi posava l'any 0001.
export function xmlFeed(feed, base) {
  const url = base + feed.cami;
  const ultima = feed.items.filter((i) => i.data).sort((a, b) => (a.data + a.hora < b.data + b.hora ? 1 : -1))[0];
  const item = (i) => `<item><title>${escapaXml(i.titol)}</title><link>${escapaXml(base + i.cami)}</link>`
    + (i.data ? `<pubDate>${rfc822(i.data, i.hora)}</pubDate>` : '')
    + `<guid>${escapaXml(base + i.cami)}</guid>`
    + (i.descripcio ? `<description>${escapaXml(i.descripcio)}</description>` : '<description/>')
    + '</item>';
  return '<?xml version="1.0" encoding="utf-8" standalone="yes"?>'
    + '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>'
    + `<title>${escapaXml(feed.titolCanal)}</title><link>${escapaXml(url)}</link><description>${escapaXml(feed.descripcio)}</description>`
    + '<language>ca</language>'
    + (ultima ? `<lastBuildDate>${rfc822(ultima.data, ultima.hora)}</lastBuildDate>` : '')
    + `<atom:link href="${escapaXml(`${url}index.xml`)}" rel="self" type="application/rss+xml"/>`
    + feed.items.map(item).join('')
    + '</channel></rss>\n';
}

// Resposta d'un endpoint de feed: el XML amb la caché curta de les pàgines que depenen de la data, o 404.
export const respostaFeed = (feed, base = SITE_URL) => (feed
  ? new Response(xmlFeed(feed, base), { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': CACHE_AVUI } })
  : new Response('No trobat\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
