// Funcions pures de `check-imatges.mjs`: extracció de les imatges d'una pàgina, imatges del build de
// Hugo i de Firestore, validació d'una resposta i llista de diferències conegudes.
import { cami, decodificaEntitats, etiquetes, extreuJsonLd, pathDe } from './check-urls-lib.mjs';

const RELS_ICONA = ['icon', 'apple-touch-icon'];
const METES_IMATGE = ['og:image', 'twitter:image'];
const CLAUS_JSONLD = ['image', 'logo', 'thumbnailUrl'];
const EXTENSIONS_HUGO = /\.(jpg|jpeg|png|webp|svg|gif|ico)$/;

// Candidats d'un `srcset`: «url descriptor, url descriptor» (les comes poden anar sense espai).
const deSrcset = (srcset) => [...srcset.matchAll(/\s*([^\s,][^\s]*?)(?:\s+[\d.]+[wxh])?\s*(?:,|$)/g)].map(([, url]) => url);

const deCss = (css) => [...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)].map(([, , url]) => url.trim());

function deJsonLd(valor, trobades = []) {
  if (Array.isArray(valor)) valor.forEach((v) => deJsonLd(v, trobades));
  else if (valor && typeof valor === 'object') {
    for (const [clau, v] of Object.entries(valor)) {
      if (CLAUS_JSONLD.includes(clau)) {
        for (const imatge of [v].flat()) {
          if (typeof imatge === 'string') trobades.push(imatge);
          else if (typeof imatge?.url === 'string') trobades.push(imatge.url);
          else if (typeof imatge?.contentUrl === 'string') trobades.push(imatge.contentUrl);
        }
      }
      deJsonLd(v, trobades);
    }
  }
  return trobades;
}

const absoluta = (url, base) => {
  try {
    return new URL(url, base).href;
  } catch {
    return null;
  }
};

// URL absolutes i úniques de totes les imatges que referencia una pàgina (sense les `data:`).
export function extreuImatges(html, urlPagina) {
  const urls = [];
  for (const a of etiquetes(html, 'img')) urls.push(a.src, ...deSrcset(a.srcset ?? ''));
  for (const a of etiquetes(html, 'source')) urls.push(a.src, ...deSrcset(a.srcset ?? ''));
  for (const a of etiquetes(html, 'link')) {
    if ((a.rel ?? '').toLowerCase().split(/\s+/).some((r) => RELS_ICONA.includes(r))) urls.push(a.href);
  }
  for (const a of etiquetes(html, 'meta')) {
    if (METES_IMATGE.includes((a.property ?? a.name ?? '').toLowerCase())) urls.push(a.content);
  }
  for (const [, doble, simple] of html.matchAll(/\sstyle=(?:"([^"]*)"|'([^']*)')/gi)) urls.push(...deCss(decodificaEntitats(doble ?? simple)));
  for (const [, css] of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) urls.push(...deCss(css));
  for (const bloc of extreuJsonLd(html)) urls.push(...deJsonLd(bloc));
  return [...new Set(urls
    .filter((u) => typeof u === 'string' && u.trim() && !/^data:/i.test(u.trim()))
    .map((u) => absoluta(u.trim(), urlPagina))
    .filter(Boolean))];
}

// Camins d'URL (NFC, sense codificar) de les imatges del build de Hugo, a partir dels fitxers relatius.
export const caminsImatgesHugo = (fitxers) => fitxers.filter((f) => EXTENSIONS_HUGO.test(f)).map((f) => `/${f}`.normalize('NFC'));

// Imatges guardades als documents de Firestore, amb el camp d'on surten.
export function imatgesFirestore({ sessions = [], pagines = [], propostes = [] }) {
  const imatges = [];
  const afegeix = (url, origen) => {
    if (typeof url === 'string' && url.trim()) imatges.push({ url: url.trim(), origen });
  };
  for (const s of sessions) {
    afegeix(s.imatgeUrl, `sessions/${s.id} imatgeUrl`);
    afegeix(s.publica?.cartell, `sessions/${s.id} publica.cartell`);
    (s.publica?.galeria ?? []).forEach((url, i) => afegeix(url, `sessions/${s.id} publica.galeria[${i}]`));
  }
  for (const p of pagines) {
    for (const [clau, url] of Object.entries(p.imatges ?? {})) afegeix(url, `pagines/${p.id} imatges.${clau}`);
  }
  for (const p of propostes) afegeix(p.imatgeUrl, `propostes/${p.id} imatgeUrl`);
  return imatges;
}

// null si la resposta final (després de redireccions) és 2xx amb `content-type: image/*`; si no, el motiu.
export function motiuFallada(res) {
  if (res.error) return `error de connexió: ${res.error}`;
  const tipus = res.headers.get('content-type');
  if (res.status < 200 || res.status >= 300) return `HTTP ${res.status}${tipus ? ` (${tipus})` : ''}`;
  if (!/^image\//i.test(tipus ?? '')) return `HTTP ${res.status} però content-type ${tipus ?? '(cap)'}`;
  return null;
}

// Separa les fallades conegudes (entrada `{ path, motiu }` exacta o `{ patro, motiu }` regex sobre el camí
// decodificat) de les inesperades; `obsoletes` són les entrades que ja no justifiquen cap fallada.
export function aplicaConegudes(fallades, permesos) {
  const usades = new Set();
  const conegudes = [];
  const inesperades = [];
  for (const f of fallades) {
    const ruta = cami(pathDe(f.url));
    const entrada = permesos.find((p) => (p.path !== undefined ? cami(p.path) === ruta : new RegExp(p.patro).test(ruta)));
    if (entrada) {
      usades.add(entrada);
      conegudes.push({ ...f, coneguda: entrada.motiu });
    } else {
      inesperades.push(f);
    }
  }
  return { conegudes, inesperades, obsoletes: permesos.filter((p) => !usades.has(p)) };
}

// `fn` sobre cada element amb `n` crides simultànies com a màxim; el resultat conserva l'ordre.
export async function perLots(elements, n, fn) {
  const resultats = new Array(elements.length);
  let seguent = 0;
  const treballador = async () => {
    while (seguent < elements.length) {
      const i = seguent++;
      resultats[i] = await fn(elements[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, elements.length) }, treballador));
  return resultats;
}

// Amb `--origen <url>`, les URL d'aquest origen (p. ex. el domini de producció guardat a Firestore) es
// comproven contra <baseNova>: serveix per validar un build local abans de desplegar-lo.
export function reescriuOrigen(url, origen, base) {
  if (!origen) return url;
  try {
    const u = new URL(url);
    return u.origin === new URL(origen).origin ? base + u.pathname + u.search : url;
  } catch {
    return url;
  }
}
