import { calcularEstatSoci, calcularVenciment, diesFinsVenciment, estaActiu, ESTAT_AL_DIA } from './estatSoci';
import { assistenciaPerSessio } from './escaneig';

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

function dataISO(data) {
  return data.toLocaleDateString('sv-SE');
}

function calcularAltesPerMes(socis, avui) {
  const mesos = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(avui.getFullYear(), avui.getMonth() - i, 1);
    mesos.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const comptador = Object.fromEntries(mesos.map((m) => [m, 0]));
  for (const soci of socis) {
    const mes = (soci.dataAlta ?? '').slice(0, 7);
    if (mes in comptador) comptador[mes] += 1;
  }
  return mesos.map((mes) => ({ mes, total: comptador[mes] }));
}

export function resumDashboardSocis(socisTots, sessions, entradesAccessLog, avui = new Date()) {
  const socis = socisTots.filter(estaActiu);
  const total = socis.length;
  const altesPerMes = calcularAltesPerMes(socis, avui);

  const dataAvui = dataISO(avui);
  const sessionsPassades = [...sessions]
    .filter((s) => (s.data ?? '') <= dataAvui)
    .sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''))
    .slice(0, 12);

  const entradesSociPerNumero = new Map();
  for (const e of entradesAccessLog) {
    if (e.tipus !== 'soci') continue;
    if (!entradesSociPerNumero.has(e.numeroSoci)) entradesSociPerNumero.set(e.numeroSoci, []);
    entradesSociPerNumero.get(e.numeroSoci).push(e);
  }

  let assistenciaMitjana = 0;
  if (sessionsPassades.length > 0 && total > 0) {
    const percentatges = socis.map((soci) => {
      const entradesSoci = entradesSociPerNumero.get(Number(soci.numeroSoci)) ?? [];
      const assistides = assistenciaPerSessio(sessionsPassades, entradesSoci).filter((s) => s.assisteix).length;
      return (assistides / sessionsPassades.length) * 100;
    });
    assistenciaMitjana = Math.round(percentatges.reduce((a, b) => a + b, 0) / percentatges.length);
  }

  const renovacionsProperes = socis
    .filter((soci) => calcularEstatSoci(soci, avui) === ESTAT_AL_DIA)
    .map((soci) => ({ numeroSoci: soci.numeroSoci, nom: soci.nom, cognoms: soci.cognoms, dies: diesFinsVenciment(soci, avui) }))
    .filter((s) => s.dies >= 0 && s.dies <= DIES_AVIS_RENOVACIO)
    .sort((a, b) => a.dies - b.dies);

  return { total, altesPerMes, assistenciaMitjana, renovacionsProperes };
}
