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

// Comparem sempre dates de calendari, no instants: `ultimPagament` és una data
// 'YYYY-MM-DD' sense hora, i `avui` pot tenir qualsevol hora del dia. Construïm
// totes dues bandes com a mitjanit LOCAL per evitar que la interpretació UTC de
// `ultimPagament` faci vèncer el soci hores abans d'hora en fusos horaris per
// davant d'UTC.
//
// L'any de soci no compta des del dia que paga, sinó des del primer cop que
// fa servir el carnet després de pagar (`inicPeriode`, fixat a EscaneigPage
// en la primera entrada vàlida posterior al pagament). Mentre encara no hagi
// escanejat des de l'últim pagament, `inicPeriode` és buit i el venciment
// cau a `ultimPagament` com a referència provisional: no hi ha risc real de
// vèncer perquè l'any encara no ha començat a córrer.
export function calcularVenciment(soci) {
  const dataBase = soci.inicPeriode || soci.ultimPagament;
  const [any, mes, dia] = dataBase.split('-').map(Number);
  return new Date(any + 1, mes - 1, dia);
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
