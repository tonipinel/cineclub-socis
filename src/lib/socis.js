import { calcularEstatSoci } from './estatSoci';

export function filtrarSocis(socis, { cerca = '', estat = 'tots' } = {}, avui = new Date()) {
  const cercaNormalitzada = cerca.trim().toLowerCase();
  return socis.filter((soci) => {
    const estatSoci = calcularEstatSoci(soci, avui);
    if (estat !== 'tots' && estatSoci !== estat) return false;
    if (!cercaNormalitzada) return true;
    const text = `${soci.numeroSoci ?? ''} ${soci.nom} ${soci.cognoms}`.toLowerCase();
    return text.includes(cercaNormalitzada);
  });
}
