import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const mockSignIn = vi.fn();
const mockUseAuth = vi.fn();
vi.mock('../auth/useAuth', () => ({ useAuth: () => mockUseAuth() }));

import Accedir from './Accedir';

describe('Accedir', () => {
  beforeEach(() => {
    mockSignIn.mockReset();
    mockUseAuth.mockReset();
    mockUseAuth.mockReturnValue({ user: null, role: null, signIn: mockSignIn });
  });

  it('mostra un error quan les credencials són incorrectes', async () => {
    mockSignIn.mockRejectedValueOnce(new Error('auth/invalid-credential'));
    const user = userEvent.setup();
    render(<MemoryRouter><Accedir /></MemoryRouter>);
    await user.type(screen.getByLabelText('Correu electrònic'), 'admin@example.com');
    await user.type(screen.getByLabelText('Contrasenya'), 'contrasenya-incorrecta');
    await user.click(screen.getByRole('button', { name: /accedir/i }));
    expect(await screen.findByText('Correu o contrasenya incorrectes.')).toBeInTheDocument();
    expect(mockSignIn).toHaveBeenCalledWith('admin@example.com', 'contrasenya-incorrecta');
  });

  it('redirigeix a /dashboard quan l\'usuari ja ha entrat com a admin', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: '1' }, role: 'admin', signIn: mockSignIn });
    render(
      <MemoryRouter initialEntries={['/accedir']}>
        <Routes>
          <Route path="/accedir" element={<Accedir />} />
          <Route path="/dashboard" element={<p>Dashboard</p>} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
  });

  it('redirigeix a /escaneig quan l\'usuari ja ha entrat com a taquilla', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: '2' }, role: 'taquilla', signIn: mockSignIn });
    render(
      <MemoryRouter initialEntries={['/accedir']}>
        <Routes>
          <Route path="/accedir" element={<Accedir />} />
          <Route path="/escaneig" element={<p>Escaneig</p>} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Escaneig')).toBeInTheDocument();
  });
});
