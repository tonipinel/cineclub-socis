export const ESTAT_AL_DIA = 'al-dia';
export const ESTAT_PENDENT = 'pendent';
export const ESTAT_VENCUT = 'vencut';

export function calcularEstatSoci(soci, avui = new Date()) {
  if (soci.estatManual === 'pendent') return ESTAT_PENDENT;
  const ultimPagament = new Date(soci.ultimPagament);
  const venciment = new Date(ultimPagament);
  venciment.setFullYear(venciment.getFullYear() + 1);
  return avui > venciment ? ESTAT_VENCUT : ESTAT_AL_DIA;
}
