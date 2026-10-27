import { describe, it, expect } from 'vitest';
import { cacheControlFor, CACHE_OK, CACHE_REDIRECT, CACHE_NOT_FOUND, CACHE_ERROR, CACHE_AVUI, CACHE_CLIENT } from '../src/lib/cache.js';

describe('cacheControlFor', () => {
  it('fixa els valors exactes de les capçaleres', () => {
    expect(CACHE_OK).toBe('public, max-age=60, s-maxage=300, stale-while-revalidate=60');
    expect(CACHE_REDIRECT).toBe('public, max-age=60, s-maxage=300');
    expect(CACHE_NOT_FOUND).toBe('public, max-age=60, s-maxage=60');
    expect(CACHE_ERROR).toBe('no-store');
    expect(CACHE_AVUI).toBe(CACHE_OK);
  });
  it('les pàgines publicades caduquen en pocs minuts: cap s-maxage passa de 5 minuts', () => {
    const segons = (valor, clau) => Number(new RegExp(`${clau}=(\\d+)`).exec(valor)[1]);
    for (const valor of [CACHE_OK, CACHE_AVUI, CACHE_REDIRECT, CACHE_NOT_FOUND]) {
      expect(segons(valor, 's-maxage')).toBeLessThanOrEqual(300);
    }
  });
  it('tria el valor segons l\'estat', () => {
    expect(cacheControlFor(200)).toBe(CACHE_OK);
    expect(cacheControlFor(301)).toBe(CACHE_REDIRECT);
    expect(cacheControlFor(404)).toBe(CACHE_NOT_FOUND);
    expect(cacheControlFor(500)).toBe(CACHE_ERROR);
    expect(cacheControlFor(503)).toBe(CACHE_ERROR);
  });
  it('els 4xx que no són 404 tenen una cache curta, no la de les pàgines bones', () => {
    for (const estat of [400, 403, 410, 429]) expect(cacheControlFor(estat)).toBe(CACHE_CLIENT);
    expect(CACHE_CLIENT).toBe('public, max-age=60, s-maxage=60');
  });
  it('404, 301 i 500 donen tres valors diferents', () => {
    expect(new Set([cacheControlFor(404), cacheControlFor(301), cacheControlFor(500)]).size).toBe(3);
  });
});
