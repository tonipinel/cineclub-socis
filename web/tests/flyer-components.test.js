import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import FlyerCaraA from '../src/components/FlyerCaraA.astro';
import FlyerCaraB from '../src/components/FlyerCaraB.astro';
import flyer from '../src/data/flyer.json';

const peli = (i, extra = {}) => ({
  id: `s${i}`,
  titol: `Pel·lícula ${i}`,
  titolTraduit: '',
  dataText: `Dj ${i} nov`,
  imatge: `https://exemple.cat/cartell-${i}.jpg`,
  generes: 'Drama · Comèdia',
  versio: 'VOSE',
  idioma: 'Francès',
  url: `/sessions/s${i}/`,
  ...extra,
});

const renderitza = async (component, props) => {
  const container = await AstroContainer.create();
  return container.renderToString(component, { props });
};
const compta = (html, re) => (html.match(re) ?? []).length;

describe('FlyerCaraA', () => {
  it.each([3, 6])('%i pel·lícules donen %i columnes', async (n) => {
    const html = await renderitza(FlyerCaraA, { pelicules: Array.from({ length: n }, (_, i) => peli(i + 1)) });
    expect(compta(html, /class="flyer-columna"/g)).toBe(n);
    expect(html).toContain('Cineclub Roda de Berà');
  });

  it('el títol llarg porta la classe de retall', async () => {
    const titol = 'A'.repeat(120);
    const html = await renderitza(FlyerCaraA, { pelicules: [peli(1, { titol })] });
    expect(html).toMatch(/class="flyer-columna__titol"[^>]*>\s*A{120}\s*</);
  });

  it('sense cartell surt el marcador amb el títol', async () => {
    const html = await renderitza(FlyerCaraA, { pelicules: [peli(1, { imatge: '', titol: 'Sense Cartell' })] });
    expect(html).not.toContain('<img');
    expect(html).toMatch(/class="flyer-columna__marcador"[^>]*>\s*Sense Cartell/);
  });

  it('sense versió es pinta «Versió per confirmar» marcat com a incomplet', async () => {
    const html = await renderitza(FlyerCaraA, { pelicules: [peli(1, { versio: '' })] });
    expect(html).toMatch(/flyer-columna__versio flyer-columna__versio--incompleta[^>]*>\s*Versió per confirmar/);
    const ok = await renderitza(FlyerCaraA, { pelicules: [peli(1)] });
    expect(ok).not.toContain('--incompleta');
    expect(ok).toContain('VOSE');
  });

  it('el CSS retalla el títol a 2 línies, els gèneres a 1 i amaga el desbordament', () => {
    const css = readFileSync(new URL('../src/styles/flyer.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.flyer-columna__titol\s*{[^}]*line-clamp:\s*2/);
    expect(css).toMatch(/\.flyer-columna__generes\s*{[^}]*line-clamp:\s*1/);
    expect(css).toMatch(/\.flyer-tira\s*{[^}]*width:\s*210mm[^}]*height:\s*99mm[^}]*overflow:\s*hidden/s);
  });
});

describe('FlyerCaraB', () => {
  it('conté l\'adreça, la web i el QR en SVG', async () => {
    const html = await renderitza(FlyerCaraB, { url: 'https://cineclubrodadebera.cat' });
    expect(html).toContain(flyer.adreca);
    expect(html).toContain(flyer.web);
    expect(html).toMatch(/class="flyer-qr"[^>]*>\s*<svg/);
  });
});
