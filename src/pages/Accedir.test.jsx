import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mockSignIn = vi.fn();
vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ user: null, signIn: mockSignIn }),
}));

import Accedir from './Accedir';

describe('Accedir', () => {
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
});
