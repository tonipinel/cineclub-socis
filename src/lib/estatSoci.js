export const ESTAT_AL_DIA = 'al-dia';
export const ESTAT_PENDENT = 'pendent';
export const ESTAT_VENCUT = 'vencut';

export function calcularEstatSoci(soci, avui = new Date()) {
  if (soci.estatManual === 'pendent') return ESTAT_PENDENT;

  // Comparem dates de calendari, no instants: `ultimPagament` és una data
  // 'YYYY-MM-DD' sense hora, i `avui` pot tenir qualsevol hora del dia.
  // Construïm totes dues bandes com a mitjanit LOCAL per evitar que la
  // interpretació UTC de `ultimPagament` faci vèncer el soci hores abans
  // d'hora en fusos horaris per davant d'UTC.
  const [any, mes, dia] = soci.ultimPagament.split('-').map(Number);
  const venciment = new Date(any + 1, mes - 1, dia);
  const avuiData = new Date(avui.getFullYear(), avui.getMonth(), avui.getDate());

  return avuiData > venciment ? ESTAT_VENCUT : ESTAT_AL_DIA;
}
