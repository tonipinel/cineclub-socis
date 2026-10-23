import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DialegConfirmacio, { GRACIA_ACCEPTAR_MS } from './DialegConfirmacio';

// Cada lectura de Date.now avança el període de gràcia: els clics no hi cauen a dins.
beforeEach(() => {
  let ara = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => (ara += GRACIA_ACCEPTAR_MS));
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('DialegConfirmacio', () => {
  it('tancat no renderitza res', () => {
    const { container } = render(<DialegConfirmacio obert={false} missatge="x" onAcceptar={() => {}} onCancellar={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('el títol dona nom al diàleg i el missatge el descriu', () => {
    render(
      <DialegConfirmacio obert titol="Eliminar l'entitat" missatge="No es pot desfer." onAcceptar={() => {}} onCancellar={() => {}} />,
    );
    const dialeg = screen.getByRole('dialog', { name: "Eliminar l'entitat" });
    expect(dialeg).toHaveAccessibleDescription('No es pot desfer.');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe("Eliminar l'entitat");
  });

  it('sense títol, el missatge dona nom al diàleg', () => {
    render(<DialegConfirmacio obert missatge="Segur?" onAcceptar={() => {}} onCancellar={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Segur?' })).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('fa servir les etiquetes donades i crida cada callback', async () => {
    const onAcceptar = vi.fn();
    const onCancellar = vi.fn();
    render(
      <DialegConfirmacio
        obert missatge="Segur?" etiquetaAcceptar="Programar" etiquetaCancellar="Tornar"
        onAcceptar={onAcceptar} onCancellar={onCancellar}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Tornar' }));
    expect(onCancellar).toHaveBeenCalledTimes(1);
    expect(onAcceptar).toHaveBeenCalledTimes(0);
    await userEvent.click(screen.getByRole('button', { name: 'Programar' }));
    expect(onAcceptar).toHaveBeenCalledTimes(1);
  });

  describe('clic al fons', () => {
    // Rellotge controlat: el diàleg s'obre a t=1000.
    let ara;
    beforeEach(() => {
      ara = 1000;
      vi.spyOn(Date, 'now').mockImplementation(() => ara);
    });

    const obrir = () => {
      const onCancellar = vi.fn();
      render(<DialegConfirmacio obert missatge="Segur?" onAcceptar={() => {}} onCancellar={onCancellar} />);
      return { onCancellar, dialeg: screen.getByRole('dialog') };
    };

    it('ignora el clic al fons durant el període de gràcia i cancel·la en acabar-lo', () => {
      const { onCancellar, dialeg } = obrir();
      ara = 1000;
      fireEvent.click(dialeg);
      ara = 1000 + GRACIA_ACCEPTAR_MS - 1;
      fireEvent.click(dialeg);
      expect(onCancellar).toHaveBeenCalledTimes(0);
      ara = 1000 + GRACIA_ACCEPTAR_MS;
      fireEvent.click(dialeg);
      expect(onCancellar).toHaveBeenCalledTimes(1);
    });

    it('ignora el segon clic d\'un doble clic al fons', () => {
      const { onCancellar, dialeg } = obrir();
      ara = 1000 + GRACIA_ACCEPTAR_MS + 500;
      fireEvent.click(dialeg, { detail: 2 });
      expect(onCancellar).toHaveBeenCalledTimes(0);
      fireEvent.click(dialeg, { detail: 1 });
      expect(onCancellar).toHaveBeenCalledTimes(1);
    });
  });
});
