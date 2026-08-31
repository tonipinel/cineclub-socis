import { describe, it, expect } from 'vitest';
import {
  calcularTotal,
  calcularSaldos,
  filtrarMoviments,
  ordenarMoviments,
  subtotalsPerMetode,
  balancPerSessio,
  formatEuros,
  resumComptable,
  TIPUS_MOVIMENT,
  CATEGORIES,
  METODES_INGRES,
  METODES_DESPESA,
  DIRECCIONS_TRASPAS,
  ETIQUETES_TIPUS,
  ETIQUETES_METODE,
  ETIQUETES_DIRECCIO,
} from './moviments';

describe('calcularTotal', () => {
  it('multiplica preu unitari per quantitat', () => {
    expect(calcularTotal(3, 4)).toBe(12);
  });

  it('retorna 0 si la quantitat és 0', () => {
    expect(calcularTotal(10, 0)).toBe(0);
  });

  it('funciona amb decimals', () => {
    expect(calcularTotal(2.5, 3)).toBe(7.5);
  });
});

describe('calcularSaldos', () => {
  it('suma un ingrés en efectiu a caixa i a l\'excedent', () => {
    const saldos = calcularSaldos([
      { tipus: 'ingres', metodePagament: 'efectiu', total: 100 },
    ]);
    expect(saldos).toEqual({ caixa: 100, banc: 0, excedent: 100 });
  });

  it('suma un ingrés per datàfon o transferència a banc', () => {
    const saldos = calcularSaldos([
      { tipus: 'ingres', metodePagament: 'datafon', total: 50 },
      { tipus: 'ingres', metodePagament: 'transferencia', total: 30 },
    ]);
    expect(saldos).toEqual({ caixa: 0, banc: 80, excedent: 80 });
  });

  it('resta una despesa en efectiu de caixa i de l\'excedent', () => {
    const saldos = calcularSaldos([
      { tipus: 'despesa', metodePagament: 'efectiu', total: 20 },
    ]);
    expect(saldos).toEqual({ caixa: -20, banc: 0, excedent: -20 });
  });

  it('resta una despesa per banc de banc', () => {
    const saldos = calcularSaldos([
      { tipus: 'despesa', metodePagament: 'banc', total: 15 },
    ]);
    expect(saldos).toEqual({ caixa: 0, banc: -15, excedent: -15 });
  });

  it('un traspàs de caixa a banc mou diners d\'un saldo a l\'altre sense afectar l\'excedent', () => {
    const saldos = calcularSaldos([
      { tipus: 'ingres', metodePagament: 'efectiu', total: 200 },
      { tipus: 'traspas', direccio: 'caixa-a-banc', total: 150 },
    ]);
    expect(saldos).toEqual({ caixa: 50, banc: 150, excedent: 200 });
  });

  it('un traspàs de banc a caixa mou diners en sentit contrari', () => {
    const saldos = calcularSaldos([
      { tipus: 'ingres', metodePagament: 'transferencia', total: 200 },
      { tipus: 'traspas', direccio: 'banc-a-caixa', total: 60 },
    ]);
    expect(saldos).toEqual({ caixa: 60, banc: 140, excedent: 200 });
  });

  it('retorna zeros quan no hi ha cap moviment', () => {
    expect(calcularSaldos([])).toEqual({ caixa: 0, banc: 0, excedent: 0 });
  });
});

describe('filtrarMoviments', () => {
  const moviments = [
    { id: '1', tipus: 'ingres', categoria: 'Quotes socis', sessionId: 's1' },
    { id: '2', tipus: 'despesa', categoria: 'Gestió pel·lícules', sessionId: 's1' },
    { id: '3', tipus: 'traspas', sessionId: '' },
  ];

  it('sense filtres retorna tots els moviments', () => {
    expect(filtrarMoviments(moviments)).toHaveLength(3);
  });

  it('filtra per tipus', () => {
    expect(filtrarMoviments(moviments, { tipus: 'ingres' }).map((m) => m.id)).toEqual(['1']);
  });

  it('filtra per categoria', () => {
    expect(filtrarMoviments(moviments, { categoria: 'Gestió pel·lícules' }).map((m) => m.id)).toEqual(['2']);
  });

  it('filtra per sessionId', () => {
    expect(filtrarMoviments(moviments, { sessionId: 's1' }).map((m) => m.id)).toEqual(['1', '2']);
  });

  it('combina diversos filtres', () => {
    expect(
      filtrarMoviments(moviments, { tipus: 'despesa', sessionId: 's1' }).map((m) => m.id)
    ).toEqual(['2']);
  });
});

describe('ordenarMoviments', () => {
  const moviments = [
    { id: 'a', data: '2026-03-01', concepte: 'B concepte', tipus: 'ingres', total: 10 },
    { id: 'b', data: '2026-05-01', concepte: 'A concepte', tipus: 'despesa', total: 30 },
    { id: 'c', data: '2026-01-01', concepte: 'C concepte', tipus: 'ingres', total: 20 },
  ];

  it('per defecte ordena per data descendent', () => {
    expect(ordenarMoviments(moviments).map((m) => m.id)).toEqual(['b', 'a', 'c']);
  });

  it('ordena per data ascendent', () => {
    expect(ordenarMoviments(moviments, { columna: 'data', direccio: 'asc' }).map((m) => m.id)).toEqual(['c', 'a', 'b']);
  });

  it('ordena per total', () => {
    expect(ordenarMoviments(moviments, { columna: 'total', direccio: 'asc' }).map((m) => m.id)).toEqual(['a', 'c', 'b']);
  });

  it('ordena per concepte', () => {
    expect(ordenarMoviments(moviments, { columna: 'concepte', direccio: 'asc' }).map((m) => m.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('subtotalsPerMetode', () => {
  it('suma els imports agrupats per mètode de pagament', () => {
    const moviments = [
      { tipus: 'ingres', metodePagament: 'efectiu', total: 50 },
      { tipus: 'ingres', metodePagament: 'efectiu', total: 30 },
      { tipus: 'ingres', metodePagament: 'datafon', total: 20 },
      { tipus: 'despesa', metodePagament: 'efectiu', total: 10 },
    ];
    expect(subtotalsPerMetode(moviments)).toEqual({ efectiu: 70, datafon: 20 });
  });

  it('ignora els traspassos, que no tenen mètode de pagament', () => {
    expect(subtotalsPerMetode([{ tipus: 'traspas', direccio: 'caixa-a-banc', total: 100 }])).toEqual({});
  });

  it('retorna un objecte buit si no hi ha moviments', () => {
    expect(subtotalsPerMetode([])).toEqual({});
  });
});

describe('balancPerSessio', () => {
  it('calcula ingressos menys despeses per cada sessió', () => {
    const moviments = [
      { sessionId: 's1', tipus: 'ingres', total: 100 },
      { sessionId: 's1', tipus: 'despesa', total: 40 },
      { sessionId: 's2', tipus: 'ingres', total: 30 },
    ];
    expect(balancPerSessio(moviments)).toEqual({ s1: 60, s2: 30 });
  });

  it('ignora els moviments sense sessió i els traspassos', () => {
    const moviments = [
      { sessionId: '', tipus: 'ingres', total: 100 },
      { sessionId: 's1', tipus: 'traspas', direccio: 'caixa-a-banc', total: 50 },
    ];
    expect(balancPerSessio(moviments)).toEqual({});
  });

  it('retorna un objecte buit sense moviments', () => {
    expect(balancPerSessio([])).toEqual({});
  });
});

describe('etiquetes', () => {
  it('exposa les etiquetes catalanes per tipus', () => {
    expect(ETIQUETES_TIPUS).toEqual({
      ingres: 'Ingrés',
      despesa: 'Despesa',
      traspas: 'Traspàs',
    });
  });

  it('exposa les etiquetes catalanes per mètode de pagament', () => {
    expect(ETIQUETES_METODE).toEqual({
      efectiu: 'Efectiu',
      datafon: 'Datàfon',
      transferencia: 'Transferència',
      banc: 'Banc',
    });
  });

  it('exposa les etiquetes catalanes per direcció de traspàs', () => {
    expect(ETIQUETES_DIRECCIO).toEqual({
      'caixa-a-banc': 'Caixa → Banc',
      'banc-a-caixa': 'Banc → Caixa',
    });
  });
});

describe('formatEuros', () => {
  it('formata un import positiu amb dos decimals i el símbol euro', () => {
    expect(formatEuros(100)).toBe('100.00€');
  });

  it('formata un import negatiu', () => {
    expect(formatEuros(-40)).toBe('-40.00€');
  });

  it('evita els artefactes de coma flotant', () => {
    expect(formatEuros(0.1 + 0.2)).toBe('0.30€');
  });
});

describe('constants', () => {
  it('exposa els tipus, categories i mètodes esperats', () => {
    expect(TIPUS_MOVIMENT).toEqual({ INGRES: 'ingres', DESPESA: 'despesa', TRASPAS: 'traspas' });
    expect(CATEGORIES).toEqual([
      'Quotes socis', 'Aportacions', 'Quotes postsessió', 'Gestió pel·lícules', 'Gestió associació',
    ]);
    expect(METODES_INGRES).toEqual(['efectiu', 'datafon', 'transferencia']);
    expect(METODES_DESPESA).toEqual(['efectiu', 'banc']);
    expect(DIRECCIONS_TRASPAS).toEqual(['caixa-a-banc', 'banc-a-caixa']);
  });
});

describe('resumComptable', () => {
  it('calcula excedent, banc i caixa igual que calcularSaldos', () => {
    const moviments = [
      { tipus: 'ingres', categoria: 'Quotes socis', metodePagament: 'efectiu', total: 100 },
      { tipus: 'despesa', categoria: 'Gestió pel·lícules', metodePagament: 'banc', total: 30 },
    ];
    const resultat = resumComptable(moviments);
    const saldos = calcularSaldos(moviments);
    expect(resultat.excedent).toBe(saldos.excedent);
    expect(resultat.banc).toBe(saldos.banc);
    expect(resultat.caixa).toBe(saldos.caixa);
    expect(resultat.ingressosTotal).toBe(100);
    expect(resultat.despesesTotal).toBe(30);
  });

  it('agrupa els ingressos per categoria i mètode (efectiu vs a compte)', () => {
    const moviments = [
      { tipus: 'ingres', categoria: 'Quotes socis', metodePagament: 'efectiu', total: 100 },
      { tipus: 'ingres', categoria: 'Quotes socis', metodePagament: 'transferencia', total: 50 },
      { tipus: 'ingres', categoria: 'Quotes socis', metodePagament: 'datafon', total: 20 },
    ];
    const resultat = resumComptable(moviments).ingressosPerCategoriaIMetode;
    expect(resultat['Quotes socis']).toEqual({ efectiu: 100, aCompte: 70, total: 170 });
  });

  it('no inclou una categoria d\'ingrés sense moviments', () => {
    const moviments = [{ tipus: 'ingres', categoria: 'Quotes socis', metodePagament: 'efectiu', total: 100 }];
    const resultat = resumComptable(moviments).ingressosPerCategoriaIMetode;
    expect(resultat['Quotes postsessió']).toBeUndefined();
  });

  it('agrupa les despeses per categoria dinàmicament', () => {
    const moviments = [
      { tipus: 'despesa', categoria: 'Gestió pel·lícules', metodePagament: 'efectiu', total: 40 },
      { tipus: 'despesa', categoria: 'Gestió associació', metodePagament: 'banc', total: 25 },
      { tipus: 'despesa', categoria: 'Gestió pel·lícules', metodePagament: 'banc', total: 10 },
    ];
    const resultat = resumComptable(moviments).despesesPerCategoria;
    expect(resultat).toEqual({ 'Gestió pel·lícules': 50, 'Gestió associació': 25 });
  });

  it('ignora els traspassos en el desglossament per categoria', () => {
    const moviments = [
      { tipus: 'ingres', categoria: 'Quotes socis', metodePagament: 'efectiu', total: 100 },
      { tipus: 'traspas', direccio: 'caixa-a-banc', total: 50 },
    ];
    const resultat = resumComptable(moviments);
    expect(Object.keys(resultat.ingressosPerCategoriaIMetode)).toEqual(['Quotes socis']);
    expect(resultat.despesesPerCategoria).toEqual({});
  });
});
