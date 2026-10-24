import { describe, it, expect, vi, beforeEach } from 'vitest';

const crides = {};
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn((_, nom) => (dades) => crides[nom](dades)),
}));
vi.mock('../../src/firebase/client.js', () => ({ functions: {} }));

import { carregarEstat, votar, carregarRanking, carregarRankingPublic, ordreBarrejat } from '../../src/lib/propostes/votacio.js';

describe('crides als callables', () => {
  beforeEach(() => {
    for (const nom of Object.keys(crides)) delete crides[nom];
  });

  it('carregarEstat envia el token i retorna data', async () => {
    crides.estatVotacio = vi.fn().mockResolvedValue({ data: { tanda: null } });
    await expect(carregarEstat('tok')).resolves.toEqual({ tanda: null });
    expect(crides.estatVotacio).toHaveBeenCalledWith({ token: 'tok' });
  });

  it('votar envia token, tanda, proposta i valor', async () => {
    crides.votarProposta = vi.fn().mockResolvedValue({ data: { votats: 1, total: 3, completa: false } });
    await expect(votar('tok', 't1', 'p1', 'like')).resolves.toEqual({ votats: 1, total: 3, completa: false });
    expect(crides.votarProposta).toHaveBeenCalledWith({ token: 'tok', tandaId: 't1', propostaId: 'p1', valor: 'like' });
  });

  it('carregarRanking envia token i tanda', async () => {
    crides.rankingTanda = vi.fn().mockResolvedValue({ data: { tancada: false, files: [] } });
    await expect(carregarRanking('tok', 't1')).resolves.toEqual({ tancada: false, files: [] });
    expect(crides.rankingTanda).toHaveBeenCalledWith({ token: 'tok', tandaId: 't1' });
  });

  it('carregarRankingPublic crida rankingPublic només amb la tanda (sense token)', async () => {
    crides.rankingPublic = vi.fn().mockResolvedValue({ data: { files: [{ propostaId: 'p1', percentatge: 80 }] } });
    await expect(carregarRankingPublic('t1')).resolves.toEqual({ files: [{ propostaId: 'p1', percentatge: 80 }] });
    expect(crides.rankingPublic).toHaveBeenCalledWith({ tandaId: 't1' });
  });
});

describe('ordreBarrejat', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];

  it('és determinista per llavor', () => {
    expect(ordreBarrejat(ids, '7-t1')).toEqual(ordreBarrejat(ids, '7-t1'));
  });

  it('conserva tots els elements i no muta l\'entrada', () => {
    const copia = [...ids];
    const resultat = ordreBarrejat(ids, '7-t1');
    expect([...resultat].sort()).toEqual(copia);
    expect(ids).toEqual(copia);
  });

  it('accepta una llavor numèrica (la tracta com a text)', () => {
    expect(ordreBarrejat(ids, 7)).toEqual(ordreBarrejat(ids, '7'));
  });

  it('canvia amb una altra llavor', () => {
    expect(ordreBarrejat(ids, '7-t1')).not.toEqual(ordreBarrejat(ids, '8-t1'));
  });
});
