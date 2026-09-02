import { estaActiu, calcularVenciment } from './estatSoci';
import { assistenciaPerSessio } from './escaneig';

export const TIPUS_MOVIMENT = { INGRES: 'ingres', DESPESA: 'despesa', TRASPAS: 'traspas' };

export const CATEGORIES = [
  'Quotes socis',
  'Aportacions',
  'Gestió pel·lícules',
  'Gestió associació',
];

export const CATEGORIA_QUOTA_SOCI = 'Quotes socis';

// Un moviment de "Quotes socis" és sempre la mateixa categoria, però pot ser
// una alta nova (pot venir atreta per una pel·lícula, per això és l'única
// que es pot vincular a una sessió) o una renovació d'un soci que ja n'havia
// pagat una abans (mai es vincula a cap sessió concreta). `tipusQuota`
// distingeix quin dels dos és, sense fer-ne categories separades.
export const TIPUS_QUOTA = { ALTA: 'alta', RENOVACIO: 'renovacio' };

// Cada categoria només té sentit per a un tipus de moviment concret
// (una despesa mai pot ser "Aportacions", ni un ingrés "Gestió pel·lícules").
export const CATEGORIES_PER_TIPUS = {
  [TIPUS_MOVIMENT.INGRES]: [CATEGORIA_QUOTA_SOCI, 'Aportacions'],
  [TIPUS_MOVIMENT.DESPESA]: ['Gestió pel·lícules', 'Gestió associació'],
};

export const METODES_INGRES = ['efectiu', 'datafon', 'transferencia'];
export const METODES_DESPESA = ['efectiu', 'banc'];
export const DIRECCIONS_TRASPAS = ['caixa-a-banc', 'banc-a-caixa'];

export const ETIQUETES_TIPUS = {
  [TIPUS_MOVIMENT.INGRES]: 'Ingrés',
  [TIPUS_MOVIMENT.DESPESA]: 'Despesa',
  [TIPUS_MOVIMENT.TRASPAS]: 'Traspàs',
};

export const ETIQUETES_METODE = {
  efectiu: 'Efectiu',
  datafon: 'Datàfon',
  transferencia: 'Transferència',
  banc: 'Banc',
};

export const ETIQUETES_DIRECCIO = {
  'caixa-a-banc': 'Caixa → Banc',
  'banc-a-caixa': 'Banc → Caixa',
};

export function formatEuros(valor) {
  return `${(Number(valor) || 0).toFixed(2)}€`;
}

export function classeSigne(valor) {
  return valor < 0 ? 'comptabilitat__valor--negatiu' : 'comptabilitat__valor--positiu';
}

export function calcularTotal(preuUnitari, quantitat) {
  return (Number(preuUnitari) || 0) * (Number(quantitat) || 0);
}

export function calcularSaldos(moviments) {
  let caixa = 0;
  let banc = 0;
  let ingressosTotal = 0;
  let despesesTotal = 0;

  for (const moviment of moviments) {
    const total = Number(moviment.total) || 0;
    if (moviment.tipus === TIPUS_MOVIMENT.INGRES) {
      ingressosTotal += total;
      if (moviment.metodePagament === 'efectiu') caixa += total;
      else banc += total;
    } else if (moviment.tipus === TIPUS_MOVIMENT.DESPESA) {
      despesesTotal += total;
      if (moviment.metodePagament === 'efectiu') caixa -= total;
      else banc -= total;
    } else if (moviment.tipus === TIPUS_MOVIMENT.TRASPAS) {
      if (moviment.direccio === 'caixa-a-banc') {
        caixa -= total;
        banc += total;
      } else if (moviment.direccio === 'banc-a-caixa') {
        banc -= total;
        caixa += total;
      }
    }
  }

  return { caixa, banc, excedent: ingressosTotal - despesesTotal };
}

export function filtrarMoviments(moviments, {
  tipus = 'tots', categoria = 'totes', sessionId = 'totes', desde = '', fins = '',
} = {}) {
  return moviments.filter((moviment) => {
    if (tipus !== 'tots' && moviment.tipus !== tipus) return false;
    if (categoria !== 'totes' && moviment.categoria !== categoria) return false;
    if (sessionId !== 'totes' && (moviment.sessionId || '') !== sessionId) return false;
    if (desde && (moviment.data ?? '') < desde) return false;
    if (fins && (moviment.data ?? '') > fins) return false;
    return true;
  });
}

const VALORS_ORDENACIO = {
  data: (moviment) => moviment.data ?? '',
  concepte: (moviment) => (moviment.concepte ?? '').toLowerCase(),
  tipus: (moviment) => moviment.tipus ?? '',
  total: (moviment) => Number(moviment.total) || 0,
};

export function ordenarMoviments(moviments, { columna = 'data', direccio = 'desc' } = {}) {
  const valorDe = VALORS_ORDENACIO[columna] ?? VALORS_ORDENACIO.data;
  const factor = direccio === 'asc' ? 1 : -1;
  return [...moviments].sort((a, b) => {
    const va = valorDe(a);
    const vb = valorDe(b);
    if (va < vb) return -1 * factor;
    if (va > vb) return 1 * factor;
    return 0;
  });
}

export function balancPerSessio(moviments) {
  const balanc = {};
  for (const moviment of moviments) {
    if (!moviment.sessionId || moviment.tipus === TIPUS_MOVIMENT.TRASPAS) continue;
    const signe = moviment.tipus === TIPUS_MOVIMENT.DESPESA ? -1 : 1;
    balanc[moviment.sessionId] = (balanc[moviment.sessionId] ?? 0) + signe * (Number(moviment.total) || 0);
  }
  return balanc;
}

export function subtotalsPerMetode(moviments) {
  const subtotals = {};
  for (const moviment of moviments) {
    if (moviment.tipus === TIPUS_MOVIMENT.TRASPAS) continue;
    const metode = moviment.metodePagament;
    if (!metode) continue;
    const signe = moviment.tipus === TIPUS_MOVIMENT.DESPESA ? -1 : 1;
    subtotals[metode] = (subtotals[metode] ?? 0) + signe * (Number(moviment.total) || 0);
  }
  return subtotals;
}

function agruparMovimentsPerCategoria(moviments, tipus, categoriaPerDefecte) {
  const grupsPerCategoria = {};
  let totalGeneral = 0;

  for (const moviment of moviments) {
    if (moviment.tipus !== tipus) continue;
    const total = Number(moviment.total) || 0;
    totalGeneral += total;
    const categoria = moviment.categoria || categoriaPerDefecte;
    const metode = moviment.metodePagament || 'altres';
    const preuUnitari = Number(moviment.preuUnitari) || 0;
    const quantitat = Number(moviment.quantitat) || 1;

    const grupCategoria = grupsPerCategoria[categoria] ?? { total: 0, detallsPerClau: {} };
    grupCategoria.total += total;

    const clau = `${preuUnitari}|${metode}`;
    const detall = grupCategoria.detallsPerClau[clau] ?? { preuUnitari, metode, quantitat: 0, total: 0 };
    detall.quantitat += quantitat;
    detall.total += total;
    grupCategoria.detallsPerClau[clau] = detall;

    grupsPerCategoria[categoria] = grupCategoria;
  }

  const perCategoria = {};
  for (const [categoria, grup] of Object.entries(grupsPerCategoria)) {
    const detalls = Object.values(grup.detallsPerClau).sort(
      (a, b) => b.preuUnitari - a.preuUnitari || a.metode.localeCompare(b.metode)
    );
    perCategoria[categoria] = { total: grup.total, detalls };
  }

  return { perCategoria, totalGeneral };
}

function agruparIngressosPerCategoria(moviments) {
  const { perCategoria, totalGeneral } = agruparMovimentsPerCategoria(moviments, TIPUS_MOVIMENT.INGRES, 'Altres ingressos');
  return { ingressosPerCategoria: perCategoria, ingressosTotal: totalGeneral };
}

export function resumEconomicSessio(moviments) {
  const { ingressosPerCategoria, ingressosTotal } = agruparIngressosPerCategoria(moviments);
  let despesesTotal = 0;
  for (const moviment of moviments) {
    if (moviment.tipus === TIPUS_MOVIMENT.DESPESA) despesesTotal += Number(moviment.total) || 0;
  }
  return { ingressosPerCategoria, ingressosTotal, despesesTotal, balanc: ingressosTotal - despesesTotal };
}

const MESOS_REFERENCIA = 3;
const MESOS_PREVISIO = 12;
const NOMS_MES = [
  'Gener', 'Febrer', 'Març', 'Abril', 'Maig', 'Juny',
  'Juliol', 'Agost', 'Setembre', 'Octubre', 'Novembre', 'Desembre',
];

// Llindar de cost per sessió (import de l'última quota ÷ sessions
// assistides en el període actual) per sobre del qual considerem que un
// soci té risc real de no renovar: si li ha sortit car venir (poc
// aprofitament de la quota), és menys probable que torni a pagar.
export const LLINDAR_COST_SESSIO_RENOVACIO = 8;

function costPerSessioPerSoci(soci, moviments, sessionsPassades, entradesPerNumero) {
  if (!soci.numeroSoci || !soci.ultimPagament) return null;
  const numeroSoci = Number(soci.numeroSoci);
  const pagamentActual = moviments
    .filter((m) => (
      m.categoria === CATEGORIA_QUOTA_SOCI && m.tipus === TIPUS_MOVIMENT.INGRES && Number(m.numeroSoci) === numeroSoci
    ))
    .sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''))[0];
  if (!pagamentActual) return null;

  const iniciPeriode = soci.inicPeriode || soci.ultimPagament;
  const sessionsPeriode = sessionsPassades.filter((s) => (s.data ?? '') >= iniciPeriode);
  const entrades = entradesPerNumero.get(numeroSoci) ?? [];
  const assistides = assistenciaPerSessio(sessionsPeriode, entrades).filter((s) => s.assisteix).length;
  if (assistides === 0) return null;

  return (Number(pagamentActual.total) || 0) / assistides;
}

function agruparEntradesPerNumero(accessLog) {
  const entradesPerNumero = new Map();
  for (const e of accessLog) {
    if (e.tipus !== 'soci' || e.numeroSoci == null) continue;
    if (!entradesPerNumero.has(e.numeroSoci)) entradesPerNumero.set(e.numeroSoci, []);
    entradesPerNumero.get(e.numeroSoci).push(e);
  }
  return entradesPerNumero;
}

// Un soci "probablement renovarà" si el seu cost per sessió actual (import
// de l'última quota ÷ sessions assistides des d'aleshores) està per sota del
// llindar. Si encara no hi ha prou dades (no ha assistit a cap sessió des
// del pagament), no el descartem: assumim que sí renovarà (benefici del
// dubte), en comptes de comptar-lo com a "no probable" sense evidència.
function probablementRenovara(soci, moviments, sessionsPassades, entradesPerNumero) {
  const cost = costPerSessioPerSoci(soci, moviments, sessionsPassades, entradesPerNumero);
  return cost === null || cost <= LLINDAR_COST_SESSIO_RENOVACIO;
}

const MESOS_REAL = 12;

// Resum real mes a mes dels últims 12 mesos (el mes actual inclòs, fins
// avui), amb el mateix desglossament de conceptes que resumPrevisio
// (quotes, aportacions, pel·lícules) per poder-los comparar i encadenar
// en un mateix gràfic. A diferència de la previsió, aquí no s'estima res:
// són moviments reals ja registrats.
export function resumReal(moviments, avui = new Date()) {
  const mesos = [];
  for (let i = -(MESOS_REAL - 1); i <= 0; i++) {
    const inici = new Date(avui.getFullYear(), avui.getMonth() + i, 1);
    const fi = new Date(avui.getFullYear(), avui.getMonth() + i + 1, 1);
    const iniciStr = inici.toLocaleDateString('sv-SE');
    const fiStr = fi.toLocaleDateString('sv-SE');

    const delMes = moviments.filter((m) => (m.data ?? '') >= iniciStr && (m.data ?? '') < fiStr);
    const quotes = delMes.filter((m) => m.categoria === CATEGORIA_QUOTA_SOCI && m.tipus === TIPUS_MOVIMENT.INGRES);
    const aportacions = delMes.filter((m) => m.categoria === 'Aportacions' && m.tipus === TIPUS_MOVIMENT.INGRES);
    const pellicules = delMes.filter((m) => m.categoria === 'Gestió pel·lícules' && m.tipus === TIPUS_MOVIMENT.DESPESA);

    const ingressosQuotes = quotes.reduce((acc, m) => acc + (Number(m.total) || 0), 0);
    const ingressosAportacions = aportacions.reduce((acc, m) => acc + (Number(m.total) || 0), 0);
    const costPellicula = pellicules.reduce((acc, m) => acc + (Number(m.total) || 0), 0);
    const impacteNet = ingressosQuotes + ingressosAportacions - costPellicula;
    const tresoreria = calcularSaldos(moviments.filter((m) => (m.data ?? '') < fiStr)).excedent;

    mesos.push({
      etiqueta: `${NOMS_MES[inici.getMonth()]} ${inici.getFullYear()}`,
      nombreQuotes: quotes.length,
      ingressosQuotes,
      ingressosAportacions,
      costPellicula,
      impacteNet,
      tresoreria,
    });
  }
  return { mesos };
}

// Previsió mes a mes per als propers 6 mesos, assumint 1 sessió/mes.
// Distingim dues fonts d'ingressos de quotes:
// - Nous socis: no tenen una data de venciment coneguda, així que els
//   estimem pel ritme mitjà d'altes dels últims 3 mesos, repetit cada mes.
// - Renovacions: NO s'estimen per mitjana, sinó soci a soci, mirant a quins
//   els venç realment la quota (ultimPagament + 1 any) dins de cada mes
//   concret, i aplicant-hi el filtre de probabilitat de renovar.
// El cost de pel·lícula més car dels últims 3 mesos (no la mitjana) queda
// fix cada mes com a estimació conservadora.
export function resumPrevisio(moviments, socis, sessions, accessLog, avui = new Date()) {
  const dataAvui = avui.toLocaleDateString('sv-SE');
  const faReferencia = new Date(avui.getFullYear(), avui.getMonth() - MESOS_REFERENCIA, avui.getDate());
  const dataLimit = faReferencia.toLocaleDateString('sv-SE');
  const recents = moviments.filter((m) => (m.data ?? '') > dataLimit && (m.data ?? '') <= dataAvui);

  // Només altes noves (no renovacions) per estimar el ritme de socis nous:
  // els moviments antics d'abans d'aquest camp no tenen `tipusQuota`, però en
  // aquest club, fins ara, tot pagament de quota històric és una alta.
  const quotesRecents = recents.filter((m) => (
    m.categoria === CATEGORIA_QUOTA_SOCI && m.tipus === TIPUS_MOVIMENT.INGRES && m.tipusQuota !== TIPUS_QUOTA.RENOVACIO
  ));
  const aportacions = recents.filter((m) => m.categoria === 'Aportacions' && m.tipus === TIPUS_MOVIMENT.INGRES);
  const pellicules = recents.filter((m) => m.categoria === 'Gestió pel·lícules' && m.tipus === TIPUS_MOVIMENT.DESPESA);

  const novesAltesPerMes = quotesRecents.length / MESOS_REFERENCIA;
  const importMitjaQuota = quotesRecents.length > 0
    ? quotesRecents.reduce((acc, m) => acc + (Number(m.total) || 0), 0) / quotesRecents.length
    : 30;
  const ingressosAportacionsPerMes = aportacions.reduce((acc, m) => acc + (Number(m.total) || 0), 0) / MESOS_REFERENCIA;
  const costPellicula = pellicules.reduce((max, m) => Math.max(max, Number(m.total) || 0), 0);

  const sessionsPassades = sessions.filter((s) => (s.data ?? '') <= dataAvui);
  const entradesPerNumero = agruparEntradesPerNumero(accessLog);
  const sociesActius = socis.filter((s) => estaActiu(s) && s.numeroSoci && s.ultimPagament);

  const mesos = [];
  for (let i = 1; i <= MESOS_PREVISIO; i++) {
    const inici = new Date(avui.getFullYear(), avui.getMonth() + i, 1);
    const fi = new Date(avui.getFullYear(), avui.getMonth() + i + 1, 1);

    const sociesDeguts = sociesActius.filter((soci) => {
      const venciment = calcularVenciment(soci);
      return venciment >= inici && venciment < fi;
    });
    const renovacionsEsperades = sociesDeguts.filter(
      (soci) => probablementRenovara(soci, moviments, sessionsPassades, entradesPerNumero)
    ).length;

    const ingressosQuotes = (novesAltesPerMes + renovacionsEsperades) * importMitjaQuota;
    const impacteNet = ingressosQuotes + ingressosAportacionsPerMes - costPellicula;

    mesos.push({
      etiqueta: `${NOMS_MES[inici.getMonth()]} ${inici.getFullYear()}`,
      novesAltes: novesAltesPerMes,
      sociesDeguts: sociesDeguts.length,
      renovacionsEsperades,
      ingressosQuotes,
      ingressosAportacions: ingressosAportacionsPerMes,
      costPellicula,
      impacteNet,
    });
  }

  const impacteNetAcumulat = mesos.reduce((acc, m) => acc + m.impacteNet, 0);

  return {
    mesos,
    novesAltesPerMes,
    importMitjaQuota,
    ingressosAportacionsPerMes,
    costPellicula,
    impacteNetAcumulat,
  };
}

export function resumComptable(moviments) {
  const { caixa, banc, excedent } = calcularSaldos(moviments);
  const { ingressosPerCategoria, ingressosTotal } = agruparIngressosPerCategoria(moviments);
  const { perCategoria: despesesPerCategoria, totalGeneral: despesesTotal } = agruparMovimentsPerCategoria(
    moviments, TIPUS_MOVIMENT.DESPESA, 'Altres despeses'
  );

  return { excedent, ingressosTotal, despesesTotal, banc, caixa, ingressosPerCategoria, despesesPerCategoria };
}
