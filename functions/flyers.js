// PDF dels flyers (`flyers/{id}`). El flyer SEGUEIX els canvis de les seves sessions: es regeneren quan canvia el flyer
// o qualsevol sessió que conté. La ruta d'impressió de la web (`/flyer/<id>/imprimir/`) dona la pàgina; Chromium la
// converteix en PDF i es desa a Storage. `pdfs.<variant>.firma` fa la regeneració idempotent.
const crypto = require('node:crypto');

const VARIANTS = ['simple', 'impremta'];
const URL_BASE_PER_DEFECTE = 'https://cineclubrodadebera.cat';
// Fora de `web/`: les regles de Storage no tenen cap regla per a `flyers/**` (denegat per defecte) i només hi accedeixen
// la funció (Admin SDK). La web llegeix els PDF per la URL amb token de `pdfs.<variant>.url` (el compte de servei de la web
// no té `storage.objects.get`). Sota `web/` serien de lectura pública (l'id del flyer és públic).
const camiPdf = (id, variant) => `flyers/${id}/flyer-${variant}.pdf`;

// Versió del disseny imprès: puja-la quan canviï el layout d'impressió, el CSS o `web/src/data/flyer.json`, perquè els
// PDF existents es regenerin en el proper disparador (la signatura no mira cap d'aquests fitxers).
// La v2 afegeix el token de descàrrega (`pdfs.<variant>.url`).
const VERSIO_DISSENY = 2;

// URL de descàrrega amb token: secreta, només al document admin del flyer; no es registra ni es posa en errors.
const urlDescarrega = (nomBucket, path, token) => `https://firebasestorage.googleapis.com/v0/b/${nomBucket}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;

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
function firmaFlyer(flyer, sessions, versio = VERSIO_DISSENY) {
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
  return crypto.createHash('sha256').update(estable({ versio, nom: flyer?.nom ?? null, sessions: imprimibles })).digest('hex');
}

// `false` si el flyer s'esborra o si només han canviat `pdfs` / `pdfsComprovatEl` / `pdfsError` (el que escrivim nosaltres:
// evita el bucle). Un canvi d'`actualitzatEl` (l'admin l'escriu a cada desat) SÍ dispara: així un desat sense canvis
// imprimibles arriba a escriure `pdfsComprovatEl`. No fa bucle: la funció no toca mai `actualitzatEl`.
function calGenerar(abans, despres) {
  if (!despres) return false;
  const sensePdfs = ({ pdfs, pdfsComprovatEl, pdfsError, actualitzatEl, ...resta }) => estable(resta); // eslint-disable-line no-unused-vars
  return !abans || sensePdfs(abans) !== sensePdfs(despres) || enMillis(abans.actualitzatEl) !== enMillis(despres.actualitzatEl);
}

function urlImpressio({ urlBase, id, variant, clau, ara }) {
  const params = new URLSearchParams({ variant, clau: clau ?? '', t: String(ara) });
  return `${urlBase}/flyer/${encodeURIComponent(id)}/imprimir/?${params}`;
}

const MAX_INTENTS = 3;

const enMillis = (valor) => (typeof valor?.toMillis === 'function' ? valor.toMillis() : valor?.getTime?.());

// Un render fallit es veu a l'admin (`pdfsError`, sense el missatge original: porta la URL i la clau). Si el flyer
// s'ha esborrat mentrestant l'escriptura falla i s'ignora.
async function marcarError({ db, id, ara }) {
  try {
    await db.collection('flyers').doc(id).update({ pdfsError: { data: new Date(ara()), missatge: 'No s\'han pogut generar els PDF' } });
  } catch {
    // flyer esborrat o escriptura fallida: no hi ha res més a fer
  }
}

async function llegir(db, id) {
  const snap = await db.collection('flyers').doc(id).get();
  if (!snap.exists) return null;
  const flyer = snap.data();
  const ids = flyer.sessionsIds ?? [];
  const sessions = [];
  if (ids.length) {
    // `getAll` torna els documents en l'ordre dels refs.
    const docs = await db.getAll(...ids.map((sessionId) => db.collection('sessions').doc(sessionId)));
    docs.forEach((s, i) => { if (s.exists) sessions.push({ id: ids[i], ...s.data() }); });
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
    if (VARIANTS.every((v) => flyer.pdfs?.[v]?.firma === firma && typeof flyer.pdfs[v].url === 'string')) {
      // Cap canvi imprès i amb URL de descàrrega (sense `url` es regenera: auto-reparació) (p. ex. Publicar o canviar només les dates): els PDF ja són vigents. L'admin compara
      // `actualitzatEl` amb l'última generació o comprovació; sense això «S'està actualitzant…» no s'acabaria mai.
      const desat = enMillis(flyer.actualitzatEl);
      const instants = [...VARIANTS.map((v) => enMillis(flyer.pdfs[v].generatEl)), enMillis(flyer.pdfsComprovatEl)];
      const comprovat = Math.max(0, ...instants.filter(Number.isFinite));
      if (desat != null && desat > comprovat) await db.collection('flyers').doc(id).update({ pdfsComprovatEl: new Date(ara()) });
      return null;
    }

    const rendits = {};
    for (const variant of VARIANTS) {
      const url = urlImpressio({ urlBase, id, variant, clau: flyer.clauPrevia, ara: ara() });
      try {
        rendits[variant] = await renderPdf(url);
      } catch {
        await marcarError({ db, id, ara });
        throw new Error(`render ${variant} fallit`);
      }
    }

    const actual = await llegir(db, id);
    if (!actual) return null;
    if (actual.firma !== firma) continue;

    const pdfs = {};
    for (const variant of VARIANTS) {
      const path = camiPdf(id, variant);
      const token = crypto.randomUUID();
      await bucket.file(path).save(rendits[variant], {
        contentType: 'application/pdf',
        resumable: false,
        metadata: { metadata: { firebaseStorageDownloadTokens: token } },
      });
      pdfs[variant] = { path, url: urlDescarrega(bucket.name, path, token), firma, generatEl: new Date(ara()) };
    }
    await db.collection('flyers').doc(id).update({ pdfs, pdfsError: null });
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

module.exports = { firmaFlyer, calGenerar, regenerarFlyer, gestionarFlyerEscrit, gestionarSessioEscrita, renderPdf, urlImpressio, camiPdf, VERSIO_DISSENY, URL_BASE_PER_DEFECTE };
