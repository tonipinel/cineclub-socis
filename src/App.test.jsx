import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('mostra el nom del cineclub', () => {
    render(<App />);
    expect(screen.getByText('Cineclub Roda de Berà')).toBeInTheDocument();
  });
});
