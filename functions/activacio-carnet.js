// Activació del carnet (`inicPeriode` de `socis`) a partir de les entrades de soci de l'`accessLog`. La porta (rol
// taquilla) no pot escriure a `socis` (firestore.rules): ho fa aquest disparador amb l'Admin SDK, tant si ha escanejat
// la taquilla com l'admin. L'escriptura a `socis` actualitza `socisPorta` via `sincronitzarSociPorta`.
//
// CÒPIA de `iniciVigencia` i `inicPeriodeEnEscanejar` de src/lib/estatSoci.js (ESM, fora del paquet que es desplega):
// activacio-carnet.test.js comprova que donen el mateix resultat que l'original sobre els mateixos casos. Si canvieu
// l'una, canvieu l'altra.
const VIGENCIA_ENCADENADA = 'encadenada';
const ZONA = 'Europe/Madrid';
// Entrades importades de l'històric (vegeu src/lib/escaneig.js): no són escanejos d'ara i no activen cap carnet.
const IMPORTACIO_HISTORICA = 'importacio-historica';

function iniciVigencia(soci) {
  return soci.vigenciaDes || soci.ultimPagament || null;
}

function inicPeriodeEnEscanejar(soci, dataAvui) {
  const inici = iniciVigencia(soci);
  if (!inici || dataAvui < inici || soci.modeVigencia === VIGENCIA_ENCADENADA) return soci.inicPeriode;
  return soci.inicPeriode && soci.inicPeriode >= inici ? soci.inicPeriode : dataAvui;
}

// Data de calendari (AAAA-MM-DD) d'un instant a Espanya: la mateixa que `avui()` del dispositiu de la porta.
function dataMadrid(instant) {
  return instant.toLocaleDateString('sv-SE', { timeZone: ZONA });
}

function numeroValid(valor) {
  const numero = Number(valor);
  return valor !== null && valor !== '' && Number.isInteger(numero) && numero > 0 ? numero : null;
}

// Data (Europe/Madrid) d'una entrada que pot activar un carnet, o null si no n'és cap: només `tipus === 'soci'`, amb
// número i timestamp vàlids i no importada. El mode prova no desa res a l'accessLog. `creada` (createTime del
// document) limita el timestamp: les regles obliguen taquilla a l'hora del servidor, però l'admin (i l'Admin SDK) en
// poden posar qualsevol; una entrada amb data futura no pot endarrerir el venciment.
function dataEntrada(entrada, creada) {
  if (!entrada || entrada.tipus !== 'soci' || entrada.escanejatPer === IMPORTACIO_HISTORICA) return null;
  if (!numeroValid(entrada.numeroSoci)) return null;
  const instant = typeof entrada.timestamp?.toDate === 'function' ? entrada.timestamp.toDate() : null;
  if (!instant || Number.isNaN(instant.getTime())) return null;
  const limit = typeof creada?.toDate === 'function' ? creada.toDate() : null;
  return dataMadrid(limit && limit < instant ? limit : instant);
}

// Disparador d'`accessLog/{id}` (creació). Dins d'una transacció: busca la fitxa pel número (en número o en text, com
// el pot tenir desat una fitxa antiga) i només escriu si `inicPeriode` canvia. Un cop desada l'activació d'una quota,
// no es mou mai (ni enrere ni endavant): la fixa la primera entrada processada, encara que n'arribi després una de més
// antiga (amb serverTimestamp, gairebé no passa; i així una entrada amb una data passada inventada no pot escurçar l'any
// de ningú). Si hi ha dues fitxes amb el mateix número, no se sap quina és: avisa i no escriu. Idempotent: repetir
// l'esdeveniment no canvia res. Si falla, registra només ids i codi d'error i llança (amb reintents).
async function activarCarnet({ id, entrada, creada, db, logger }) {
  const data = dataEntrada(entrada, creada);
  if (!data) return null;
  const numero = numeroValid(entrada.numeroSoci);
  try {
    return await db.runTransaction(async (t) => {
      const consulta = db.collection('socis').where('numeroSoci', 'in', [numero, String(numero)]).limit(2);
      const snap = await t.get(consulta);
      if (snap.empty) return null;
      if (snap.docs.length > 1) {
        logger.warn('Número de soci repetit: no es desa l\'activació del carnet', { entradaId: id, numeroSoci: numero });
        return null;
      }
      const doc = snap.docs[0];
      const soci = doc.data();
      if (soci.actiu === false) return null;
      const inicPeriode = inicPeriodeEnEscanejar(soci, data);
      if ((inicPeriode ?? null) === (soci.inicPeriode ?? null)) return null;
      t.update(doc.ref, { inicPeriode });
      return { sociId: doc.id, inicPeriode };
    });
  } catch (e) {
    logger.error('No s\'ha pogut desar l\'activació del carnet', { entradaId: id, numeroSoci: numero, codi: e?.code ?? null });
    throw e;
  }
}

module.exports = {
  ZONA, iniciVigencia, inicPeriodeEnEscanejar, dataMadrid, dataEntrada, activarCarnet,
};
