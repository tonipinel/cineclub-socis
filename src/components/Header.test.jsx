import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mockUseAuth = vi.fn();
vi.mock('../auth/useAuth', () => ({ useAuth: () => mockUseAuth() }));

import Header from './Header';

describe('Header', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it('mostra el nom de la marca', () => {
    mockUseAuth.mockReturnValue({ user: null, role: null, signOut: vi.fn() });
    render(<MemoryRouter><Header /></MemoryRouter>);
    expect(screen.getByText('Cineclub Roda de Berà')).toBeInTheDocument();
  });

  it('no mostra cap enllaç de navegació quan no hi ha usuari', () => {
    mockUseAuth.mockReturnValue({ user: null, role: null, signOut: vi.fn() });
    render(<MemoryRouter><Header /></MemoryRouter>);
    expect(screen.queryByText('Socis')).not.toBeInTheDocument();
    expect(screen.queryByText('Sol·licituds')).not.toBeInTheDocument();
    expect(screen.queryByText('Sortir')).not.toBeInTheDocument();
  });

  it('mostra els enllaços de navegació i el botó de sortir quan l\'usuari és admin', async () => {
    const signOut = vi.fn();
    mockUseAuth.mockReturnValue({ user: { uid: '1' }, role: 'admin', signOut });
    const user = userEvent.setup();
    render(<MemoryRouter><Header /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Socis' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sol·licituds' })).toBeInTheDocument();
    const botoSortir = screen.getByRole('button', { name: 'Sortir' });
    await user.click(botoSortir);
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
