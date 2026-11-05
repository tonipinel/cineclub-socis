import {
  estaActiu, calcularPeriodes, calcularVenciment, iniciPeriodeActual,
} from './estatSoci';
import { assistenciaPerSessio } from './escaneig';
import { sessionsAmbControl } from './sessions';

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

// Període de vigència de cada quota segons l'historial de cada soci (vegeu calcularPeriodes a estatSoci.js): una
// renovació anticipada compta des del venciment de l'anterior, i l'última, si és una alta, des de l'activació del carnet.
function periodesDeQuotes(moviments, socis) {
  const socisPerNumero = new Map(socis.map((soci) => [Number(soci.numeroSoci), soci]));
  // Una quota sense número de soci no s'encadena amb cap altra: és un historial propi.
  const quotesPerSoci = new Map();
  for (const quota of moviments) {
    if (quota.categoria !== CATEGORIA_QUOTA_SOCI || quota.tipus !== TIPUS_MOVIMENT.INGRES || !quota.data) continue;
    const numero = Number(quota.numeroSoci) || Symbol('sense número');
    if (!quotesPerSoci.has(numero)) quotesPerSoci.set(numero, []);
    quotesPerSoci.get(numero).push(quota);
  }
  return [...quotesPerSoci].flatMap(([numero, quotes]) => (
    calcularPeriodes(quotes, { inicPeriode: socisPerNumero.get(numero)?.inicPeriode })
      .map(({ total, inici, fi }) => ({ total: Number(total) || 0, inici, fi }))
  ));
}

// Mínim de pel·lícules que comptem per any: les quotes es reparteixen com a
// mínim entre 12 sessions, encara que se'n hagin programat menys, perquè
// les poques ja programades no s'emportin tot el pes de les quotes.
export const MINIM_SESSIONS_ANY = 12;

// Rendibilitat imputada de cada sessió: el que aporta la pel·lícula per si
// mateixa (aportacions de la porta i el seu cost, és a dir, els moviments
// lligats a la sessió que no són quotes) més la part que li toca de les
// quotes vigents aquell dia. Cada quota es reparteix per igual entre les
// sessions del seu període, o entre MINIM_SESSIONS_ANY si n'hi ha menys.
// `costsReals` ({ [sessioId]: number | null }, vegeu `costsRealsSessions`): el cost conegut de la pel·lícula (distribuïdora i preu).
// Mentre la sessió no té registrada la despesa de pel·lícula, es resta com a cost previst; en registrar-la, mana la real.
export function rendibilitatPerSessio(moviments, socis, sessionsTotes, costsReals = {}) {
  const sessions = sessionsAmbControl(sessionsTotes);
  const rendibilitat = {};
  const ambDespesaPellicula = new Set(moviments
    .filter((m) => m.sessionId && m.tipus === TIPUS_MOVIMENT.DESPESA && m.categoria === 'Gestió pel·lícules')
    .map((m) => m.sessionId));
  for (const sessio of sessions) {
    const cost = costsReals[sessio.id];
    if (esNombre(cost) && cost > 0 && !ambDespesaPellicula.has(sessio.id)) rendibilitat[sessio.id] = -cost;
  }
  for (const moviment of moviments) {
    if (!moviment.sessionId || moviment.tipus === TIPUS_MOVIMENT.TRASPAS) continue;
    if (moviment.categoria === CATEGORIA_QUOTA_SOCI) continue;
    const signe = moviment.tipus === TIPUS_MOVIMENT.DESPESA ? -1 : 1;
    rendibilitat[moviment.sessionId] = (rendibilitat[moviment.sessionId] ?? 0) + signe * (Number(moviment.total) || 0);
  }

  for (const periode of periodesDeQuotes(moviments, socis)) {
    const sessionsDelPeriode = sessions.filter((s) => s.data && s.data >= periode.inici && s.data <= periode.fi);
    const divisor = Math.max(sessionsDelPeriode.length, MINIM_SESSIONS_ANY);
    for (const sessio of sessionsDelPeriode) {
      rendibilitat[sessio.id] = (rendibilitat[sessio.id] ?? 0) + periode.total / divisor;
    }
  }
  return rendibilitat;
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

// Compara les entrades genèriques escanejades amb els moviments d'"Aportacions" ja registrats. Si falta import i
// entrades, proposa el que queda (i l'altre mètode si fins ara se n'ha fet servir un de sol entre efectiu i dàtafon).
export function aportacionsPerRegistrar(entrades, moviments) {
  const registrades = moviments.filter((m) => m.tipus === TIPUS_MOVIMENT.INGRES && m.categoria === 'Aportacions');
  const centims = (valor) => Math.round((Number(valor) || 0) * 100);
  const escanejat = entrades.reduce((total, e) => total + centims(e.preuAplicat), 0);
  const registrat = registrades.reduce((total, m) => total + centims(m.total), 0);
  const diferencia = escanejat - registrat;
  if (diferencia === 0) return { estat: 'quadra' };
  if (diferencia < 0) return { estat: 'sobra', import: -diferencia / 100 };
  const quantitat = entrades.length - registrades.reduce((total, m) => total + (Number(m.quantitat) || 0), 0);
  if (quantitat <= 0) return { estat: 'desquadra', import: diferencia / 100 };
  const metodes = [...new Set(registrades.map((m) => m.metodePagament))];
  const altre = { efectiu: 'datafon', datafon: 'efectiu' }[metodes[0]];
  return {
    estat: 'pendent',
    quantitat,
    import: diferencia / 100,
    preuUnitari: diferencia / 100 / quantitat,
    metode: metodes.length === 1 ? altre : undefined,
  };
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

  const iniciPeriode = iniciPeriodeActual(soci);
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

const MESOS_MITJANA_PELLICULA = 6;
const CATEGORIA_PELLICULES = 'Gestió pel·lícules';

const esNombre = (valor) => typeof valor === 'number' && Number.isFinite(valor);

// Cost real d'una sessió: el preu propi de la proposta interna (0 inclòs) i,
// si no en té, el preu per defecte de la distribuïdora. Si no es pot saber → null.
export function costRealSessio(sessio, interns, distribuidores) {
  const intern = sessio?.propostaId ? interns?.[sessio.propostaId] : null;
  if (!intern) return null;
  if (esNombre(intern.preu)) return intern.preu;
  const preuDistribuidora = distribuidores?.[intern.distribuidoraId]?.preu;
  return esNombre(preuDistribuidora) ? preuDistribuidora : null;
}

// Cost conegut de cada sessió: `{ [sessioId]: number | null }` (vegeu `costRealSessio`).
export const costsRealsSessions = (sessions, interns, distribuidores) => Object.fromEntries(
  (sessions ?? []).map((s) => [s.id, costRealSessio(s, interns, distribuidores)]),
);

// Mitjana de les últimes 6 despeses de pel·lícula que han costat diners
// (omet les de cost 0). Sense cap → 0.
export function costMitjaPellicula(moviments) {
  const ultimes = moviments
    .filter((m) => m.categoria === CATEGORIA_PELLICULES && m.tipus === TIPUS_MOVIMENT.DESPESA && Number(m.total) > 0)
    .sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''))
    .slice(0, MESOS_MITJANA_PELLICULA);
  if (ultimes.length === 0) return 0;
  return ultimes.reduce((acc, m) => acc + Number(m.total), 0) / ultimes.length;
}

// Previsió mes a mes per als propers 6 mesos, assumint 1 sessió/mes.
// Distingim dues fonts d'ingressos de quotes:
// - Nous socis: no tenen una data de venciment coneguda, així que els
//   estimem pel ritme mitjà d'altes dels últims 3 mesos, repetit cada mes.
// - Renovacions: NO s'estimen per mitjana, sinó soci a soci, mirant a quins
//   els venç realment la quota (calcularVenciment) dins de cada mes
//   concret, i aplicant-hi el filtre de probabilitat de renovar.
// Pel·lícules: els mesos amb sessions programades (data futura) usen el cost
// real de `costsReals` ({ [sessioId]: number | null }, null = desconegut);
// els mesos sense sessions, i les sessions de cost desconegut, usen la mitjana
// de les últimes pel·lícules que han costat diners.
// Aportacions: import per sessió dels últims 3 mesos × sessions del mes (o 1).
export function resumPrevisio(moviments, socis, sessions, accessLog, avui = new Date(), opcions = {}) {
  const costsReals = opcions?.costsReals ?? {};
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
  const novesAltesPerMes = quotesRecents.length / MESOS_REFERENCIA;
  const importMitjaQuota = quotesRecents.length > 0
    ? quotesRecents.reduce((acc, m) => acc + (Number(m.total) || 0), 0) / quotesRecents.length
    : 30;
  const ingressosAportacionsPerMes = aportacions.reduce((acc, m) => acc + (Number(m.total) || 0), 0) / MESOS_REFERENCIA;
  const costPellicula = costMitjaPellicula(moviments.filter((m) => (m.data ?? '') <= dataAvui));

  const sessionsAmbControlTotes = sessionsAmbControl(sessions);
  const sessionsPassades = sessionsAmbControlTotes.filter((s) => s.data && s.data <= dataAvui);
  const sessionsRecents = sessionsPassades.filter((s) => s.data > dataLimit);
  const totalAportacions = aportacions.reduce((acc, m) => acc + (Number(m.total) || 0), 0);
  const aportacionsPerSessio = sessionsRecents.length > 0
    ? totalAportacions / sessionsRecents.length
    : ingressosAportacionsPerMes;
  const sessionsFutures = sessionsAmbControlTotes.filter((s) => s.data && s.data > dataAvui);

  // Cost aplicat a un conjunt de sessions programades: el real de cada una i,
  // si és desconegut, el cost mitjà de pel·lícula.
  const costDeSessions = (sessionsMes) => {
    const costs = sessionsMes.map((s) => costsReals[s.id] ?? null);
    const coneguts = costs.filter((c) => c !== null);
    const desconegudes = costs.length - coneguts.length;
    const sumaConeguts = coneguts.reduce((acc, c) => acc + c, 0);
    const precis = sessionsMes.length > 0 && desconegudes === 0;
    return {
      precis,
      parcial: sessionsMes.length > 0 && desconegudes > 0,
      costReal: precis ? sumaConeguts : null,
      cost: sumaConeguts + desconegudes * costPellicula,
    };
  };
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

    const iniciStr = inici.toLocaleDateString('sv-SE');
    const fiStr = fi.toLocaleDateString('sv-SE');
    const sessionsDelMes = sessionsFutures.filter((s) => s.data >= iniciStr && s.data < fiStr);
    const { precis, parcial, costReal, cost } = costDeSessions(sessionsDelMes);
    const costMes = sessionsDelMes.length === 0 ? costPellicula : cost;
    const ingressosAportacions = aportacionsPerSessio * Math.max(sessionsDelMes.length, 1);

    const ingressosQuotes = (novesAltesPerMes + renovacionsEsperades) * importMitjaQuota;
    const impacteNet = ingressosQuotes + ingressosAportacions - costMes;

    mesos.push({
      etiqueta: `${NOMS_MES[inici.getMonth()]} ${inici.getFullYear()}`,
      novesAltes: novesAltesPerMes,
      sociesDeguts: sociesDeguts.length,
      renovacionsEsperades,
      ingressosQuotes,
      ingressosAportacions,
      sessionsProgramades: sessionsDelMes.length,
      costReal,
      precis,
      parcial,
      costPellicula: costMes,
      impacteNet,
    });
  }

  // Resta del mes actual: només les sessions programades que queden (data
  // estrictament futura). Sense cap, 0: la pel·lícula del mes ja és a les dades
  // reals, i no es preveuen quotes per al que queda de mes.
  const iniciMesSeguent = new Date(avui.getFullYear(), avui.getMonth() + 1, 1).toLocaleDateString('sv-SE');
  const sessionsResta = sessionsFutures.filter((s) => s.data < iniciMesSeguent);
  const resta = costDeSessions(sessionsResta);
  const ingressosAportacionsResta = aportacionsPerSessio * sessionsResta.length;
  const restaMesActual = {
    etiqueta: `${NOMS_MES[avui.getMonth()]} ${avui.getFullYear()}`,
    sessionsProgramades: sessionsResta.length,
    costReal: resta.costReal,
    precis: resta.precis,
    parcial: resta.parcial,
    ingressosQuotes: 0,
    ingressosAportacions: ingressosAportacionsResta,
    costPellicula: resta.cost,
    impacteNet: ingressosAportacionsResta - resta.cost,
  };

  const impacteNetAcumulat = mesos.reduce((acc, m) => acc + m.impacteNet, 0);

  return {
    mesos,
    restaMesActual,
    novesAltesPerMes,
    importMitjaQuota,
    ingressosAportacionsPerMes,
    aportacionsPerSessio,
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
