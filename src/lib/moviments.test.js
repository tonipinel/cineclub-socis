import { describe, it, expect } from 'vitest';
import {
  calcularTotal,
  calcularSaldos,
  filtrarMoviments,
  ordenarMoviments,
  subtotalsPerMetode,
  balancPerSessio,
  resumEconomicSessio,
  formatEuros,
  resumComptable,
  resumReal,
  resumPrevisio,
  LLINDAR_COST_SESSIO_RENOVACIO,
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
    { id: '1', tipus: 'ingres', categoria: 'Quotes socis', sessionId: 's1', data: '2026-01-10' },
    { id: '2', tipus: 'despesa', categoria: 'Gestió pel·lícules', sessionId: 's1', data: '2026-02-15' },
    { id: '3', tipus: 'traspas', sessionId: '', data: '2026-03-20' },
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

  it('filtra per data des de', () => {
    expect(filtrarMoviments(moviments, { desde: '2026-02-15' }).map((m) => m.id)).toEqual(['2', '3']);
  });

  it('filtra per data fins', () => {
    expect(filtrarMoviments(moviments, { fins: '2026-02-15' }).map((m) => m.id)).toEqual(['1', '2']);
  });

  it('combina desde i fins per acotar un rang', () => {
    expect(
      filtrarMoviments(moviments, { desde: '2026-01-15', fins: '2026-02-28' }).map((m) => m.id)
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

describe('resumEconomicSessio', () => {
  it('agrupa els ingressos per categoria i, dins de cada categoria, per preu unitari i mètode de pagament', () => {
    const moviments = [
      { tipus: 'ingres', categoria: 'Quotes socis', metodePagament: 'efectiu', preuUnitari: 30, quantitat: 4, total: 120 },
      { tipus: 'ingres', categoria: 'Quotes socis', metodePagament: 'datafon', preuUnitari: 5, quantitat: 6, total: 30 },
      { tipus: 'ingres', categoria: 'Aportacions', metodePagament: 'efectiu', preuUnitari: 5, quantitat: 4, total: 20 },
      { tipus: 'despesa', metodePagament: 'banc', total: 201.5 },
    ];
    expect(resumEconomicSessio(moviments)).toEqual({
      ingressosPerCategoria: {
        'Quotes socis': {
          total: 150,
          detalls: [
            { preuUnitari: 30, metode: 'efectiu', quantitat: 4, total: 120 },
            { preuUnitari: 5, metode: 'datafon', quantitat: 6, total: 30 },
          ],
        },
        Aportacions: {
          total: 20,
          detalls: [{ preuUnitari: 5, metode: 'efectiu', quantitat: 4, total: 20 }],
        },
      },
      ingressosTotal: 170,
      despesesTotal: 201.5,
      balanc: -31.5,
    });
  });

  it('suma la quantitat i el total quan es repeteix el mateix preu unitari i mètode dins una categoria', () => {
    const moviments = [
      { tipus: 'ingres', categoria: 'Quotes socis', metodePagament: 'efectiu', preuUnitari: 30, quantitat: 2, total: 60 },
      { tipus: 'ingres', categoria: 'Quotes socis', metodePagament: 'efectiu', preuUnitari: 30, quantitat: 1, total: 30 },
    ];
    expect(resumEconomicSessio(moviments).ingressosPerCategoria['Quotes socis'].detalls).toEqual([
      { preuUnitari: 30, metode: 'efectiu', quantitat: 3, total: 90 },
    ]);
  });

  it('agrupa els ingressos sense categoria sota "Altres ingressos" i sense mètode sota "altres"', () => {
    const moviments = [{ tipus: 'ingres', total: 15 }];
    expect(resumEconomicSessio(moviments).ingressosPerCategoria).toEqual({
      'Altres ingressos': {
        total: 15,
        detalls: [{ preuUnitari: 0, metode: 'altres', quantitat: 1, total: 15 }],
      },
    });
  });

  it('ignora els traspassos', () => {
    const moviments = [{ tipus: 'traspas', direccio: 'caixa-a-banc', total: 100 }];
    expect(resumEconomicSessio(moviments)).toEqual({
      ingressosPerCategoria: {}, ingressosTotal: 0, despesesTotal: 0, balanc: 0,
    });
  });

  it('retorna zeros sense moviments', () => {
    expect(resumEconomicSessio([])).toEqual({
      ingressosPerCategoria: {}, ingressosTotal: 0, despesesTotal: 0, balanc: 0,
    });
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
      'Quotes socis', 'Aportacions', 'Gestió pel·lícules', 'Gestió associació',
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

  it('agrupa els ingressos per categoria i, dins de cada categoria, per preu unitari i mètode', () => {
    const moviments = [
      { tipus: 'ingres', categoria: 'Quotes socis', metodePagament: 'efectiu', preuUnitari: 100, quantitat: 1, total: 100 },
      { tipus: 'ingres', categoria: 'Quotes socis', metodePagament: 'transferencia', preuUnitari: 50, quantitat: 1, total: 50 },
      { tipus: 'ingres', categoria: 'Quotes socis', metodePagament: 'datafon', preuUnitari: 20, quantitat: 1, total: 20 },
    ];
    const resultat = resumComptable(moviments).ingressosPerCategoria;
    expect(resultat['Quotes socis'].total).toBe(170);
    expect(resultat['Quotes socis'].detalls).toEqual([
      { preuUnitari: 100, metode: 'efectiu', quantitat: 1, total: 100 },
      { preuUnitari: 50, metode: 'transferencia', quantitat: 1, total: 50 },
      { preuUnitari: 20, metode: 'datafon', quantitat: 1, total: 20 },
    ]);
  });

  it('no inclou una categoria d\'ingrés sense moviments', () => {
    const moviments = [{ tipus: 'ingres', categoria: 'Quotes socis', metodePagament: 'efectiu', total: 100 }];
    const resultat = resumComptable(moviments).ingressosPerCategoria;
    expect(resultat['Aportacions']).toBeUndefined();
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
    expect(Object.keys(resultat.ingressosPerCategoria)).toEqual(['Quotes socis']);
    expect(resultat.despesesPerCategoria).toEqual({});
  });
});

describe('resumReal', () => {
  const avui = new Date(2026, 7, 31);

  it('retorna 12 mesos, acabant amb el mes actual, amb el nom i any correctes', () => {
    const resultat = resumReal([], avui);
    expect(resultat.mesos).toHaveLength(12);
    expect(resultat.mesos.map((m) => m.etiqueta)).toEqual([
      'Setembre 2025', 'Octubre 2025', 'Novembre 2025', 'Desembre 2025', 'Gener 2026', 'Febrer 2026',
      'Març 2026', 'Abril 2026', 'Maig 2026', 'Juny 2026', 'Juliol 2026', 'Agost 2026',
    ]);
  });

  it('suma els moviments reals de cada mes, sense estimar res', () => {
    const moviments = [
      { data: '2026-07-05', tipus: 'ingres', categoria: 'Quotes socis', total: 30 },
      { data: '2026-07-20', tipus: 'ingres', categoria: 'Quotes socis', total: 10 },
      { data: '2026-08-05', tipus: 'ingres', categoria: 'Aportacions', total: 20 },
      { data: '2026-07-15', tipus: 'despesa', categoria: 'Gestió pel·lícules', total: 150 },
    ];
    const resultat = resumReal(moviments, avui);
    const juliol = resultat.mesos.find((m) => m.etiqueta === 'Juliol 2026');
    const agost = resultat.mesos.find((m) => m.etiqueta === 'Agost 2026');
    expect(juliol.nombreQuotes).toBe(2);
    expect(juliol.ingressosQuotes).toBe(40);
    expect(juliol.costPellicula).toBe(150);
    expect(juliol.impacteNet).toBeCloseTo(40 - 150);
    expect(agost.ingressosAportacions).toBe(20);
    expect(agost.costPellicula).toBe(0);
  });

  it('calcula la tresoreria acumulada real fins al final de cada mes', () => {
    const moviments = [
      { data: '2026-06-10', tipus: 'ingres', categoria: 'Quotes socis', metodePagament: 'efectiu', total: 100 },
      { data: '2026-07-10', tipus: 'ingres', categoria: 'Quotes socis', metodePagament: 'efectiu', total: 50 },
    ];
    const resultat = resumReal(moviments, avui);
    const juny = resultat.mesos.find((m) => m.etiqueta === 'Juny 2026');
    const juliol = resultat.mesos.find((m) => m.etiqueta === 'Juliol 2026');
    const agost = resultat.mesos.find((m) => m.etiqueta === 'Agost 2026');
    expect(juny.tresoreria).toBe(100);
    expect(juliol.tresoreria).toBe(150);
    expect(agost.tresoreria).toBe(150);
  });

  it('el mes actual inclou els moviments fins avui', () => {
    const moviments = [{ data: '2026-08-31', tipus: 'ingres', categoria: 'Aportacions', total: 5 }];
    const resultat = resumReal(moviments, avui);
    const agost = resultat.mesos.find((m) => m.etiqueta === 'Agost 2026');
    expect(agost.ingressosAportacions).toBe(5);
  });

  it('retorna zeros sense moviments', () => {
    const resultat = resumReal([], avui);
    expect(resultat.mesos.every((m) => (
      m.nombreQuotes === 0 && m.ingressosQuotes === 0 && m.ingressosAportacions === 0
      && m.costPellicula === 0 && m.impacteNet === 0 && m.tresoreria === 0
    ))).toBe(true);
  });
});

describe('resumPrevisio', () => {
  // Constructor de 3 arguments (any, mes, dia), sempre hora local.
  const avui = new Date(2026, 7, 31);
  // Sense socis/sessions/accessLog no hi ha cap soci amb venciment conegut,
  // així que totes les renovacions esperades queden a 0: aquests tests
  // només verifiquen el ritme d'altes noves i la resta del desglossament
  // mensual, no el càlcul de renovacions per data de venciment real (cobert
  // més avall).
  const previsio = (moviments, data) => resumPrevisio(moviments, [], [], [], data);

  it('retorna 12 mesos, a partir del mes vinent, amb el nom i any correctes', () => {
    const resultat = previsio([], avui);
    expect(resultat.mesos).toHaveLength(12);
    expect(resultat.mesos.map((m) => m.etiqueta)).toEqual([
      'Setembre 2026', 'Octubre 2026', 'Novembre 2026', 'Desembre 2026', 'Gener 2027', 'Febrer 2027',
      'Març 2027', 'Abril 2027', 'Maig 2027', 'Juny 2027', 'Juliol 2027', 'Agost 2027',
    ]);
  });

  it('reparteix les quotes dels últims 3 mesos en un ritme mensual mitjà de noves altes', () => {
    const moviments = [
      { data: '2026-06-05', tipus: 'ingres', categoria: 'Quotes socis', total: 30 },
      { data: '2026-07-05', tipus: 'ingres', categoria: 'Quotes socis', total: 30 },
      { data: '2026-08-05', tipus: 'ingres', categoria: 'Quotes socis', total: 30 },
    ];
    const resultat = previsio(moviments, avui);
    expect(resultat.novesAltesPerMes).toBe(1);
    expect(resultat.importMitjaQuota).toBe(30);
    expect(resultat.mesos[0].novesAltes).toBe(1);
    expect(resultat.mesos[11].ingressosQuotes).toBe(30);
  });

  it('exclou les renovacions (tipusQuota "renovacio") del ritme de noves altes', () => {
    const moviments = [
      { data: '2026-06-05', tipus: 'ingres', categoria: 'Quotes socis', tipusQuota: 'alta', total: 30 },
      { data: '2026-07-05', tipus: 'ingres', categoria: 'Quotes socis', tipusQuota: 'renovacio', total: 30 },
      { data: '2026-08-05', tipus: 'ingres', categoria: 'Quotes socis', tipusQuota: 'alta', total: 30 },
    ];
    const resultat = previsio(moviments, avui);
    // Només 2 dels 3 moviments són altes; el ritme es reparteix igualment
    // entre els 3 mesos de referència.
    expect(resultat.novesAltesPerMes).toBeCloseTo(2 / 3);
  });

  it('ignora moviments anteriors als últims 3 mesos', () => {
    const moviments = [
      { data: '2026-04-01', tipus: 'ingres', categoria: 'Quotes socis', total: 30 },
    ];
    const resultat = previsio(moviments, avui);
    expect(resultat.novesAltesPerMes).toBe(0);
  });

  it('reparteix les aportacions dels últims 3 mesos en un ritme mensual mitjà', () => {
    const moviments = [
      { data: '2026-06-10', tipus: 'ingres', categoria: 'Aportacions', total: 30 },
      { data: '2026-07-10', tipus: 'ingres', categoria: 'Aportacions', total: 30 },
      { data: '2026-08-10', tipus: 'ingres', categoria: 'Aportacions', total: 30 },
    ];
    const resultat = previsio(moviments, avui);
    expect(resultat.ingressosAportacionsPerMes).toBe(30);
  });

  it('agafa el cost de pel·lícula més car (no la mitjana) dels últims 3 mesos, i el manté fix cada mes', () => {
    const moviments = [
      { data: '2026-06-15', tipus: 'despesa', categoria: 'Gestió pel·lícules', total: 80 },
      { data: '2026-07-15', tipus: 'despesa', categoria: 'Gestió pel·lícules', total: 150 },
      { data: '2026-08-15', tipus: 'despesa', categoria: 'Gestió pel·lícules', total: 100 },
    ];
    const resultat = previsio(moviments, avui);
    expect(resultat.costPellicula).toBe(150);
    expect(resultat.mesos.every((m) => m.costPellicula === 150)).toBe(true);
  });

  it('sense cap soci amb venciment conegut, les renovacions esperades són 0 cada mes', () => {
    const resultat = previsio([], avui);
    expect(resultat.mesos.every((m) => m.sociesDeguts === 0 && m.renovacionsEsperades === 0)).toBe(true);
  });

  it('calcula l\'impacte net mensual (sense renovacions) i l\'acumulat dels 12 mesos', () => {
    const moviments = [
      { data: '2026-08-05', tipus: 'ingres', categoria: 'Quotes socis', total: 30 },
      { data: '2026-08-10', tipus: 'ingres', categoria: 'Aportacions', total: 20 },
      { data: '2026-08-15', tipus: 'despesa', categoria: 'Gestió pel·lícules', total: 100 },
    ];
    const resultat = previsio(moviments, avui);
    // Noves altes: 1/3 de mitjana * 30€ = 10€, aportacions: 20/3 = 6.67€, pel·lícula: 100€.
    const impacteNetPerMes = 10 + 20 / 3 - 100;
    expect(resultat.mesos[0].impacteNet).toBeCloseTo(impacteNetPerMes);
    expect(resultat.impacteNetAcumulat).toBeCloseTo(impacteNetPerMes * 12);
  });

  it('retorna zeros si no hi ha moviments en els últims 3 mesos', () => {
    const resultat = previsio([], avui);
    expect(resultat.novesAltesPerMes).toBe(0);
    expect(resultat.ingressosAportacionsPerMes).toBe(0);
    expect(resultat.costPellicula).toBe(0);
    expect(resultat.impacteNetAcumulat).toBe(0);
  });
});

describe('resumPrevisio — renovacions per data de venciment real', () => {
  const avui = new Date(2026, 7, 31);
  // Cap d'aquests moviments cau en els últims 3 mesos (estan datats a finals
  // de 2025), així que novesAltesPerMes és 0 i no interfereixen amb les
  // renovacions que estem provant.
  const sessions = [
    { id: 'sA', data: '2026-08-01' },
    { id: 'sB', data: '2026-08-15' },
  ];

  it('només compta un soci com a "degut" en el mes exacte en què li venç la quota', () => {
    const socis = [
      // ultimPagament 2025-10-01 -> venciment 2026-10-01 -> Octubre 2026
      { numeroSoci: 10, ultimPagament: '2025-10-01' },
      // ultimPagament 2025-11-05 -> venciment 2026-11-05 -> Novembre 2026
      { numeroSoci: 20, ultimPagament: '2025-11-05' },
    ];
    const moviments = [
      { data: '2025-10-01', tipus: 'ingres', categoria: 'Quotes socis', numeroSoci: 10, total: 10 },
      { data: '2025-11-05', tipus: 'ingres', categoria: 'Quotes socis', numeroSoci: 20, total: 30 },
    ];
    const accessLog = [
      { tipus: 'soci', numeroSoci: 10, sessionId: 'sA' },
      { tipus: 'soci', numeroSoci: 10, sessionId: 'sB' },
      { tipus: 'soci', numeroSoci: 20, sessionId: 'sA' },
    ];
    const resultat = resumPrevisio(moviments, socis, sessions, accessLog, avui);
    const octubre = resultat.mesos.find((m) => m.etiqueta === 'Octubre 2026');
    const novembre = resultat.mesos.find((m) => m.etiqueta === 'Novembre 2026');
    const desembre = resultat.mesos.find((m) => m.etiqueta === 'Desembre 2026');
    expect(octubre.sociesDeguts).toBe(1);
    expect(novembre.sociesDeguts).toBe(1);
    expect(desembre.sociesDeguts).toBe(0);
  });

  it('descarta de les renovacions esperades un soci amb cost per sessió per sobre del llindar', () => {
    const socis = [
      // 10€ ÷ 2 sessions assistides = 5€/sessió -> per sota del llindar, renova.
      { numeroSoci: 10, ultimPagament: '2025-10-01' },
      // 30€ ÷ 1 sessió assistida = 30€/sessió -> per sobre del llindar, no renova.
      { numeroSoci: 20, ultimPagament: '2025-10-15' },
    ];
    const moviments = [
      { data: '2025-10-01', tipus: 'ingres', categoria: 'Quotes socis', numeroSoci: 10, total: 10 },
      { data: '2025-10-15', tipus: 'ingres', categoria: 'Quotes socis', numeroSoci: 20, total: 30 },
    ];
    const accessLog = [
      { tipus: 'soci', numeroSoci: 10, sessionId: 'sA' },
      { tipus: 'soci', numeroSoci: 10, sessionId: 'sB' },
      { tipus: 'soci', numeroSoci: 20, sessionId: 'sA' },
    ];
    const resultat = resumPrevisio(moviments, socis, sessions, accessLog, avui);
    const octubre = resultat.mesos.find((m) => m.etiqueta === 'Octubre 2026');
    expect(octubre.sociesDeguts).toBe(2);
    expect(octubre.renovacionsEsperades).toBe(1);
  });

  it('usa inicPeriode (no ultimPagament) per comptar les sessions assistides del període actual', () => {
    // ultimPagament és molt anterior a totes dues sessions (sA i sB), així que
    // sense inicPeriode comptarien totes dues: 10€ ÷ 2 = 5€/sessió (renova).
    // Amb inicPeriode fixat entre sA i sB, només compta sB: 10€ ÷ 1 = 10€/sessió
    // (per sobre del llindar de 8€, no renova).
    const socis = [{ numeroSoci: 10, ultimPagament: '2025-10-01', inicPeriode: '2026-08-10' }];
    const moviments = [
      { data: '2025-10-01', tipus: 'ingres', categoria: 'Quotes socis', numeroSoci: 10, total: 10 },
    ];
    const accessLog = [
      { tipus: 'soci', numeroSoci: 10, sessionId: 'sA' },
      { tipus: 'soci', numeroSoci: 10, sessionId: 'sB' },
    ];
    const resultat = resumPrevisio(moviments, socis, sessions, accessLog, avui);
    const octubre = resultat.mesos.find((m) => m.etiqueta === 'Octubre 2026');
    expect(octubre.renovacionsEsperades).toBe(0);
  });

  it('reconeix pagaments amb tipusQuota "renovacio" (no només "alta") per calcular el cost per sessió', () => {
    // 10€ ÷ 2 sessions assistides = 5€/sessió -> per sota del llindar, renova.
    const socis = [{ numeroSoci: 10, ultimPagament: '2025-10-01' }];
    const moviments = [
      { data: '2025-10-01', tipus: 'ingres', categoria: 'Quotes socis', tipusQuota: 'renovacio', numeroSoci: 10, total: 10 },
    ];
    const accessLog = [
      { tipus: 'soci', numeroSoci: 10, sessionId: 'sA' },
      { tipus: 'soci', numeroSoci: 10, sessionId: 'sB' },
    ];
    const resultat = resumPrevisio(moviments, socis, sessions, accessLog, avui);
    const octubre = resultat.mesos.find((m) => m.etiqueta === 'Octubre 2026');
    expect(octubre.renovacionsEsperades).toBe(1);
  });

  it('dona el benefici del dubte (compta com a probable) a un soci degut sense sessions assistides encara', () => {
    const socis = [{ numeroSoci: 10, ultimPagament: '2025-10-01' }];
    const moviments = [
      { data: '2025-10-01', tipus: 'ingres', categoria: 'Quotes socis', numeroSoci: 10, total: 30 },
    ];
    const resultat = resumPrevisio(moviments, socis, sessions, [], avui);
    const octubre = resultat.mesos.find((m) => m.etiqueta === 'Octubre 2026');
    expect(octubre.sociesDeguts).toBe(1);
    expect(octubre.renovacionsEsperades).toBe(1);
  });

  it('ignora els socis desactivats a l\'hora de comptar deguts', () => {
    const socis = [{ numeroSoci: 10, ultimPagament: '2025-10-01', actiu: false }];
    const moviments = [
      { data: '2025-10-01', tipus: 'ingres', categoria: 'Quotes socis', numeroSoci: 10, total: 30 },
    ];
    const resultat = resumPrevisio(moviments, socis, sessions, [], avui);
    const octubre = resultat.mesos.find((m) => m.etiqueta === 'Octubre 2026');
    expect(octubre.sociesDeguts).toBe(0);
  });

  it('suma l\'ingrés esperat de renovacions al de noves altes, amb l\'import mitjà de quota', () => {
    const socis = [{ numeroSoci: 10, ultimPagament: '2025-10-01' }];
    const moviments = [
      { data: '2025-10-01', tipus: 'ingres', categoria: 'Quotes socis', numeroSoci: 10, total: 10 },
    ];
    const accessLog = [
      { tipus: 'soci', numeroSoci: 10, sessionId: 'sA' },
      { tipus: 'soci', numeroSoci: 10, sessionId: 'sB' },
    ];
    const resultat = resumPrevisio(moviments, socis, sessions, accessLog, avui);
    // Cap quota en els últims 3 mesos -> importMitjaQuota per defecte 30€.
    expect(resultat.importMitjaQuota).toBe(30);
    const octubre = resultat.mesos.find((m) => m.etiqueta === 'Octubre 2026');
    expect(octubre.renovacionsEsperades).toBe(1);
    expect(octubre.ingressosQuotes).toBe(30);
  });
});

describe('LLINDAR_COST_SESSIO_RENOVACIO', () => {
  it('és de 8€', () => {
    expect(LLINDAR_COST_SESSIO_RENOVACIO).toBe(8);
  });
});
