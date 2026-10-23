import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GaleriaImatges from './GaleriaImatges';

const GALERIA = ['https://x/a.jpg', 'https://x/b.jpg', 'https://x/c.jpg'];

const muntar = (props) => {
  const onCanviGaleria = vi.fn();
  const onFerCartell = vi.fn();
  render(
    <GaleriaImatges
      galeria={GALERIA}
      cartell=""
      onCanviGaleria={onCanviGaleria}
      onFerCartell={onFerCartell}
      {...props}
    />,
  );
  return { onCanviGaleria, onFerCartell, galeria: within(screen.getByRole('list', { name: 'Galeria' })) };
};

describe('GaleriaImatges', () => {
  it('mostra una miniatura per imatge, en ordre', () => {
    const { galeria } = muntar({ arrossegament: true });
    expect(galeria.getAllByRole('img').map((img) => [img.alt, img.getAttribute('src')])).toEqual([
      ['Imatge 1 de la galeria', 'https://x/a.jpg'],
      ['Imatge 2 de la galeria', 'https://x/b.jpg'],
      ['Imatge 3 de la galeria', 'https://x/c.jpg'],
    ]);
  });

  describe('sense arrossegament', () => {
    it('↑ al segon canvia l\'ordre; ↑ del primer i ↓ de l\'últim estan desactivats; no hi ha handle', async () => {
      const { galeria, onCanviGaleria } = muntar({ arrossegament: false });
      await userEvent.click(galeria.getByRole('button', { name: 'Moure amunt la imatge 2' }));
      expect(onCanviGaleria).toHaveBeenCalledWith(['https://x/b.jpg', 'https://x/a.jpg', 'https://x/c.jpg']);
      await userEvent.click(galeria.getByRole('button', { name: 'Moure avall la imatge 1' }));
      expect(onCanviGaleria).toHaveBeenLastCalledWith(['https://x/b.jpg', 'https://x/a.jpg', 'https://x/c.jpg']);
      expect(galeria.getByRole('button', { name: 'Moure amunt la imatge 1' })).toBeDisabled();
      expect(galeria.getByRole('button', { name: 'Moure avall la imatge 3' })).toBeDisabled();
      expect(galeria.queryByRole('button', { name: /^Arrossega/ })).not.toBeInTheDocument();
    });
  });

  describe('amb arrossegament', () => {
    it('cada imatge té un handle i no hi ha botons «Moure…»', () => {
      const { galeria } = muntar({ arrossegament: true });
      expect(galeria.getAllByRole('button', { name: /^Arrossega per reordenar la imatge \d$/ }).map((b) => b.getAttribute('aria-label')))
        .toEqual(['Arrossega per reordenar la imatge 1', 'Arrossega per reordenar la imatge 2', 'Arrossega per reordenar la imatge 3']);
      expect(galeria.getByRole('button', { name: 'Arrossega per reordenar la imatge 2' })).toHaveAttribute('type', 'button');
      expect(galeria.queryByRole('button', { name: /^Moure/ })).not.toBeInTheDocument();
    });
  });

  it('«Treure» treu només aquella imatge', async () => {
    const { galeria, onCanviGaleria } = muntar({ arrossegament: true });
    await userEvent.click(galeria.getByRole('button', { name: 'Treure la imatge 2' }));
    expect(onCanviGaleria).toHaveBeenCalledWith(['https://x/a.jpg', 'https://x/c.jpg']);
  });

  it('«Fer cartell» passa la URL i està desactivat a la que ja és el cartell', async () => {
    const { galeria, onFerCartell } = muntar({ arrossegament: true, cartell: 'https://x/b.jpg' });
    expect(galeria.getByRole('button', { name: 'Fer cartell la imatge 2' })).toBeDisabled();
    expect(galeria.getByRole('button', { name: 'Fer cartell la imatge 1' })).toBeEnabled();
    await userEvent.click(galeria.getByRole('button', { name: 'Fer cartell la imatge 3' }));
    expect(onFerCartell).toHaveBeenCalledWith('https://x/c.jpg');
  });

  it('sense imatges diu que la galeria és buida', () => {
    render(<GaleriaImatges galeria={[]} cartell="" onCanviGaleria={() => {}} onFerCartell={() => {}} arrossegament />);
    expect(screen.getByText('La galeria és buida.')).toBeInTheDocument();
  });
});
