// Auditoria de les imatges de la web: el que `check-urls` fa per a les pàgines, per a les imatges.
//
//   node scripts/check-imatges.mjs <baseNova> [--hugo <dir public de Hugo>] [--firestore] [--permet fitxer.json] [--origen <url>]
//   npm --prefix web run check-imatges -- https://cineclubrodadebera.cat --hugo ~/sites/cineclub/public --firestore
//
// - Recorre les URL del sitemap.xml de <baseNova> (més /propostes/ i /propostes/votar/), n'extreu totes les
//   imatges (<img src/srcset>, <source>, icones, og:image/twitter:image, url() d'estils i JSON-LD) i
//   comprova cada URL única: després de redireccions ha de donar 2xx amb `content-type: image/*`.
// - `--hugo <dir>`: comprova també que cada imatge (.jpg .jpeg .png .webp .svg .gif .ico) del build de Hugo
//   respon igual a <baseNova> amb el mateix camí. Les fallades de la llista de diferències conegudes
//   (per defecte scripts/diferencies-imatges-conegudes.json; entrades `{ path | patro, motiu }`) no compten.
// - `--firestore`: comprova les imatges guardades a Firestore (sessions: imatgeUrl, publica.cartell,
//   publica.galeria; pagines: imatges; propostes: imatgeUrl). Credencials: GOOGLE_APPLICATION_CREDENTIALS
//   o la clau cineclub-socis-firebase-adminsdk-*.json de l'arrel del repo. Només llegeix.
//
// - `--origen <url>`: les URL d'imatge d'aquest origen es comproven contra <baseNova> (per validar un build
//   local, p. ex. `http://127.0.0.1:5951 ... --origen https://cineclubrodadebera.cat`, abans de desplegar).
//
// Surt amb codi 1 si hi ha alguna fallada que no és a la llista de conegudes. Forma part del checklist del
// tall: s'executa abans i després de canviar el DNS.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demanaSegur, llegeixSitemap } from './check-urls-lib.mjs';
import {
  aplicaConegudes, caminsImatgesHugo, extreuImatges, imatgesFirestore, motiuFallada, perLots, reescriuOrigen,
} from './check-imatges-lib.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const ARREL_REPO = resolve(DIR, '..', '..');
const US = 'Ús: node scripts/check-imatges.mjs <baseNova> [--hugo <dir public de Hugo>] [--firestore] [--permet fitxer.json] [--origen <url>]';
const CONCURRENCIA = 8;
const TEMPS_LIMIT = 20000;
const PAGINES_EXTRA = ['/propostes/', '/propostes/votar/'];

const args = process.argv.slice(2);
const treu = (nom, ambValor) => {
  const i = args.indexOf(nom);
  if (i < 0) return null;
  return ambValor ? args.splice(i, 2)[1] : args.splice(i, 1)[0];
};
const dirHugo = treu('--hugo', true);
const ambFirestore = treu('--firestore', false) !== null;
const origen = treu('--origen', true);
const fitxerPermet = treu('--permet', true) ?? join(DIR, 'diferencies-imatges-conegudes.json');
const [baseArg] = args;
if (!baseArg || args.length > 1 || (dirHugo !== null && !existsSync(dirHugo))) {
  console.error(US);
  process.exit(2);
}
const base = baseArg.replace(/\/$/, '');
const permesos = existsSync(fitxerPermet) ? JSON.parse(readFileSync(fitxerPermet, 'utf8')).permesos ?? [] : [];

// Un error de connexió (DNS, temps esgotat) es reintenta un cop abans de comptar-lo com a fallada.
const intenta = (url) => demanaSegur(fetch, url, { redirect: 'follow', signal: AbortSignal.timeout(TEMPS_LIMIT) });
const demana = async (url) => {
  const res = await intenta(url);
  return res.error ? intenta(url) : res;
};

// 1. Pàgines de la web nova i imatges que referencien.
const referencies = new Map();
const referencia = (url, origen) => {
  if (!referencies.has(url)) referencies.set(url, new Set());
  referencies.get(url).add(origen);
};
const resSitemap = await demana(`${base}/sitemap.xml`);
if (resSitemap.status !== 200) {
  console.error(`No s'ha pogut llegir ${base}/sitemap.xml (${resSitemap.error ?? resSitemap.status})`);
  process.exit(1);
}
const pagines = [...new Set([...llegeixSitemap(await resSitemap.text()), ...PAGINES_EXTRA])];
const paginesFallides = [];
await perLots(pagines, 6, async (ruta) => {
  const res = await demana(base + ruta);
  if (res.status !== 200) return paginesFallides.push({ ruta, motiu: res.error ? `error de connexió: ${res.error}` : `HTTP ${res.status}` });
  for (const url of extreuImatges(await res.text(), res.url || base + ruta)) referencia(url, ruta);
});
const urlsPagines = new Set(referencies.keys());

// 2. Imatges del build de Hugo, amb el mateix camí a la web nova.
const fitxers = (dir, prefix = '') => readdirSync(dir).flatMap((nom) => {
  const relatiu = prefix ? `${prefix}/${nom}` : nom;
  return statSync(join(dir, nom)).isDirectory() ? fitxers(join(dir, nom), relatiu) : [relatiu];
});
const urlsHugo = new Set();
if (dirHugo) {
  for (const ruta of caminsImatgesHugo(fitxers(dirHugo))) {
    const url = base + encodeURI(ruta);
    urlsHugo.add(url);
    referencia(url, 'build de Hugo');
  }
}

// 3. Imatges guardades a Firestore.
const urlsFirestore = new Set();
if (ambFirestore) {
  const { initializeApp, cert, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  let credential = applicationDefault();
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const key = readdirSync(ARREL_REPO).find((f) => /^cineclub-socis-firebase-adminsdk-.*\.json$/.test(f));
    if (key) credential = cert(JSON.parse(readFileSync(join(ARREL_REPO, key), 'utf8')));
  }
  const db = getFirestore(initializeApp({ credential }));
  const llegeix = async (nom) => (await db.collection(nom).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const [sessions, paginesDb, propostes] = await Promise.all(['sessions', 'pagines', 'propostes'].map(llegeix));
  for (const { url, origen } of imatgesFirestore({ sessions, pagines: paginesDb, propostes })) {
    urlsFirestore.add(url);
    referencia(url, `Firestore ${origen}`);
  }
}

// 4. Una petició per URL única.
const urls = [...referencies.keys()];
const motius = new Map();
await perLots(urls, CONCURRENCIA, async (url) => {
  if (!/^https?:\/\//i.test(url)) return motius.set(url, 'URL no vàlida (no és http/https absoluta)');
  const res = await demana(reescriuOrigen(url, origen, base));
  res.body?.cancel?.().catch(() => {});
  const motiu = motiuFallada(res);
  if (motiu) motius.set(url, res.url && res.url !== url ? `${motiu} a ${res.url}` : motiu);
});

const fallades = (conjunt) => [...conjunt].filter((u) => motius.has(u)).sort().map((url) => ({ url, motiu: motius.get(url), refs: [...referencies.get(url)].sort() }));
const fPagines = fallades(urlsPagines);
const hugo = aplicaConegudes(fallades(urlsHugo), permesos);
const fFirestore = fallades(urlsFirestore);

const mostra = (titol, llista, ambConeguda = false) => {
  console.log(`\n${titol} (${llista.length})`);
  for (const f of llista) {
    console.log(`  ${f.url}\n      ${f.motiu}${ambConeguda ? `\n      coneguda: ${f.coneguda}` : ''}`);
    const refs = f.refs.filter((r) => r !== 'build de Hugo');
    if (refs.length) console.log(`      referenciada a (${refs.length}): ${refs.slice(0, 12).join(', ')}${refs.length > 12 ? ', ...' : ''}`);
  }
};
if (paginesFallides.length) {
  console.log(`\nPÀGINES QUE NO RESPONEN 200 (${paginesFallides.length})`);
  for (const p of paginesFallides) console.log(`  ${p.ruta}  ${p.motiu}`);
}
mostra('IMATGES DE LES PÀGINES QUE FALLEN', fPagines);
if (dirHugo) {
  mostra('IMATGES DEL BUILD DE HUGO QUE JA NO RESPONEN (INESPERADES)', hugo.inesperades);
  mostra('IMATGES DEL BUILD DE HUGO QUE JA NO RESPONEN (CONEGUDES)', hugo.conegudes, true);
  if (hugo.obsoletes.length) {
    console.log(`\nAVIS: ${hugo.obsoletes.length} entrades de ${fitxerPermet} ja no justifiquen cap fallada:`);
    for (const e of hugo.obsoletes) console.log(`  ${e.path ?? e.patro}  (${e.motiu})`);
  }
}
if (ambFirestore) mostra('IMATGES DE FIRESTORE QUE FALLEN', fFirestore);

console.log(`\nPàgines: ${pagines.length} (${paginesFallides.length} no responen 200) | URL d'imatge úniques comprovades: ${urls.length} | fallen: ${motius.size}`);
console.log(`  de les pàgines: ${urlsPagines.size} (fallen ${fPagines.length})${dirHugo ? ` | del build de Hugo: ${urlsHugo.size} (fallen ${hugo.inesperades.length} inesperades + ${hugo.conegudes.length} conegudes)` : ''}${ambFirestore ? ` | de Firestore: ${urlsFirestore.size} (fallen ${fFirestore.length})` : ''}`);
const inesperades = paginesFallides.length + fPagines.length + hugo.inesperades.length + fFirestore.length;
process.exit(inesperades ? 1 : 0);
