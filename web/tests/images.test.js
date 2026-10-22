import { describe, it, expect } from 'vitest';
import { STORAGE_PREFIX, RESIZE_WIDTHS, resizedUrl, srcsetOf } from '../src/lib/images.js';

const FOTO = `${STORAGE_PREFIX}sessions%2Fpig%2Fposter.jpg?alt=media`;

describe('images', () => {
  it('fixa el prefix de Storage i els amples de Hugo', () => {
    expect(STORAGE_PREFIX).toBe('https://firebasestorage.googleapis.com/v0/b/cineclub-socis.firebasestorage.app/o/web%2F');
    expect(RESIZE_WIDTHS).toEqual([160, 200, 300, 400, 500, 600, 700, 800, 1400]);
  });

  it('serveix les fotos de Storage per /api/img.webp', () => {
    expect(resizedUrl(FOTO, 400)).toBe(`/api/img.webp?w=400&u=${encodeURIComponent(FOTO)}`);
  });

  it('deixa intactes les URLs d\'altres llocs i les amples no permesos', () => {
    expect(resizedUrl('https://exemple.cat/a.jpg', 400)).toBe('https://exemple.cat/a.jpg');
    expect(resizedUrl(FOTO, 401)).toBe(FOTO);
    expect(resizedUrl('', 400)).toBe('');
    expect(resizedUrl(undefined, 400)).toBeUndefined();
  });

  it('no redimensiona els GIF animats', () => {
    const gif = `${STORAGE_PREFIX}pagines%2Fa.gif?alt=media`;
    expect(resizedUrl(gif, 400)).toBe(gif);
  });

  it('construeix el srcset només per a fotos de Storage', () => {
    expect(srcsetOf(FOTO, [400, 800])).toBe(`${resizedUrl(FOTO, 400)} 400w, ${resizedUrl(FOTO, 800)} 800w`);
    expect(srcsetOf('https://exemple.cat/a.jpg', [400])).toBeUndefined();
  });
});

describe('resizedUrl: adreça canònica', () => {
  it('treu el token i qualsevol altre paràmetre perquè l\'endpoint l\'accepti', () => {
    const amb = `${STORAGE_PREFIX}sessions%2Fpig%2Fposter.jpg?alt=media&token=abc&x=1#f`;
    expect(resizedUrl(amb, 400)).toBe(resizedUrl(FOTO, 400));
  });
});
