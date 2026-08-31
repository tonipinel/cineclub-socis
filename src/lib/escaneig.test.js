import { describe, it, expect } from 'vitest';
import {
  identificarCodi, codisDeLot, resumAccessLog, assistenciaPerSessio, comptarAssistenciesRecents,
  resumPerSessio,
} from './escaneig';
import { carnetPayload } from './carnet';

describe('identificarCodi', () => {
  it('reconeix un codi de soci', () => {
    expect(identificarCodi('SOCI-42')).toEqual({ tipus: 'soci', numeroSoci: 42 });
  });

  it('reconeix un codi de tiquet genèric', () => {
    expect(identificarCodi('L1-014')).toEqual({ tipus: 'generic', codiTiquet: 'L1-014' });
    expect(identificarCodi('L2-150')).toEqual({ tipus: 'generic', codiTiquet: 'L2-150' });
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

describe('codisDeLot', () => {
  it('genera 150 codis del lot 1, del 001 al 150', () => {
    const codis = codisDeLot('lot1');
    expect(codis).toHaveLength(150);
    expect(codis[0]).toBe('L1-001');
    expect(codis[149]).toBe('L1-150');
  });

  it('genera 150 codis del lot 2', () => {
    const codis = codisDeLot('lot2');
    expect(codis[0]).toBe('L2-001');
    expect(codis[149]).toBe('L2-150');
  });

  it('identifica tots els codis d\'un lot com a tiquets genèrics', () => {
    expect(codisDeLot('lot2').every((c) => identificarCodi(c).tipus === 'generic')).toBe(true);
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
      { tipus: 'soci', numeroSoci: 7, data: new Date('2026-08-06T19:00:00') },
      { tipus: 'soci', numeroSoci: 7, data: new Date('2026-06-25T19:00:00') },
      { tipus: 'soci', numeroSoci: 12, data: new Date('2026-03-05T19:00:00') },
      { tipus: 'generic', codiTiquet: 'L1-001', data: new Date('2026-08-06T19:00:00') },
    ];
    expect(comptarAssistenciesRecents(entrades, avui)).toEqual({ 7: 2, 12: 1 });
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
