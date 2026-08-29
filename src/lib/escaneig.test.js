import { describe, it, expect } from 'vitest';
import { identificarCodi, codisDeLot, resumAccessLog } from './escaneig';

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
