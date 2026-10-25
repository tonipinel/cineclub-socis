import { describe, it, expect, vi } from 'vitest';
import { gestionaErrorPrecarrega, CLAU_RECARREGA } from './recarregaChunks';

function magatzem(inicial = {}) {
  const dades = { ...inicial };
  return {
    getItem: (k) => (k in dades ? dades[k] : null),
    setItem: (k, v) => { dades[k] = String(v); },
    dades,
  };
}

describe('gestionaErrorPrecarrega', () => {
  it('la primera vegada recarrega la pàgina, desa l\'hora i evita l\'error', () => {
    const event = { preventDefault: vi.fn() };
    const recarrega = vi.fn();
    const m = magatzem();
    expect(gestionaErrorPrecarrega(event, { emmagatzematge: m, recarrega, ara: 1000 })).toBe(true);
    expect(recarrega).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(m.dades[CLAU_RECARREGA]).toBe('1000');
  });

  it('si ja s\'ha recarregat fa poc, no torna a recarregar (evita bucles) i deixa passar l\'error', () => {
    const event = { preventDefault: vi.fn() };
    const recarrega = vi.fn();
    const m = magatzem({ [CLAU_RECARREGA]: '1000' });
    expect(gestionaErrorPrecarrega(event, { emmagatzematge: m, recarrega, ara: 5000 })).toBe(false);
    expect(recarrega).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('passat un temps (un desplegament nou més tard), torna a recarregar', () => {
    const recarrega = vi.fn();
    const m = magatzem({ [CLAU_RECARREGA]: '1000' });
    gestionaErrorPrecarrega({ preventDefault() {} }, { emmagatzematge: m, recarrega, ara: 1000 + 60_000 });
    expect(recarrega).toHaveBeenCalled();
  });

  it('sense sessionStorage disponible, no recarrega (no es pot protegir del bucle)', () => {
    const recarrega = vi.fn();
    const trencat = { getItem: () => { throw new Error('bloquejat'); }, setItem: () => { throw new Error('bloquejat'); } };
    expect(gestionaErrorPrecarrega({ preventDefault() {} }, { emmagatzematge: trencat, recarrega, ara: 1 })).toBe(false);
    expect(recarrega).not.toHaveBeenCalled();
  });
});
