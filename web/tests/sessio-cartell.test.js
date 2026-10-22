import { describe, it, expect, vi } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import SessioPagina from '../src/components/SessioPagina.astro';

// Amb el cartell actiu (part 2) el banner apareix i enllaça al cartell imprimible.
vi.mock('../src/lib/env.js', () => ({
  SITE_URL: 'https://cineclub-web.web.app',
  INDEXABLE: false,
  CARTELL_ACTIU: true,
}));

describe('banner del cartell amb CARTELL_ACTIU', () => {
  it('apareix amb l\'enllaç a cartell.html', async () => {
    const sessio = { id: 'a', titol: 'Pig', slug: 'pig', publicada: true, data: '2026-06-25', hora: '19:00', publica: { titolOriginal: 'Pig', directors: [], preu: 0, organitza: 'cineclub', cos: '' } };
    const container = await AstroContainer.create();
    const html = await container.renderToString(SessioPagina, { props: { sessio, sessions: [sessio] } });
    expect(html).toContain('<span class="session-cartell-banner__title">Ajuda\'ns a fer difusió!</span>');
    expect(html).toContain('href="/programacio/2026/pig/cartell.html" target="_blank" rel="noopener"');
    expect(html).toContain('Imprimir/veure cartell de la sessió</a>');
  });
});

describe('banner del cartell desactivat amb PUBLIC_CARTELL_ACTIU=false', () => {
  it('no pinta el banner ni l\'enllaç', async () => {
    vi.resetModules();
    vi.doMock('../src/lib/env.js', () => ({ SITE_URL: 'https://cineclub-web.web.app', INDEXABLE: false, CARTELL_ACTIU: false }));
    const { default: Pagina } = await import('../src/components/SessioPagina.astro');
    const sessio = { id: 'a', titol: 'Pig', slug: 'pig', publicada: true, data: '2026-06-25', hora: '19:00', publica: { titolOriginal: 'Pig', directors: [], preu: 0, organitza: 'cineclub', cos: '' } };
    const container = await AstroContainer.create();
    const html = await container.renderToString(Pagina, { props: { sessio, sessions: [sessio] } });
    expect(html).not.toContain('session-cartell-banner');
    expect(html).not.toContain('cartell.html');
    vi.doUnmock('../src/lib/env.js');
  });
});
