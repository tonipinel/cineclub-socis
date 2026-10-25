import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { netejarTelefon } from '../public/js/fes-te-socia-dades.js';

// Les regles de Firestore només accepten `^[0-9+ ().-]{6,25}$` al telèfon.
const REGLA_TELEFON = /^[0-9+ ().-]{6,25}$/;

describe('netejarTelefon', () => {
  it('converteix espais no separables, tabuladors i espais repetits en un sol espai', () => {
    expect(netejarTelefon('600 00 00\t00')).toBe('600 00 00 00');
    expect(netejarTelefon('  +34   600 000 000  ')).toBe('+34 600 000 000');
  });

  it('deixa un telèfon enganxat amb espais estranys dins del que accepten les regles', () => {
    expect(REGLA_TELEFON.test(netejarTelefon(' +34 600 000 000 '))).toBe(true);
  });

  it('el formulari l\'usa per al telèfon que envia', () => {
    const formulari = readFileSync(new URL('../public/js/fes-te-socia-form.js', import.meta.url), 'utf8');
    expect(formulari).toContain('telefon: netejarTelefon(form.telefon.value)');
  });
});
