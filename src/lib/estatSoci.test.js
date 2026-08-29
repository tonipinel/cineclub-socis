import { describe, it, expect } from 'vitest';
import { calcularEstatSoci, calcularVenciment, diesFinsVenciment, ESTAT_AL_DIA, ESTAT_PENDENT, ESTAT_VENCUT, ESTAT_NOU_REGISTRE } from './estatSoci';

describe('calcularEstatSoci', () => {
  it('retorna Al dia quan fa menys d\'un any del darrer pagament', () => {
    const soci = { numeroSoci: '1', ultimPagament: '2026-01-01' };
    expect(calcularEstatSoci(soci, new Date('2026-06-01'))).toBe(ESTAT_AL_DIA);
  });

  it('retorna Vençut quan ha passat més d\'un any del darrer pagament', () => {
    const soci = { numeroSoci: '1', ultimPagament: '2025-01-01' };
    expect(calcularEstatSoci(soci, new Date('2026-06-01'))).toBe(ESTAT_VENCUT);
  });

  it('retorna Al dia el mateix dia del venciment', () => {
    const soci = { numeroSoci: '1', ultimPagament: '2025-06-01' };
    expect(calcularEstatSoci(soci, new Date('2026-06-01'))).toBe(ESTAT_AL_DIA);
  });

  it('retorna Pendent quan estatManual és pendent, encara que estigui al dia per data', () => {
    const soci = { numeroSoci: '1', ultimPagament: '2026-01-01', estatManual: 'pendent' };
    expect(calcularEstatSoci(soci, new Date('2026-06-01'))).toBe(ESTAT_PENDENT);
  });

  it('retorna Al dia el mateix dia del venciment amb una hora local real (evita el bug de fus horari)', () => {
    const soci = { numeroSoci: '1', ultimPagament: '2025-06-01' };
    // new Date(any, mes, dia, ...) construeix en hora LOCAL, com fa l'app en producció
    // (a diferència de new Date('YYYY-MM-DD'), que és mitjanit UTC).
    expect(calcularEstatSoci(soci, new Date(2026, 5, 1, 15, 0))).toBe(ESTAT_AL_DIA);
  });

  it('retorna Nou registre quan encara no té número de soci assignat, encara que les dates diguin que està al dia', () => {
    const soci = { ultimPagament: '2026-01-01', numeroSoci: '' };
    expect(calcularEstatSoci(soci, new Date('2026-06-01'))).toBe(ESTAT_NOU_REGISTRE);
  });

  it('Nou registre té prioritat fins i tot sobre estatManual pendent', () => {
    const soci = { ultimPagament: '2026-01-01', numeroSoci: '', estatManual: 'pendent' };
    expect(calcularEstatSoci(soci, new Date('2026-06-01'))).toBe(ESTAT_NOU_REGISTRE);
  });
});

describe('calcularVenciment', () => {
  it('retorna la data de l\'últim pagament més un any', () => {
    const venciment = calcularVenciment({ ultimPagament: '2026-03-15' });
    expect(venciment.getFullYear()).toBe(2027);
    expect(venciment.getMonth()).toBe(2);
    expect(venciment.getDate()).toBe(15);
  });
});

describe('diesFinsVenciment', () => {
  it('retorna un número positiu quan encara falten dies per vèncer', () => {
    const soci = { ultimPagament: '2026-03-01' };
    expect(diesFinsVenciment(soci, new Date(2027, 1, 15))).toBe(14);
  });

  it('retorna 0 el mateix dia del venciment', () => {
    const soci = { ultimPagament: '2026-03-01' };
    expect(diesFinsVenciment(soci, new Date(2027, 2, 1))).toBe(0);
  });

  it('retorna un número negatiu quan ja ha vençut', () => {
    const soci = { ultimPagament: '2026-03-01' };
    expect(diesFinsVenciment(soci, new Date(2027, 2, 11))).toBe(-10);
  });
});
