import { describe, it, expect, vi, beforeEach } from 'vitest';

const crida = vi.fn();
const httpsCallable = vi.fn(() => crida);
vi.mock('firebase/functions', () => ({ httpsCallable: (...args) => httpsCallable(...args) }));
vi.mock('../firebase/firebase', () => ({ functions: { nom: 'functions' } }));

import { assignarPellicula } from './pellicules';

describe('assignarPellicula', () => {
  beforeEach(() => {
    crida.mockReset();
    crida.mockResolvedValue({ data: { ok: true } });
  });

  it('per defecte envia sobreescriure: false', async () => {
    expect(await assignarPellicula('p1', 42)).toEqual({ ok: true });
    expect(httpsCallable).toHaveBeenCalledWith({ nom: 'functions' }, 'assignarPellicula');
    expect(crida).toHaveBeenCalledWith({ propostaId: 'p1', tmdbId: 42, sobreescriure: false });
  });

  it('envia sobreescriure: true quan es demana', async () => {
    await assignarPellicula('p1', 42, { sobreescriure: true });
    expect(crida).toHaveBeenCalledWith({ propostaId: 'p1', tmdbId: 42, sobreescriure: true });
  });
});
