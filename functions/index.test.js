import { describe, it, expect } from 'vitest';
import funcions from './index.js';

// Sense límit, una funció v2 pot arribar a 100 instàncies: amb aquests, un abús costa poc.
describe('maxInstances', () => {
  it('les callables en tenen 10 com a màxim i els disparadors 5', () => {
    const limits = Object.fromEntries(Object.entries(funcions).map(([nom, f]) => [nom, f.__endpoint.maxInstances]));
    expect(limits).toEqual({
      notificarNovaSolicitud: 5,
      desarFitxaNovaProposta: 5,
      cercarPellicules: 10,
      assignarPellicula: 10,
      estatVotacio: 10,
      votarProposta: 10,
      rankingTanda: 10,
      rankingPublic: 10,
      sincronitzarCalendari: 5,
      sincronitzarCalendariTot: 10,
    });
  });
});
