// Auditoria de desbordament horitzontal en mòbil de l'administració. Arrenca l'arnès
// (`scripts/arnes-admin/`: l'app real amb Firebase simulat i dades adverses), recorre totes les
// rutes a 375 i 320 px (i les que en tenen, també amb els filtres oberts o en mode edició) i
// comprova que la pàgina no és més ampla que la finestra. Si ho és, en llista els culpables:
// els elements més externs que sobresurten per la dreta, amb el fitxer CSS on es defineix la classe.
//
//   npm run audit-overflow                         (totes les rutes, 375 i 320 px)
//   npm run audit-overflow -- --rutes /socis,/tickets --amplades 320
//
// A cada ruta (i estat) comprova també: cap camp visible sense nom accessible, exactament un <h1>
// (`scripts/auditoria-a11y.js`) i, a 1440 px, que l'amplada de `.pagina-admin` sigui una de les tres
// estàndard (1280/1024/768 ±2), excepte a les rutes de `SENSE_PAGINA_ADMIN` (amb el motiu).
//
// Surt amb codi 1 si alguna pàgina desborda, no acaba de carregar, redirigeix, llança un error
// (`pageerror`), no té el botó d'un estat que s'hi espera o incompleix alguna d'aquestes comprovacions. Fa servir el Chrome instal·lat
// (`CHROME_PATH` per canviar-ne la ruta) i el port 6201 (`PORT_ARNES` per canviar-lo).
//
// Sense xarxa: Firebase és simulat (dades en memòria, no es llegeix ni s'escriu res real) i el
// navegador avorta tota petició que no vagi a localhost/127.0.0.1 (les fonts de Google, la imatge
// de fons del carnet…). Així el resultat no depèn de la connexió: el text es mesura sempre amb les
// fonts alternatives del sistema (`ui-sans-serif`/`system-ui`), que són més amples que Oswald i
// Inter, de manera que l'auditoria és, si de cas, més estricta que la realitat.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { campsSenseNom, nombreH1, ampladaContenidor, ampladaEstandard } from './auditoria-a11y.js';

const ARREL = fileURLToPath(new URL('..', import.meta.url));
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.PORT_ARNES ?? 6201);

// Ids de `scripts/arnes-admin/dades.js`.
export const RUTES = [
  '/accedir?anonim',
  '/dashboard',
  '/socis', '/socis/nou', '/socis/s1', '/socis/s11', '/socis/s12', '/socis/s13', '/socis/s14', '/socis/s1/carnet', '/socis/carnets?ids=s1,s2,s3', '/socis/s1/pagament',
  '/solicituds',
  '/sessions', '/sessions/nova', '/sessions/ses2', '/sessions/ses5',
  '/sessions/ses2?pestanya=dades', '/sessions/ses2?pestanya=continguts', '/sessions/ses2?pestanya=mitjans',
  '/sessions/ses5?pestanya=dades',
  '/entitats', '/entitats/nova', '/entitats/e1', '/entitats/e2',
  '/tickets', '/tickets/lot1',
  '/escaneig', '/escaneig/log',
  '/comptabilitat', '/comptabilitat/nou', '/comptabilitat/nou?sessionId=ses2', '/comptabilitat/m1', '/comptabilitat/m4', '/comptabilitat/m7', '/comptabilitat/m9',
  '/configuracio',
  '/distribuidores', '/distribuidores/nova', '/distribuidores/d1', '/distribuidores/d2', '/distribuidores/d7',
  '/propostes/pendents', '/propostes/pendents?vista=tandes', '/propostes/pendents?estat=aprovada&tanda=cap',
  '/propostes/pendents/nova', '/propostes/pendents/p1',
  '/propostes/pendents/p1?pestanya=pellicula', '/propostes/pendents/p1?pestanya=gestio', '/propostes/pendents/p1?pestanya=mitjans',
  '/propostes/pendents/p23', '/propostes/pendents/p23?pestanya=gestio', '/propostes/pendents/p23?pestanya=pellicula', '/propostes/pendents/p23?pestanya=mitjans',
  '/propostes/pendents/p24', '/propostes/pendents/p24?pestanya=pellicula', '/propostes/pendents/p24?pestanya=gestio', '/propostes/pendents/p24?pestanya=mitjans',
  '/tandes', '/tandes/nova', '/tandes/t1', '/tandes/t3', '/tandes/t1/resultats',
];
const AMPLADES = [375, 320];
const AMPLADA_ESCRIPTORI = 1440;

// Rutes que no fan servir `PaginaAdmin` (o no n'han de seguir l'amplada), només per a la comprovació
// d'amplada a 1440 px. Cada excepció té un motiu; no s'hi afegeix res per fer passar l'auditoria.
const SENSE_PAGINA_ADMIN = {
  '/accedir': 'pantalla d\'accés, fora de l\'administració (targeta centrada pròpia)',
  '/escaneig': 'pantalla d\'operació a la porta: a tot l\'ample, pensada per a tauleta/mòbil',
  '/socis/s1/carnet': 'carnet: disseny d\'impressió amb mides fixes',
  '/socis/carnets': 'carnets: disseny d\'impressió amb mides fixes',
};

// Estats que només apareixen en interactuar, i les rutes on s'han de provar. Si la ruta no té el
// botó, falla; si una ruta té el botó però no és a la llista, s'avisa perquè s'hi afegeixi.
const ESTATS = {
  filtres: '[aria-label="Mostrar filtres"]',
  desar: '.barra-desar button[type="submit"]',
  calendari: '.pagina-admin__accions [aria-label="Sincronitzar el calendari"]',
};
const ESTATS_PER_RUTA = {
  '/socis': ['filtres'],
  '/comptabilitat': ['filtres'],
  // Fitxa de soci: barra fixa «Desar» en donar d'alta, amb tots els camps extrems (s1) i desactivat amb un motiu llarg (s11);
  // a la capçalera, «Trucar» i «Escriure un correu» tots dos (s1), només el correu (s12), només trucar (s13) o cap (s14).
  '/socis/nou': ['desar'],
  '/socis/s1': ['desar'],
  '/socis/s11': ['desar'],
  '/socis/s12': ['desar'],
  '/socis/s13': ['desar'],
  '/socis/s14': ['desar'],
  '/sessions': ['calendari'],
  // Fitxa de sessió: la barra fixa «Desar» és a les pestanyes d'edició (no a Estadístiques).
  '/sessions/nova': ['desar'],
  '/sessions/ses5': ['desar'], // sense control: la pestanya per defecte és Dades
  '/sessions/ses2?pestanya=dades': ['desar'],
  '/sessions/ses2?pestanya=continguts': ['desar'],
  '/sessions/ses2?pestanya=mitjans': ['desar'],
  '/sessions/ses5?pestanya=dades': ['desar'],
  // Fitxa de moviment: barra fixa «Desar» en crear, venint d'una sessió (errors de camp a la barra), amb concepte i
  // imports extrems (m1), quota bloquejada (m4), amb document adjunt de nom llarg (m7) i traspàs (m9).
  '/comptabilitat/nou': ['desar'],
  '/comptabilitat/nou?sessionId=ses2': ['desar'],
  '/comptabilitat/m1': ['desar'],
  '/comptabilitat/m4': ['desar'],
  '/comptabilitat/m7': ['desar'],
  '/comptabilitat/m9': ['desar'],
  // Configuració: barra fixa «Desar» sempre visible (pàgina d'un sol document, sense mode «Editar»).
  '/configuracio': ['desar'],
  // Fitxa de proposta: la barra fixa «Desar» és a les pestanyes editables (no al Resum, la pestanya per defecte).
  '/propostes/pendents/p1?pestanya=pellicula': ['desar'],
  '/propostes/pendents/p1?pestanya=gestio': ['desar'],
  '/propostes/pendents/p1?pestanya=mitjans': ['desar'],
  '/propostes/pendents/p23?pestanya=gestio': ['desar'],
  '/propostes/pendents/p23?pestanya=pellicula': ['desar'],
  '/propostes/pendents/p24?pestanya=pellicula': ['desar'],
  '/propostes/pendents/p24?pestanya=gestio': ['desar'],
  '/propostes/pendents/p23?pestanya=mitjans': ['desar'],
  '/propostes/pendents/p24?pestanya=mitjans': ['desar'],
  // Fitxa de tanda: barra fixa «Desar» en crear, en una d'oberta amb vots (t1) i en una de tancada (t3).
  '/tandes/nova': ['desar'],
  '/tandes/t1': ['desar'],
  '/tandes/t3': ['desar'],
  // Fitxa d'entitat: barra fixa «Desar» en crear, amb un nom llarg sense logo (e1) i amb logo (e2).
  '/entitats/nova': ['desar'],
  '/entitats/e1': ['desar'],
  '/entitats/e2': ['desar'],
  // Fitxa de distribuïdora: barra fixa «Desar» en crear, amb textos llargs i logo (d1), amb logo ample (d2) i amb nom molt llarg (d7).
  '/distribuidores/nova': ['desar'],
  '/distribuidores/d1': ['desar'],
  '/distribuidores/d2': ['desar'],
  '/distribuidores/d7': ['desar'],
  '/propostes/pendents': ['filtres'],
  '/propostes/pendents?vista=tandes': ['filtres'],
  '/propostes/pendents?estat=aprovada&tanda=cap': ['filtres'],
};

const esLocal = (url) => {
  const { protocol, hostname } = new URL(url);
  return ['data:', 'blob:'].includes(protocol) || ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
};

const args = process.argv.slice(2);
const opcio = (nom) => {
  const i = args.indexOf(nom);
  return i >= 0 ? args[i + 1] : null;
};
const rutes = opcio('--rutes')?.split(',') ?? RUTES;
const excepcioAmplada = (ruta) => SENSE_PAGINA_ADMIN[ruta.split('?')[0]] ?? (/^\/socis\/[^/]+\/carnet$/.test(ruta.split('?')[0]) ? SENSE_PAGINA_ADMIN['/socis/s1/carnet'] : null);
const amplades = opcio('--amplades')?.split(',').map(Number) ?? AMPLADES;

// S'executa dins la pàgina. Un element és culpable si sobresurt per la dreta de la finestra i
// no és dins d'un contenidor amb scroll/retall propi que sí que hi cap, ni dins d'un element fix
// (el menú lateral amagat fora de pantalla no fa créixer la pàgina).
function mesura() {
  window.scrollTo(0, 0);
  const html = document.documentElement;
  const vw = html.clientWidth;
  const sobresurt = (el) => el.getBoundingClientRect().right - vw;
  const contingut = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const estil = getComputedStyle(e);
      if (estil.position === 'fixed') return true;
      if (e !== el && estil.overflowX !== 'visible' && sobresurt(e) <= 0.5) return true;
    }
    return false;
  };
  // Fins on arriba el contingut (text inclòs) d'un element que no retalla: el text que no es pot
  // partir sobresurt de la caixa sense que la caixa creixi.
  const sobresurtContingut = (el) => {
    const r = el.getBoundingClientRect();
    const visible = getComputedStyle(el).overflowX === 'visible';
    return (visible && el.scrollWidth ? Math.max(r.right, r.left + el.scrollWidth) : r.right) - vw;
  };
  const culpables = [];
  for (const el of document.body.querySelectorAll('*')) {
    const caixa = sobresurt(el);
    const total = sobresurtContingut(el);
    if (total <= 0.5 || contingut(el)) continue;
    const pare = el.parentElement;
    if (pare && pare !== document.body && sobresurt(pare) > 0.5 && !contingut(pare)) continue;
    // La caixa hi cap però el contingut no: només és culpable si cap fill no ho explica (text propi).
    if (caixa <= 0.5 && [...el.children].some((fill) => sobresurtContingut(fill) >= total - 0.5)) continue;
    culpables.push({
      etiqueta: el.tagName.toLowerCase(),
      classes: typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean) : [],
      px: Math.round(total),
      motiu: caixa > 0.5 ? 'caixa' : 'text',
      amplada: Math.round(el.getBoundingClientRect().width),
      text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60),
    });
  }
  culpables.sort((a, b) => b.px - a.px);
  return {
    amplada: vw,
    scrollHtml: html.scrollWidth,
    scrollBody: document.body.scrollWidth,
    culpables: culpables.slice(0, 8),
  };
}

// classe → fitxer CSS on es defineix (per orientar on cal corregir).
function indexClasses() {
  const index = new Map();
  const recorre = (dir) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const cami = join(dir, f.name);
      if (f.isDirectory()) recorre(cami);
      else if (f.name.endsWith('.css')) {
        for (const [, classe] of readFileSync(cami, 'utf8').matchAll(/\.([a-zA-Z_][\w-]*)/g)) {
          if (!index.has(classe)) index.set(classe, relative(ARREL, cami));
        }
      }
    }
  };
  recorre(join(ARREL, 'src/styles'));
  return index;
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Torna false si la pàgina no ha acabat de carregar (p. ex. falta alguna dada a l'arnès): una
// pàgina que només mostra el «Carregant…» no demostra res.
async function preparada(pagina) {
  const carregada = await pagina.waitForFunction(() => !document.querySelector('.carregant') && document.querySelector('#root')?.children.length, { timeout: 10000 })
    .then(() => true, () => false);
  await pagina.evaluate(() => document.fonts.ready);
  await espera(400);
  return carregada;
}

async function main() {
  const servidor = await createServer({
    configFile: join(ARREL, 'scripts/arnes-admin/vite.config.mjs'),
    server: { port: PORT, strictPort: true },
  });
  await servidor.listen();
  const base = `http://localhost:${PORT}`;
  const navegador = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
  const classes = indexClasses();
  const resultats = [];
  const avisos = new Set();
  const bloquejades = new Set();
  try {
    for (const amplada of amplades) {
      for (const ruta of rutes) {
        const cami = ruta.split('?')[0];
        const casos = [[ruta, null], ...(ESTATS_PER_RUTA[ruta] ?? []).map((estat) => [`${ruta} ~${estat}`, ESTATS[estat]])];
        for (const [nom, selector] of casos) {
          const pagina = await navegador.newPage();
          await pagina.setViewport({ width: amplada, height: 812, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
          await pagina.setRequestInterception(true);
          pagina.on('request', (peticio) => {
            if (esLocal(peticio.url())) return peticio.continue();
            bloquejades.add(new URL(peticio.url()).origin);
            return peticio.abort('blockedbyclient');
          });
          const errors = [];
          pagina.on('pageerror', (e) => errors.push(e.message));
          await pagina.goto(base + ruta, { waitUntil: 'load' });
          // Si l'app redirigeix (p. ex. a /accedir), no s'ha mesurat la pàgina que tocava.
          const carregada = await preparada(pagina) && new URL(pagina.url()).pathname === cami;
          let senseBoto = false;
          if (selector) {
            const boto = await pagina.$(selector);
            if (boto) {
              await boto.click();
              await espera(500);
            } else senseBoto = true;
          } else {
            for (const [estat, sel] of Object.entries(ESTATS)) {
              if (!(ESTATS_PER_RUTA[ruta] ?? []).includes(estat) && await pagina.$(sel)) {
                avisos.add(`${ruta} té el botó «${estat}» però no és a ESTATS_PER_RUTA: no s'ha provat.`);
              }
            }
          }
          const r = await pagina.evaluate(mesura);
          const desborda = Math.max(r.scrollHtml, r.scrollBody) - r.amplada;
          const infraccions = [];
          {
            const h1 = await pagina.evaluate(nombreH1);
            if (h1 !== 1) infraccions.push(`${h1} <h1> (n'hi ha d'haver exactament 1)`);
          }
          for (const camp of await pagina.evaluate(campsSenseNom)) infraccions.push(`camp sense nom accessible: ${camp}`);
          resultats.push({ nom, amplada, desborda, carregada, senseBoto, culpables: r.culpables, errors, infraccions });
          await pagina.close();
        }
      }
    }
    // Amplada del contenidor principal a escriptori (només la ruta, sense estats).
    if (!opcio('--amplades')) {
      for (const ruta of rutes) {
        const pagina = await navegador.newPage();
        await pagina.setViewport({ width: AMPLADA_ESCRIPTORI, height: 900, deviceScaleFactor: 1 });
        await pagina.setRequestInterception(true);
        pagina.on('request', (peticio) => (esLocal(peticio.url()) ? peticio.continue() : peticio.abort('blockedbyclient')));
        await pagina.goto(base + ruta, { waitUntil: 'load' });
        const carregada = await preparada(pagina) && new URL(pagina.url()).pathname === ruta.split('?')[0];
        const px = await pagina.evaluate(ampladaContenidor);
        const motiu = excepcioAmplada(ruta);
        const infraccions = [];
        if (!carregada) infraccions.push('no carrega a 1440 px');
        else if (!motiu && px === null) infraccions.push('no fa servir PaginaAdmin (.pagina-admin) i no és a SENSE_PAGINA_ADMIN');
        else if (!motiu && !ampladaEstandard(px)) infraccions.push(`amplada de .pagina-admin ${px} px: no és 1280, 1024 ni 768 (±2)`);
        resultats.push({ nom: ruta, amplada: AMPLADA_ESCRIPTORI, desborda: 0, carregada: true, senseBoto: false, culpables: [], errors: [], infraccions, px, motiu });
        await pagina.close();
      }
    }
  } finally {
    await navegador.close();
    await servidor.close();
  }

  const dolents = resultats.filter((r) => r.desborda > 0 || !r.carregada || r.senseBoto || r.errors.length || r.infraccions.length);
  for (const r of resultats) {
    let estat = 'ok        ';
    if (r.errors.length) estat = 'ERROR JS  ';
    if (r.senseBoto) estat = 'SENSE BOTÓ';
    if (!r.carregada) estat = 'NO CARREGA';
    if (r.infraccions.length) estat = 'INFRACCIÓ ';
    if (r.desborda > 0) estat = 'DESBORDA  ';
    console.log(`${estat}  ${String(r.amplada).padEnd(4)} ${r.nom}${r.desborda > 0 ? `  (+${r.desborda} px)` : ''}${r.motiu ? `  (exceptuada: ${r.motiu})` : ''}`);
    for (const i of r.infraccions) console.log(`          ${r.nom}: ${i}`);
    if (r.errors.length) console.log(`          errors de la pàgina: ${r.errors.join(' | ')}`);
    for (const c of r.desborda > 0 ? r.culpables : []) {
      const classe = c.classes.find((k) => classes.has(k));
      const on = classe ? `${classe} (${classes.get(classe)})` : `${c.etiqueta}${c.classes.length ? `.${c.classes.join('.')}` : ''} (sense classe pròpia)`;
      console.log(`          +${c.px} px  [${c.motiu}] ${c.etiqueta} ${on}  «${c.text}»`);
    }
  }
  for (const avis of avisos) console.log(`AVÍS: ${avis}`);
  if (bloquejades.size) console.log(`Peticions externes avortades (fonts alternatives deterministes): ${[...bloquejades].join(', ')}`);
  console.log(`\n${resultats.length} casos, ${dolents.length} amb problemes (desbordament, sense carregar, error JS, sense botó, h1, noms accessibles o amplada).`);
  process.exitCode = dolents.length ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
