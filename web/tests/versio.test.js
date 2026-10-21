import { describe, it, expect } from 'vitest';
import { versioInfo } from '../src/lib/versio.js';

describe('versioInfo', () => {
  it('tradueix els cinc tipus de la plantilla de Hugo', () => {
    expect(versioInfo('vo', 'Anglès')).toEqual({ sigles: 'V.O.', explicacio: 'Versió Original en Anglès' });
    expect(versioInfo('vose')).toEqual({ sigles: 'V.O.S.E.', explicacio: 'Versió Original Subtitulada en Espanyol' });
    expect(versioInfo('vosc')).toEqual({ sigles: 'V.O.S.C.', explicacio: 'Versió Original Subtitulada en Català' });
    expect(versioInfo('doblada-cat')).toEqual({ sigles: 'DOBL. CAT.', explicacio: 'Doblada al Català' });
    expect(versioInfo('doblada-cast')).toEqual({ sigles: 'DOBL. CAST.', explicacio: 'Doblada al Castellà' });
  });

  it('retorna buit per a un tipus desconegut', () => {
    expect(versioInfo('altre')).toEqual({ sigles: '', explicacio: '' });
  });
});
