const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { getAuth } = require('firebase-admin/auth');
const { cercarPellicules, detallPellicula, descarregarCartell, esTmdbIdValid } = require('./tmdb');
const { gestionarEstat, gestionarVot, gestionarRanking, gestionarRankingPublic, ambMemoria, sociDelToken } = require('./votacio-handlers');
const { credencialsCalendari } = require('./calendari');
const { clientCalendari } = require('./calendari-google');
const { sincronitzarSessio, sincronitzarTot } = require('./calendari-handlers');
const { desarFitxaAmbDependencies } = require('./fitxa-proposta');
const { gestionarNovaSolicitud, comptarDelFormulariDesDe } = require('./solicituds');
const { crearPropostaAmbDependencies } = require('./proposta');
const { sincronitzarSociPorta } = require('./socis-porta');
const { activarCarnet } = require('./activacio-carnet');
const usuaris = require('./usuaris');

initializeApp();

const TMDB_API_KEY = defineSecret('TMDB_API_KEY');
const SECRETS = [TMDB_API_KEY];
const GOOGLE_CALENDAR_SERVICE_ACCOUNT_KEY = defineSecret('GOOGLE_CALENDAR_SERVICE_ACCOUNT_KEY');
const GOOGLE_CALENDAR_ID = defineSecret('GOOGLE_CALENDAR_ID');
const SECRETS_CALENDARI = [GOOGLE_CALENDAR_SERVICE_ACCOUNT_KEY, GOOGLE_CALENDAR_ID];

// Límits d'instàncies (per defecte, fins a 100): n'hi ha prou de sobres per al club i limiten el cost d'un abús.
const MAX_CALLABLES = 10;
const MAX_DISPARADORS = 5;

async function obtenirConfiguracio() {
  const snap = await getFirestore().doc('configuracio/associacio').get();
  const dades = snap.exists ? snap.data() : {};
  return {
    quotaAnual: dades.quotaAnual ?? 30,
    numeroCompte: dades.numeroCompte ?? '',
  };
}

// La lògica (escapar, a qui s'envia la benvinguda, límits) és a `solicituds.js`.
exports.notificarNovaSolicitud = onDocumentCreated({ document: 'solicituds/{id}', maxInstances: MAX_DISPARADORS }, async (event) => {
  const db = getFirestore();
  const solicituds = db.collection('solicituds');
  await gestionarNovaSolicitud({
    obtenirConfiguracio,
    mail: db.collection('mail'),
    comptarDesDe: (data) => comptarDelFormulariDesDe(solicituds, data),
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
  { document: 'propostes/{id}', secrets: SECRETS, maxInstances: MAX_DISPARADORS },
  async (event) => {
    const dades = event.data.data();
    if (!esTmdbIdValid(dades.tmdbId)) return;
    try {
      // En crear-la no es respecta cap camp marcat com a editat: s'agafa tota la fitxa de TMDB i es buida
      // `campsEditats` si n'hi hagués.
      await desarFitxa(event.params.id, dades.tmdbId, { sobreescriure: true });
    } catch (error) {
      logger.error('No s\'ha pogut desar la fitxa de la proposta', event.params.id, error);
    }
  }
);

// La clau de TMDB no pot sortir del servidor, així que el cercador del
// formulari passa per aquí. S'hi pot accedir amb el token del carnet d'un
// soci (formulari públic) o com a admin.
exports.cercarPellicules = onCall({ secrets: SECRETS, maxInstances: MAX_CALLABLES }, async (request) => {
  const consulta = String(request.data?.consulta ?? '').trim();
  if (consulta.length < 2) return [];
  const esAdmin = request.auth?.token?.role === 'admin';
  if (!esAdmin) {
    try {
      await sociDelToken(getFirestore(), request.data?.token);
    } catch (error) {
      if (error.codi === 'permission-denied') throw new HttpsError('permission-denied', 'Identifica\'t amb el carnet per cercar pel·lícules.');
      throw error;
    }
  }
  return cercarPellicules(consulta, TMDB_API_KEY.value());
});

// L'admin tria a mà la pel·lícula d'una proposta ja existent (p. ex. les
// anteriors al cercador): se'n torna a agafar la fitxa de TMDB, respectant els camps editats a mà
// tret que demani `sobreescriure`.
exports.assignarPellicula = onCall({ secrets: SECRETS, maxInstances: MAX_CALLABLES }, async (request) => {
  if (request.auth?.token?.role !== 'admin') throw new HttpsError('permission-denied', 'Només l\'admin.');
  const { propostaId, tmdbId, sobreescriure } = request.data ?? {};
  if (!propostaId || !esTmdbIdValid(tmdbId)) throw new HttpsError('invalid-argument', 'Falten dades.');
  try {
    return await desarFitxa(propostaId, tmdbId, { sobreescriure: sobreescriure === true });
  } catch (error) {
    if (error.codi === 'not-found') throw new HttpsError('not-found', error.message);
    throw error;
  }
});

function votacio(gestor) {
  return onCall({ maxInstances: MAX_CALLABLES }, async (request) => {
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
// Sense token i amb una tanda tancada que ja no canvia: es desa uns minuts per no rellegir tots els vots.
exports.rankingPublic = votacio(ambMemoria(gestionarRankingPublic));

// Proposta d'un soci des de la web pública, identificat amb el token del carnet (vegeu `proposta.js`).
exports.crearProposta = votacio((db, dades, ara) =>
  crearPropostaAmbDependencies({ db, marcaTemps: () => FieldValue.serverTimestamp() }, dades, ara));

let calendari;
const obtenirCalendari = () => (calendari ??= clientCalendari(credencialsCalendari({
  GOOGLE_CALENDAR_SERVICE_ACCOUNT_KEY: GOOGLE_CALENDAR_SERVICE_ACCOUNT_KEY.value(),
  GOOGLE_CALENDAR_ID: GOOGLE_CALENDAR_ID.value(),
})));

// Manté el Google Calendar del club al dia amb cada sessió publicada. No escriu mai a `sessions`.
exports.sincronitzarCalendari = onDocumentWritten(
  { document: 'sessions/{id}', secrets: SECRETS_CALENDARI, retry: false, timeoutSeconds: 60, maxInstances: MAX_DISPARADORS },
  (event) => sincronitzarSessio({
    id: event.params.id,
    abans: event.data?.before?.exists ? event.data.before.data() : null,
    despres: event.data?.after?.exists ? event.data.after.data() : null,
    db: getFirestore(),
    obtenirCalendari,
    logger,
  })
);

// Manté `socisPorta/{numeroSoci}` (el que pot llegir la porta) al dia amb cada fitxa de soci. La llista blanca de
// camps i la lògica són a `socis-porta.js`. No escriu mai a `socis`. Amb reintents: el gestor és idempotent i, si
// falla, la porta veuria un estat desfasat (p. ex. un soci que acaba de pagar com a «Vençut»).
exports.sincronitzarSociPorta = onDocumentWritten(
  { document: 'socis/{id}', retry: true, timeoutSeconds: 60, maxInstances: MAX_DISPARADORS },
  (event) => sincronitzarSociPorta({
    id: event.params.id,
    abans: event.data?.before?.exists ? event.data.before.data() : null,
    despres: event.data?.after?.exists ? event.data.after.data() : null,
    db: getFirestore(),
    logger,
  })
);

// Activació del carnet (`inicPeriode`) al primer escaneig d'una alta, també quan escaneja la taquilla, que no pot
// escriure a `socis`. La lògica (mateixa regla que l'admin, data de l'entrada a Europe/Madrid) és a
// `activacio-carnet.js`. Amb reintents: el gestor és idempotent i, si falla, el soci no venceria mai.
exports.activarCarnetEnEscanejar = onDocumentCreated(
  { document: 'accessLog/{id}', retry: true, timeoutSeconds: 60, maxInstances: MAX_DISPARADORS },
  (event) => activarCarnet({
    id: event.params.id,
    entrada: event.data?.data() ?? null,
    creada: event.data?.createTime ?? null,
    db: getFirestore(),
    logger,
  })
);

// Sincronització completa (adoptar els de Hugo, reparar desajustos). Per defecte és un informe.
exports.sincronitzarCalendariTot = onCall({ secrets: SECRETS_CALENDARI, timeoutSeconds: 300, maxInstances: MAX_CALLABLES }, async (request) => {
  try {
    return await sincronitzarTot({
      db: getFirestore(), obtenirCalendari, auth: request.auth, dades: request.data, logger,
    });
  } catch (error) {
    if (error.codi) throw new HttpsError(error.codi, error.message);
    throw error;
  }
});

// Gestió dels usuaris de taquilla des de l'admin. La lògica (permisos, rol, límits, auditoria) és a `usuaris.js`.
function usuarisTaquilla(gestor) {
  return onCall({ maxInstances: MAX_CALLABLES }, (request) => usuaris.executar(gestor, {
    auth: getAuth(), db: getFirestore(), FieldValue, logger, ara: Date.now(),
  }, request, HttpsError));
}

exports.llistarUsuarisTaquilla = usuarisTaquilla(usuaris.llistar);
exports.crearUsuariTaquilla = usuarisTaquilla(usuaris.crear);
exports.editarUsuariTaquilla = usuarisTaquilla(usuaris.editar);
exports.canviarEstatUsuariTaquilla = usuarisTaquilla(usuaris.canviarEstat);
exports.restablirContrasenyaUsuariTaquilla = usuarisTaquilla(usuaris.restablirContrasenya);
exports.eliminarUsuariTaquilla = usuarisTaquilla(usuaris.eliminar);
