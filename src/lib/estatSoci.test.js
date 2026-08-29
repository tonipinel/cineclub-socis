import { describe, it, expect } from 'vitest';
import { calcularEstatSoci, ESTAT_AL_DIA, ESTAT_PENDENT, ESTAT_VENCUT } from './estatSoci';

describe('calcularEstatSoci', () => {
  it('retorna Al dia quan fa menys d\'un any del darrer pagament', () => {
    const soci = { ultimPagament: '2026-01-01' };
    expect(calcularEstatSoci(soci, new Date('2026-06-01'))).toBe(ESTAT_AL_DIA);
  });

  it('retorna Vençut quan ha passat més d\'un any del darrer pagament', () => {
    const soci = { ultimPagament: '2025-01-01' };
    expect(calcularEstatSoci(soci, new Date('2026-06-01'))).toBe(ESTAT_VENCUT);
  });

  it('retorna Al dia el mateix dia del venciment', () => {
    const soci = { ultimPagament: '2025-06-01' };
    expect(calcularEstatSoci(soci, new Date('2026-06-01'))).toBe(ESTAT_AL_DIA);
  });

  it('retorna Pendent quan estatManual és pendent, encara que estigui al dia per data', () => {
    const soci = { ultimPagament: '2026-01-01', estatManual: 'pendent' };
    expect(calcularEstatSoci(soci, new Date('2026-06-01'))).toBe(ESTAT_PENDENT);
  });
});
