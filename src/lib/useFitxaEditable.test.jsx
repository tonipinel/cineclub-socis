import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useAvisSortida from './useAvisSortida';
import useFitxaEditable from './useFitxaEditable';

vi.mock('./useAvisSortida', () => ({ default: vi.fn() }));

const INICIAL = { titol: 'Vertigo', any: '1958' };
const ERROR = "No s'ha pogut desar. Torna-ho a provar.";

function diferit() {
  let resol;
  let rebutja;
  const promesa = new Promise((res, rej) => {
    resol = res;
    rebutja = rej;
  });
  return { promesa, resol, rebutja };
}

function munta(onDesar = vi.fn().mockResolvedValue(undefined), opcions = {}) {
  const hook = renderHook(() => useFitxaEditable({ inicial: INICIAL, onDesar, ...opcions }));
  return { ...hook, onDesar };
}

describe('useFitxaEditable', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('sense canvis està net i desa() no crida onDesar', async () => {
    const { result, onDesar } = munta();
    expect(result.current.estat).toBe('net');
    expect(result.current.valors).toEqual(INICIAL);
    expect(result.current.canviats).toEqual([]);
    expect(result.current.hiHaCanvis).toBe(false);
    expect(result.current.errorDesat).toBe(null);
    expect(result.current.errors).toEqual({});
    await act(() => result.current.desa());
    expect(onDesar).not.toHaveBeenCalled();
    expect(result.current.estat).toBe('net');
  });

  it('canvia marca canviats, hiHaCanvis i estat pendent', () => {
    const { result } = munta();
    act(() => result.current.canvia('titol', 'Psycho'));
    expect(result.current.valors).toEqual({ titol: 'Psycho', any: '1958' });
    expect(result.current.canviats).toEqual(['titol']);
    expect(result.current.hiHaCanvis).toBe(true);
    expect(result.current.estat).toBe('pendent');
  });

  it('tornar a posar el valor original deixa canviats buit', () => {
    const { result } = munta();
    act(() => result.current.canvia('titol', 'Psycho'));
    act(() => result.current.canvia('titol', 'Vertigo'));
    expect(result.current.canviats).toEqual([]);
    expect(result.current.hiHaCanvis).toBe(false);
    expect(result.current.estat).toBe('net');
  });

  it('desa crida onDesar amb la instantània i exactament els canviats', async () => {
    const { result, onDesar } = munta();
    act(() => result.current.canvia('any', '1960'));
    await act(() => result.current.desa());
    expect(onDesar).toHaveBeenCalledTimes(1);
    expect(onDesar).toHaveBeenCalledWith({ valors: { titol: 'Vertigo', any: '1960' }, canviats: ['any'] });
  });

  it('un doble desa() immediat crida onDesar una sola vegada', async () => {
    const d = diferit();
    const { result, onDesar } = munta(vi.fn(() => d.promesa));
    act(() => result.current.canvia('titol', 'Psycho'));
    let p1;
    let p2;
    act(() => {
      p1 = result.current.desa();
      p2 = result.current.desa();
    });
    expect(onDesar).toHaveBeenCalledTimes(1);
    expect(result.current.estat).toBe('desant');
    // Un tercer clic després del re-render, encara desant, també s'ignora.
    act(() => {
      result.current.desa();
    });
    expect(onDesar).toHaveBeenCalledTimes(1);
    await act(async () => {
      d.resol();
      await Promise.all([p1, p2]);
    });
    expect(onDesar).toHaveBeenCalledTimes(1);
  });

  it('desat correcte: línia base nova, estat desat 2500 ms i després net', async () => {
    const { result } = munta();
    act(() => result.current.canvia('titol', 'Psycho'));
    await act(() => result.current.desa());
    expect(result.current.estat).toBe('desat');
    expect(result.current.canviats).toEqual([]);
    expect(result.current.hiHaCanvis).toBe(false);
    act(() => vi.advanceTimersByTime(2499));
    expect(result.current.estat).toBe('desat');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.estat).toBe('net');
    // La nova línia base és el valor desat: tornar a 'Vertigo' ara és un canvi.
    act(() => result.current.canvia('titol', 'Vertigo'));
    expect(result.current.canviats).toEqual(['titol']);
  });

  it('editar després de desar treu «desat» i cancel·la el temporitzador', async () => {
    const { result } = munta();
    act(() => result.current.canvia('titol', 'Psycho'));
    await act(() => result.current.desa());
    act(() => result.current.canvia('any', '1960'));
    act(() => result.current.canvia('any', '1958'));
    expect(result.current.estat).toBe('net');
  });

  it('edició durant el desat: continua pendent i canviats només conté el nou', async () => {
    const d = diferit();
    const { result, onDesar } = munta(vi.fn(() => d.promesa));
    act(() => result.current.canvia('titol', 'Psycho'));
    let p;
    act(() => {
      p = result.current.desa();
    });
    act(() => result.current.canvia('any', '1960'));
    expect(result.current.estat).toBe('desant');
    await act(async () => {
      d.resol();
      await p;
    });
    expect(onDesar).toHaveBeenCalledWith({ valors: { titol: 'Psycho', any: '1958' }, canviats: ['titol'] });
    expect(result.current.valors).toEqual({ titol: 'Psycho', any: '1960' });
    expect(result.current.canviats).toEqual(['any']);
    expect(result.current.estat).toBe('pendent');
    act(() => vi.advanceTimersByTime(2500));
    expect(result.current.estat).toBe('pendent');
  });

  it('onDesar que rebutja: estat error, errorDesat, línia base intacta i un segon desa() reintenta', async () => {
    const onDesar = vi.fn().mockRejectedValueOnce(new Error('xarxa')).mockResolvedValueOnce(undefined);
    const { result } = munta(onDesar);
    act(() => result.current.canvia('titol', 'Psycho'));
    await act(() => result.current.desa());
    expect(result.current.estat).toBe('error');
    expect(result.current.errorDesat).toBe(ERROR);
    expect(result.current.canviats).toEqual(['titol']);
    expect(result.current.valors).toEqual({ titol: 'Psycho', any: '1958' });
    await act(() => result.current.desa());
    expect(onDesar).toHaveBeenCalledTimes(2);
    expect(onDesar).toHaveBeenLastCalledWith({ valors: { titol: 'Psycho', any: '1958' }, canviats: ['titol'] });
    expect(result.current.errorDesat).toBe(null);
    expect(result.current.estat).toBe('desat');
    expect(result.current.canviats).toEqual([]);
  });

  it('després d\'un error, editar esborra errorDesat i torna a pendent', async () => {
    const { result } = munta(vi.fn().mockRejectedValue(new Error('xarxa')));
    act(() => result.current.canvia('titol', 'Psycho'));
    await act(() => result.current.desa());
    expect(result.current.estat).toBe('error');
    act(() => result.current.canvia('any', '1960'));
    expect(result.current.errorDesat).toBe(null);
    expect(result.current.estat).toBe('pendent');
  });

  it('onDesar que retorna { errors } exposa els errors i no canvia la línia base', async () => {
    const { result } = munta(vi.fn().mockResolvedValue({ errors: { titol: 'Massa llarg', any: 'Invàlid' } }));
    act(() => result.current.canvia('titol', 'Psycho'));
    await act(() => result.current.desa());
    expect(result.current.errors).toEqual({ titol: 'Massa llarg', any: 'Invàlid' });
    expect(result.current.errorDesat).toBe(null);
    expect(result.current.estat).toBe('error');
    expect(result.current.canviats).toEqual(['titol']);
    act(() => vi.advanceTimersByTime(2500));
    expect(result.current.estat).toBe('error');
    // Editar un camp esborra només el seu error.
    act(() => result.current.canvia('titol', 'Psicosi'));
    expect(result.current.errors).toEqual({ any: 'Invàlid' });
    expect(result.current.estat).toBe('error');
    act(() => result.current.canvia('any', '1960'));
    expect(result.current.errors).toEqual({});
    expect(result.current.estat).toBe('pendent');
  });

  it('onDesar que retorna { errors: {} } compta com a desat correcte', async () => {
    const { result } = munta(vi.fn().mockResolvedValue({ errors: {} }));
    act(() => result.current.canvia('titol', 'Psycho'));
    await act(() => result.current.desa());
    expect(result.current.estat).toBe('desat');
    expect(result.current.canviats).toEqual([]);
  });

  it('setErrors fixa errors externs i posa l\'estat en error', () => {
    const { result } = munta();
    act(() => result.current.setErrors({ any: 'Obligatori' }));
    expect(result.current.errors).toEqual({ any: 'Obligatori' });
    expect(result.current.estat).toBe('error');
  });

  it('descarta restableix els valors a la línia base', () => {
    const { result } = munta();
    act(() => result.current.canvia('titol', 'Psycho'));
    act(() => result.current.canvia('any', '1960'));
    act(() => result.current.descarta());
    expect(result.current.valors).toEqual(INICIAL);
    expect(result.current.canviats).toEqual([]);
    expect(result.current.estat).toBe('net');
  });

  it('reinicia fixa una nova línia base i valors i cancel·la «desat»', async () => {
    const { result } = munta();
    act(() => result.current.canvia('titol', 'Psycho'));
    await act(() => result.current.desa());
    expect(result.current.estat).toBe('desat');
    act(() => result.current.reinicia({ titol: 'Rebecca', any: '1940' }));
    expect(result.current.valors).toEqual({ titol: 'Rebecca', any: '1940' });
    expect(result.current.canviats).toEqual([]);
    expect(result.current.estat).toBe('net');
    act(() => result.current.canvia('titol', 'Psycho'));
    expect(result.current.canviats).toEqual(['titol']);
  });

  it('compara amb igualtat estricta de string/JSON', () => {
    const { result } = renderHook(() => useFitxaEditable({ inicial: { llista: ['a', 'b'], n: '1' }, onDesar: vi.fn() }));
    act(() => result.current.canvia('llista', ['a', 'b']));
    expect(result.current.canviats).toEqual([]);
    act(() => result.current.canvia('n', 1));
    expect(result.current.canviats).toEqual(['n']);
  });

  it('crida useAvisSortida amb true si hi ha canvis i amb false mentre es desa', async () => {
    const d = diferit();
    const { result } = munta(vi.fn(() => d.promesa));
    expect(useAvisSortida).toHaveBeenLastCalledWith(false);
    act(() => result.current.canvia('titol', 'Psycho'));
    expect(useAvisSortida).toHaveBeenLastCalledWith(true);
    let p;
    act(() => {
      p = result.current.desa();
    });
    expect(useAvisSortida).toHaveBeenLastCalledWith(false);
    await act(async () => {
      d.resol();
      await p;
    });
    expect(useAvisSortida).toHaveBeenLastCalledWith(false);
  });

  it('amb avisSortida false no activa mai l\'avís', () => {
    const { result } = munta(undefined, { avisSortida: false });
    act(() => result.current.canvia('titol', 'Psycho'));
    expect(useAvisSortida).not.toHaveBeenCalledWith(true);
  });

  it('descarta després d\'un error neteja errors i errorDesat i torna a net', async () => {
    const { result } = munta(vi.fn().mockResolvedValueOnce({ errors: { titol: 'Massa llarg' } })
      .mockRejectedValueOnce(new Error('xarxa')));
    act(() => result.current.canvia('titol', 'Psycho'));
    await act(() => result.current.desa());
    expect(result.current.estat).toBe('error');
    act(() => result.current.descarta());
    expect(result.current.estat).toBe('net');
    expect(result.current.errors).toEqual({});
    expect(result.current.errorDesat).toBe(null);
    act(() => result.current.canvia('titol', 'Psycho'));
    await act(() => result.current.desa());
    expect(result.current.errorDesat).toBe(ERROR);
    act(() => result.current.descarta());
    expect(result.current.estat).toBe('net');
    expect(result.current.errors).toEqual({});
    expect(result.current.errorDesat).toBe(null);
  });

  it('descarta després de desar cancel·la «desat»', async () => {
    const { result } = munta();
    act(() => result.current.canvia('titol', 'Psycho'));
    await act(() => result.current.desa());
    expect(result.current.estat).toBe('desat');
    act(() => result.current.descarta());
    expect(result.current.estat).toBe('net');
  });

  it('{ errors } ignora els errors dels camps editats mentre es desava', async () => {
    const d = diferit();
    const { result } = munta(vi.fn(() => d.promesa));
    act(() => result.current.canvia('titol', 'Psycho'));
    act(() => result.current.canvia('any', '1960'));
    let p;
    act(() => {
      p = result.current.desa();
    });
    act(() => result.current.canvia('titol', 'Psicosi'));
    await act(async () => {
      d.resol({ errors: { titol: 'Massa llarg', any: 'Invàlid' } });
      await p;
    });
    expect(result.current.errors).toEqual({ any: 'Invàlid' });
    expect(result.current.estat).toBe('error');
    expect(result.current.canviats).toEqual(['titol', 'any']);
  });

  it('reinicia durant un desat pendent conserva la nova línia base quan el desat resol', async () => {
    const d = diferit();
    const { result } = munta(vi.fn(() => d.promesa));
    act(() => result.current.canvia('titol', 'Psycho'));
    let p;
    act(() => {
      p = result.current.desa();
    });
    act(() => result.current.reinicia({ titol: 'Rebecca', any: '1940' }));
    await act(async () => {
      d.resol();
      await p;
    });
    expect(result.current.valors).toEqual({ titol: 'Rebecca', any: '1940' });
    expect(result.current.canviats).toEqual([]);
    expect(result.current.estat).toBe('net');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reinicia durant un desat pendent ignora el rebuig posterior', async () => {
    const d = diferit();
    const { result } = munta(vi.fn(() => d.promesa));
    act(() => result.current.canvia('titol', 'Psycho'));
    let p;
    act(() => {
      p = result.current.desa();
    });
    act(() => result.current.reinicia({ titol: 'Rebecca', any: '1940' }));
    await act(async () => {
      d.rebutja(new Error('xarxa'));
      await p;
    });
    expect(result.current.errorDesat).toBe(null);
    expect(result.current.estat).toBe('net');
  });

  it('desmuntar a mig desat: no programa temporitzadors ni avisa per consola', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    const d = diferit();
    const { result, unmount } = munta(vi.fn(() => d.promesa));
    act(() => result.current.canvia('titol', 'Psycho'));
    let p;
    act(() => {
      p = result.current.desa();
    });
    unmount();
    await act(async () => {
      d.resol();
      await p;
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(consola).not.toHaveBeenCalled();
    consola.mockRestore();
  });

  it('onDesar que llança síncronament: estat error, guarda alliberada i un segon desa() reintenta', async () => {
    const onDesar = vi.fn()
      .mockImplementationOnce(() => { throw new Error('síncron'); })
      .mockResolvedValueOnce(undefined);
    const { result } = munta(onDesar);
    act(() => result.current.canvia('titol', 'Psycho'));
    await act(() => result.current.desa());
    expect(result.current.estat).toBe('error');
    expect(result.current.errorDesat).toBe(ERROR);
    await act(() => result.current.desa());
    expect(onDesar).toHaveBeenCalledTimes(2);
    expect(result.current.estat).toBe('desat');
  });

  it('editar després de desar cancel·la el temporitzador: mai torna a «desat»', async () => {
    const { result } = munta();
    act(() => result.current.canvia('titol', 'Psycho'));
    await act(() => result.current.desa());
    expect(result.current.estat).toBe('desat');
    act(() => result.current.canvia('any', '1960'));
    expect(result.current.estat).toBe('pendent');
    act(() => vi.advanceTimersByTime(1000));
    act(() => result.current.canvia('any', '1958'));
    expect(result.current.estat).toBe('net');
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(2500));
    expect(result.current.estat).toBe('net');
  });
});
