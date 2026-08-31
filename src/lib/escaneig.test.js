import { describe, it, expect } from 'vitest';
import {
  entradesPerFranjaHorariaFixa,
  identificarCodi, codisDesDe, tiquetsDelLot, trobarLotDelCodi, tiquetEstaAnulat,
  resumAccessLog, assistenciaPerSessio, comptarAssistenciesRecents, resumPerSessio,
  resumDashboardTiquets, entradesPerFranjaHoraria,
} from './escaneig';
import { carnetPayload } from './carnet';

describe('identificarCodi', () => {
  it('reconeix un codi de soci', () => {
    expect(identificarCodi('SOCI-42')).toEqual({ tipus: 'soci', numeroSoci: 42 });
  });

  it('ja no reconeix el format antic de lots (L1-/L2-, tiquets que ja no existeixen)', () => {
    expect(identificarCodi('L1-014')).toEqual({ tipus: 'desconegut' });
    expect(identificarCodi('L2-150')).toEqual({ tipus: 'desconegut' });
  });

  it('reconeix un codi de tiquet genèric incremental (format nou)', () => {
    expect(identificarCodi('T-000123')).toEqual({ tipus: 'generic', codiTiquet: 'T-000123' });
  });

  it('retorna desconegut per a un codi que no coincideix amb cap patró', () => {
    expect(identificarCodi('XYZ-123')).toEqual({ tipus: 'desconegut' });
    expect(identificarCodi('')).toEqual({ tipus: 'desconegut' });
  });

  it('ignora espais en blanc al voltant del codi', () => {
    expect(identificarCodi('  SOCI-7  ')).toEqual({ tipus: 'soci', numeroSoci: 7 });
  });

  it('identifica correctament un codi generat per carnetPayload', () => {
    expect(identificarCodi(carnetPayload({ numeroSoci: 42 }))).toEqual({ tipus: 'soci', numeroSoci: 42 });
  });
});

describe('codisDesDe', () => {
  it('genera codis incrementals a partir del número indicat', () => {
    const codis = codisDesDe(1, 5);
    expect(codis).toEqual(['T-000001', 'T-000002', 'T-000003', 'T-000004', 'T-000005']);
  });

  it('continua des d\'un número diferent de 1', () => {
    const codis = codisDesDe(151, 3);
    expect(codis).toEqual(['T-000151', 'T-000152', 'T-000153']);
  });

  it('cada codi generat s\'identifica com a tiquet genèric', () => {
    expect(codisDesDe(1, 3).every((c) => identificarCodi(c).tipus === 'generic')).toBe(true);
  });
});

describe('tiquetsDelLot', () => {
  it('marca com a usats els codis del lot que apareixen a l\'accessLog', () => {
    const lot = { numeroInicial: 1, quantitat: 3 };
    const entrades = [
      { tipus: 'generic', codiTiquet: 'T-000002' },
      { tipus: 'soci', numeroSoci: 7 },
    ];
    expect(tiquetsDelLot(lot, entrades)).toEqual([
      { codi: 'T-000001', usat: false },
      { codi: 'T-000002', usat: true },
      { codi: 'T-000003', usat: false },
    ]);
  });

  it('cap tiquet usat si l\'accessLog és buit', () => {
    const lot = { numeroInicial: 10, quantitat: 2 };
    expect(tiquetsDelLot(lot, [])).toEqual([
      { codi: 'T-000010', usat: false },
      { codi: 'T-000011', usat: false },
    ]);
  });
});

describe('trobarLotDelCodi', () => {
  const lots = [
    { numeroInicial: 1, quantitat: 150 },
    { numeroInicial: 151, quantitat: 150 },
  ];

  it('troba el lot al qual pertany un codi', () => {
    expect(trobarLotDelCodi('T-000047', lots)).toEqual([lots[0]]);
    expect(trobarLotDelCodi('T-000200', lots)).toEqual([lots[1]]);
  });

  it('retorna una llista buida per a un codi que no pertany a cap lot conegut', () => {
    expect(trobarLotDelCodi('T-999999', lots)).toEqual([]);
    expect(trobarLotDelCodi('L1-014', lots)).toEqual([]);
  });

  it('retorna tots els lots que coincideixen si els rangs se superposen', () => {
    const lotsSuperposats = [
      { numeroInicial: 1, quantitat: 150 },
      { numeroInicial: 1, quantitat: 150 },
    ];
    expect(trobarLotDelCodi('T-000047', lotsSuperposats)).toEqual(lotsSuperposats);
  });
});

describe('tiquetEstaAnulat', () => {
  it('és cert si tot el lot està anul·lat', () => {
    const lots = [{ numeroInicial: 1, quantitat: 150, anulat: true }];
    expect(tiquetEstaAnulat('T-000047', lots)).toBe(true);
  });

  it('és cert si el codi concret està a la llista de codis anul·lats del lot', () => {
    const lots = [{ numeroInicial: 1, quantitat: 150, anulat: false, codisAnulats: ['T-000047'] }];
    expect(tiquetEstaAnulat('T-000047', lots)).toBe(true);
    expect(tiquetEstaAnulat('T-000048', lots)).toBe(false);
  });

  it('és fals si el codi no pertany a cap lot conegut (p. ex. format antic de lots)', () => {
    expect(tiquetEstaAnulat('L1-014', [{ numeroInicial: 1, quantitat: 150, anulat: true }])).toBe(false);
  });

  it('és cert si algun dels lots que se superposen amb el codi està anul·lat', () => {
    const lotsSuperposats = [
      { numeroInicial: 1, quantitat: 150, anulat: true },
      { numeroInicial: 1, quantitat: 150, anulat: false },
    ];
    expect(tiquetEstaAnulat('T-000047', lotsSuperposats)).toBe(true);
  });
});

describe('resumAccessLog', () => {
  it('compta socis diferents, entrades genèriques i import acumulat', () => {
    const entrades = [
      { tipus: 'soci', numeroSoci: 1 },
      { tipus: 'soci', numeroSoci: 2 },
      { tipus: 'soci', numeroSoci: 1 },
      { tipus: 'generic', codiTiquet: 'L1-001', preuAplicat: 5 },
      { tipus: 'generic', codiTiquet: 'L1-002', preuAplicat: 5 },
    ];
    expect(resumAccessLog(entrades)).toEqual({ socisDistints: 2, entradesGeneriques: 2, importGeneric: 10 });
  });

  it('retorna zeros amb una llista buida', () => {
    expect(resumAccessLog([])).toEqual({ socisDistints: 0, entradesGeneriques: 0, importGeneric: 0 });
  });
});

describe('assistenciaPerSessio', () => {
  const sessions = [
    { id: 's1', titol: 'The Artist', data: '2026-03-05' },
    { id: 's2', titol: 'Pig', data: '2026-06-25' },
    { id: 's3', titol: 'Jane Eyre', data: '2026-08-06' },
  ];

  it('marca com a assistides només les sessions amb una entrada d\'aquest soci', () => {
    const entradesSoci = [{ sessionId: 's1' }, { sessionId: 's3' }];
    expect(assistenciaPerSessio(sessions, entradesSoci)).toEqual([
      { id: 's3', titol: 'Jane Eyre', data: '2026-08-06', assisteix: true },
      { id: 's2', titol: 'Pig', data: '2026-06-25', assisteix: false },
      { id: 's1', titol: 'The Artist', data: '2026-03-05', assisteix: true },
    ]);
  });

  it('marca totes les sessions com a no assistides si el soci no té cap entrada', () => {
    expect(assistenciaPerSessio(sessions, []).every((s) => !s.assisteix)).toBe(true);
  });
});

describe('comptarAssistenciesRecents', () => {
  const avui = new Date('2026-08-31T12:00:00');

  it('compta les entrades de soci dels últims 12 mesos, agrupades per numeroSoci', () => {
    const entrades = [
      { tipus: 'soci', numeroSoci: 7, sessionId: 's1', data: new Date('2026-08-06T19:00:00') },
      { tipus: 'soci', numeroSoci: 7, sessionId: 's2', data: new Date('2026-06-25T19:00:00') },
      { tipus: 'soci', numeroSoci: 12, sessionId: 's3', data: new Date('2026-03-05T19:00:00') },
      { tipus: 'generic', codiTiquet: 'L1-001', data: new Date('2026-08-06T19:00:00') },
    ];
    expect(comptarAssistenciesRecents(entrades, avui)).toEqual({ 7: 2, 12: 1 });
  });

  it('compta una mateixa sessió una sola vegada encara que el soci hi tingui diverses entrades', () => {
    const entrades = [
      { tipus: 'soci', numeroSoci: 7, sessionId: 's1', data: new Date('2026-08-06T19:00:00') },
      { tipus: 'soci', numeroSoci: 7, sessionId: 's1', data: new Date('2026-08-06T19:05:00') },
    ];
    expect(comptarAssistenciesRecents(entrades, avui)).toEqual({ 7: 1 });
  });

  it('ignora les entrades de fa més de 12 mesos', () => {
    const entrades = [
      { tipus: 'soci', numeroSoci: 7, data: new Date('2024-01-01T19:00:00') },
    ];
    expect(comptarAssistenciesRecents(entrades, avui)).toEqual({});
  });

  it('retorna un objecte buit amb una llista buida', () => {
    expect(comptarAssistenciesRecents([], avui)).toEqual({});
  });
});

describe('resumPerSessio', () => {
  it('agrupa les entrades per sessió i en calcula el resum', () => {
    const entrades = [
      { sessionId: 's1', tipus: 'soci', numeroSoci: 1 },
      { sessionId: 's1', tipus: 'generic', preuAplicat: 5 },
      { sessionId: 's2', tipus: 'soci', numeroSoci: 2 },
    ];
    expect(resumPerSessio(entrades)).toEqual({
      s1: { socisDistints: 1, entradesGeneriques: 1, importGeneric: 5 },
      s2: { socisDistints: 1, entradesGeneriques: 0, importGeneric: 0 },
    });
  });

  it('ignora les entrades sense sessionId', () => {
    expect(resumPerSessio([{ tipus: 'soci', numeroSoci: 1 }])).toEqual({});
  });

  it('retorna un objecte buit amb una llista buida', () => {
    expect(resumPerSessio([])).toEqual({});
  });
});

describe('resumDashboardTiquets', () => {
  it('retorna 0 disponibles si no hi ha lots', () => {
    expect(resumDashboardTiquets([], [], [])).toEqual({ disponibles: 0, gastatsUltimaSessio: 0 });
  });

  it('compta els tiquets no usats de tots els lots no anul·lats', () => {
    const lots = [
      { numeroInicial: 1, quantitat: 3, anulat: false, codisAnulats: [] },
      { numeroInicial: 100, quantitat: 2, anulat: false, codisAnulats: [] },
    ];
    expect(resumDashboardTiquets(lots, [], []).disponibles).toBe(5);
  });

  it('descompta els tiquets ja usats', () => {
    const lots = [{ numeroInicial: 1, quantitat: 3, anulat: false, codisAnulats: [] }];
    const entradesAccessLog = [{ tipus: 'generic', codiTiquet: 'T-000001' }];
    expect(resumDashboardTiquets(lots, entradesAccessLog, []).disponibles).toBe(2);
  });

  it('exclou tot un lot anul·lat', () => {
    const lots = [{ numeroInicial: 1, quantitat: 3, anulat: true, codisAnulats: [] }];
    expect(resumDashboardTiquets(lots, [], []).disponibles).toBe(0);
  });

  it('exclou un tiquet anul·lat individualment encara que el lot no estigui anul·lat', () => {
    const lots = [{ numeroInicial: 1, quantitat: 3, anulat: false, codisAnulats: ['T-000002'] }];
    expect(resumDashboardTiquets(lots, [], []).disponibles).toBe(2);
  });

  it('gastatsUltimaSessio és 0 si no hi ha sessions', () => {
    expect(resumDashboardTiquets([], [], []).gastatsUltimaSessio).toBe(0);
  });

  it('gastatsUltimaSessio compta les entrades genèriques de la sessió més recent per data', () => {
    const sessions = [
      { id: 's1', data: '2026-08-01' },
      { id: 's2', data: '2026-08-15' },
    ];
    const entradesAccessLog = [
      { tipus: 'generic', codiTiquet: 'T-000001', sessionId: 's1' },
      { tipus: 'generic', codiTiquet: 'T-000002', sessionId: 's2' },
      { tipus: 'generic', codiTiquet: 'T-000003', sessionId: 's2' },
      { tipus: 'soci', numeroSoci: 7, sessionId: 's2' },
    ];
    expect(resumDashboardTiquets([], entradesAccessLog, sessions).gastatsUltimaSessio).toBe(2);
  });

  it('gastatsUltimaSessio ignora sessions futures i pren la darrera sessió ja passada', () => {
    const avui = new Date(2026, 7, 31);
    const sessions = [
      { id: 's1', data: '2026-08-01' },
      { id: 's2', data: '2099-01-01' },
    ];
    const entradesAccessLog = [
      { tipus: 'generic', codiTiquet: 'T-000001', sessionId: 's1' },
      { tipus: 'generic', codiTiquet: 'T-000002', sessionId: 's1' },
      { tipus: 'generic', codiTiquet: 'T-000003', sessionId: 's2' },
    ];
    expect(resumDashboardTiquets([], entradesAccessLog, sessions, avui).gastatsUltimaSessio).toBe(2);
  });
});

describe('entradesPerFranjaHoraria', () => {
  it('retorna un array buit si no hi ha entrades', () => {
    expect(entradesPerFranjaHoraria([])).toEqual([]);
  });

  it('agrupa les entrades en franges de 30 minuts, ordenades cronològicament', () => {
    const entrades = [
      { timestamp: { toDate: () => new Date(2026, 7, 31, 20, 45) } },
      { timestamp: { toDate: () => new Date(2026, 7, 31, 20, 10) } },
      { timestamp: { toDate: () => new Date(2026, 7, 31, 20, 20) } },
      { timestamp: { toDate: () => new Date(2026, 7, 31, 21, 5) } },
    ];
    expect(entradesPerFranjaHoraria(entrades)).toEqual([
      { franja: '20:00', total: 2 },
      { franja: '20:30', total: 1 },
      { franja: '21:00', total: 1 },
    ]);
  });

  it('ignora les entrades sense timestamp', () => {
    const entrades = [
      { timestamp: { toDate: () => new Date(2026, 7, 31, 20, 10) } },
      { timestamp: null },
      {},
    ];
    expect(entradesPerFranjaHoraria(entrades)).toEqual([{ franja: '20:00', total: 1 }]);
  });
});

describe('entradesPerFranjaHorariaFixa', () => {
  it("genera franges fixes de 15 min des d'una hora abans de l'inici fins a 30 min després", () => {
    expect(entradesPerFranjaHorariaFixa([], '19:00')).toEqual([
      { franja: '18:00', total: 0 },
      { franja: '18:15', total: 0 },
      { franja: '18:30', total: 0 },
      { franja: '18:45', total: 0 },
      { franja: '19:00', total: 0 },
      { franja: '19:15', total: 0 },
      { franja: '19:30', total: 0 },
    ]);
  });

  it('omple les franges amb el recompte real d\'entrades', () => {
    const entrades = [
      { timestamp: { toDate: () => new Date(2026, 7, 31, 18, 20) } },
      { timestamp: { toDate: () => new Date(2026, 7, 31, 19, 5) } },
      { timestamp: { toDate: () => new Date(2026, 7, 31, 19, 5) } },
    ];
    expect(entradesPerFranjaHorariaFixa(entrades, '19:00')).toEqual([
      { franja: '18:00', total: 0 },
      { franja: '18:15', total: 1 },
      { franja: '18:30', total: 0 },
      { franja: '18:45', total: 0 },
      { franja: '19:00', total: 2 },
      { franja: '19:15', total: 0 },
      { franja: '19:30', total: 0 },
    ]);
  });

  it('sempre retorna el mateix nombre de franges, independentment de les entrades, perquè la proporció sigui consistent entre sessions', () => {
    const ambEntrades = entradesPerFranjaHorariaFixa(
      [{ timestamp: { toDate: () => new Date(2026, 7, 31, 19, 0) } }], '19:00'
    );
    const senseEntrades = entradesPerFranjaHorariaFixa([], '19:00');
    expect(ambEntrades).toHaveLength(senseEntrades.length);
  });
});
