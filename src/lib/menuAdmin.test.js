import { describe, it, expect } from 'vitest';
import { GRUPS_ADMIN, grupActiu } from './menuAdmin';

describe('GRUPS_ADMIN', () => {
  it('defineix els grups Socis i Propostes amb els seus elements en ordre', () => {
    expect(GRUPS_ADMIN.map((g) => g.etiqueta)).toEqual(['Socis', 'Propostes']);
    expect(GRUPS_ADMIN[0].elements.map((e) => e.etiqueta)).toEqual(['Socis', 'Sol·licituds', 'Tiquets']);
    expect(GRUPS_ADMIN[1].elements.map((e) => e.etiqueta)).toEqual(['Propostes', 'Tandes', 'Distribuïdores']);
  });
});

describe('grupActiu', () => {
  it('troba el grup per ruta exacta', () => {
    expect(grupActiu('/socis').etiqueta).toBe('Socis');
    expect(grupActiu('/solicituds').etiqueta).toBe('Socis');
    expect(grupActiu('/tickets').etiqueta).toBe('Socis');
    expect(grupActiu('/propostes/pendents').etiqueta).toBe('Propostes');
    expect(grupActiu('/tandes').etiqueta).toBe('Propostes');
    expect(grupActiu('/distribuidores').etiqueta).toBe('Propostes');
  });

  it('troba el grup per subrutes', () => {
    expect(grupActiu('/socis/12').etiqueta).toBe('Socis');
    expect(grupActiu('/socis/nou').etiqueta).toBe('Socis');
    expect(grupActiu('/socis/carnets').etiqueta).toBe('Socis');
    expect(grupActiu('/tickets/abc').etiqueta).toBe('Socis');
    expect(grupActiu('/propostes/pendents/nova').etiqueta).toBe('Propostes');
    expect(grupActiu('/tandes/nova').etiqueta).toBe('Propostes');
    expect(grupActiu('/tandes/7/resultats').etiqueta).toBe('Propostes');
    expect(grupActiu('/distribuidores/nova').etiqueta).toBe('Propostes');
  });

  it('no confon prefixos que només coincideixen en els caràcters', () => {
    expect(grupActiu('/socisx')).toBeNull();
    expect(grupActiu('/tandesos')).toBeNull();
    expect(grupActiu('/ticketsfoo/1')).toBeNull();
  });

  it('retorna null per a rutes sense grup', () => {
    expect(grupActiu('/')).toBeNull();
    expect(grupActiu('/sessions')).toBeNull();
    expect(grupActiu('/sessions/nova')).toBeNull();
    expect(grupActiu('/escaneig')).toBeNull();
    expect(grupActiu('/propostes')).toBeNull();
    expect(grupActiu('/propostes/proposar')).toBeNull();
    expect(grupActiu('/comptabilitat')).toBeNull();
  });
});
