const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { cercarPellicules, detallPellicula, descarregarCartell } = require('./tmdb');
const { gestionarEstat, gestionarVot, gestionarRanking, gestionarRankingPublic } = require('./votacio-handlers');
const { credencialsCalendari } = require('./calendari');
const { clientCalendari } = require('./calendari-google');
const { sincronitzarSessio, sincronitzarTot } = require('./calendari-handlers');
const { desarFitxaAmbDependencies } = require('./fitxa-proposta');
const { gestionarNovaSolicitud } = require('./solicituds');

initializeApp();

const TMDB_API_KEY = defineSecret('TMDB_API_KEY');
const SECRETS = [TMDB_API_KEY];
const GOOGLE_CALENDAR_SERVICE_ACCOUNT_KEY = defineSecret('GOOGLE_CALENDAR_SERVICE_ACCOUNT_KEY');
const GOOGLE_CALENDAR_ID = defineSecret('GOOGLE_CALENDAR_ID');
const SECRETS_CALENDARI = [GOOGLE_CALENDAR_SERVICE_ACCOUNT_KEY, GOOGLE_CALENDAR_ID];

async function obtenirConfiguracio() {
  const snap = await getFirestore().doc('configuracio/associacio').get();
  const dades = snap.exists ? snap.data() : {};
  return {
    quotaAnual: dades.quotaAnual ?? 30,
    numeroCompte: dades.numeroCompte ?? '',
  };
}

// La lògica (escapar, a qui s'envia la benvinguda, límits) és a `solicituds.js`.
exports.notificarNovaSolicitud = onDocumentCreated('solicituds/{id}', async (event) => {
  const db = getFirestore();
  const solicituds = db.collection('solicituds');
  await gestionarNovaSolicitud({
    obtenirConfiguracio,
    mail: db.collection('mail'),
    comptarDesDe: async (data) => (await solicituds.where('timestamp', '>=', data).count().get()).data().count,
    solicitudsAmbCorreu: async (variants) => (await solicituds.where('correuElectronic', 'in', variants).get())
      .docs.map((doc) => ({ id: doc.id, ms: doc.get('timestamp')?.toMillis?.() ?? null })),
    avisar: (missatge, dades) => logger.warn(missatge, dades),
  }, event.params.id, event.data.data(), Date.now());
});

// La lògica (camps editats a mà, cartell a Storage) és a `fitxa-proposta.js`; aquí només s'hi injecten les
// dependències reals.
function desarFitxa(propostaId, tmdbId, opcions) {
  return desarFitxaAmbDependencies({
    db: getFirestore(),
    bucket: getStorage().bucket(),
    detallPellicula: (id) => detallPellicula(id, TMDB_API_KEY.value()),
    descarregarCartell,
    FieldValue,
    ara: () => Date.now(),
  }, propostaId, tmdbId, opcions);
}

exports.desarFitxaNovaProposta = onDocumentCreated(
  { document: 'propostes/{id}', secrets: SECRETS },
  async (event) => {
    const dades = event.data.data();
    if (!dades.tmdbId) return;
    try {
      // Les propostes es poden crear sense autenticar-se, així que en crear-les no es respecta cap camp
      // marcat com a editat: s'agafa tota la fitxa de TMDB i es buida `campsEditats` si n'hi hagués.
      await desarFitxa(event.params.id, dades.tmdbId, { sobreescriure: true });
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
// anteriors al cercador): se'n torna a agafar la fitxa de TMDB, respectant els camps editats a mà
// tret que demani `sobreescriure`.
exports.assignarPellicula = onCall({ secrets: SECRETS }, async (request) => {
  if (request.auth?.token?.role !== 'admin') throw new HttpsError('permission-denied', 'Només l\'admin.');
  const { propostaId, tmdbId, sobreescriure } = request.data ?? {};
  if (!propostaId || !tmdbId) throw new HttpsError('invalid-argument', 'Falten dades.');
  try {
    return await desarFitxa(propostaId, tmdbId, { sobreescriure: sobreescriure === true });
  } catch (error) {
    if (error.codi === 'not-found') throw new HttpsError('not-found', error.message);
    throw error;
  }
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
exports.rankingPublic = votacio(gestionarRankingPublic);

let calendari;
const obtenirCalendari = () => (calendari ??= clientCalendari(credencialsCalendari({
  GOOGLE_CALENDAR_SERVICE_ACCOUNT_KEY: GOOGLE_CALENDAR_SERVICE_ACCOUNT_KEY.value(),
  GOOGLE_CALENDAR_ID: GOOGLE_CALENDAR_ID.value(),
})));

// Manté el Google Calendar del club al dia amb cada sessió publicada. No escriu mai a `sessions`.
exports.sincronitzarCalendari = onDocumentWritten(
  { document: 'sessions/{id}', secrets: SECRETS_CALENDARI, retry: false, timeoutSeconds: 60 },
  (event) => sincronitzarSessio({
    id: event.params.id,
    abans: event.data?.before?.exists ? event.data.before.data() : null,
    despres: event.data?.after?.exists ? event.data.after.data() : null,
    db: getFirestore(),
    obtenirCalendari,
    logger,
  })
);

// Sincronització completa (adoptar els de Hugo, reparar desajustos). Per defecte és un informe.
exports.sincronitzarCalendariTot = onCall({ secrets: SECRETS_CALENDARI, timeoutSeconds: 300 }, async (request) => {
  try {
    return await sincronitzarTot({
      db: getFirestore(), obtenirCalendari, auth: request.auth, dades: request.data, logger,
    });
  } catch (error) {
    if (error.codi) throw new HttpsError(error.codi, error.message);
    throw error;
  }
});
