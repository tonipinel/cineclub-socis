import { describe, it, expect } from 'vitest';
import { triaTanda } from '../../src/lib/propostes/tandes.js';

const ara = new Date('2026-11-01T10:00:00Z');
const dia = (text) => new Date(`${text}T10:00:00Z`);
const stamp = (data) => ({ toDate: () => data });

describe('triaTanda', () => {
  it('sense tandes retorna null', () => {
    expect(triaTanda([], ara)).toBeNull();
  });

  it('prefereix la oberta amb creada més recent', () => {
    const tandes = [
      { id: 'a', tanca: dia('2026-11-05'), creada: dia('2026-10-01') },
      { id: 'b', tanca: dia('2026-11-06'), creada: dia('2026-10-20') },
      { id: 'tancada', tanca: dia('2026-10-30'), creada: dia('2026-10-25') },
    ];
    expect(triaTanda(tandes, ara).id).toBe('b');
  });

  it('prefereix la oberta encara que n\'hi hagi una de tancada creada després', () => {
    const tandes = [
      { id: 'oberta', tanca: dia('2026-11-05'), creada: dia('2026-09-01') },
      { id: 'tancada', tanca: dia('2026-10-30'), creada: dia('2026-10-25') },
    ];
    expect(triaTanda(tandes, ara).id).toBe('oberta');
  });

  it('sense cap oberta tria la tancada amb tanca més recent', () => {
    const tandes = [
      { id: 'vella', tanca: dia('2026-09-01'), creada: dia('2026-10-20') },
      { id: 'recent', tanca: dia('2026-10-30'), creada: dia('2026-08-01') },
    ];
    expect(triaTanda(tandes, ara).id).toBe('recent');
  });

  it('una tanda que tanca just ara ja és tancada', () => {
    expect(triaTanda([{ id: 'a', tanca: ara, creada: dia('2026-10-01') }], ara).id).toBe('a');
  });

  it('accepta Timestamps de Firestore i no muta l\'entrada', () => {
    const tandes = [
      { id: 'a', tanca: stamp(dia('2026-11-05')), creada: stamp(dia('2026-10-01')) },
      { id: 'b', tanca: stamp(dia('2026-11-05')), creada: stamp(dia('2026-10-02')) },
    ];
    const copia = [...tandes];
    expect(triaTanda(tandes, ara).id).toBe('b');
    expect(tandes).toEqual(copia);
  });
});
