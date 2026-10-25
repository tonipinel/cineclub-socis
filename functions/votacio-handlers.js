const { propostesEfectives, estaTancada, aplicarVot, estaCompleta, calcularRanking } = require('./votacio');

function error(codi, missatge) {
  return Object.assign(new Error(missatge), { codi });
}

const esIdValid = (valor) =>
  typeof valor === 'string' && valor !== '' && !valor.includes('/') && valor !== '.' && valor !== '..' && !/^__.*__$/.test(valor);
const aData = (valor) => (typeof valor?.toDate === 'function' ? valor.toDate() : valor);
const aMs = (valor) => aData(valor)?.getTime() ?? 0;

async function numeroSociDelToken(db, token) {
  const soci = esIdValid(token) ? await db.doc(`socisPublic/${token}`).get() : null;
  const numeroSoci = soci?.exists ? soci.data().numeroSoci : null;
  if (numeroSoci == null) throw error('permission-denied', 'Identifica\'t amb el carnet.');
  return numeroSoci;
}

async function carregarTanda(db, tandaId) {
  if (!esIdValid(tandaId)) throw error('invalid-argument', 'Tanda no vàlida.');
  const snap = await db.doc(`tandes/${tandaId}`).get();
  if (!snap.exists) throw error('not-found', 'La tanda no existeix.');
  return { id: tandaId, ...snap.data() };
}

async function carregarEfectives(db, tanda) {
  const propostesPerId = {};
  await Promise.all(
    tanda.propostes.map(async (id) => {
      const snap = await db.doc(`propostes/${id}`).get();
      if (snap.exists) propostesPerId[id] = snap.data();
    })
  );
  return propostesEfectives(tanda, propostesPerId);
}

async function carregarVot(db, tandaId, numeroSoci) {
  const snap = await db.doc(`tandes/${tandaId}/vots/${String(numeroSoci)}`).get();
  return snap.exists ? snap.data() : null;
}

async function trobarTanda(db, ara) {
  const obertes = await db.collection('tandes').where('tanca', '>', ara).get();
  if (!obertes.empty) {
    const doc = obertes.docs.reduce((a, b) => (aMs(b.data().creada) > aMs(a.data().creada) ? b : a));
    return { id: doc.id, ...doc.data() };
  }
  const tancades = await db.collection('tandes').orderBy('tanca', 'desc').limit(1).get();
  return tancades.empty ? null : { id: tancades.docs[0].id, ...tancades.docs[0].data() };
}

async function gestionarEstat(db, dades, ara) {
  const numeroSoci = await numeroSociDelToken(db, dades.token);
  const tanda = await trobarTanda(db, ara);
  if (!tanda) return { tanda: null };
  const efectives = await carregarEfectives(db, tanda);
  const vot = await carregarVot(db, tanda.id, numeroSoci);
  const valors = Object.fromEntries(efectives.filter((id) => vot?.valors?.[id]).map((id) => [id, vot.valors[id]]));
  return {
    tanda: {
      id: tanda.id,
      nom: tanda.nom,
      tanca: aData(tanda.tanca).toISOString(),
      tancada: estaTancada(tanda, ara),
      propostes: efectives,
    },
    valors,
    bloquejat: vot?.bloquejat ?? false,
    completa: estaCompleta(valors, efectives),
  };
}

async function gestionarVot(db, dades, ara) {
  const numeroSoci = await numeroSociDelToken(db, dades.token);
  const tanda = await carregarTanda(db, dades.tandaId);
  const efectives = await carregarEfectives(db, tanda);
  const tancada = estaTancada(tanda, ara);
  const referencia = db.doc(`tandes/${tanda.id}/vots/${String(numeroSoci)}`);
  return db.runTransaction(async (t) => {
    const snap = await t.get(referencia);
    const vot = snap.exists ? snap.data() : null;
    const nou = aplicarVot(vot, dades.propostaId, dades.valor, efectives, { tancada });
    t.set(
      referencia,
      {
        valors: { [dades.propostaId]: dades.valor },
        ...(vot ? {} : { bloquejat: false }),
        actualitzat: ara,
      },
      { merge: true }
    );
    return {
      votats: efectives.filter((id) => nou.valors[id]).length,
      total: efectives.length,
      completa: estaCompleta(nou.valors, efectives),
    };
  });
}

async function gestionarRanking(db, dades, ara) {
  const numeroSoci = await numeroSociDelToken(db, dades.token);
  const tanda = await carregarTanda(db, dades.tandaId);
  const efectives = await carregarEfectives(db, tanda);
  const tancada = estaTancada(tanda, ara);
  if (!tancada) {
    const referencia = db.doc(`tandes/${tanda.id}/vots/${String(numeroSoci)}`);
    await db.runTransaction(async (t) => {
      const snap = await t.get(referencia);
      const vot = snap.exists ? snap.data() : null;
      if (!estaCompleta(vot?.valors ?? {}, efectives)) {
        throw error('permission-denied', 'Cal votar totes les propostes per veure el rànquing.');
      }
      if (!vot?.bloquejat) {
        t.set(referencia, { bloquejat: true, ...(vot ? {} : { valors: {}, actualitzat: ara }) }, { merge: true });
      }
    });
  }
  const vots = await db.collection(`tandes/${tanda.id}/vots`).get();
  return { tancada, files: calcularRanking(vots.docs.map((doc) => doc.data()), efectives) };
}

// Públic (sense token): només les tandes tancades, i només propostaId i percentatge.
async function gestionarRankingPublic(db, dades, ara) {
  const tanda = await carregarTanda(db, dades.tandaId);
  if (!estaTancada(tanda, ara)) throw error('failed-precondition', 'La tanda encara està oberta.');
  const efectives = await carregarEfectives(db, tanda);
  const vots = await db.collection(`tandes/${tanda.id}/vots`).get();
  const files = calcularRanking(vots.docs.map((doc) => doc.data()), efectives);
  return { files: files.map(({ propostaId, percentatge }) => ({ propostaId, percentatge })) };
}

// Memòria per instància del rànquing públic: una tanda tancada ja no canvia, així que no cal tornar a llegir
// tots els vots a cada crida anònima. Només es desen les respostes bones (una tanda oberta continua donant
// error), caduquen als `duradaMs` segons l'`ara` de cada crida i, si n'hi ha `maxim`, surt la més antiga.
function ambMemoria(gestor, { duradaMs = 10 * 60 * 1000, maxim = 100 } = {}) {
  const memoria = new Map();
  return async (db, dades, ara) => {
    const desat = memoria.get(dades.tandaId);
    if (desat && ara.getTime() < desat.fins) return desat.resultat;
    const resultat = await gestor(db, dades, ara);
    memoria.delete(dades.tandaId);
    if (memoria.size >= maxim) memoria.delete(memoria.keys().next().value);
    memoria.set(dades.tandaId, { resultat, fins: ara.getTime() + duradaMs });
    return resultat;
  };
}

module.exports = { gestionarEstat, gestionarVot, gestionarRanking, gestionarRankingPublic, ambMemoria };
