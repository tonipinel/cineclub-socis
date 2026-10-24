import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BarraDesar from './BarraDesar';

const onDesar = vi.fn();
const onAnarA = vi.fn();

beforeEach(() => {
  onDesar.mockReset();
  onAnarA.mockReset();
});

function pinta(props) {
  return render(<BarraDesar onDesar={onDesar} onAnarA={onAnarA} {...props} />);
}

describe('BarraDesar', () => {
  it('net: «Sense canvis» i botó desactivat', () => {
    pinta({ estat: 'net' });
    expect(screen.getByText('Sense canvis')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desar' })).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('pendent: avís de canvis i botó actiu', () => {
    pinta({ estat: 'pendent' });
    expect(screen.getByText('Hi ha canvis sense desar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desar' })).toBeEnabled();
  });

  it('amb onDesar el botó és de tipus button; sense, de tipus submit', () => {
    const { unmount } = pinta({ estat: 'pendent' });
    expect(screen.getByRole('button', { name: 'Desar' })).toHaveAttribute('type', 'button');
    unmount();
    pinta({ estat: 'pendent', onDesar: undefined });
    expect(screen.getByRole('button', { name: 'Desar' })).toHaveAttribute('type', 'submit');
  });

  it('pendent: afegeix les pestanyes afectades', () => {
    pinta({ estat: 'pendent', pestanyesAfectades: ['Dades', 'Mitjans'] });
    expect(screen.getByText('Hi ha canvis sense desar · Dades, Mitjans')).toBeInTheDocument();
  });

  it('desant: «Desant…», botó desactivat i aria-busy', () => {
    pinta({ estat: 'desant' });
    expect(screen.getByText('Desant…')).toBeInTheDocument();
    const boto = screen.getByRole('button', { name: 'Desar' });
    expect(boto).toBeDisabled();
    expect(boto).toHaveAttribute('aria-busy', 'true');
  });

  it('desat: «Desat ✓» i botó desactivat', () => {
    pinta({ estat: 'desat' });
    expect(screen.getByText('Desat ✓')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desar' })).toBeDisabled();
  });

  it('el text d\'estat és una regió polite', () => {
    pinta({ estat: 'pendent' });
    expect(screen.getByText('Hi ha canvis sense desar')).toHaveAttribute('aria-live', 'polite');
  });

  it('clicar Desar crida onDesar', async () => {
    pinta({ estat: 'pendent' });
    await userEvent.click(screen.getByRole('button', { name: 'Desar' }));
    expect(onDesar).toHaveBeenCalledTimes(1);
  });

  describe('Descartar canvis (onDescarta)', () => {
    it('sense onDescarta no hi ha botó de descartar', () => {
      pinta({ estat: 'pendent' });
      expect(screen.queryByRole('button', { name: 'Descartar canvis' })).not.toBeInTheDocument();
    });

    it.each(['net', 'desat'])('amb estat %s (sense canvis) no es mostra', (estat) => {
      pinta({ estat, onDescarta: vi.fn() });
      expect(screen.queryByRole('button', { name: 'Descartar canvis' })).not.toBeInTheDocument();
    });

    it.each(['pendent', 'error'])('amb estat %s es mostra i crida onDescarta', async (estat) => {
      const onDescarta = vi.fn();
      pinta({ estat, onDescarta });
      const boto = screen.getByRole('button', { name: 'Descartar canvis' });
      expect(boto).toHaveAttribute('type', 'button');
      await userEvent.click(boto);
      expect(onDescarta).toHaveBeenCalledTimes(1);
      expect(onDesar).not.toHaveBeenCalled();
    });

    it('mentre es desa es mostra deshabilitat', () => {
      pinta({ estat: 'desant', onDescarta: vi.fn() });
      expect(screen.getByRole('button', { name: 'Descartar canvis' })).toBeDisabled();
    });
  });

  describe('error', () => {
    const errors = [
      { pestanya: 'dades', etiquetaPestanya: 'Dades', missatge: 'Falta el títol' },
      { pestanya: 'continguts', etiquetaPestanya: 'Continguts', missatge: 'El cos és massa llarg' },
    ];

    it('mostra una alerta, la llista d\'errors i el botó actiu', () => {
      pinta({ estat: 'error', errors });
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
      expect(screen.getByRole('button', { name: 'Desar' })).toBeEnabled();
    });

    it('clicar un error crida onAnarA amb la seva pestanya', async () => {
      pinta({ estat: 'error', errors });
      await userEvent.click(screen.getByRole('button', { name: /El cos és massa llarg/ }));
      expect(onAnarA).toHaveBeenCalledTimes(1);
      expect(onAnarA).toHaveBeenCalledWith('continguts');
    });

    it('accepta un missatge propi (p. ex. un error de xarxa)', () => {
      pinta({ estat: 'error', missatgeError: "No s'ha pogut desar. Torna-ho a provar." });
      expect(screen.getByRole('alert')).toHaveTextContent(/^No s'ha pogut desar\. Torna-ho a provar\.$/);
    });

    it('el missatge propi només s\'usa en l\'estat d\'error', () => {
      pinta({ estat: 'net', missatgeError: 'Error vell' });
      expect(screen.getByText('Sense canvis')).toBeInTheDocument();
      expect(screen.queryByText('Error vell')).not.toBeInTheDocument();
    });
  });

  it('bloquejada: «Desar» i «Descartar canvis» desactivats encara que hi hagi canvis', async () => {
    const onDescarta = vi.fn();
    pinta({ estat: 'pendent', onDescarta, bloquejada: true });
    expect(screen.getByRole('button', { name: 'Desar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descartar canvis' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Desar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Descartar canvis' }));
    expect(onDesar).not.toHaveBeenCalled();
    expect(onDescarta).not.toHaveBeenCalled();
  });
});
