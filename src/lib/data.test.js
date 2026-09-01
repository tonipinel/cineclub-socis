import { describe, it, expect, vi, afterEach } from 'vitest';
import { avui } from './data';

describe('avui', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retorna la data local, no la UTC, prop del canvi de dia', () => {
    // 2026-06-15 00:30 hora local (Madrid, UTC+2 a l'estiu) equival a
    // 2026-06-14 22:30 UTC: si es fes servir toISOString() donaria el dia
    // anterior.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 0, 30));
    expect(avui()).toBe('2026-06-15');
  });
});
