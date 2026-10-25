export const ESTAT_AL_DIA = 'al-dia';
export const ESTAT_PENDENT = 'pendent';
export const ESTAT_VENCUT = 'vencut';
export const ESTAT_NOU_REGISTRE = 'nou-registre';

// Com compta la quota vigent (`modeVigencia`, a la fitxa i al moviment de quota). Les dades d'abans no en tenen i
// segueixen la regla anterior (activació al primer escaneig també en les renovacions).
// - VIGENCIA_PRIMER_ESCANEIG: una alta (primer pagament, o el primer després d'una baixa). L'any compta des del primer
//   escaneig a partir de vigenciaDes.
// - VIGENCIA_ENCADENADA: una renovació. 12 mesos justos des de vigenciaDes; cap escaneig la retarda ni l'allarga.
export const VIGENCIA_PRIMER_ESCANEIG = 'primer-escaneig';
export const VIGENCIA_ENCADENADA = 'encadenada';

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
// - `vigenciaDes`: des de quan compta la quota pagada. Regla de la propietat: una renovació és sempre encadenada (comença
//   quan acaba la quota actual, o el dia del pagament si ja havia vençut sense donar-se de baixa, i dura 12 mesos
//   justos); una alta (també la primera quota després d'una baixa) comença el dia del pagament. Les fitxes d'abans no
//   en tenen: llavors és `ultimPagament` (abans, una renovació es desava amb el venciment antic com a data).
// - `modeVigencia`: vegeu VIGENCIA_ENCADENADA / VIGENCIA_PRIMER_ESCANEIG.
// - `inicPeriode`: activació del carnet, el primer escaneig fet DINS del període pagat. En una alta (o en dades
//   d'abans) l'any compta des d'aquí si és posterior a `vigenciaDes`; en una quota encadenada no compta.
// - `reiniciQuota`: el soci s'ha donat de baixa (desactivat) des de l'última quota: la propera serà una alta.
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

function ambActivacio(inici, inicPeriode, modeVigencia) {
  return modeVigencia === VIGENCIA_ENCADENADA ? inici : mesTard(inicPeriode, inici);
}

// Des de quan compta el període actual: l'activació del carnet si és dins de la quota pagada (i la quota no és
// encadenada), si no, l'inici de la quota.
export function iniciPeriodeActual(soci) {
  const inici = iniciVigencia(soci);
  return inici ? ambActivacio(inici, soci.inicPeriode, soci.modeVigencia) : null;
}

// Alta o renovació: font única de la decisió (RegistrarPagament). `teQuotes`: el soci ja té algun moviment de quota.
// - Sense número o sense cap data: no hi ha cap període pagat → alta.
// - Amb la marca de baixa (`reiniciQuota: true`) → alta (tornar-se a donar d'alta). Desactivat sense cap marca (baixa
//   d'abans d'aquesta regla) → alta, com sempre. Desactivat amb `reiniciQuota: false`: ja ha pagat l'alta nova mentre
//   seguia de baixa; el pagament següent no la torna a reiniciar, s'hi encadena.
// - Amb quotes → renovació. Sense quotes, un soci importat de l'Excel (`notaImportacio`) ja tenia un període pagat real
//   → renovació; si no, és una sol·licitud aprovada amb data provisional → alta.
export function tipusPagamentQuota(soci, { teQuotes }) {
  if (!soci.numeroSoci || !iniciVigencia(soci)) return 'alta';
  if (soci.reiniciQuota === true || (!estaActiu(soci) && soci.reiniciQuota !== false)) return 'alta';
  return teQuotes || soci.notaImportacio ? 'renovacio' : 'alta';
}

// Valor de `reiniciQuota` en reactivar un soci. Una baixa feta amb l'app actual ja l'ha marcat (i un pagament fet
// mentre estava desactivat l'ha desmarcat): es conserva. Una baixa d'abans no té marca: la propera quota serà una alta
// llevat que ja hagi pagat després de la baixa.
export function reiniciQuotaEnReactivar(soci) {
  if (typeof soci.reiniciQuota === 'boolean') return soci.reiniciQuota;
  return !(soci.ultimPagament && soci.dataDesactivacio && soci.ultimPagament > soci.dataDesactivacio);
}

export function calcularVenciment(soci) {
  const [any, mes, dia] = iniciPeriodeActual(soci).split('-').map(Number);
  return new Date(any + 1, mes - 1, dia);
}

// Inici i mode de la quota que es paga ara. Una alta comença sempre el dia del pagament (la data provisional d'una
// sol·licitud aprovada o la quota d'abans d'una baixa no compten) i espera el primer escaneig; una renovació
// s'encadena al venciment actual del soci (activació de la quota actual inclosa, si en tenia) i no n'espera cap.
// `vencimentAnterior` es desa al moviment perquè l'historial conservi aquest venciment.
export function novaQuota(soci, dataPagament, { renovacio }) {
  if (!renovacio) return { vigenciaDes: dataPagament, vencimentAnterior: null, modeVigencia: VIGENCIA_PRIMER_ESCANEIG };
  const vencimentAnterior = iniciVigencia(soci) ? dataIso(calcularVenciment(soci)) : null;
  return { vigenciaDes: mesTard(vencimentAnterior, dataPagament), vencimentAnterior, modeVigencia: VIGENCIA_ENCADENADA };
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

// Períodes coberts per l'historial de quotes d'un soci (moviments amb `data` i, si són d'ara, `vencimentAnterior` i
// `modeVigencia`), ordenats per data: cada quota comença a max(data del pagament, final de l'anterior,
// vencimentAnterior desat) i dura un any; una alta amb VIGENCIA_PRIMER_ESCANEIG (p. ex. després d'una baixa) no
// s'encadena i comença el dia del pagament. L'activació (`inicPeriode` del soci) només es coneix per a l'última, i no
// s'aplica si és encadenada. Retorna, per a cada pagament, `vigenciaDes` (inici de la quota), `inici` (inici efectiu,
// activació inclosa) i `fi` (venciment).
export function calcularPeriodes(pagaments, { inicPeriode } = {}) {
  const ordenats = pagaments.filter((p) => p.data).sort(compararPagaments);
  let fiAnterior = null;
  return ordenats.map((pagament, i) => {
    const vigenciaDes = pagament.modeVigencia === VIGENCIA_PRIMER_ESCANEIG
      ? pagament.data
      : mesTard(mesTard(pagament.vencimentAnterior, fiAnterior), pagament.data);
    const inici = i === ordenats.length - 1 ? ambActivacio(vigenciaDes, inicPeriode, pagament.modeVigencia) : vigenciaDes;
    fiAnterior = sumarUnAny(inici);
    return { ...pagament, vigenciaDes, inici, fi: fiAnterior };
  });
}

// Valor d'`inicPeriode` després d'un escaneig `dataAvui`: el fixa a avui només al primer escaneig des que ha
// començat la quota pagada. Abans d'aquella data (renovació anticipada) no toca res: el període actual encara corre.
// Una quota encadenada no té activació: tampoc toca res.
export function inicPeriodeEnEscanejar(soci, dataAvui) {
  const inici = iniciVigencia(soci);
  if (!inici || dataAvui < inici || soci.modeVigencia === VIGENCIA_ENCADENADA) return soci.inicPeriode;
  return soci.inicPeriode && soci.inicPeriode >= inici ? soci.inicPeriode : dataAvui;
}

// Camps de la fitxa que cal canviar perquè quadri amb l'historial de quotes (després d'editar o eliminar un
// moviment). Només retorna el que canvia: si l'historial dona el mateix (p. ex. s'ha editat el concepte), res.
// L'activació es conserva mentre sigui dins del primer any de la quota resultant; si no, era d'una altra quota
// (p. ex. la que s'acaba d'eliminar) i es descarta perquè la fixi el proper escaneig.
export function sincronitzacioQuotes(soci, pagaments) {
  const periodes = calcularPeriodes(pagaments);
  if (periodes.length === 0) return {};
  const { data, vigenciaDes, modeVigencia = null } = periodes[periodes.length - 1];
  const canvis = {};
  if (soci.ultimPagament !== data) canvis.ultimPagament = data;
  const canviaInici = iniciVigencia(soci) !== vigenciaDes;
  if (canviaInici || (!soci.vigenciaDes && canvis.ultimPagament)) canvis.vigenciaDes = vigenciaDes;
  if ((soci.modeVigencia ?? null) !== modeVigencia) canvis.modeVigencia = modeVigencia;
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
