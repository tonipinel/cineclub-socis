import { describe, it, expect } from 'vitest';
import { redireccioPer } from '../src/lib/redirects.js';

// Els 6 `aliases` reals de Hugo, amb la sessió a la qual apunten.
const sessio = (slug, data, aliases, extra = {}) => ({ id: slug, slug, data, publicada: true, publica: { aliases }, ...extra });
const sessions = [
  sessio('pig', '2026-06-25', ['/programacio/25-de-juny-pig/']),
  sessio('the-artist', '2026-03-05', ['/programacio/5-de-març-the-artist/']),
  sessio('secrets-i-mentides', '2026-05-07', ['/programacio/7-de-maig-secrets-i-mentides/']),
  sessio('jane-eyre', '2026-08-06', ['/programacio/6-dagost-jane-eyre/']),
  sessio('esperando-a-dali', '2026-07-23', ['/programacio/23-de-juliol-esperando-a-dalí/']),
  sessio('lavi-de-100-anys-que-es-va-escapar-per-la-finestra', '2026-04-02', ['/programacio/2-dabril-lavi-de-100-anys-que-es-va-escapar-per-la-finestra/']),
  sessio('sense-alias', '2026-09-03', undefined),
];

describe('redireccioPer', () => {
  it('resol els 6 aliases reals cap a la URL de la sessió', () => {
    expect(redireccioPer('/programacio/25-de-juny-pig/', sessions)).toBe('/programacio/2026/pig/');
    expect(redireccioPer('/programacio/5-de-març-the-artist/', sessions)).toBe('/programacio/2026/the-artist/');
    expect(redireccioPer('/programacio/7-de-maig-secrets-i-mentides/', sessions)).toBe('/programacio/2026/secrets-i-mentides/');
    expect(redireccioPer('/programacio/6-dagost-jane-eyre/', sessions)).toBe('/programacio/2026/jane-eyre/');
    expect(redireccioPer('/programacio/23-de-juliol-esperando-a-dalí/', sessions)).toBe('/programacio/2026/esperando-a-dali/');
    expect(redireccioPer('/programacio/2-dabril-lavi-de-100-anys-que-es-va-escapar-per-la-finestra/', sessions))
      .toBe('/programacio/2026/lavi-de-100-anys-que-es-va-escapar-per-la-finestra/');
  });

  it('accepta la forma percent-encoded dels accents', () => {
    expect(redireccioPer('/programacio/5-de-mar%C3%A7-the-artist/', sessions)).toBe('/programacio/2026/the-artist/');
    expect(redireccioPer('/programacio/23-de-juliol-esperando-a-dal%C3%AD/', sessions)).toBe('/programacio/2026/esperando-a-dali/');
  });

  it('accepta les formes NFC i NFD (també percent-encoded)', () => {
    const nfd = '/programacio/5-de-març-the-artist/'.normalize('NFD');
    expect(nfd).not.toBe('/programacio/5-de-març-the-artist/');
    expect(redireccioPer(nfd, sessions)).toBe('/programacio/2026/the-artist/');
    expect(redireccioPer(encodeURI(nfd), sessions)).toBe('/programacio/2026/the-artist/');
    // L'alias guardat a Firestore també pot venir en NFD.
    const enNfd = [sessio('the-artist', '2026-03-05', [nfd])];
    expect(redireccioPer('/programacio/5-de-març-the-artist/', enNfd)).toBe('/programacio/2026/the-artist/');
  });

  it('retorna null per a les URL normals i per a les que no existeixen', () => {
    expect(redireccioPer('/', sessions)).toBeNull();
    expect(redireccioPer('/programacio/', sessions)).toBeNull();
    expect(redireccioPer('/programacio/2026/pig/', sessions)).toBeNull();
    expect(redireccioPer('/programacio/no-existeix/', sessions)).toBeNull();
    expect(redireccioPer('/directors/', [])).toBeNull();
  });

  it('només redirigeix els aliases de sessions publicades', () => {
    const mixtes = [...sessions, sessio('oculta', '2026-11-01', ['/programacio/oculta-antiga/'], { publicada: false })];
    expect(redireccioPer('/programacio/oculta-antiga/', mixtes)).toBeNull();
  });

  it('no redirigeix cap alias a si mateix', () => {
    const bucle = [sessio('pig', '2026-06-25', ['/programacio/2026/pig/'])];
    expect(redireccioPer('/programacio/2026/pig/', bucle)).toBeNull();
  });

  it('una percent-encoding malformada no peta', () => {
    expect(redireccioPer('/programacio/%E0%A4%A/', sessions)).toBeNull();
  });

  it('la destinació va codificada si el slug porta accents', () => {
    const accents = [sessio('azúa', '2026-09-03', ['/programacio/antiga/'])];
    expect(redireccioPer('/programacio/antiga/', accents)).toBe('/programacio/2026/az%C3%BAa/');
  });
});
