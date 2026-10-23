import { describe, it, expect } from 'vitest';
import { estatBarra, pestanyesAmbCanvis } from './estatDesar';

const base = { desant: false, error: false, hiHaCanvis: false, desatRecent: false };

describe('estatBarra', () => {
  it.each([
    [{}, 'net'],
    [{ desatRecent: true }, 'desat'],
    [{ hiHaCanvis: true }, 'pendent'],
    [{ hiHaCanvis: true, desatRecent: true }, 'pendent'],
    [{ error: true }, 'error'],
    [{ error: true, hiHaCanvis: true }, 'error'],
    [{ desant: true }, 'desant'],
    [{ desant: true, error: true }, 'desant'],
    [{ desant: true, error: true, hiHaCanvis: true, desatRecent: true }, 'desant'],
  ])('%j -> %s', (canvi, esperat) => {
    expect(estatBarra({ ...base, ...canvi })).toBe(esperat);
  });
});

describe('pestanyesAmbCanvis', () => {
  const mapa = { titol: 'dades', cos: 'continguts', trailerYoutubeId: 'mitjans' };

  it('retorna les pestanyes afectades sense repetir-les', () => {
    expect(pestanyesAmbCanvis(['titol'], ['cos', 'trailerYoutubeId'], mapa)).toEqual(['dades', 'continguts', 'mitjans']);
    expect(pestanyesAmbCanvis(['titol', 'titol'], ['titol'], mapa)).toEqual(['dades']);
  });

  it('un camp desconegut va a dades', () => {
    expect(pestanyesAmbCanvis(['camp-nou'], [], mapa)).toEqual(['dades']);
  });

  it('sense canvis retorna una llista buida', () => {
    expect(pestanyesAmbCanvis([], [], mapa)).toEqual([]);
  });
});
