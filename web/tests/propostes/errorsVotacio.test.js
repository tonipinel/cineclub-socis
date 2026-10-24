import { describe, it, expect } from 'vitest';
import { missatgeError, esCarnetNoValid } from '../../src/lib/propostes/errorsVotacio.js';

describe('missatgeError', () => {
  it('permission-denied en carregar l\'estat o votar és un carnet no vàlid', () => {
    expect(missatgeError({ code: 'functions/permission-denied' }, 'estat')).toMatch(/carnet no és vàlid/);
    expect(missatgeError({ code: 'functions/permission-denied' }, 'vot')).toMatch(/carnet no és vàlid/);
  });

  it('permission-denied en demanar el rànquing demana votar-ho tot', () => {
    expect(missatgeError({ code: 'functions/permission-denied' }, 'ranking')).toMatch(/votar totes les propostes/);
  });

  it('failed-precondition: tanda tancada o vots bloquejats', () => {
    expect(missatgeError({ code: 'functions/failed-precondition' })).toMatch(/^La tanda de pel·lícules és tancada o .*bloquejats/);
  });

  it('invalid-argument i not-found: proposta o tanda que ja no existeix', () => {
    expect(missatgeError({ code: 'functions/invalid-argument' })).toMatch(/proposta o tanda de pel·lícules ja no està disponible/);
    expect(missatgeError({ code: 'functions/not-found' })).toMatch(/ja no està disponible/);
  });

  it('qualsevol altre error, o un error sense code, dona un missatge genèric', () => {
    expect(missatgeError({ code: 'functions/internal' })).toMatch(/Torna-ho a provar/);
    expect(missatgeError(new Error('xarxa'))).toMatch(/Torna-ho a provar/);
    expect(missatgeError(undefined)).toMatch(/Torna-ho a provar/);
  });
});

describe('esCarnetNoValid', () => {
  it('només és cert per a permission-denied', () => {
    expect(esCarnetNoValid({ code: 'functions/permission-denied' })).toBe(true);
    expect(esCarnetNoValid({ code: 'functions/not-found' })).toBe(false);
    expect(esCarnetNoValid(null)).toBe(false);
  });
});
