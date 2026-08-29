import { describe, it, expect } from 'vitest';
import { carnetPayload } from './carnet';

describe('carnetPayload', () => {
  it('genera un identificador prefixat amb l\'id del soci', () => {
    expect(carnetPayload({ id: 'abc123' })).toBe('CINECLUB-SOCI:abc123');
  });
});
