import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
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

  it('ordre accessible: estat, errors (botons), «Descartar canvis» i «Desar»', () => {
    const errors = [
      { pestanya: 'dades', etiquetaPestanya: 'Dades', missatge: 'Falta el títol' },
      { pestanya: 'mitjans', etiquetaPestanya: 'Mitjans', missatge: 'Tràiler no vàlid' },
    ];
    pinta({ estat: 'error', errors, onDescarta: vi.fn(), missatgeError: "No s'ha pogut desar. Torna-ho a provar." });
    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveAttribute('aria-live', 'polite');
    const botons = screen.getAllByRole('button');
    expect(botons.map((b) => b.textContent)).toEqual([
      'Dades: Falta el títol', 'Mitjans: Tràiler no vàlid', 'Descartar canvis', 'Desar',
    ]);
    botons.forEach((b) => expect(b).toHaveAttribute('type', 'button'));
    // L'estat (i els errors) van abans dels botons en l'ordre del document, i els errors no són dins de l'alerta.
    expect(alerta.compareDocumentPosition(botons[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(alerta).not.toContainElement(botons[0]);
    expect(screen.getByRole('list')).not.toContainElement(botons[2]);
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
  describe('motiu del bloqueig (motiuBloqueig)', () => {
    const MOTIU = "S'està pujant una imatge…";

    it('bloquejada: mostra el motiu com a nota informativa (polite, no alerta) i «Desar» desactivat', () => {
      pinta({ estat: 'pendent', bloquejada: true, motiuBloqueig: MOTIU });
      const nota = screen.getByText(MOTIU);
      expect(nota).toHaveAttribute('aria-live', 'polite');
      expect(nota).not.toHaveAttribute('role', 'alert');
      expect(nota).not.toHaveClass('barra-desar__text--error');
      expect(nota).toHaveClass('barra-desar__nota');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      // L'estat de la fitxa continua visible al costat del motiu.
      expect(screen.getByText('Hi ha canvis sense desar')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Desar' })).toBeDisabled();
    });

    it('sense bloqueig el motiu no es mostra, però la regió viva ja hi és (buida)', () => {
      const { container } = pinta({ estat: 'pendent', motiuBloqueig: MOTIU });
      expect(screen.queryByText(MOTIU)).not.toBeInTheDocument();
      const nota = container.querySelector('.barra-desar__nota');
      expect(nota).toHaveAttribute('aria-live', 'polite');
      expect(nota).toBeEmptyDOMElement();
    });

    it('en passar a bloquejada, el motiu apareix dins de la mateixa regió viva', () => {
      const { container, rerender } = pinta({ estat: 'pendent', motiuBloqueig: MOTIU });
      const nota = container.querySelector('.barra-desar__nota');
      rerender(<BarraDesar onDesar={onDesar} onAnarA={onAnarA} estat="pendent" motiuBloqueig={MOTIU} bloquejada />);
      expect(container.querySelector('.barra-desar__nota')).toBe(nota);
      expect(nota).toHaveTextContent(MOTIU);
    });

    it('no substitueix el missatge d\'error: tots dos es mostren per separat', () => {
      pinta({
        estat: 'error', bloquejada: true, motiuBloqueig: MOTIU, missatgeError: "No s'ha pogut desar. Torna-ho a provar.",
      });
      expect(screen.getByRole('alert')).toHaveTextContent(/^No s'ha pogut desar\. Torna-ho a provar\.$/);
      expect(screen.getByText(MOTIU)).not.toHaveClass('barra-desar__text--error');
    });
  });

  describe('focus després de «Descartar canvis»', () => {
    // La barra en una fitxa mínima: descartar torna a «Sense canvis» i el botó desapareix.
    function FitxaAmbBarra({ onDescarta = () => {} }) {
      const [estat, setEstat] = useState('pendent');
      return (
        <BarraDesar
          estat={estat}
          onDesar={onDesar}
          onDescarta={() => { onDescarta(); setEstat('net'); }}
        />
      );
    }

    it('el focus passa al text d\'estat de la barra (no es perd al body)', async () => {
      render(<FitxaAmbBarra />);
      await userEvent.click(screen.getByRole('button', { name: 'Descartar canvis' }));
      expect(screen.queryByRole('button', { name: 'Descartar canvis' })).not.toBeInTheDocument();
      const text = screen.getByText('Sense canvis');
      expect(text).toHaveFocus();
      expect(text).toHaveAttribute('tabindex', '-1');
    });

    it('amb el teclat també: Enter a «Descartar canvis» deixa el focus a l\'estat', async () => {
      render(<FitxaAmbBarra />);
      screen.getByRole('button', { name: 'Descartar canvis' }).focus();
      await userEvent.keyboard('{Enter}');
      expect(screen.getByText('Sense canvis')).toHaveFocus();
      // El text no entra a l'ordre de tabulació: el següent Tab no s'hi atura en tornar-hi.
      expect(screen.getByText('Sense canvis').tabIndex).toBe(-1);
    });

    it('si el descart no treu el botó (no fa res), el focus es queda al botó', async () => {
      render(<BarraDesar estat="pendent" onDesar={onDesar} onDescarta={vi.fn()} />);
      const boto = screen.getByRole('button', { name: 'Descartar canvis' });
      await userEvent.click(boto);
      expect(boto).toHaveFocus();
    });

    it('no roba el focus en renderitzats posteriors sense descart', async () => {
      const { rerender } = render(<BarraDesar estat="pendent" onDesar={onDesar} onDescarta={vi.fn()} />);
      await userEvent.click(screen.getByRole('button', { name: 'Descartar canvis' }));
      screen.getByRole('button', { name: 'Descartar canvis' }).blur();
      expect(document.body).toHaveFocus();
      rerender(<BarraDesar estat="net" onDesar={onDesar} onDescarta={vi.fn()} />);
      expect(screen.getByText('Sense canvis')).not.toHaveFocus();
    });
  });
});
