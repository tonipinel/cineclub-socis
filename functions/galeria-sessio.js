// Galeria d'una sessió programada des d'una proposta: les escenes de TMDB que ja té la proposta (`imatges`, paths
// com "/abc.jpg") es baixen de image.tmdb.org i es desen a Storage, i les URL van a `publica.galeria`. Ho fan la
// callable `importarGaleriaSessio` (en programar la sessió) i scripts/importa-galeria-proposta.mjs (les antigues).
// Camí: `web/sessions/<id de la sessió>/gallery-N-<nom del fitxer de TMDB>.<jpg|png>`. És l'id i no l'slug perquè una
// sessió acabada de programar encara no en té i l'slug pot canviar; N és la posició del path a la proposta i el nom de
// TMDB fa que un contingut diferent no reutilitzi mai un camí (es serveix amb una caché d'un any). El camí i la URL es
// saben abans de baixar res (el script ho registra per poder-ho desfer). Mai se sobreescriu una galeria que ja tingui
// res, i reexecutar-ho amb la galeria plena no fa res.
const URL_IMATGES = 'https://image.tmdb.org/t/p/w1280';
const PATH_TMDB = /^\/[A-Za-z0-9_-]+\.(jpg|jpeg|png)$/;
const ID_SESSIO = /^[A-Za-z0-9_-]{1,128}$/;
const MAXIM_IMATGES = 5;
const MAXIM_BYTES = 5 * 1024 * 1024;
const TEMPS_MAXIM_MS = 15_000;
const CACHE = 'public, max-age=31536000';
const NOMES_ADMIN = 'Només l\'admin pot importar les imatges.';

const error = (codi, missatge) => Object.assign(new Error(missatge), { codi });
const esPathValid = (path) => typeof path === 'string' && PATH_TMDB.test(path);
const extensio = (path) => (path.endsWith('.png') ? 'png' : 'jpg');
const tipusDe = (ext) => (ext === 'png' ? 'image/png' : 'image/jpeg');
const nomBase = (path) => path.slice(1, path.lastIndexOf('.'));
const MAGICS = { 'image/jpeg': [0xff, 0xd8, 0xff], 'image/png': [0x89, 0x50, 0x4e, 0x47] };
const ambMagic = (contingut, tipus) => MAGICS[tipus].every((byte, i) => contingut[i] === byte);
const urlStorage = (bucket, cami) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(cami)}?alt=media`;
// Com `llistaDe` de la web i de l'admin: un text sol també és una galeria (d'un element).
const buit = (v) => v == null || v === '' || Number.isNaN(v) || (Array.isArray(v) && v.length === 0);
const galeriaDe = (sessio) => {
  const valor = sessio?.publica?.galeria;
  if (Array.isArray(valor)) return valor;
  return buit(valor) ? [] : [valor];
};

const dataMadrid = (instant) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instant).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
};

// Els paths vàlids (sense repetir, fins a 5) amb el camí i la URL de Storage que tindran. `rebutjats`: els invàlids.
function planificarGaleria(sessioId, imatges, bucket) {
  const llista = Array.isArray(imatges) ? imatges : [];
  const valids = [...new Set(llista.filter(esPathValid))].slice(0, MAXIM_IMATGES);
  return {
    rebutjats: llista.filter((p) => !esPathValid(p)).length,
    imatges: valids.map((path, i) => {
      const cami = `web/sessions/${sessioId}/gallery-${i + 1}-${nomBase(path)}.${extensio(path)}`;
      return { path, cami, url: urlStorage(bucket, cami) };
    }),
  };
}

// Llegeix el cos per trossos i s'atura en passar del límit (sense `content-length` no se'n sabria la mida).
async function llegirAmbLimit(resposta, maxBytes) {
  if (!resposta.body) throw new Error('Resposta sense cos.');
  const trossos = [];
  let total = 0;
  for await (const tros of resposta.body) {
    total += tros.length;
    if (total > maxBytes) {
      await resposta.body.cancel?.().catch(() => {});
      throw new Error('Imatge massa gran.');
    }
    trossos.push(Buffer.from(tros));
  }
  return Buffer.concat(trossos);
}

// L'URL només es fa amb l'origen fix i un path validat; sense redireccions, amb temps i mida màxims, i el tipus
// (capçalera i bytes inicials) ha de coincidir amb l'extensió.
async function descarregarImatgeTmdb(path, fetchFn = fetch) {
  if (!esPathValid(path)) throw new Error('Path de TMDB no vàlid.');
  const resposta = await fetchFn(`${URL_IMATGES}${path}`, { redirect: 'error', signal: AbortSignal.timeout(TEMPS_MAXIM_MS) });
  if (!resposta.ok) throw new Error(`TMDB ha respost ${resposta.status}`);
  const tipus = (resposta.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (tipus !== tipusDe(extensio(path))) throw new Error(`Tipus inesperat: ${tipus || '(cap)'}`);
  if (Number(resposta.headers.get('content-length')) > MAXIM_BYTES) throw new Error('Imatge massa gran.');
  const contingut = await llegirAmbLimit(resposta, MAXIM_BYTES);
  if (!ambMagic(contingut, tipus)) throw new Error('El contingut no és una imatge del tipus esperat.');
  return { contingut, contentType: tipus };
}

// Com `comprovarAdmin` de usuaris.js: el rol del token i el del compte actual (el token pot ser antic).
async function comprovarAdmin(auth, tokenAuth) {
  if (!tokenAuth?.uid) throw error('unauthenticated', 'Cal iniciar la sessió.');
  if (tokenAuth.token?.role !== 'admin') throw error('permission-denied', NOMES_ADMIN);
  const actual = await auth.getUser(tokenAuth.uid).catch(() => null);
  if (!actual || actual.disabled || actual.customClaims?.role !== 'admin') throw error('permission-denied', NOMES_ADMIN);
}

// Torna `{ estat, galeria, fallades, fitxers }`; `estat`: 'importada', 'ja-tenia', 'sense-imatges' o 'error' (cap
// imatge baixada). `fallades` compta els paths invàlids i les baixades o pujades que han fallat: amb alguna d'aquestes
// es desen les que sí que han anat bé. `fitxers`: els camins de Storage escrits i referenciats per la galeria;
// `actualitzatEl`: el que s'ha escrit (el script el registra per poder-ho desfer).
async function importarGaleria({ db, bucket, fetchFn = fetch, ara = () => Date.now(), log = () => {} }, sessioId) {
  if (typeof sessioId !== 'string' || !ID_SESSIO.test(sessioId)) throw error('invalid-argument', 'Sessió no vàlida.');
  const ref = db.collection('sessions').doc(sessioId);
  const snap = await ref.get();
  if (!snap.exists) throw error('not-found', 'La sessió no existeix.');
  const sessio = snap.data();
  const res = (estat, extra = {}) => ({ estat, galeria: [], fallades: 0, fitxers: [], ...extra });
  if (galeriaDe(sessio).length > 0) return res('ja-tenia', { galeria: galeriaDe(sessio) });
  if (typeof sessio.propostaId !== 'string' || !sessio.propostaId) return res('sense-imatges');
  const proposta = await db.collection('propostes').doc(sessio.propostaId).get();
  const pla = planificarGaleria(sessioId, proposta.exists ? proposta.data().imatges : [], bucket.name);
  if (pla.imatges.length === 0) return res('sense-imatges', { fallades: pla.rebutjats });

  const resultats = await Promise.allSettled(pla.imatges.map(async ({ path, cami }) => {
    const { contingut, contentType } = await descarregarImatgeTmdb(path, fetchFn);
    await bucket.file(cami).save(contingut, { contentType, resumable: false, metadata: { cacheControl: CACHE } });
  }));
  resultats.forEach((r, i) => { if (r.status === 'rejected') log(`No s'ha pogut importar ${pla.imatges[i].path}: ${r.reason?.message}`); });
  const desades = pla.imatges.filter((_, i) => resultats[i].status === 'fulfilled');
  const fallades = pla.rebutjats + pla.imatges.length - desades.length;
  if (desades.length === 0) return res('error', { fallades });

  const urls = desades.map((d) => d.url);
  const actualitzatEl = dataMadrid(ara());
  const escrit = await db.runTransaction(async (tx) => {
    const actual = await tx.get(ref);
    if (!actual.exists) return { existeix: false };
    if (galeriaDe(actual.data()).length > 0) return { existeix: true, galeria: galeriaDe(actual.data()) };
    // Com `prepararDesat` de l'admin: un canvi real de la fitxa pública mou `actualitzatEl` (el `lastmod` del sitemap).
    tx.update(ref, { 'publica.galeria': urls, 'publica.actualitzatEl': actualitzatEl });
    return { existeix: true, galeria: null };
  });
  if (escrit.existeix && !escrit.galeria) {
    return res('importada', { galeria: urls, fallades, fitxers: desades.map((d) => d.cami), actualitzatEl });
  }

  // Mentrestant l'han esborrada o algú ha posat una galeria: es treuen els fitxers nous que no hi siguin.
  const sobrers = desades.filter((d) => !escrit.galeria?.includes(d.url));
  await Promise.all(sobrers.map((d) => bucket.file(d.cami).delete({ ignoreNotFound: true }).catch(() => {})));
  if (!escrit.existeix) throw error('not-found', 'La sessió no existeix.');
  return res('ja-tenia', { galeria: escrit.galeria });
}

async function importarGaleriaSessio(deps, request) {
  await comprovarAdmin(deps.auth, request.auth);
  return importarGaleria(deps, request.data?.sessioId);
}

module.exports = {
  galeriaDe, MAXIM_IMATGES, MAXIM_BYTES, esPathValid, planificarGaleria, descarregarImatgeTmdb, importarGaleria, importarGaleriaSessio,
};
