// @vitest-environment node
import { describe, it, expect } from 'vitest';
import porta from '../../functions/socis-porta.js';
import { dadesInicials, ambSocisPorta } from './dades.js';

// L'arnès no té Cloud Functions: `socisPorta` s'omple en carregar-lo. Ha de donar el mateix que el disparador real.
describe('arnès: socisPorta', () => {
  it('té un document per soci, idèntic al que escriuria sincronitzarSociPorta', async () => {
    const dades = await ambSocisPorta(dadesInicials());
    const socis = Object.entries(dades).filter(([cami]) => cami.startsWith('socis/'));
    const portes = Object.entries(dades).filter(([cami]) => cami.startsWith('socisPorta/'));
    expect(portes).toHaveLength(socis.length);
    for (const [, soci] of socis) {
      expect(dades[`socisPorta/${porta.idPorta(soci)}`]).toEqual(porta.docPorta(soci));
    }
  });
});
