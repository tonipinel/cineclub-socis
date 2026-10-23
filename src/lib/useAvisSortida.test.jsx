import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import useAvisSortida from './useAvisSortida';

function Prova({ actiu, missatge }) {
  useAvisSortida(actiu, missatge);
  return (
    <div>
      <a href="/sessions">interna</a>
      <a href="/sessions" target="_blank">nova pestanya</a>
      <a href="https://altre.cat/x">externa</a>
      <a href={window.location.pathname}>mateixa</a>
    </div>
  );
}

function clic(element, opcions = {}) {
  const e = new MouseEvent('click', { bubbles: true, cancelable: true, ...opcions });
  element.dispatchEvent(e);
  return e;
}

const enllac = (text) => [...document.querySelectorAll('a')].find((a) => a.textContent === text);

describe('useAvisSortida', () => {
  let confirm;
  beforeEach(() => {
    confirm = vi.spyOn(window, 'confirm');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('actiu: beforeunload queda cancel·lat', () => {
    render(<Prova actiu />);
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('inactiu: beforeunload no es toca', () => {
    render(<Prova actiu={false} />);
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });

  it('inactiu: un enllaç intern no demana confirmació', () => {
    render(<Prova actiu={false} />);
    const e = clic(enllac('interna'));
    expect(confirm).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it('enllaç intern amb confirmació cancel·lada: no navega', () => {
    confirm.mockReturnValue(false);
    render(<Prova actiu missatge="Segur?" />);
    const e = clic(enllac('interna'));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith('Segur?');
    expect(e.defaultPrevented).toBe(true);
  });

  it('enllaç intern amb confirmació acceptada: deixa passar', () => {
    confirm.mockReturnValue(true);
    render(<Prova actiu />);
    const e = clic(enllac('interna'));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(false);
  });

  it('usa el missatge per defecte', () => {
    confirm.mockReturnValue(true);
    render(<Prova actiu />);
    clic(enllac('interna'));
    expect(confirm).toHaveBeenCalledWith('Hi ha canvis sense desar. Vols sortir igualment?');
  });

  it('no demana confirmació per a enllaços externs, target o la mateixa ubicació', () => {
    render(<Prova actiu />);
    for (const text of ['externa', 'nova pestanya', 'mateixa']) {
      const e = clic(enllac(text));
      expect(e.defaultPrevented).toBe(false);
    }
    expect(confirm).not.toHaveBeenCalled();
  });

  it('no demana confirmació amb modificadors', () => {
    render(<Prova actiu />);
    clic(enllac('interna'), { ctrlKey: true });
    clic(enllac('interna'), { metaKey: true });
    expect(confirm).not.toHaveBeenCalled();
  });

  it('en desmuntar treu els listeners', () => {
    const { unmount } = render(<Prova actiu />);
    unmount();
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    const a = document.createElement('a');
    a.href = '/sessions';
    document.body.appendChild(a);
    clic(a);
    expect(confirm).not.toHaveBeenCalled();
  });
});
