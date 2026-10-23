import { describe, it, expect } from 'vitest';
import { GRUPS_ADMIN, grupActiu } from './menuAdmin';

describe('GRUPS_ADMIN', () => {
  it('defineix els grups Socis, Programació i Sala amb els seus elements en ordre', () => {
    expect(GRUPS_ADMIN.map((g) => [g.id, g.etiqueta])).toEqual([
      ['socis', 'Socis'], ['programacio', 'Programació'], ['sala', 'Sala'],
    ]);
    expect(GRUPS_ADMIN[0].elements.map((e) => [e.etiqueta, e.to])).toEqual([
      ['Socis', '/socis'], ['Sol·licituds', '/solicituds'],
    ]);
    expect(GRUPS_ADMIN[1].elements.map((e) => [e.etiqueta, e.to])).toEqual([
      ['Propostes', '/propostes/pendents'], ['Tandes', '/tandes'], ['Sessions', '/sessions'],
      ['Distribuïdores', '/distribuidores'], ['Entitats', '/entitats'],
    ]);
    expect(GRUPS_ADMIN[2].elements.map((e) => [e.etiqueta, e.to])).toEqual([
      ['Escaneig', '/escaneig'], ['Tiquets', '/tickets'],
    ]);
  });

  it('enllaça els comptadors de sol·licituds i propostes', () => {
    expect(GRUPS_ADMIN.flatMap((g) => g.elements).filter((e) => e.comptador).map((e) => [e.etiqueta, e.comptador]))
      .toEqual([['Sol·licituds', 'solicituds'], ['Propostes', 'propostes']]);
  });
});

describe('grupActiu', () => {
  const taula = {
    socis: ['/socis', '/socis/s1', '/socis/nou', '/socis/s1/carnet', '/socis/carnets', '/socis/s1/pagament', '/solicituds'],
    programacio: [
      '/propostes/pendents', '/propostes/pendents/nova', '/propostes/pendents/p1',
      '/tandes', '/tandes/nova', '/tandes/t1', '/tandes/t1/resultats',
      '/sessions', '/sessions/nova', '/sessions/s1',
      '/distribuidores', '/distribuidores/nova', '/distribuidores/d1',
      '/entitats', '/entitats/nova', '/entitats/e1',
    ],
    sala: ['/escaneig', '/escaneig/log', '/tickets', '/tickets/lot1'],
  };
  Object.entries(taula).forEach(([id, rutes]) => {
    it.each(rutes)(`${id}: %s`, (ruta) => {
      expect(grupActiu(ruta)?.id).toBe(id);
    });
  });

  it.each([
    '/', '/comptabilitat', '/comptabilitat/nou', '/comptabilitat/m1', '/configuracio', '/dashboard', '/accedir',
    '/propostes', '/propostes/proposar',
  ])('retorna null per a %s', (ruta) => {
    expect(grupActiu(ruta)).toBeNull();
  });

  it('no confon prefixos que només coincideixen en els caràcters', () => {
    expect(grupActiu('/socisx')).toBeNull();
    expect(grupActiu('/tandesos')).toBeNull();
    expect(grupActiu('/ticketsfoo/1')).toBeNull();
    expect(grupActiu('/escaneigs')).toBeNull();
  });
});
