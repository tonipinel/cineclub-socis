const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { cercarPellicules, detallPellicula, descarregarCartell } = require('./tmdb');
const { gestionarEstat, gestionarVot, gestionarRanking } = require('./votacio-handlers');

initializeApp();

const TMDB_API_KEY = defineSecret('TMDB_API_KEY');
const SECRETS = [TMDB_API_KEY];

const URL_SOLICITUDS = 'https://associacio.cineclubrodadebera.cat/solicituds';
const DESTINATARI = 'cineclub.rodadebera@gmail.com';
const LOGO_URL = 'https://cineclubrodadebera.cat/images/logo.png';

const CAMPS = [
  ['nom', 'Nom'],
  ['cognoms', 'Cognoms'],
  ['dni', 'DNI'],
  ['poblacio', 'Població'],
  ['codiPostal', 'Codi postal'],
  ['telefon', 'Telèfon'],
  ['correuElectronic', 'Correu electrònic'],
  ['comentaris', 'Comentaris'],
];

async function obtenirConfiguracio() {
  const snap = await getFirestore().doc('configuracio/associacio').get();
  const dades = snap.exists ? snap.data() : {};
  return {
    quotaAnual: dades.quotaAnual ?? 30,
    numeroCompte: dades.numeroCompte ?? '',
  };
}

function signatura() {
  return `
    <p style="margin-top:24px;">
      <img src="${LOGO_URL}" alt="Cineclub Roda de Berà" width="80" style="display:block;margin-bottom:8px;">
      <strong>Associació Cineclub Roda de Berà</strong>
    </p>
  `;
}

function missatgeNotificacioAdmin(dades) {
  const files = CAMPS
    .filter(([camp]) => dades[camp])
    .map(([camp, etiqueta]) => `<tr><td><strong>${etiqueta}</strong></td><td>${dades[camp]}</td></tr>`)
    .join('');
  return `
    <p>S'ha rebut una nova sol·licitud d'alta de soci/a.</p>
    <table cellpadding="4">${files}</table>
    <p><a href="${URL_SOLICITUDS}">Veure les sol·licituds pendents</a></p>
  `;
}

function missatgeBenvinguda(dades, config) {
  return `
    <p>Hola ${dades.nom},</p>
    <p>Moltes gràcies per haver omplert el formulari per formar part del Cineclub Roda de Berà. Ens fa molta il·lusió veure l'interès que està generant el projecte.</p>
    <p>T'informem del nostre compte bancari de l'associació per si vols tramitar el pagament de la quota anual (${config.quotaAnual}€): ${config.numeroCompte}.</p>
    <p>Si ho prefereixes, també pots pagar en efectiu o targeta en la propera sessió o algun dimecres en el nostre horari d'oficina a l'Hotel d'Entitats, que és de 15.15 a 16.15 hores (en aquest últim cas, consulta'ns abans perquè algun dimecres potser no hi som).</p>
    <p>Per avançar feina i que no et perdis cap informació mentrestant, t'afegirem al grup de whatsapp de socis i sòcies, allà és on centralitzem tota la informació i on generem les enquestes per triar les properes sessions.</p>
    <p>Gràcies per la confiança i per ajudar-nos a posar en marxa aquest espai de cinema a Roda de Berà.</p>
    <p>Si tens qualsevol dubte, comentari o suggeriment, estem a la teva disposició.</p>
    <p>Salut i cinema!</p>
  `;
}

exports.notificarNovaSolicitud = onDocumentCreated('solicituds/{id}', async (event) => {
  const dades = event.data.data();
  const config = await obtenirConfiguracio();
  const mail = getFirestore().collection('mail');

  await mail.add({
    to: DESTINATARI,
    from: DESTINATARI,
    message: {
      subject: `Nova sol·licitud d'alta: ${dades.nom} ${dades.cognoms}`,
      html: missatgeNotificacioAdmin(dades) + signatura(),
    },
  });

  if (dades.correuElectronic) {
    await mail.add({
      to: dades.correuElectronic,
      from: DESTINATARI,
      message: {
        subject: 'Benvingut/da al Cineclub Roda de Berà',
        html: missatgeBenvinguda(dades, config) + signatura(),
      },
    });
  }
});

// Tota la ficha de la proposta (títol, any, cartell, sinopsi, durada,
// repartiment, director, tràiler, etc.) surt de TMDB. Els títols es deixen
// en versió original; la sinopsi arriba en català si n'hi ha i, si no, en
// castellà o anglès (`sinopsiIdioma`) perquè l'admin la tradueixi a mà. El cartell es descarrega i es desa a
// Storage perquè no depenguem de cap web externa que ens pugui bloquejar la
// imatge.
async function desarFitxa(propostaId, tmdbId) {
  const pellicula = await detallPellicula(tmdbId, TMDB_API_KEY.value());
  const canvis = {
    tmdbId: pellicula.tmdbId,
    titol: pellicula.titol,
    titolLocal: pellicula.titolLocal,
    any: pellicula.any,
    sinopsi: pellicula.sinopsi,
    sinopsiIdioma: pellicula.sinopsiIdioma,
    durada: pellicula.durada,
    directors: pellicula.directors,
    generes: pellicula.generes,
    imatges: pellicula.escenes,
    guionistes: pellicula.guionistes,
    repartiment: pellicula.repartiment,
    lema: pellicula.lema,
    paisos: pellicula.paisos,
    idiomes: pellicula.idiomes,
    valoracio: pellicula.valoracio,
    tmdbUrl: pellicula.tmdbUrl,
  };
  if (pellicula.trailerUrl) canvis.trailerUrl = pellicula.trailerUrl;
  if (pellicula.posterPath) {
    const { contingut, contentType } = await descarregarCartell(pellicula.posterPath);
    const bucket = getStorage().bucket();
    // Ruta nova a cada actualització: el cartell es serveix amb una caché d'un
    // any, així que reutilitzar la ruta faria veure el cartell antic.
    const ruta = `carteils/${propostaId}-${Date.now()}.jpg`;
    await bucket.file(ruta).save(contingut, { contentType, metadata: { cacheControl: 'public, max-age=31536000' } });
    canvis.cartellPath = ruta;
    canvis.imatgeUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(ruta)}?alt=media`;
  }
  const referencia = getFirestore().doc(`propostes/${propostaId}`);
  // Si l'admin ja ha revisat/traduït la sinopsi d'aquesta mateixa pel·lícula
  // (la desa amb sinopsiIdioma 'ca'), no la tornem a trepitjar.
  const actual = (await referencia.get()).data();
  if (actual.tmdbId === pellicula.tmdbId && actual.sinopsi && actual.sinopsiIdioma === 'ca') {
    delete canvis.sinopsi;
    delete canvis.sinopsiIdioma;
  }
  await referencia.update(canvis);
  if (canvis.cartellPath) {
    // El cartell anterior ja no es fa servir (inclòs el de la ruta antiga, sense marca de temps).
    const bucket = getStorage().bucket();
    const anteriors = [actual.cartellPath, `carteils/${propostaId}.jpg`].filter((ruta) => ruta && ruta !== canvis.cartellPath);
    await Promise.all(anteriors.map((ruta) => bucket.file(ruta).delete({ ignoreNotFound: true }).catch(() => {})));
  }
  return { ...canvis, sinopsi: canvis.sinopsi ?? actual.sinopsi, sinopsiIdioma: canvis.sinopsiIdioma ?? actual.sinopsiIdioma };
}

exports.desarFitxaNovaProposta = onDocumentCreated(
  { document: 'propostes/{id}', secrets: SECRETS },
  async (event) => {
    const dades = event.data.data();
    if (!dades.tmdbId) return;
    try {
      await desarFitxa(event.params.id, dades.tmdbId);
    } catch (error) {
      logger.error('No s\'ha pogut desar la fitxa de la proposta', event.params.id, error);
    }
  }
);

// La clau de TMDB no pot sortir del servidor, així que el cercador del
// formulari passa per aquí. S'hi pot accedir amb el token del carnet d'un
// soci (formulari públic) o com a admin.
exports.cercarPellicules = onCall({ secrets: SECRETS }, async (request) => {
  const consulta = String(request.data?.consulta ?? '').trim();
  if (consulta.length < 2) return [];
  const esAdmin = request.auth?.token?.role === 'admin';
  if (!esAdmin) {
    const token = request.data?.token;
    const soci = token ? await getFirestore().doc(`socisPublic/${token}`).get() : null;
    if (!soci?.exists) throw new HttpsError('permission-denied', 'Identifica\'t amb el carnet per cercar pel·lícules.');
  }
  return cercarPellicules(consulta, TMDB_API_KEY.value());
});

// L'admin tria a mà la pel·lícula d'una proposta ja existent (p. ex. les
// anteriors al cercador): se'n torna a agafar tota la fitxa de TMDB.
exports.assignarPellicula = onCall({ secrets: SECRETS }, async (request) => {
  if (request.auth?.token?.role !== 'admin') throw new HttpsError('permission-denied', 'Només l\'admin.');
  const { propostaId, tmdbId } = request.data ?? {};
  if (!propostaId || !tmdbId) throw new HttpsError('invalid-argument', 'Falten dades.');
  return desarFitxa(propostaId, tmdbId);
});

function votacio(gestor) {
  return onCall(async (request) => {
    try {
      return await gestor(getFirestore(), request.data ?? {}, new Date());
    } catch (error) {
      if (error.codi) throw new HttpsError(error.codi, error.message);
      throw error;
    }
  });
}

exports.estatVotacio = votacio(gestionarEstat);
exports.votarProposta = votacio(gestionarVot);
exports.rankingTanda = votacio(gestionarRanking);
