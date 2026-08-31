export const TIPUS_MOVIMENT = { INGRES: 'ingres', DESPESA: 'despesa', TRASPAS: 'traspas' };

export const CATEGORIES = [
  'Quotes socis',
  'Aportacions',
  'Quotes postsessió',
  'Gestió pel·lícules',
  'Gestió associació',
];

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

export function filtrarMoviments(moviments, { tipus = 'tots', categoria = 'totes', sessionId = 'totes' } = {}) {
  return moviments.filter((moviment) => {
    if (tipus !== 'tots' && moviment.tipus !== tipus) return false;
    if (categoria !== 'totes' && moviment.categoria !== categoria) return false;
    if (sessionId !== 'totes' && (moviment.sessionId || '') !== sessionId) return false;
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

export function resumComptable(moviments) {
  const { caixa, banc, excedent } = calcularSaldos(moviments);
  let ingressosTotal = 0;
  let despesesTotal = 0;
  const ingressosPerCategoriaIMetode = {};
  const despesesPerCategoria = {};

  for (const moviment of moviments) {
    const total = Number(moviment.total) || 0;
    if (moviment.tipus === TIPUS_MOVIMENT.INGRES) {
      ingressosTotal += total;
      const categoria = moviment.categoria ?? '';
      const grup = ingressosPerCategoriaIMetode[categoria] ?? { efectiu: 0, aCompte: 0, total: 0 };
      if (moviment.metodePagament === 'efectiu') grup.efectiu += total;
      else grup.aCompte += total;
      grup.total += total;
      ingressosPerCategoriaIMetode[categoria] = grup;
    } else if (moviment.tipus === TIPUS_MOVIMENT.DESPESA) {
      despesesTotal += total;
      const categoria = moviment.categoria ?? '';
      despesesPerCategoria[categoria] = (despesesPerCategoria[categoria] ?? 0) + total;
    }
  }

  return { excedent, ingressosTotal, despesesTotal, banc, caixa, ingressosPerCategoriaIMetode, despesesPerCategoria };
}
