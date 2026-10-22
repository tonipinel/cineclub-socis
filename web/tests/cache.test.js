import { describe, it, expect } from 'vitest';
import { cacheControlFor, CACHE_OK, CACHE_REDIRECT, CACHE_NOT_FOUND, CACHE_ERROR, CACHE_AVUI, CACHE_CLIENT } from '../src/lib/cache.js';

describe('cacheControlFor', () => {
  it('fixa els valors exactes de les capçaleres', () => {
    expect(CACHE_OK).toBe('public, max-age=300, s-maxage=86400, stale-while-revalidate=86400');
    expect(CACHE_REDIRECT).toBe('public, max-age=300, s-maxage=3600');
    expect(CACHE_NOT_FOUND).toBe('public, max-age=60, s-maxage=300');
    expect(CACHE_ERROR).toBe('no-store');
    expect(CACHE_AVUI).toBe('public, max-age=300, s-maxage=3600, stale-while-revalidate=3600');
  });
  it('CACHE_AVUI és més curta que la general: les pàgines que depenen de la data d\'avui caduquen abans', () => {
    const segons = (valor, clau) => Number(new RegExp(`${clau}=(\\d+)`).exec(valor)[1]);
    expect(segons(CACHE_AVUI, 's-maxage')).toBeLessThan(segons(CACHE_OK, 's-maxage'));
    expect(segons(CACHE_AVUI, 'stale-while-revalidate')).toBeLessThan(segons(CACHE_OK, 'stale-while-revalidate'));
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
