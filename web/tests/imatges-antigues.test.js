import { describe, it, expect } from 'vitest';
import { imatgeAntigaPer, imatgePaginaPer, rutaImatgePagina } from '../src/lib/redirects.js';
import { SLUGS_PAGINES } from '../src/lib/pagines.js';

const STORAGE = 'https://firebasestorage.googleapis.com/v0/b/cineclub-socis.firebasestorage.app/o/web%2Fsessions%2F';
const pig = {
  id: 'pig',
  slug: 'pig',
  data: '2026-06-25',
  publicada: true,
  publica: {
    cartell: `${STORAGE}pig%2Fposter.jpg?alt=media`,
    galeria: [`${STORAGE}pig%2Fgallery-1.jpg?alt=media`, `${STORAGE}pig%2Ffoto%20gran.webp?alt=media`],
  },
};
const sensePublica = { id: 'x', slug: 'x', data: '2026-05-01', publicada: true };
const esborrany = { ...pig, id: 'e', slug: 'esborrany', publicada: false };
const sessions = [pig, sensePublica, esborrany];

describe('imatgeAntigaPer', () => {
  it('poster.jpg i les variants poster_hu<dígits> de Hugo van al cartell', () => {
    expect(imatgeAntigaPer('/programacio/2026/pig/poster.jpg', sessions)).toBe(pig.publica.cartell);
    expect(imatgeAntigaPer('/programacio/2026/pig/poster_hu123.jpg', sessions)).toBe(pig.publica.cartell);
    expect(imatgeAntigaPer('/programacio/2026/pig/poster_hu2054139803791585904.webp', sessions)).toBe(pig.publica.cartell);
  });

  it('un nom de la galeria va a la seva imatge (també amb el nom percent-encoded)', () => {
    expect(imatgeAntigaPer('/programacio/2026/pig/gallery-1.jpg', sessions)).toBe(pig.publica.galeria[0]);
    expect(imatgeAntigaPer('/programacio/2026/pig/foto%20gran.webp', sessions)).toBe(pig.publica.galeria[1]);
  });

  it('l\'any ha de ser de 4 xifres', () => {
    expect(imatgeAntigaPer('/programacio/abcd/pig/poster.jpg', [{ ...pig, data: 'abcd-01-01' }])).toBeNull();
  });

  it('només redirigeix a Storage (firebasestorage o storage.googleapis.com en https)', () => {
    const altra = { ...pig, publica: { cartell: 'https://exemple.com/x.jpg', galeria: ['https://exemple.com/gallery-1.jpg'] } };
    expect(imatgeAntigaPer('/programacio/2026/pig/poster.jpg', [altra])).toBeNull();
    expect(imatgeAntigaPer('/programacio/2026/pig/gallery-1.jpg', [altra])).toBeNull();
  });

  it('retorna null per a sessions inexistents, no publicades o d\'un altre any', () => {
    expect(imatgeAntigaPer('/programacio/2026/no-hi-es/poster.jpg', sessions)).toBeNull();
    expect(imatgeAntigaPer('/programacio/2026/esborrany/poster.jpg', sessions)).toBeNull();
    expect(imatgeAntigaPer('/programacio/2025/pig/poster.jpg', sessions)).toBeNull();
    expect(imatgeAntigaPer('/programacio/2026/x/poster.jpg', sessions)).toBeNull();
  });

  it('retorna null per a fitxers que no són de la sessió', () => {
    expect(imatgeAntigaPer('/programacio/2026/pig/gallery-9.jpg', sessions)).toBeNull();
    expect(imatgeAntigaPer('/programacio/2026/pig/Poster.jpg', sessions)).toBeNull();
  });

  it('només captura /programacio/<any>/<slug>/<fitxer> amb extensió d\'imatge en minúscules', () => {
    for (const cami of [
      '/programacio/2026/pig/poster.JPG',
      '/programacio/2026/pig/poster.gif',
      '/programacio/2026/pig/poster.jpg.html',
      '/programacio/2026/pig/poster.jpg/',
      '/programacio/2026/poster.jpg',
      '/programacio/2026/pig/a/poster.jpg',
      '/programacio/2026/pig/',
      '/programacio/2026/pig/cartell.html',
      '/programacio/25-de-juny-pig/',
      '/x/programacio/2026/pig/poster.jpg',
    ]) expect(imatgeAntigaPer(cami, sessions), cami).toBeNull();
  });
});

describe('imatgeAntigaPer: variants redimensionades de Hugo', () => {
  it('poster_hu_<hex> i gallery-N_hu_<hex> van a l\'original del mateix nom', () => {
    expect(imatgeAntigaPer('/programacio/2026/pig/poster_hu_2d2baa06fd575032.jpg', sessions)).toBe(pig.publica.cartell);
    expect(imatgeAntigaPer('/programacio/2026/pig/gallery-1_hu_da72240e6782de3b.jpg', sessions)).toBe(pig.publica.galeria[0]);
    expect(imatgeAntigaPer('/programacio/2026/pig/gallery-1_hu123.jpg', sessions)).toBe(pig.publica.galeria[0]);
  });

  it('si l\'original no existeix, null', () => {
    expect(imatgeAntigaPer('/programacio/2026/pig/gallery-9_hu_da72.jpg', sessions)).toBeNull();
    expect(imatgeAntigaPer('/programacio/2026/pig/gallery-1_huxyz.jpg', sessions)).toBeNull();
  });
});

describe('rutaImatgePagina i imatgePaginaPer', () => {
  const portada = { slug: 'portada', imatges: { 'hero-logo.png': 'https://firebasestorage.googleapis.com/v0/b/b/o/web%2Fpagines%2Fhero-logo.png', 'creix.png': 'https://firebasestorage.googleapis.com/v0/b/b/o/web%2Fpagines%2Fcreix.png' } };
  const socia = { slug: 'fes-te-socia', imatges: { 'foto-public.jpg': 'https://firebasestorage.googleapis.com/v0/b/b/o/web%2Fpagines%2Ffoto-public.jpg' } };

  it('/<fitxer> és de la portada i /<slug>/<fitxer> d\'aquella pàgina', () => {
    expect(rutaImatgePagina('/hero-logo.png', SLUGS_PAGINES)).toEqual({ slug: 'portada', fitxer: 'hero-logo.png' });
    expect(rutaImatgePagina('/fes-te-socia/foto-public.jpg', SLUGS_PAGINES)).toEqual({ slug: 'fes-te-socia', fitxer: 'foto-public.jpg' });
    expect(rutaImatgePagina('/fes-te-socia/foto%20gran.webp', SLUGS_PAGINES)).toEqual({ slug: 'fes-te-socia', fitxer: 'foto gran.webp' });
  });

  it('no captura res més', () => {
    for (const cami of ['/hero-logo.PNG', '/favicon.ico', '/loading.gif', '/a/b/c.png', '/hero-logo.png/', '/', '/fes-te-socia/',
      '/portada/hero-logo.png', '/sitemap.xml', '/slug-inventat/foto.jpg', '/__x__/a.png', '/../a.png', '/api/a.png', '/images/foto.jpg', '/robots.txt', '/programacio/2026/pig/poster.jpg']) {
      expect(rutaImatgePagina(cami, SLUGS_PAGINES), cami).toBeNull();
    }
  });

  it('el fitxer exacte o l\'original d\'una variant _hu; si no hi és, null', () => {
    expect(imatgePaginaPer(portada, 'hero-logo.png')).toBe('https://firebasestorage.googleapis.com/v0/b/b/o/web%2Fpagines%2Fhero-logo.png');
    expect(imatgePaginaPer(portada, 'hero-logo_hu_4e5f1684bcb60cc8.png')).toBe('https://firebasestorage.googleapis.com/v0/b/b/o/web%2Fpagines%2Fhero-logo.png');
    expect(imatgePaginaPer(socia, 'foto-public_hu_1621aec05e5e09b6.jpg')).toBe('https://firebasestorage.googleapis.com/v0/b/b/o/web%2Fpagines%2Ffoto-public.jpg');
    expect(imatgePaginaPer(portada, 'hero.png')).toBeNull();
    expect(imatgePaginaPer(portada, 'hero-logo.png.png')).toBeNull();
    expect(imatgePaginaPer(portada, 'logo.png')).toBeNull();
    expect(imatgePaginaPer(null, 'hero-logo.png')).toBeNull();
    expect(imatgePaginaPer({ imatges: { 'x.png': 'poster.jpg' } }, 'x.png')).toBeNull();
    expect(imatgePaginaPer({ imatges: { 'x.png': 'https://exemple.com/x.png' } }, 'x.png')).toBeNull();
    expect(imatgePaginaPer({ imatges: { 'x.png': 'http://firebasestorage.googleapis.com/x.png' } }, 'x.png')).toBeNull();
    expect(imatgePaginaPer({ imatges: { 'x.png': 'https://storage.googleapis.com/b/x.png' } }, 'x.png')).toBe('https://storage.googleapis.com/b/x.png');
  });
});
