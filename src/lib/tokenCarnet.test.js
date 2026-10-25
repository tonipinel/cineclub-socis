// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { hashTokenCarnet } from './tokenCarnet';
import porta from '../../functions/socis-porta.js';

// El navegador ha de calcular exactament el mateix hash que desa la Cloud Function a `socisPorta.tokenHash`.
describe('hashTokenCarnet (navegador)', () => {
  it('és el SHA-256 en hexadecimal del token', async () => {
    expect(await hashTokenCarnet('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it.each(['3fa85f64-5717-4562-b3fc-2c963f66afa6', 'tok1abcdefghijklmnopqrstuvwxyz0123456789', 'àèò·l'])(
    'coincideix amb el de la Cloud Function per a %s',
    async (token) => {
      expect(await hashTokenCarnet(token)).toBe(porta.hashTokenCarnet(token));
      expect(await hashTokenCarnet(token)).toBe(createHash('sha256').update(token, 'utf8').digest('hex'));
    },
  );
});
