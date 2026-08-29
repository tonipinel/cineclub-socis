import { describe, it, expect } from 'vitest';
import { buildStaffClaims } from './adminClaims.js';

describe('buildStaffClaims', () => {
  it('retorna els claims per a un rol vàlid', () => {
    expect(buildStaffClaims('admin')).toEqual({ role: 'admin' });
    expect(buildStaffClaims('taquilla')).toEqual({ role: 'taquilla' });
  });

  it('llança un error per a un rol desconegut', () => {
    expect(() => buildStaffClaims('superadmin')).toThrow('Rol desconegut');
  });
});
