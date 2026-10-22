const { isDeepStrictEqual } = require('node:util');
const {
  sessionsPubliques, esdevenimentDesDeSessio, calcularCanvis, aplicarCanvis, finestra, quan,
} = require('./calendari');

const MAX_ELEMENTS = 200;

function error(codi, missatge) {
  return Object.assign(new Error(missatge), { codi });
}

// Mai es registra l'objecte d'error sencer: el del client de Google porta la petició (amb el token d'accés).
const detallError = (e) => ({ missatge: e?.message, codi: e?.code ?? e?.status });

function esdevenimentDe(id, dades, opcions) {
  const [sessio] = dades ? sessionsPubliques([{ ...dades, id }]) : [];
  return sessio ? { sessio, esdeveniment: esdevenimentDesDeSessio(sessio, opcions) } : null;
}

const resum = ({ crear, actualitzar, esborrar }) => ({
  crear: crear.length, actualitzar: actualitzar.length, esborrar: esborrar.length,
});

// Disparador de `sessions/{id}`. `abans`/`despres` només decideixen si cal fer res i aporten l'iCalUID antic;
// l'estat desitjat surt del document ACTUAL (els disparadors poden arribar desordenats o repetits).
// `obtenirCalendari()` retorna `{ cercar, crear, actualitzar, esborrar }`. No llança mai (sense reintents).
async function sincronitzarSessio({ id, abans, despres, db, obtenirCalendari, logger, opcions, ara = new Date() }) {
  try {
    const vell = esdevenimentDe(id, abans, opcions);
    const nou = esdevenimentDe(id, despres, opcions);
    if (isDeepStrictEqual(vell?.esdeveniment ?? null, nou?.esdeveniment ?? null)) return null;
    const snap = await db.doc(`sessions/${id}`).get();
    const actual = esdevenimentDe(id, snap.exists ? snap.data() : null, opcions);
    const calendari = obtenirCalendari();
    const iCalUIDs = [...new Set([vell, nou, actual].filter(Boolean).map((x) => x.esdeveniment.iCalUID))];
    const candidats = (await calendari.cercar({ sessioId: id, iCalUIDs, finestra: finestra(ara) }))
      .filter((e) => [id, undefined].includes(e.extendedProperties?.private?.cineclubSessioId));
    const canvis = calcularCanvis(actual ? [actual.sessio] : [], candidats, opcions);
    await aplicarCanvis(calendari, canvis);
    logger.info('Calendari sincronitzat amb la sessió', { sessioId: id, ...resum(canvis) });
    return resum(canvis);
  } catch (e) {
    logger.error('No s\'ha pogut sincronitzar el calendari amb la sessió', { sessioId: id, ...detallError(e) });
    return null;
  }
}

const text = (ev) => `${ev.summary ?? '(sense títol)'} (${quan(ev)})`;
const llista = (items) => items.slice(0, MAX_ELEMENTS).map(text);

// Callable de l'admin: informe (per defecte) o aplicació de la sincronització completa, dins `finestra`.
// Una sessió amb dades que no es poden convertir s'omet (i els seus esdeveniments no es toquen).
async function sincronitzarTot({ db, obtenirCalendari, auth, dades, logger, opcions, ara = new Date() }) {
  if (auth?.token?.role !== 'admin') throw error('permission-denied', 'Només l\'admin.');
  const aplicar = dades?.aplicar === true;
  const { timeMin, timeMax } = finestra(ara);
  try {
    const calendari = obtenirCalendari();
    const snap = await db.collection('sessions').get();
    const sessions = [];
    const omeses = [];
    for (const s of sessionsPubliques(snap.docs.map((d) => ({ id: d.id, ...d.data() })))) {
      let inici;
      try {
        inici = esdevenimentDesDeSessio(s, opcions).start.dateTime;
      } catch (e) {
        logger.warn('Sessió omesa de la sincronització del calendari', { sessioId: s.id, missatge: e.message });
        omeses.push(s.id);
        continue;
      }
      if (inici >= timeMin && inici < timeMax) sessions.push(s);
    }
    const existents = (await calendari.llistar({ timeMin, timeMax }))
      .filter((e) => !omeses.includes(e.extendedProperties?.private?.cineclubSessioId));
    const canvis = calcularCanvis(sessions, existents, opcions);
    if (aplicar) await aplicarCanvis(calendari, canvis);
    return {
      aplicat: aplicar,
      crear: llista(canvis.crear.map((c) => c.esdeveniment)),
      actualitzar: llista(canvis.actualitzar.map((c) => c.esdeveniment)),
      esborrar: llista(canvis.esborrar),
      placeholdersConservats: llista(canvis.placeholders),
      noGestionats: canvis.ignorats.length,
      sessionsOmeses: omeses.slice(0, MAX_ELEMENTS),
      totals: { ...resum(canvis), iguals: canvis.iguals, placeholdersConservats: canvis.placeholders.length },
    };
  } catch (e) {
    logger.error('No s\'ha pogut sincronitzar el calendari', detallError(e));
    throw error('internal', 'No s\'ha pogut sincronitzar el calendari.');
  }
}

module.exports = { sincronitzarSessio, sincronitzarTot, MAX_ELEMENTS };
