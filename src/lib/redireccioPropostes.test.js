import { describe, it, expect } from 'vitest';
import { urlPublica } from './redireccioPropostes';

describe('urlPublica', () => {
  it('redirigeix / i /propostes conservant el hash', () => {
    expect(urlPublica('/', '#abc123')).toBe('https://cineclubrodadebera.cat/propostes/#abc123');
    expect(urlPublica('/propostes', '#top')).toBe('https://cineclubrodadebera.cat/propostes/#top');
    expect(urlPublica('/propostes/', '')).toBe('https://cineclubrodadebera.cat/propostes/');
  });

  it('redirigeix /propostes/proposar a la seva pàgina pública', () => {
    expect(urlPublica('/propostes/proposar', '#x')).toBe('https://cineclubrodadebera.cat/propostes/proposar/#x');
  });

  it('retorna null per a les altres rutes', () => {
    expect(urlPublica('/accedir', '')).toBeNull();
    expect(urlPublica('/propostes/pendents', '')).toBeNull();
    expect(urlPublica('/sessions', '#a')).toBeNull();
  });
});
