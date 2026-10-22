import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RedireccioPropostes from './RedireccioPropostes';

const replace = vi.fn();
const locationOriginal = window.location;

function renderitza(ruta, hash) {
  Object.defineProperty(window, 'location', { configurable: true, value: { hash, replace } });
  render(<MemoryRouter initialEntries={[ruta]}><RedireccioPropostes /></MemoryRouter>);
}

beforeEach(() => replace.mockClear());
afterEach(() => Object.defineProperty(window, 'location', { configurable: true, value: locationOriginal }));

describe('RedireccioPropostes', () => {
  it.each([
    ['/', '#abc123', 'https://cineclubrodadebera.cat/propostes/#abc123'],
    ['/propostes', '#top', 'https://cineclubrodadebera.cat/propostes/#top'],
    ['/', '', 'https://cineclubrodadebera.cat/propostes/'],
    ['/propostes/proposar', '', 'https://cineclubrodadebera.cat/propostes/proposar/'],
  ])('%s %s redirigeix a %s i mostra l\'enllaç', (ruta, hash, desti) => {
    renderitza(ruta, hash);
    expect(replace).toHaveBeenCalledWith(desti);
    expect(screen.getByRole('link', { name: /han canviat d'adreça/ })).toHaveAttribute('href', desti);
  });
});
