import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./firebase/firebase', () => ({ auth: {}, db: {} }));
vi.mock('./auth/useAuth', () => ({
  useAuth: () => ({ user: null, role: null, loading: false, signIn: vi.fn(), signOut: vi.fn() }),
}));

import App from './App';

describe('App', () => {
  it('mostra el nom del cineclub', () => {
    render(<App />);
    expect(screen.getByText('Cineclub Roda de Berà')).toBeInTheDocument();
  });
});
