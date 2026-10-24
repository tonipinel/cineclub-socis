import { describe, it, expect } from 'vitest';
import { missatgeBloqueigEliminar } from './blocatgeEliminar';

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
