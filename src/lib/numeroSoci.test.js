import { describe, it, expect } from 'vitest';
import { properNumeroSoci } from './numeroSoci';

describe('properNumeroSoci', () => {
  it('retorna 1 quan no hi ha cap soci', () => {
    expect(properNumeroSoci([])).toBe(1);
  });

  it('retorna el següent número disponible', () => {
    expect(properNumeroSoci([1, 2, 5])).toBe(6);
  });

  it('ignora valors buits o no numèrics (socis sense número assignat)', () => {
    expect(properNumeroSoci([1, '', 3, undefined, 'abc'])).toBe(4);
  });

  it('funciona amb números guardats com a string', () => {
    expect(properNumeroSoci(['1', '2', '10'])).toBe(11);
  });
});
