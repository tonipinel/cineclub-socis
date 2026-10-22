import { describe, it, expect, vi } from 'vitest';
import { creaMemo } from '../src/lib/memo.js';

describe('creaMemo', () => {
  const nou = () => {
    const rellotge = { t: 0 };
    return { rellotge, memo: creaMemo({ ttl: 60000, ara: () => rellotge.t }) };
  };

  it('no repeteix la lectura dins del TTL i la repeteix en passar-ne', async () => {
    const { rellotge, memo } = nou();
    const db = {};
    const llegeix = vi.fn(async () => 'x');
    await memo.obte(db, 'k', llegeix);
    rellotge.t = 59999;
    await memo.obte(db, 'k', llegeix);
    expect(llegeix).toHaveBeenCalledTimes(1);
    rellotge.t = 60000;
    await memo.obte(db, 'k', llegeix);
    expect(llegeix).toHaveBeenCalledTimes(2);
  });

  it('les peticions simultànies comparteixen una sola lectura', async () => {
    const { memo } = nou();
    const llegeix = vi.fn(async () => 'x');
    const db = {};
    await Promise.all([memo.obte(db, 'k', llegeix), memo.obte(db, 'k', llegeix), memo.obte(db, 'k', llegeix)]);
    expect(llegeix).toHaveBeenCalledTimes(1);
  });

  it('una lectura que falla no es desa', async () => {
    const { memo } = nou();
    const db = {};
    await expect(memo.obte(db, 'k', async () => { throw new Error('caiguda'); })).rejects.toThrow('caiguda');
    await expect(memo.obte(db, 'k', async () => 'bé')).resolves.toBe('bé');
  });

  it('cada clau i cada base tenen la seva entrada', async () => {
    const { memo } = nou();
    const a = {};
    expect(await memo.obte(a, 'k1', async () => 1)).toBe(1);
    expect(await memo.obte(a, 'k2', async () => 2)).toBe(2);
    expect(await memo.obte({}, 'k1', async () => 3)).toBe(3);
  });

  it('reinicia buida la memòria', async () => {
    const { memo } = nou();
    const db = {};
    await memo.obte(db, 'k', async () => 1);
    memo.reinicia();
    expect(await memo.obte(db, 'k', async () => 2)).toBe(2);
  });
});
