import { describe, it, expect } from 'vitest';
import { paginaPerSlug } from '../src/lib/pagines.js';

function dbFals(pagines) {
  return {
    collection: (nom) => ({
      doc: (id) => ({
        get: async () => {
          const dades = nom === 'pagines' ? pagines[id] : undefined;
          return { exists: dades !== undefined, data: () => dades };
        },
      }),
    }),
  };
}

describe('paginaPerSlug', () => {
  const faq = { slug: 'preguntes-frequents', tipus: 'faq', titol: 'Preguntes freqüents', dades: {}, cos: '...', imatges: {} };

  it('retorna la pàgina existent', async () => {
    expect(await paginaPerSlug('preguntes-frequents', dbFals({ 'preguntes-frequents': faq }))).toEqual(faq);
  });
  it('retorna null si no existeix', async () => {
    expect(await paginaPerSlug('no-hi-es', dbFals({}))).toBeNull();
  });
  it('retorna null amb un slug buit o amb barres', async () => {
    expect(await paginaPerSlug('', dbFals({}))).toBeNull();
    expect(await paginaPerSlug('a/b', dbFals({}))).toBeNull();
  });
});
