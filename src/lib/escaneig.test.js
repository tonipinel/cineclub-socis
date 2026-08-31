import { describe, it, expect } from 'vitest';
import {
  identificarCodi, codisDesDe, tiquetsDelLot, trobarLotDelCodi, tiquetEstaAnulat,
  resumAccessLog, assistenciaPerSessio, comptarAssistenciesRecents, resumPerSessio,
} from './escaneig';
import { carnetPayload } from './carnet';

describe('identificarCodi', () => {
  it('reconeix un codi de soci', () => {
    expect(identificarCodi('SOCI-42')).toEqual({ tipus: 'soci', numeroSoci: 42 });
  });

  it('reconeix un codi de tiquet genèric (format antic de lots)', () => {
    expect(identificarCodi('L1-014')).toEqual({ tipus: 'generic', codiTiquet: 'L1-014' });
    expect(identificarCodi('L2-150')).toEqual({ tipus: 'generic', codiTiquet: 'L2-150' });
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
