import { describe, it, expect, vi, afterEach } from 'vitest';

const carrega = async (env) => {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const { GET } = await import('../src/pages/robots.txt.js');
  return GET();
};

describe('robots.txt', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('no indexable: tanca tot el web i no anuncia sitemap', async () => {
    const res = await carrega({ PUBLIC_INDEXABLE: '', PUBLIC_SITE_URL: 'https://cineclubrodadebera.cat' });
    expect(res.headers.get('Content-Type')).toContain('text/plain');
    expect(await res.text()).toBe('User-agent: *\nDisallow: /\n');
  });

  it('indexable: idèntic al de Hugo, amb el Sitemap sobre SITE_URL', async () => {
    const res = await carrega({ PUBLIC_INDEXABLE: 'true', PUBLIC_SITE_URL: 'https://cineclubrodadebera.cat/' });
    expect(await res.text()).toBe('User-agent: *\nAllow: /\n\nSitemap: https://cineclubrodadebera.cat/sitemap.xml\n');
  });
});
