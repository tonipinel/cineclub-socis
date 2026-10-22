import { describe, it, expect } from 'vitest';
import { identificarCodi } from '../../src/lib/propostes/identificarCodi.js';

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

  it('reconeix un codi de carnet amb token (CARNET-)', () => {
    expect(identificarCodi('CARNET-3fa85f64-5717-4562-b3fc-2c963f66afa6')).toEqual({
      tipus: 'carnet-token',
      token: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    });
  });

  it('retalla espais en blanc també per als codis de carnet amb token', () => {
    expect(identificarCodi('  CARNET-abc123  ')).toEqual({ tipus: 'carnet-token', token: 'abc123' });
  });
});
