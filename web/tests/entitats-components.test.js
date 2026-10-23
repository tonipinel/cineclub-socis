import { describe, it, expect, beforeEach } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import CollabStrip from '../src/components/CollabStrip.astro';
import CartellEntitat from '../src/components/CartellEntitat.astro';
import { fixaEntitatsDeProva } from '../src/lib/entitats.js';

const pinta = async (component, props) => (await AstroContainer.create()).renderToString(component, { props });

const franja = (publica) => pinta(CollabStrip, { sessio: { publica } });

describe('components d\'entitats amb el catàleg de Firestore', () => {
  beforeEach(() => {
    fixaEntitatsDeProva({
      'Amb tot': { logo: '/tot.png', url: 'https://tot' },
      'Només logo': { logo: '/logo.png' },
      'Només URL': { logo: '', url: 'https://url' },
      'Sense res': {},
    });
  });

  it('CollabStrip: logo amb enllaç, logo sol, i el nom en text si l\'entitat no té logo', async () => {
    const html = await franja({ organitza: 'Només URL', participa: ['Amb tot', 'Només logo'], collabora: ['Sense res', 'Desconeguda'] });
    expect(html).toContain('<span class="collab-strip__entity">Només URL</span>');
    expect(html).toContain('<a class="collab-strip__link" href="https://tot" target="_blank" rel="noopener"><img class="collab-strip__logo" src="/tot.png" alt="Amb tot"></a>');
    expect(html).toContain('<img class="collab-strip__logo" src="/logo.png" alt="Només logo">');
    expect(html).toContain('<span class="collab-strip__entity">Sense res</span>');
    expect(html).toContain('<span class="collab-strip__entity">Desconeguda</span>');
    expect(html).not.toContain('href="https://url"');
    expect(html.match(/<img /g)).toHaveLength(2);
  });

  it('CartellEntitat: el nom en text si l\'entitat no té logo; l\'Ajuntament porta sempre el logo horitzontal', async () => {
    const props = { logoClass: 'l', entityClass: 'e' };
    expect(await pinta(CartellEntitat, { ...props, nom: 'Només URL' })).toBe('<span class="e">Només URL</span>');
    expect(await pinta(CartellEntitat, { ...props, nom: 'Sense res' })).toBe('<span class="e">Sense res</span>');
    expect(await pinta(CartellEntitat, { ...props, nom: 'Només logo' })).toBe('<img class="l" src="/logo.png" alt="Només logo">');
    expect(await pinta(CartellEntitat, { ...props, nom: 'Ajuntament de Roda de Berà' }))
      .toBe('<img class="l" src="/images/entitats/ajuntament-roda-de-bera-horitzontal.png" alt="Ajuntament de Roda de Berà">');
  });
});
