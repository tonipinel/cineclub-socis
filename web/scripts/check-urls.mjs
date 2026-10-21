// Compara la web nova amb el build de Hugo: per cada URL del sitemap de Hugo comprova estat 200,
// títol, canonical (camí), meta description i blocs JSON-LD; comprova que els `aliases` de Hugo i
// les URL sense barra final redirigeixen (301) i que el sitemap de la web nova té les mateixes URL.
//
//   node scripts/check-urls.mjs <baseNova> <dirHugoPublic> [--permet diferencies-conegudes.json]
//
// Surt amb codi 1 si hi ha alguna diferència que no és a la llista de permesos.
//
// Les comprovacions «barra» (sense barra final -> 301) només passen contra un build de producció
// (`astro build` + `dist/server/entry.mjs`): el servidor de desenvolupament mostra un 404 propi.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  aplicaPermet, cami, comparaPagines, llegeixAliases, llegeixSitemap, pathDe,
} from './check-urls-lib.mjs';

const args = process.argv.slice(2);
const iPermet = args.indexOf('--permet');
const fitxerPermet = iPermet >= 0 ? args.splice(iPermet, 2)[1] : null;
const [baseArg, dirHugo] = args;
if (!baseArg || !dirHugo) {
  console.error('Ús: node scripts/check-urls.mjs <baseNova> <dirHugoPublic> [--permet fitxer.json]');
  process.exit(2);
}
const base = baseArg.replace(/\/$/, '');
const permet = fitxerPermet ? JSON.parse(readFileSync(fitxerPermet, 'utf8')).permesos ?? [] : [];

const sitemapHugo = readFileSync(join(dirHugo, 'sitemap.xml'), 'utf8');
const camins = llegeixSitemap(sitemapHugo);

// `index.html` de Hugo per a un camí (el sistema de fitxers pot guardar els accents en NFD).
function htmlHugo(ruta) {
  const decodificat = decodeURIComponent(ruta);
  for (const forma of ['NFC', 'NFD']) {
    const fitxer = join(dirHugo, decodificat.normalize(forma), 'index.html');
    if (existsSync(fitxer)) return readFileSync(fitxer, 'utf8');
  }
  throw new Error(`No hi ha index.html de Hugo per a ${ruta}`);
}

function fitxersHtml(dir, prefix = '') {
  return readdirSync(dir).flatMap((nom) => {
    const complet = join(dir, nom);
    const relatiu = prefix ? `${prefix}/${nom}` : nom;
    if (statSync(complet).isDirectory()) return fitxersHtml(complet, relatiu);
    return nom === 'index.html' && statSync(complet).size < 2048 ? [relatiu] : [];
  });
}

const demana = (ruta, opcions = {}) => fetch(base + ruta, { redirect: 'manual', ...opcions });
const diferencies = [];
const afegeix = (path, camp, hugo, nova) => diferencies.push({ path, camp, hugo, nova });

// Pàgines del sitemap de Hugo.
let comprovades = 0;
async function comprovaPagina(ruta) {
  const res = await demana(ruta);
  comprovades++;
  if (res.status !== 200) return afegeix(ruta, 'status', 200, res.status);
  for (const d of comparaPagines(htmlHugo(ruta), await res.text())) afegeix(ruta, d.camp, d.hugo, d.nova);
}
for (let i = 0; i < camins.length; i += 6) await Promise.all(camins.slice(i, i + 6).map(comprovaPagina));

// `aliases` de Hugo: 301 cap a la URL nova.
const aliases = llegeixAliases(Object.fromEntries(
  fitxersHtml(dirHugo).map((ruta) => [ruta, readFileSync(join(dirHugo, ruta), 'utf8')]),
));
for (const { alias, desti } of aliases) {
  const res = await demana(encodeURI(alias));
  const location = res.headers.get('location');
  if (res.status !== 301) afegeix(alias, 'alias', `301 ${desti}`, `${res.status}${location ? ` ${location}` : ''}`);
  else if (!location || cami(pathDe(location)) !== cami(desti)) afegeix(alias, 'alias', `301 ${desti}`, `301 ${location}`);
}

// Sense barra final: 301 cap a la mateixa URL amb barra (una per tipus de URL, una amb query).
const mostres = new Map();
for (const ruta of camins) {
  const segments = ruta.split('/').filter(Boolean);
  if (segments.length && !mostres.has(`${segments.length}/${segments[0]}`)) mostres.set(`${segments.length}/${segments[0]}`, ruta);
}
const senseBarra = [...mostres.values()].map((ruta, i) => [ruta.slice(0, -1) + (i === 0 ? '?x=1' : ''), ruta + (i === 0 ? '?x=1' : '')]);
for (const [origen, esperat] of senseBarra) {
  const res = await demana(origen);
  const location = res.headers.get('location');
  if (res.status !== 301 || cami(location ?? '') !== cami(esperat)) afegeix(origen, 'barra', `301 ${esperat}`, `${res.status}${location ? ` ${location}` : ''}`);
}

// Sitemap de la web nova: mateixes URL que el de Hugo.
const resSitemap = await demana('/sitemap.xml');
if (resSitemap.status !== 200) {
  afegeix('/sitemap.xml', 'status', 200, resSitemap.status);
} else {
  const nous = new Set(llegeixSitemap(await resSitemap.text()).map(cami));
  const antics = new Set(camins.map(cami));
  for (const ruta of camins) if (!nous.has(cami(ruta))) afegeix(ruta, 'sitemap', 'hi és', 'no hi és');
  for (const ruta of nous) if (!antics.has(ruta)) afegeix(ruta, 'sitemap', 'no hi és', 'hi és');
}

const { conegudes, inesperades } = aplicaPermet(diferencies, permet);
const curt = (valor) => {
  const text = typeof valor === 'string' ? valor : JSON.stringify(valor);
  return text.length > 90 ? `${text.slice(0, 87)}...` : text;
};
const ordena = (a, b) => (cami(a.path) + a.camp < cami(b.path) + b.camp ? -1 : 1);
const mostra = (titol, llista, ambMotiu) => {
  if (!llista.length) return;
  console.log(`\n${titol} (${llista.length})`);
  for (const d of [...llista].sort(ordena)) {
    console.log(`  ${cami(d.path)}  [${d.camp}]\n      hugo: ${curt(d.hugo)}\n      nova: ${curt(d.nova)}${ambMotiu ? `\n      motiu: ${d.motiu}` : ''}`);
  }
};
mostra('DIFERENCIES INESPERADES', inesperades, false);
mostra('DIFERENCIES CONEGUDES', conegudes, true);

const urlsAmbDiferencia = new Set(diferencies.map((d) => cami(d.path)));
const ok = camins.filter((c) => !urlsAmbDiferencia.has(cami(c))).length;
console.log(`\nURL del sitemap de Hugo: ${camins.length} (${comprovades} comprovades) | OK: ${ok} | amb diferències conegudes: ${new Set(conegudes.map((d) => cami(d.path))).size} | inesperades: ${inesperades.length}`);
console.log(`Aliases: ${aliases.length} | URL sense barra final: ${senseBarra.length}`);
process.exit(inesperades.length ? 1 : 0);
