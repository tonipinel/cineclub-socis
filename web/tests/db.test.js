import { describe, it, expect } from 'vitest';
import { llegir, READ_TIMEOUT_MS } from '../src/lib/db.js';

describe('llegir', () => {
  it('fixa el temps màxim de lectura', () => {
    expect(READ_TIMEOUT_MS).toBe(10000);
  });
  it('retorna el valor de la promesa', async () => {
    expect(await llegir(Promise.resolve(42))).toBe(42);
  });
  it('propaga els errors de la promesa', async () => {
    await expect(llegir(Promise.reject(new Error('boom')))).rejects.toThrow('boom');
  });
  it('rebutja per timeout si la promesa no es resol', async () => {
    await expect(llegir(new Promise(() => {}), 20)).rejects.toThrow(/timeout/);
  });
});
