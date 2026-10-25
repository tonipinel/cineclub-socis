import { describe, it, expect, vi } from 'vitest';

const crides = {};
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn((_, nom) => (dades) => crides[nom](dades)),
}));
vi.mock('../../src/firebase/client.js', () => ({ functions: {} }));

import { crearProposta, missatgeErrorProposta } from '../../src/lib/propostes/pellicules.js';

describe('crearProposta', () => {
  it('envia el token i només els camps de la pel·lícula, i retorna data', async () => {
    crides.crearProposta = vi.fn().mockResolvedValue({ data: { id: 'p1' } });
    const pellicula = { titol: 'X', any: '1990', tmdbId: 11, comentari: 'Bona', numeroSoci: 99 };
    await expect(crearProposta('tok', pellicula)).resolves.toEqual({ id: 'p1' });
    expect(crides.crearProposta).toHaveBeenCalledWith({ token: 'tok', titol: 'X', any: '1990', tmdbId: 11, comentari: 'Bona' });
  });
});

describe('missatgeErrorProposta', () => {
  it.each([
    ['functions/permission-denied', 'Torna a escanejar-lo'],
    ['functions/already-exists', 'ja està proposada'],
    ['functions/resource-exhausted', 'massa propostes'],
    ['functions/invalid-argument', 'no és vàlida'],
    [undefined, 'Torna-ho a provar'],
  ])('%s', (code, text) => {
    expect(missatgeErrorProposta({ code })).toContain(text);
  });
});
