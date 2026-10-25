import { describe, it, expect } from 'vitest';
import { missatgeBloqueigEliminar, missatgeBloqueigEliminarDiversos } from './blocatgeEliminar';

describe('missatgeBloqueigEliminar', () => {
  it('singular i plural, amb els títols', () => {
    expect(missatgeBloqueigEliminar(1, 'sessió', 'sessions', ['Pig'])).toBe("No es pot eliminar: l'usa 1 sessió (Pig)");
    expect(missatgeBloqueigEliminar(2, 'sessió', 'sessions', ['Pig', 'Bis'])).toBe("No es pot eliminar: l'usen 2 sessions (Pig, Bis)");
  });

  it('sense títols, només el recompte', () => {
    expect(missatgeBloqueigEliminar(1, 'proposta', 'propostes')).toBe("No es pot eliminar: l'usa 1 proposta");
    expect(missatgeBloqueigEliminar(5, 'proposta', 'propostes', [undefined, ''])).toBe("No es pot eliminar: l'usen 5 propostes");
  });
});

describe('missatgeBloqueigEliminarDiversos', () => {
  it('ajunta els usos que en tenen i omet els buits', () => {
    expect(missatgeBloqueigEliminarDiversos([
      { nombre: 1, singular: 'tanda', plural: 'tandes', titols: ['Tardor'] },
      { nombre: 2, singular: 'sessió', plural: 'sessions', titols: ['Pig', 'Bis'] },
    ])).toBe("No es pot eliminar: l'usa 1 tanda (Tardor) i l'usen 2 sessions (Pig, Bis)");
    expect(missatgeBloqueigEliminarDiversos([
      { nombre: 0, singular: 'tanda', plural: 'tandes', titols: [] },
      { nombre: 1, singular: 'sessió', plural: 'sessions', titols: ['Pig'] },
    ])).toBe("No es pot eliminar: l'usa 1 sessió (Pig)");
  });

  it('sense cap ús retorna null', () => {
    expect(missatgeBloqueigEliminarDiversos([{ nombre: 0, singular: 'tanda', plural: 'tandes' }])).toBeNull();
  });
});
