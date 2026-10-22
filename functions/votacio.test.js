import { describe, it, expect } from 'vitest';
import votacio from './votacio.js';

const { propostesEfectives, estaTancada, aplicarVot, estaCompleta, calcularRanking } = votacio;

describe('propostesEfectives', () => {
  it('ignora les propostes no aprovades i les inexistents i manté l\'ordre de la tanda', () => {
    const tanda = { propostes: ['c', 'a', 'x', 'b', 'd'] };
    const propostesPerId = {
      a: { estat: 'aprovada' },
      b: { estat: 'pendent' },
      c: { estat: 'aprovada' },
      d: { estat: 'rebutjada' },
    };
    expect(propostesEfectives(tanda, propostesPerId)).toEqual(['c', 'a']);
  });
});

describe('estaTancada', () => {
  const tanca = new Date('2026-11-01T12:00:00Z');
  const timestamp = { toDate: () => tanca };

  it('és false abans de tanca', () => {
    const abans = new Date('2026-11-01T11:59:59Z');
    expect(estaTancada({ tanca: timestamp }, abans)).toBe(false);
    expect(estaTancada({ tanca }, abans)).toBe(false);
  });

  it('és true en tanca i després', () => {
    const despres = new Date('2026-11-01T12:00:01Z');
    expect(estaTancada({ tanca: timestamp }, tanca)).toBe(true);
    expect(estaTancada({ tanca }, tanca)).toBe(true);
    expect(estaTancada({ tanca: timestamp }, despres)).toBe(true);
    expect(estaTancada({ tanca }, despres)).toBe(true);
  });
});

describe('aplicarVot', () => {
  const efectives = ['a', 'b'];
  const oberta = { tancada: false };

  it('desa un like en un vot nou', () => {
    expect(aplicarVot(null, 'a', 'like', efectives, oberta)).toEqual({ valors: { a: 'like' }, bloquejat: false });
  });

  it('permet canviar a dislike si no està bloquejat', () => {
    const actual = { valors: { a: 'like', b: 'like' }, bloquejat: false };
    expect(aplicarVot(actual, 'a', 'dislike', efectives, oberta)).toEqual({
      valors: { a: 'dislike', b: 'like' },
      bloquejat: false,
    });
  });

  it('no modifica el vot actual', () => {
    const actual = { valors: { a: 'like' }, bloquejat: false };
    aplicarVot(actual, 'a', 'dislike', efectives, oberta);
    expect(actual).toEqual({ valors: { a: 'like' }, bloquejat: false });
  });

  it('rebutja amb failed-precondition si la tanda és tancada', () => {
    expect(() => aplicarVot(null, 'a', 'like', efectives, { tancada: true }))
      .toThrow(expect.objectContaining({ codi: 'failed-precondition' }));
  });

  it('rebutja amb failed-precondition si el vot és bloquejat', () => {
    const actual = { valors: { a: 'like', b: 'like' }, bloquejat: true };
    expect(() => aplicarVot(actual, 'a', 'dislike', efectives, oberta))
      .toThrow(expect.objectContaining({ codi: 'failed-precondition' }));
  });

  it('rebutja amb invalid-argument una proposta fora d\'efectives', () => {
    expect(() => aplicarVot(null, 'z', 'like', efectives, oberta))
      .toThrow(expect.objectContaining({ codi: 'invalid-argument' }));
  });

  it('rebutja amb invalid-argument un valor que no sigui like o dislike', () => {
    expect(() => aplicarVot(null, 'a', 'meh', efectives, oberta))
      .toThrow(expect.objectContaining({ codi: 'invalid-argument' }));
  });

  it('és idempotent', () => {
    const una = aplicarVot(null, 'a', 'like', efectives, oberta);
    const dues = aplicarVot(una, 'a', 'like', efectives, oberta);
    expect(dues).toEqual(una);
  });
});

describe('estaCompleta', () => {
  it('és true només si totes les efectives tenen valor', () => {
    const efectives = ['a', 'b'];
    expect(estaCompleta({ a: 'like', b: 'dislike' }, efectives)).toBe(true);
    expect(estaCompleta({ a: 'like' }, efectives)).toBe(false);
    expect(estaCompleta({}, efectives)).toBe(false);
  });

  it('no compta una proposta retirada amb un vot antic', () => {
    expect(estaCompleta({ a: 'like', retirada: 'like' }, ['a', 'b'])).toBe(false);
    expect(estaCompleta({ a: 'like', retirada: 'like' }, ['a'])).toBe(true);
  });
});

describe('calcularRanking', () => {
  const vots = (valorsPerVot) => valorsPerVot.map((valors) => ({ valors }));

  it('calcula el percentatge arrodonit amb 6 vots (4 like, 2 dislike) → 67', () => {
    const docs = vots([
      { a: 'like' }, { a: 'like' }, { a: 'like' }, { a: 'like' }, { a: 'dislike' }, { a: 'dislike' },
    ]);
    expect(calcularRanking(docs, ['a'], {})).toEqual([{ propostaId: 'a', percentatge: 67 }]);
  });

  it('dóna percentatge null amb menys vots que el mínim', () => {
    const docs = vots([{ a: 'like' }, { a: 'like' }, { a: 'like' }, { a: 'dislike' }]);
    expect(calcularRanking(docs, ['a'], {})).toEqual([{ propostaId: 'a', percentatge: null }]);
  });

  it('accepta un mínim personalitzat', () => {
    const docs = vots([{ a: 'like' }, { a: 'dislike' }]);
    expect(calcularRanking(docs, ['a'], { minim: 2 })).toEqual([{ propostaId: 'a', percentatge: 50 }]);
  });

  it('ordena per percentatge descendent amb els null al final', () => {
    const docs = vots([
      { a: 'dislike', b: 'like', c: 'like' },
      { a: 'dislike', b: 'like', c: 'like' },
      { a: 'dislike', b: 'like', c: 'dislike' },
      { a: 'like', b: 'like', c: 'dislike' },
      { a: 'like', b: 'dislike' },
      { a: 'like', b: 'dislike' },
    ]);
    expect(calcularRanking(docs, ['a', 'b', 'c'], {})).toEqual([
      { propostaId: 'b', percentatge: 67 },
      { propostaId: 'a', percentatge: 50 },
      { propostaId: 'c', percentatge: null },
    ]);
  });

  it('desempata per l\'ordre d\'efectives', () => {
    const docs = vots(Array.from({ length: 5 }, () => ({ a: 'like', b: 'like' })));
    expect(calcularRanking(docs, ['b', 'a'], {}).map((r) => r.propostaId)).toEqual(['b', 'a']);
  });

  it('ignora els vots de propostes fora d\'efectives', () => {
    const docs = vots(Array.from({ length: 5 }, () => ({ a: 'like', retirada: 'dislike' })));
    expect(calcularRanking(docs, ['a'], {})).toEqual([{ propostaId: 'a', percentatge: 100 }]);
  });

  it('no peta si un document de vot no té valors', () => {
    const docs = [...vots(Array.from({ length: 5 }, () => ({ a: 'like' }))), {}, { bloquejat: true }];
    expect(calcularRanking(docs, ['a'], {})).toEqual([{ propostaId: 'a', percentatge: 100 }]);
  });
});
