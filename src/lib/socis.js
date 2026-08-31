import { calcularEstatSoci, calcularVenciment, diesFinsVenciment, ESTAT_AL_DIA } from './estatSoci';

export const DIES_AVIS_RENOVACIO = 30;
export const FILTRE_PROXIMA_RENOVACIO = 'proxima-renovacio';

export function teNumeroSoci(soci) {
  return Boolean(soci.numeroSoci);
}

export function cercaCoincideix(soci, cerca) {
  const cercaNormalitzada = cerca.trim().toLowerCase();
  if (!cercaNormalitzada) return true;
  const text = `${soci.numeroSoci ?? ''} ${soci.nom} ${soci.cognoms}`.toLowerCase();
  return text.includes(cercaNormalitzada);
}

export function filtrarSocis(socis, { cerca = '', estat = 'tots' } = {}, avui = new Date()) {
  return socis.filter((soci) => {
    const estatSoci = calcularEstatSoci(soci, avui);
    if (estat === FILTRE_PROXIMA_RENOVACIO) {
      if (estatSoci !== ESTAT_AL_DIA) return false;
      if (diesFinsVenciment(soci, avui) > DIES_AVIS_RENOVACIO) return false;
    } else if (estat !== 'tots' && estatSoci !== estat) {
      return false;
    }
    return cercaCoincideix(soci, cerca);
  });
}

const VALORS_ORDENACIO = {
  numeroSoci: (soci) => Number(soci.numeroSoci) || 0,
  nom: (soci) => (soci.nom ?? '').toLowerCase(),
  cognoms: (soci) => (soci.cognoms ?? '').toLowerCase(),
  estat: (soci, avui) => calcularEstatSoci(soci, avui),
  venciment: (soci) => calcularVenciment(soci).getTime(),
  assistencies: (soci) => Number(soci.assistencies) || 0,
};

export function ordenarSocis(socis, { columna = 'numeroSoci', direccio = 'desc' } = {}, avui = new Date()) {
  const valorDe = VALORS_ORDENACIO[columna] ?? VALORS_ORDENACIO.numeroSoci;
  const factor = direccio === 'asc' ? 1 : -1;
  return [...socis].sort((a, b) => {
    const va = valorDe(a, avui);
    const vb = valorDe(b, avui);
    if (va < vb) return -1 * factor;
    if (va > vb) return 1 * factor;
    return 0;
  });
}
