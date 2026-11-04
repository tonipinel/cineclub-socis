// PDF dels flyers (`flyers/{id}`). El flyer SEGUEIX els canvis de les seves sessions: es regeneren quan canvia el flyer
// o qualsevol sessió que conté. La ruta d'impressió de la web (`/flyer/<id>/imprimir/`) dona la pàgina; Chromium la
// converteix en PDF i es desa a Storage. `pdfs.<variant>.firma` fa la regeneració idempotent.
const crypto = require('node:crypto');

const VARIANTS = ['simple', 'impremta'];
const URL_BASE_PER_DEFECTE = 'https://cineclubrodadebera.cat';
const camiPdf = (id, variant) => `web/flyers/${id}/flyer-${variant}.pdf`;

// JSON amb les claus ordenades: el mateix valor dona sempre el mateix text.
function estable(valor) {
  if (Array.isArray(valor)) return `[${valor.map(estable).join(',')}]`;
  if (valor && typeof valor === 'object') {
    return `{${Object.keys(valor).sort().map((k) => `${JSON.stringify(k)}:${estable(valor[k])}`).join(',')}}`;
  }
  return JSON.stringify(valor) ?? 'null';
}

// Hash del que surt imprès: el nom i, per cada sessió publicada (en l'ordre rebut), els seus camps visibles.
// `sessions` són `{ id, ...dades }` en l'ordre del flyer.
function firmaFlyer(flyer, sessions) {
  const imprimibles = (sessions ?? [])
    .filter((s) => s?.publicada === true)
    .map((s) => ({
      id: s.id,
      slug: s.slug ?? null,
      titolSessio: s.titol ?? null,
      data: s.data ?? null,
      hora: s.hora ?? null,
      titol: s.publica?.titol ?? null,
      titolTraduit: s.publica?.titolTraduit ?? null,
      versioTipus: s.publica?.versioTipus ?? null,
      idioma: s.publica?.idioma ?? null,
      generes: s.publica?.generes ?? null,
      cartell: s.publica?.cartell ?? null,
    }));
  return crypto.createHash('sha256').update(estable({ nom: flyer?.nom ?? null, sessions: imprimibles })).digest('hex');
}

// `false` si el flyer s'esborra o si només han canviat `pdfs` / `actualitzatEl` (el que escrivim nosaltres: evita el bucle).
function calGenerar(abans, despres) {
  if (!despres) return false;
  const sensePdfs = ({ pdfs, actualitzatEl, ...resta }) => estable(resta); // eslint-disable-line no-unused-vars
  return !abans || sensePdfs(abans) !== sensePdfs(despres);
}

function urlImpressio({ urlBase, id, variant, clau, ara }) {
  const params = new URLSearchParams({ variant, clau: clau ?? '', t: String(ara) });
  return `${urlBase}/flyer/${encodeURIComponent(id)}/imprimir/?${params}`;
}

const MAX_INTENTS = 3;

async function llegir(db, id) {
  const snap = await db.collection('flyers').doc(id).get();
  if (!snap.exists) return null;
  const flyer = snap.data();
  const sessions = [];
  for (const sessionId of flyer.sessionsIds ?? []) {
    const s = await db.collection('sessions').doc(sessionId).get();
    if (s.exists) sessions.push({ id: sessionId, ...s.data() });
  }
  return { flyer, firma: firmaFlyer(flyer, sessions) };
}

// Llegeix el flyer i les seves sessions i, si la signatura no coincideix amb la dels PDF desats, els torna a generar.
// Després de renderitzar torna a llegir: si les dades han canviat durant el render (el PDF ja és vell) renderitza de nou
// (fins a MAX_INTENTS) i només desa i escriu `pdfs` quan la signatura del render és la vigent. Un error de render es
// rellança SENSE el missatge original: el de puppeteer porta la URL, i la URL porta la `clauPrevia`. No es registra mai.
async function regenerarFlyer({
  id, db, bucket, renderPdf, logger, urlBase = URL_BASE_PER_DEFECTE, ara = () => Date.now(),
}) {
  for (let intent = 0; intent < MAX_INTENTS; intent += 1) {
    const lectura = await llegir(db, id);
    if (!lectura) return null;
    const { flyer, firma } = lectura;
    if (VARIANTS.every((v) => flyer.pdfs?.[v]?.firma === firma)) return null;

    const rendits = {};
    for (const variant of VARIANTS) {
      const url = urlImpressio({ urlBase, id, variant, clau: flyer.clauPrevia, ara: ara() });
      try {
        rendits[variant] = await renderPdf(url);
      } catch {
        throw new Error(`render ${variant} fallit`);
      }
    }

    const actual = await llegir(db, id);
    if (!actual) return null;
    if (actual.firma !== firma) continue;

    const pdfs = {};
    for (const variant of VARIANTS) {
      const path = camiPdf(id, variant);
      await bucket.file(path).save(rendits[variant], { contentType: 'application/pdf', resumable: false });
      pdfs[variant] = { path, firma, generatEl: new Date(ara()).toISOString() };
    }
    await db.collection('flyers').doc(id).update({ pdfs });
    logger.info('flyer: PDF generats', { id });
    return pdfs;
  }
  logger.warn('flyer: les dades canvien mentre es genera el PDF; es provarà amb el proper canvi', { id });
  return null;
}

// Gestors dels dos disparadors (index.js només els connecta). `regenerar(id)` és regenerarFlyer ja amb dependències.
async function gestionarFlyerEscrit({ id, abans, despres, regenerar, logger }) {
  if (!calGenerar(abans, despres)) return;
  try {
    await regenerar(id);
  } catch (error) {
    logger.error('flyer: no s\'han pogut generar els PDF', { id, error: error.message });
  }
}

// Només els flyers que contenen la sessió; un que falli no atura els altres.
async function gestionarSessioEscrita({ id, db, regenerar, logger }) {
  const afectats = await db.collection('flyers').where('sessionsIds', 'array-contains', id).get();
  for (const flyer of afectats.docs) {
    try {
      await regenerar(flyer.id);
    } catch (error) {
      logger.error('flyer: no s\'han pogut generar els PDF', { id: flyer.id, error: error.message });
    }
  }
}

// Chromium (Linux) de @sparticuz/chromium + puppeteer-core. Es carreguen aquí dins perquè només es necessiten al desplegament.
async function renderPdf(url) {
  const chromium = require('@sparticuz/chromium').default ?? require('@sparticuz/chromium');
  const puppeteer = require('puppeteer-core');
  const browser = await puppeteer.launch({
    args: await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
    executablePath: await chromium.executablePath(),
    headless: 'shell',
  });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle0' });
    return Buffer.from(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
  } finally {
    await browser.close();
  }
}

module.exports = { firmaFlyer, calGenerar, regenerarFlyer, gestionarFlyerEscrit, gestionarSessioEscrita, renderPdf, urlImpressio, camiPdf, URL_BASE_PER_DEFECTE };
