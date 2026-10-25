export const ESTAT_AL_DIA = 'al-dia';
export const ESTAT_PENDENT = 'pendent';
export const ESTAT_VENCUT = 'vencut';
export const ESTAT_NOU_REGISTRE = 'nou-registre';

// L'activació és independent de l'estat de pagament: un soci pot estar
// "Vençut" i actiu, o "Al dia" i desactivat. Per això no es barreja dins de
// calcularEstatSoci, sinó que es consulta a part amb aquest predicat.
export function estaActiu(soci) {
  return soci.actiu !== false;
}

// Comparem sempre dates de calendari, no instants: les dates es desen com a 'YYYY-MM-DD' sense hora, i `avui` pot
// tenir qualsevol hora del dia. Construïm totes dues bandes com a mitjanit LOCAL per evitar que la interpretació UTC
// faci vèncer el soci hores abans d'hora en fusos horaris per davant d'UTC.
//
// Model de la quota (font única de veritat; vegeu també calcularPeriodes):
// - `ultimPagament`: data REAL de l'últim pagament (la mateixa del moviment de comptabilitat).
// - `vigenciaDes`: des de quan compta la quota pagada. Regla de la propietat: si es renova ABANS que venci el
//   període actual, la quota nova comença quan acaba l'actual (venciment nou = antic + 12 mesos, sense perdre cap
//   dia); si ja havia vençut, comença el dia del pagament. Les fitxes d'abans no en tenen: llavors és
//   `ultimPagament` (abans, una renovació es desava amb el venciment antic com a data, que ja era aquest inici).
// - `inicPeriode`: activació del carnet, el primer escaneig fet DINS del període pagat. L'any compta des d'aquí si
//   és posterior a `vigenciaDes`; una activació anterior (escaneig abans que comencés la quota) no compta.
// El venciment és l'últim dia "al dia" i també el primer dia de la quota següent si es renova abans.
// Un pagament el 29 de febrer venç l'1 de març de l'any següent.
function dataIso(data) {
  return data.toLocaleDateString('sv-SE');
}

function sumarUnAny(dataIsoStr) {
  const [any, mes, dia] = dataIsoStr.split('-').map(Number);
  return dataIso(new Date(any + 1, mes - 1, dia));
}

function mesTard(a, b) {
  return a && (!b || a > b) ? a : b;
}

export function iniciVigencia(soci) {
  return soci.vigenciaDes || soci.ultimPagament || null;
}

function ambActivacio(inici, inicPeriode) {
  return mesTard(inicPeriode, inici);
}

// Des de quan compta el període actual: l'activació del carnet si és dins de la quota pagada, si no, l'inici de la
// quota.
export function iniciPeriodeActual(soci) {
  const inici = iniciVigencia(soci);
  return inici ? ambActivacio(inici, soci.inicPeriode) : null;
}

export function calcularVenciment(soci) {
  const [any, mes, dia] = iniciPeriodeActual(soci).split('-').map(Number);
  return new Date(any + 1, mes - 1, dia);
}

// Inici de la quota que es paga ara. Una alta comença sempre el dia del pagament (la data provisional d'una
// sol·licitud aprovada o d'una fitxa nova no és cap període pagat); una renovació s'encadena al venciment actual del
// soci, activació inclosa. `vencimentAnterior` es desa al moviment perquè l'historial conservi aquesta activació.
export function novaQuota(soci, dataPagament, { renovacio }) {
  const vencimentAnterior = renovacio && iniciVigencia(soci) ? dataIso(calcularVenciment(soci)) : null;
  return { vigenciaDes: mesTard(vencimentAnterior, dataPagament), vencimentAnterior };
}

// Ordre total i independent de l'ordre d'entrada (les consultes no en garanteixen cap): per data; amb la mateixa data,
// primer la que no s'encadena a res (sense vencimentAnterior, p. ex. l'alta) i després per vencimentAnterior; si encara
// empaten, per id del moviment i, en últim terme, pel contingut. Sense això, una renovació podia quedar abans de la
// quota a què s'encadena i sumar un any de més en una sincronització posterior.
function clauContingut(pagament) {
  return JSON.stringify(Object.keys(pagament).sort().map((k) => [k, pagament[k]]));
}

function compararPagaments(a, b) {
  return a.data.localeCompare(b.data)
    || (a.vencimentAnterior || '').localeCompare(b.vencimentAnterior || '')
    || String(a.id ?? '').localeCompare(String(b.id ?? ''))
    || clauContingut(a).localeCompare(clauContingut(b));
}

// Períodes coberts per l'historial de quotes d'un soci (moviments amb `data` i, si són d'ara, `vencimentAnterior`),
// ordenats per data: cada quota comença a max(data del pagament, final de l'anterior, vencimentAnterior desat) i dura
// un any. L'activació (`inicPeriode` del soci) només es coneix per a l'última. Retorna, per a cada pagament,
// `vigenciaDes` (inici de la quota), `inici` (inici efectiu, activació inclosa) i `fi` (venciment).
export function calcularPeriodes(pagaments, { inicPeriode } = {}) {
  const ordenats = pagaments.filter((p) => p.data).sort(compararPagaments);
  let fiAnterior = null;
  return ordenats.map((pagament, i) => {
    const vigenciaDes = mesTard(mesTard(pagament.vencimentAnterior, fiAnterior), pagament.data);
    const inici = i === ordenats.length - 1 ? ambActivacio(vigenciaDes, inicPeriode) : vigenciaDes;
    fiAnterior = sumarUnAny(inici);
    return { ...pagament, vigenciaDes, inici, fi: fiAnterior };
  });
}

// Valor d'`inicPeriode` després d'un escaneig `dataAvui`: el fixa a avui només al primer escaneig des que ha
// començat la quota pagada. Abans d'aquella data (renovació anticipada) no toca res: el període actual encara corre.
export function inicPeriodeEnEscanejar(soci, dataAvui) {
  const inici = iniciVigencia(soci);
  if (!inici || dataAvui < inici) return soci.inicPeriode;
  return soci.inicPeriode && soci.inicPeriode >= inici ? soci.inicPeriode : dataAvui;
}

// Camps de la fitxa que cal canviar perquè quadri amb l'historial de quotes (després d'editar o eliminar un
// moviment). Només retorna el que canvia: si l'historial dona el mateix (p. ex. s'ha editat el concepte), res.
// L'activació es conserva mentre sigui dins del primer any de la quota resultant; si no, era d'una altra quota
// (p. ex. la que s'acaba d'eliminar) i es descarta perquè la fixi el proper escaneig.
export function sincronitzacioQuotes(soci, pagaments) {
  const periodes = calcularPeriodes(pagaments);
  if (periodes.length === 0) return {};
  const { data, vigenciaDes } = periodes[periodes.length - 1];
  const canvis = {};
  if (soci.ultimPagament !== data) canvis.ultimPagament = data;
  const canviaInici = iniciVigencia(soci) !== vigenciaDes;
  if (canviaInici || (!soci.vigenciaDes && canvis.ultimPagament)) canvis.vigenciaDes = vigenciaDes;
  const activacioValida = soci.inicPeriode >= vigenciaDes && soci.inicPeriode < sumarUnAny(vigenciaDes);
  if (canviaInici && soci.inicPeriode && !activacioValida) canvis.inicPeriode = null;
  return canvis;
}

function dataCalendari(data) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

export function calcularEstatSoci(soci, avui = new Date()) {
  if (!soci.numeroSoci) return ESTAT_NOU_REGISTRE;
  if (soci.estatManual === 'pendent') return ESTAT_PENDENT;
  const venciment = calcularVenciment(soci);
  const avuiData = dataCalendari(avui);
  return avuiData > venciment ? ESTAT_VENCUT : ESTAT_AL_DIA;
}

export function diesFinsVenciment(soci, avui = new Date()) {
  const MS_PER_DIA = 24 * 60 * 60 * 1000;
  const venciment = calcularVenciment(soci);
  const avuiData = dataCalendari(avui);
  return Math.round((venciment.getTime() - avuiData.getTime()) / MS_PER_DIA);
}
