import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const carrega = async (env) => {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('../src/lib/env.js');
};

describe('env', () => {
  beforeEach(() => vi.unstubAllEnvs());
  afterEach(() => vi.unstubAllEnvs());

  it('per defecte no s\'indexa, el cartell és actiu (com a Hugo) i la URL és la provisional', async () => {
    const env = await carrega({ PUBLIC_INDEXABLE: '', PUBLIC_CARTELL_ACTIU: '', PUBLIC_SITE_URL: '' });
    expect(env.INDEXABLE).toBe(false);
    expect(env.CARTELL_ACTIU).toBe(true);
    expect(env.SITE_URL).toBe('https://cineclub-web.web.app');
  });

  it('només "true" activa INDEXABLE i només "false" desactiva CARTELL_ACTIU', async () => {
    const env = await carrega({ PUBLIC_INDEXABLE: 'true', PUBLIC_CARTELL_ACTIU: 'false' });
    expect(env.INDEXABLE).toBe(true);
    expect(env.CARTELL_ACTIU).toBe(false);
    const altre = await carrega({ PUBLIC_INDEXABLE: '1', PUBLIC_CARTELL_ACTIU: 'yes' });
    expect(altre.INDEXABLE).toBe(false);
    expect(altre.CARTELL_ACTIU).toBe(true);
  });

  it('SITE_URL treu la barra final', async () => {
    const env = await carrega({ PUBLIC_SITE_URL: 'https://exemple.cat/' });
    expect(env.SITE_URL).toBe('https://exemple.cat');
  });

  it('.env.production fixa els valors públics de producció perquè un build des d\'un shell net sigui indexable', () => {
    const text = readFileSync(new URL('../.env.production', import.meta.url), 'utf8');
    expect(text).toMatch(/^PUBLIC_INDEXABLE=true$/m);
    expect(text).toMatch(/^PUBLIC_SITE_URL=https:\/\/cineclubrodadebera\.cat$/m);
  });

  it('.env.production no està ignorat per git', () => {
    const ignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
    expect(ignore).not.toMatch(/^\.env(\.production|\*)?$/m);
  });
});
