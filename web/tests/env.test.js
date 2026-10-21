import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const carrega = async (env) => {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('../src/lib/env.js');
};

describe('env', () => {
  beforeEach(() => vi.unstubAllEnvs());
  afterEach(() => vi.unstubAllEnvs());

  it('per defecte no s\'indexa, no hi ha cartell actiu i la URL és la provisional', async () => {
    const env = await carrega({ PUBLIC_INDEXABLE: '', PUBLIC_CARTELL_ACTIU: '', PUBLIC_SITE_URL: '' });
    expect(env.INDEXABLE).toBe(false);
    expect(env.CARTELL_ACTIU).toBe(false);
    expect(env.SITE_URL).toBe('https://cineclub-web.web.app');
  });

  it('només "true" activa INDEXABLE i CARTELL_ACTIU', async () => {
    const env = await carrega({ PUBLIC_INDEXABLE: 'true', PUBLIC_CARTELL_ACTIU: 'true' });
    expect(env.INDEXABLE).toBe(true);
    expect(env.CARTELL_ACTIU).toBe(true);
    const altre = await carrega({ PUBLIC_INDEXABLE: '1', PUBLIC_CARTELL_ACTIU: 'yes' });
    expect(altre.INDEXABLE).toBe(false);
    expect(altre.CARTELL_ACTIU).toBe(false);
  });

  it('SITE_URL treu la barra final', async () => {
    const env = await carrega({ PUBLIC_SITE_URL: 'https://exemple.cat/' });
    expect(env.SITE_URL).toBe('https://exemple.cat');
  });
});
