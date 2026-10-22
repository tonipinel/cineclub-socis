// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BarraProgres from '../../src/components/propostes/BarraProgres.jsx';

describe('BarraProgres', () => {
  it('mostra «Has votat 7 de 12» i aria-valuenow=58', () => {
    render(<BarraProgres votats={7} total={12} />);
    expect(screen.getByText('Has votat 7 de 12')).toBeInTheDocument();
    const barra = screen.getByRole('progressbar');
    expect(barra).toHaveAttribute('aria-valuenow', '58');
    expect(barra).toHaveAttribute('aria-valuemin', '0');
    expect(barra).toHaveAttribute('aria-valuemax', '100');
  });

  it('a 12/12 mostra només «Has votat 12 de 12» i la barra plena en verd (classe d\'èxit)', () => {
    const { container } = render(<BarraProgres votats={12} total={12} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText('Has votat 12 de 12')).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByText(/Has votat totes les propostes/)).not.toBeInTheDocument();
    expect(container.querySelector('.barra-progres')).toHaveClass('barra-progres--completa');
  });

  it('mentre no és complet no té la classe d\'èxit', () => {
    const { container } = render(<BarraProgres votats={11} total={12} />);
    expect(container.querySelector('.barra-progres')).not.toHaveClass('barra-progres--completa');
  });

  it('amb total 0 no es marca com a completa', () => {
    const { container } = render(<BarraProgres votats={0} total={0} />);
    expect(container.querySelector('.barra-progres')).not.toHaveClass('barra-progres--completa');
  });

  it('amb total 0 no peta', () => {
    render(<BarraProgres votats={0} total={0} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('limita el valor entre 0 i 100', () => {
    const { rerender } = render(<BarraProgres votats={15} total={12} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('progressbar').firstChild.style.width).toBe('100%');
    rerender(<BarraProgres votats={-3} total={12} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByRole('progressbar').firstChild.style.width).toBe('0%');
  });

  it('el text del progrés és una regió aria-live polite', () => {
    render(<BarraProgres votats={1} total={3} />);
    expect(screen.getByText('Has votat 1 de 3')).toHaveAttribute('aria-live', 'polite');
  });
});
