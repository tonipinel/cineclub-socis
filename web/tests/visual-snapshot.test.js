import { describe, it, expect } from 'vitest';
import { comparaCaptures, formataDiferencies, nomCaptura, seleccionaCamins } from '../scripts/visual-snapshot-lib.mjs';

const sitemap = `<?xml version="1.0"?><urlset>
<url><loc>https://exemple.cat/</loc></url>
<url><loc>https://exemple.cat/programacio/</loc></url>
<url><loc>https://exemple.cat/programacio/2026/pig/</loc></url>
<url><loc>https://exemple.cat/programacio/2026/amour/</loc></url>
<url><loc>https://exemple.cat/directors/</loc></url>
<url><loc>https://exemple.cat/directors/michael-haneke/</loc></url>
<url><loc>https://exemple.cat/directors/agn%C3%A8s-varda/</loc></url>
<url><loc>https://exemple.cat/generes/drama/</loc></url>
<url><loc>https://exemple.cat/privacitat/</loc></url>
</urlset>`;

describe('seleccionaCamins', () => {
  it('afegeix totes les sessions i el primer terme de cada taxonomia als camins fixos', () => {
    expect(seleccionaCamins(sitemap)).toEqual([
      '/', '/programacio/', '/programacio/2026/amour/', '/programacio/2026/pig/',
      '/preguntes-frequents/', '/privacitat/', '/fes-te-socia/', '/directors/', '/generes/', '/interprets/',
      '/directors/agn%C3%A8s-varda/', '/generes/drama/',
    ]);
  });
});

describe('nomCaptura', () => {
  it('fa un nom de fitxer per camí i amplada', () => {
    expect(nomCaptura('/', 1280)).toBe('inici@1280');
    expect(nomCaptura('/programacio/2026/pig/', 375)).toBe('programacio_2026_pig@375');
    expect(nomCaptura('/directors/agn%C3%A8s-varda/', 768)).toBe('directors_agnès-varda@768');
  });
});

const element = (cami, canvis = {}) => ({
  cami,
  classe: 'btn',
  rect: { x: 0, y: 10, width: 100, height: 20, ...canvis.rect },
  estil: { color: 'rgb(0, 0, 0)', 'margin-top': '0px', ...canvis.estil },
  pseudo: canvis.pseudo ?? {},
});
const captura = (elements, scrollHeight = 1000) => ({ scrollHeight, elements });

describe('comparaCaptures', () => {
  it('no troba res entre captures iguals', () => {
    expect(comparaCaptures(captura([element('body')]), captura([element('body')]))).toEqual([]);
  });

  it('accepta fins a 0,5 px de diferència als rectangles', () => {
    const despres = captura([element('body', { rect: { y: 10.5, width: 100.4 } })]);
    expect(comparaCaptures(captura([element('body')]), despres)).toEqual([]);
    const mogut = captura([element('body', { rect: { y: 10.6 } })]);
    expect(comparaCaptures(captura([element('body')]), mogut))
      .toEqual([{ element: 'body (.btn)', propietat: 'rect.y', abans: 10, despres: 10.6 }]);
  });

  it('no admet cap tolerància als estils ni a l\'alçada del document', () => {
    const despres = captura([element('body', { estil: { color: 'rgb(0, 0, 1)' } })], 1001);
    expect(comparaCaptures(captura([element('body')]), despres)).toEqual([
      { element: 'document', propietat: 'scrollHeight', abans: 1000, despres: 1001 },
      { element: 'body (.btn)', propietat: 'color', abans: 'rgb(0, 0, 0)', despres: 'rgb(0, 0, 1)' },
    ]);
  });

  it('detecta elements que falten o sobren', () => {
    const abans = captura([element('body'), element('body>div[0]')]);
    const despres = captura([element('body'), element('body>p[0]')]);
    expect(comparaCaptures(abans, despres)).toEqual([
      { element: 'body>div[0] (.btn)', propietat: '(element)', abans: 'present', despres: 'absent' },
      { element: 'body>p[0] (.btn)', propietat: '(element)', abans: 'absent', despres: 'present' },
    ]);
  });

  it('compara els pseudoelements', () => {
    const abans = captura([element('body', { pseudo: { '::after': { content: '""', color: 'red' } } })]);
    const canviat = captura([element('body', { pseudo: { '::after': { content: '""', color: 'blue' } } })]);
    const sense = captura([element('body')]);
    expect(comparaCaptures(abans, canviat))
      .toEqual([{ element: 'body (.btn)', propietat: '::after color', abans: 'red', despres: 'blue' }]);
    expect(comparaCaptures(abans, sense))
      .toEqual([{ element: 'body (.btn)', propietat: '::after', abans: 'present', despres: 'absent' }]);
  });
});

describe('formataDiferencies', () => {
  it('resumeix i talla la llista', () => {
    const dif = [1, 2, 3].map((n) => ({ element: `body>p[${n}]`, propietat: 'color', abans: 'a', despres: 'b' }));
    expect(formataDiferencies('inici@375', dif, { maxim: 2 })).toBe([
      'inici@375: 3 diferències',
      '  body>p[1]  color: a → b',
      '  body>p[2]  color: a → b',
      '  … i 1 més',
    ].join('\n'));
  });
});
