import { describe, it, expect } from 'vitest';
import { carnetPayload, carnetQR } from './carnet';

describe('carnetPayload', () => {
  it('genera un codi curt basat en el número de soci', () => {
    expect(carnetPayload({ numeroSoci: 42 })).toBe('SOCI-42');
  });

  it('genera un identificador prefixat amb el número de soci', () => {
    expect(carnetPayload({ numeroSoci: 123 })).toBe('SOCI-123');
  });
});

describe('carnetQR', () => {
  it('genera el contingut del QR a partir del token del carnet', () => {
    expect(carnetQR({ tokenCarnet: 'abc-123' })).toBe('CARNET-abc-123');
  });
});
