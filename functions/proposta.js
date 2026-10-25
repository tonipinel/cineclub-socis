const { sociDelToken } = require('./votacio-handlers');
const { esTmdbIdValid } = require('./tmdb');

// Propostes de la web pública: el soci s'identifica amb el token del carnet i el número de soci i el nom públic
// surten de `socisPublic`, mai del client. Es desa amb l'Admin SDK la mateixa forma de document que escrivia
// abans el client; el trigger `desarFitxaNovaProposta` hi afegeix la fitxa de TMDB.

const MAXIM_TITOL = 200;
const MAXIM_COMENTARI = 1000;
const MAXIM_ENLLAC = 500;
const DIA_MS = 24 * 60 * 60 * 1000;
const LIMIT_PER_SOCI_DIA = 5;
const LIMIT_GLOBAL_DIA = 30;
// Una proposta amb aquests estats bloqueja una altra de la mateixa pel·lícula.
const ESTATS_DUPLICAT = ['pendent', 'aprovada'];

function error(codi, missatge) {
  return Object.assign(new Error(missatge), { codi });
}

const aMs = (valor) => {
  if (typeof valor?.toMillis === 'function') return valor.toMillis();
  if (typeof valor?.toDate === 'function') return valor.toDate().getTime();
  return valor instanceof Date ? valor.getTime() : -Infinity;
};

function textOpcional(valor, maxim, camp) {
  if (valor == null) return '';
  if (typeof valor !== 'string') throw error('invalid-argument', `El camp ${camp} no és vàlid.`);
  const net = valor.trim();
  if (net.length > maxim) throw error('invalid-argument', `El camp ${camp} és massa llarg.`);
  return net;
}

function enllacValid(valor) {
  const enllac = textOpcional(valor, MAXIM_ENLLAC, 'enllaç');
  if (!enllac) return '';
  let url;
  try {
    url = new URL(enllac);
  } catch {
    throw error('invalid-argument', 'L\'enllaç no és vàlid.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw error('invalid-argument', 'L\'enllaç no és vàlid.');
  return enllac;
}

// Només es desen aquests camps; qualsevol altre que enviï el client (numeroSoci, estat, imatgeUrl...) s'ignora.
function validarProposta(dades) {
  const titol = textOpcional(dades.titol, MAXIM_TITOL, 'títol');
  if (!titol) throw error('invalid-argument', 'Falta el títol.');
  const proposta = { titol };
  if (dades.any != null) {
    if (typeof dades.any !== 'string' || !/^(\d{4})?$/.test(dades.any)) throw error('invalid-argument', 'L\'any no és vàlid.');
    proposta.any = dades.any;
  }
  if (dades.tmdbId != null) {
    if (!esTmdbIdValid(dades.tmdbId)) throw error('invalid-argument', 'La pel·lícula no és vàlida.');
    proposta.tmdbId = dades.tmdbId;
  }
  proposta.comentari = textOpcional(dades.comentari, MAXIM_COMENTARI, 'comentari');
  const enllac = enllacValid(dades.enllac);
  if (enllac) proposta.enllac = enllac;
  return proposta;
}

const normalitzarTitol = (titol) => String(titol ?? '')
  .normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Si totes dues tenen tmdbId, només compta aquest (Dune de 1984 i de 2021 són pel·lícules diferents); el títol
// només es compara quan alguna de les dues no en té.
function esDuplicada(existent, proposta) {
  if (proposta.tmdbId != null && existent.tmdbId != null) return existent.tmdbId === proposta.tmdbId;
  const titol = normalitzarTitol(proposta.titol);
  return [existent.titol, existent.titolLocal].some((t) => t && normalitzarTitol(t) === titol);
}

// `marcaTemps` és `FieldValue.serverTimestamp()` en producció. Els límits i els duplicats es comproven dins la
// transacció perquè dues crides alhora no se'ls puguin saltar.
async function crearPropostaAmbDependencies({ db, marcaTemps }, dades, ara) {
  const { numeroSoci, nomPublic } = await sociDelToken(db, dades.token);
  const proposta = validarProposta(dades);
  const desDe = ara.getTime() - DIA_MS;
  const propostes = db.collection('propostes');
  const referencia = propostes.doc();
  await db.runTransaction(async (t) => {
    const [delSoci, recents, obertes] = await Promise.all([
      t.get(propostes.where('numeroSoci', '==', numeroSoci)),
      // Per saber si s'ha arribat al límit n'hi ha prou de llegir-ne un més: limita lectures i bloquejos.
      t.get(propostes.where('timestamp', '>=', new Date(desDe)).limit(LIMIT_GLOBAL_DIA + 1)),
      t.get(propostes.where('estat', 'in', ESTATS_DUPLICAT)),
    ]);
    const recentsDelSoci = delSoci.docs.filter((doc) => aMs(doc.data().timestamp) >= desDe).length;
    if (recentsDelSoci >= LIMIT_PER_SOCI_DIA || recents.docs.length >= LIMIT_GLOBAL_DIA) {
      throw error('resource-exhausted', 'S\'han enviat massa propostes. Torna-ho a provar demà.');
    }
    if (obertes.docs.some((doc) => esDuplicada(doc.data(), proposta))) {
      throw error('already-exists', 'Aquesta pel·lícula ja està proposada.');
    }
    t.create(referencia, {
      ...proposta,
      numeroSoci,
      nomProposant: nomPublic ?? null,
      estat: 'pendent',
      timestamp: marcaTemps(),
    });
    t.create(db.collection('propostesActivitat').doc(), {
      tipus: 'proposta_creada', propostaId: referencia.id, numeroSoci, timestamp: marcaTemps(),
    });
  });
  return { id: referencia.id };
}

module.exports = {
  crearPropostaAmbDependencies, validarProposta, normalitzarTitol, LIMIT_PER_SOCI_DIA, LIMIT_GLOBAL_DIA,
};
