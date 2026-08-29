import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Header from './Header';

describe('Header', () => {
  it('mostra el nom de la marca', () => {
    render(<Header />);
    expect(screen.getByText('Cineclub Roda de Berà')).toBeInTheDocument();
  });
});
