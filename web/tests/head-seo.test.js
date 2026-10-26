import { describe, it, expect, vi, afterEach } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { extreuCanonical, extreuDescripcio, extreuTitol } from '../scripts/check-urls-lib.mjs';

const sessio = {
  id: 'x', titol: 'Una altra', slug: 'una-altra', publicada: true, data: '2026-11-05', hora: '19:00',
  publica: { titolOriginal: 'Una altra', directors: ['A B'], pais: 'França', any: 2000, idioma: 'Francès', preu: 0, seccio: 'cartellera', organitza: 'cineclub', cos: 'Text.' },
};

// Cada cas carrega els mòduls de nou perquè `INDEXABLE` es fixa en importar-los.
async function render(env, component) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const container = await AstroContainer.create();
  if (component === '404') {
    const { default: Pagina404 } = await import('../src/pages/404.astro');
    return container.renderToString(Pagina404, { request: new Request('https://cineclub-web.web.app/no-existeix/') });
  }
  const { default: SessioPagina } = await import('../src/components/SessioPagina.astro');
  return container.renderToString(SessioPagina, { props: { sessio, sessions: [sessio] } });
}

const ROBOTS = '<meta name="robots" content="index,follow,max-image-preview:large">';

describe('etiquetes del head invisibles per a SEO', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('indexable: meta robots index,follow,max-image-preview:large', async () => {
    const html = await render({ PUBLIC_INDEXABLE: 'true' });
    expect(html).toContain(ROBOTS);
    expect(html.match(/name="robots"/g)).toHaveLength(1);
  });

  it('no indexable: cap meta robots (el bloqueig va a robots.txt i X-Robots-Tag)', async () => {
    expect(await render({ PUBLIC_INDEXABLE: '' })).not.toContain('name="robots"');
    expect(await render({ PUBLIC_INDEXABLE: 'false' })).not.toContain('name="robots"');
  });

  it('el 404 no s\'anuncia mai com a indexable', async () => {
    const html = await render({ PUBLIC_INDEXABLE: 'true' }, '404');
    expect(html).toContain('<meta name="robots" content="noindex,follow">');
    expect(html).not.toContain('index,follow,');
    expect(await render({ PUBLIC_INDEXABLE: '' }, '404')).toContain('content="noindex,follow"');
  });

  it('una pàgina noindex (el 404) no emet canonical; les indexables sí', async () => {
    expect(await render({ PUBLIC_INDEXABLE: 'true' }, '404')).not.toContain('rel="canonical"');
    expect(await render({ PUBLIC_INDEXABLE: 'true' })).toContain('<link rel="canonical"');
  });

  it.each([['true'], ['']])('og:site_name i og:locale sempre (PUBLIC_INDEXABLE=%j)', async (indexable) => {
    const html = await render({ PUBLIC_INDEXABLE: indexable });
    expect(html).toContain('<meta property="og:site_name" content="Cineclub Roda de Berà">');
    expect(html).toContain('<meta property="og:locale" content="ca_ES">');
  });

  it('no afegeix <link rel="alternate"> (Hugo no en té)', async () => {
    expect(await render({ PUBLIC_INDEXABLE: 'true' })).not.toContain('rel="alternate"');
  });

  it('les etiquetes noves no alteren el que compara check-urls (títol, canonical, descripció)', async () => {
    const html = await render({ PUBLIC_INDEXABLE: 'true', PUBLIC_SITE_URL: 'https://cineclubrodadebera.cat' });
    expect(extreuTitol(html)).toBe('Una altra · Cineclub Roda de Berà');
    expect(extreuCanonical(html)).toBe('https://cineclubrodadebera.cat/programacio/2026/una-altra/');
    expect(extreuDescripcio(html)).toContain('Una altra (2000), dirigida per A B');
  });
});
