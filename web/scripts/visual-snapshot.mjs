// Captura i compara l'aspecte de la web per detectar qualsevol canvi visual (p. ex. en canviar de
// versió de Tailwind). Per cada pàgina i amplada guarda, de cada element del `body`, el rectangle i
// una llista fixa d'estils calculats (també dels pseudoelements), més una captura PNG de pàgina sencera.
//
//   node scripts/visual-snapshot.mjs captura <base> <dirSortida> [--camins /a/,/b/] [--amplades 1280,375] [--estats]
//   node scripts/visual-snapshot.mjs diff <dirAbans> <dirDespres> [--tot]
//
// Sense `--camins` llegeix `<base>/sitemap.xml` i tria les pàgines amb `seleccionaCamins`.
// Amb `--estats` també captura els estats interactius: `:hover` de cada enllaç i botó (a partir de
// 1024 px), el menú mòbil obert, el cartell ampliat, un filtre de secció, les FAQ obertes i el
// formulari amb error (`<pàgina>@<amplada>~<estat>.json`).
// `diff` surt amb codi 1 si hi ha alguna diferència (rectangles amb tolerància de 0,5 px).
// Fa servir el Chrome instal·lat (`CHROME_PATH` per canviar-ne la ruta).
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import {
  AMPLADES, PROPIETATS, PROPIETATS_PSEUDO, comparaCaptures, formataDiferencies, nomCaptura, seleccionaCamins,
} from './visual-snapshot-lib.mjs';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ALCADA = 900;

const args = process.argv.slice(2);
const opcio = (nom) => {
  const i = args.indexOf(nom);
  return i >= 0 ? args.splice(i, 2)[1] : null;
};
const bandera = (nom) => {
  const i = args.indexOf(nom);
  if (i >= 0) args.splice(i, 1);
  return i >= 0;
};
const tot = bandera('--tot');
const estats = bandera('--estats');
const caminsArg = opcio('--camins');
const ampladesArg = opcio('--amplades');
const [ordre, a, b] = args;

async function captura(base, sortida) {
  mkdirSync(sortida, { recursive: true });
  const camins = caminsArg
    ? caminsArg.split(',')
    : seleccionaCamins(await (await fetch(`${base}/sitemap.xml`)).text());
  const amplades = ampladesArg ? ampladesArg.split(',').map(Number) : AMPLADES;
  const navegador = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
  const desa = (nom, dades) => {
    writeFileSync(join(sortida, `${nom}.json`), JSON.stringify(dades));
    console.log(`${nom}: ${dades.elements.length} elements`);
  };
  try {
    for (const cami of camins) {
      for (const amplada of amplades) {
        const nom = nomCaptura(cami, amplada);
        const pagina = await obre(navegador, base + cami, amplada);
        desa(nom, { cami, amplada, ...await pagina.evaluate(() => window.__vs.pagina()) });
        await pagina.screenshot({ path: join(sortida, `${nom}.png`), fullPage: true });
        if (estats && amplada >= 1024) desa(`${nom}~hover`, { cami, amplada, ...await capturaHover(pagina) });
        await pagina.close();
        if (!estats) continue;
        for (const [estat, accio] of Object.entries(ESTATS)) {
          const p = await obre(navegador, base + cami, amplada);
          if (await p.evaluate(accio)) {
            await espera(600);
            desa(`${nom}~${estat}`, { cami, amplada, ...await p.evaluate(() => window.__vs.pagina()) });
            await p.screenshot({ path: join(sortida, `${nom}~${estat}.png`) });
          }
          await p.close();
        }
      }
    }
  } finally {
    await navegador.close();
  }
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Estats que només apareixen en interactuar. Cada acció s'executa a la pàgina (acabada de carregar)
// i torna `false` si no s'hi pot aplicar. No s'envia cap formulari: l'error es marca a mà.
const ESTATS = {
  menu: () => {
    const boto = document.querySelector('[data-menu-toggle]');
    if (!boto || !boto.offsetParent) return false;
    boto.click();
    return true;
  },
  cartell: () => {
    const boto = document.querySelector('[data-poster-trigger]');
    if (!boto || !boto.offsetParent) return false;
    boto.click();
    return true;
  },
  filtre: () => {
    const boto = document.querySelector('.section-filter__btn:not(.is-active)');
    if (!boto) return false;
    boto.click();
    return true;
  },
  faq: () => {
    const detalls = document.querySelectorAll('details');
    detalls.forEach((d) => { d.open = true; });
    return detalls.length > 0;
  },
  'error-formulari': () => {
    const form = document.querySelector('.signup-form');
    if (!form) return false;
    form.querySelector('.signup-form__input')?.classList.add('signup-form__input--error');
    form.querySelector('input[type="checkbox"]')?.classList.add('signup-form__input--error');
    const error = form.querySelector('[data-form-error]');
    if (error) error.textContent = 'Cal omplir tots els camps obligatoris.';
    return true;
  },
};

// Passa el ratolí per sobre de cada enllaç i botó visible i en guarda l'element, els avantpassats i
// els descendents (els `:hover` poden pintar tant el contenidor com els fills).
async function capturaHover(pagina) {
  const objectius = await pagina.$$('a[href], button, summary');
  const elements = [];
  for (const objectiu of objectius) {
    const visible = await objectiu.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    });
    if (!visible) continue;
    await objectiu.hover();
    await espera(400);
    elements.push(...await objectiu.evaluate((el) => window.__vs.entorn(el)));
  }
  await pagina.mouse.move(0, 0);
  return { scrollHeight: await pagina.evaluate(() => document.documentElement.scrollHeight), elements };
}

async function obre(navegador, url, amplada) {
  const pagina = await navegador.newPage();
  await pagina.setViewport({ width: amplada, height: ALCADA, deviceScaleFactor: 1 });
  const resposta = await pagina.goto(url, { waitUntil: 'networkidle0', timeout: 120000 });
  if (!resposta.ok()) throw new Error(`${url}: estat ${resposta.status()}`);
  await carregaTot(pagina);
  await pagina.evaluate(preparaAjudants, PROPIETATS, PROPIETATS_PSEUDO);
  return pagina;
}

// Espera les fonts, baixa fins a baix per carregar les imatges diferides i torna a dalt.
async function carregaTot(pagina) {
  await pagina.evaluate(async () => {
    await document.fonts.ready;
    const espera = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight / 2) {
      window.scrollTo(0, y);
      await espera(50);
    }
    window.scrollTo(0, 0);
  });
  await pagina.waitForNetworkIdle({ idleTime: 500, timeout: 120000 });
  // Les imatges diferides que queden fora de la vista (p. ex. a la galeria horitzontal) es forcen.
  await pagina.evaluate(async () => {
    const espera = (img) => new Promise((r) => {
      img.addEventListener('load', r, { once: true });
      img.addEventListener('error', r, { once: true });
      setTimeout(r, 20000);
    });
    await Promise.all([...document.images].filter((img) => !img.complete).map((img) => {
      img.loading = 'eager';
      return espera(img);
    }));
    await document.fonts.ready;
  });
  await pagina.waitForNetworkIdle({ idleTime: 500, timeout: 120000 });
  // La barra d'eines d'`astro dev` no forma part de la web i, fixa a baix, taparia el ratolí.
  await pagina.evaluate(() => document.querySelector('astro-dev-toolbar')?.remove());
  // Les transicions (p. ex. la barra flotant de fes-te-socia) duren com a molt 300 ms.
  await espera(600);
}

// S'executa dins la pàgina: deixa a `window.__vs` les funcions que llegeixen el camí estable
// (etiqueta + índex), el rectangle i els estils de cada element.
function preparaAjudants(propietats, propietatsPseudo) {
  // La barra d'eines d'Astro i la capa d'errors de Vite no formen part de la web.
  const ignora = (el) => el.localName === 'astro-dev-toolbar' || el.localName === 'vite-error-overlay';
  const fills = (el) => [...el.children].filter((f) => !ignora(f));
  // Les URL dels estils (`url(...)`) es guarden sense l'origen, per comparar servidors en ports diferents.
  const llegeix = (estil, llista) => Object.fromEntries(llista.map((p) =>
    [p, estil.getPropertyValue(p).replaceAll(location.origin, '')]));
  const element = (el, cami) => {
    const rect = el.getBoundingClientRect();
    const pseudo = {};
    // (Chrome no dona l'estil de `::placeholder` a `getComputedStyle`: torna el de l'element.)
    for (const ps of ['::before', '::after', '::marker', '::backdrop']) {
      const estil = getComputedStyle(el, ps);
      const content = estil.getPropertyValue('content');
      const existeix = ps === '::marker' ? getComputedStyle(el).display === 'list-item'
        : ps === '::backdrop' ? el.matches('dialog[open]')
          : content && content !== 'none' && content !== 'normal';
      if (existeix) pseudo[ps] = llegeix(estil, propietatsPseudo);
    }
    return {
      cami,
      classe: el.classList[0] ?? '',
      rect: { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height },
      estil: llegeix(getComputedStyle(el), propietats),
      pseudo,
    };
  };
  const recorre = (el, cami, sortida) => {
    sortida.push(element(el, cami));
    fills(el).forEach((fill, i) => recorre(fill, `${cami}>${fill.localName}[${i}]`, sortida));
    return sortida;
  };
  const camiDe = (el) => (el === document.body ? 'body'
    : `${camiDe(el.parentElement)}>${el.localName}[${fills(el.parentElement).indexOf(el)}]`);
  window.__vs = {
    pagina: () => ({ scrollHeight: document.documentElement.scrollHeight, elements: recorre(document.body, 'body', []) }),
    // L'element amb els seus avantpassats i descendents, amb el camí prefixat per l'element.
    entorn: (el) => {
      const cami = camiDe(el);
      const avantpassats = [];
      for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
        avantpassats.push(element(a, camiDe(a)));
      }
      return [...avantpassats, ...recorre(el, cami, [])].map((e) => ({ ...e, cami: `hover(${cami}) ${e.cami}` }));
    },
  };
}

function diff(dirAbans, dirDespres) {
  const fitxers = (dir) => readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const abans = fitxers(dirAbans);
  const despres = new Set(fitxers(dirDespres));
  let total = 0;
  let elements = 0;
  for (const f of abans) {
    if (!despres.has(f)) { console.log(`${f}: absent a ${dirDespres}`); total++; continue; }
    despres.delete(f);
    const ca = JSON.parse(readFileSync(join(dirAbans, f), 'utf8'));
    const cd = JSON.parse(readFileSync(join(dirDespres, f), 'utf8'));
    elements += ca.elements.length;
    const dif = comparaCaptures(ca, cd);
    total += dif.length;
    if (dif.length) console.log(formataDiferencies(f.replace(/\.json$/, ''), dif, { maxim: tot ? Infinity : 40 }));
  }
  for (const f of despres) { console.log(`${f}: absent a ${dirAbans}`); total++; }
  console.log(`Captures: ${abans.length} | elements comparats: ${elements} | diferències: ${total}`);
  return total ? 1 : 0;
}

if (ordre === 'captura' && a && b) await captura(a.replace(/\/$/, ''), b);
else if (ordre === 'diff' && a && b) process.exitCode = diff(a, b);
else {
  console.error('Ús: visual-snapshot.mjs captura <base> <dirSortida> [--camins ..] [--amplades ..] [--estats] | diff <dirAbans> <dirDespres> [--tot]');
  process.exit(2);
}
