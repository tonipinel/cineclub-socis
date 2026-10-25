import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./firebase/firebase', () => ({ auth: {}, db: {}, functions: {} }));
const mockUseAuth = vi.fn();
vi.mock('./auth/useAuth', () => ({ useAuth: () => mockUseAuth() }));
const mockCrida = vi.fn();
vi.mock('firebase/functions', () => ({ httpsCallable: (_f, nom) => (dades) => mockCrida(nom, dades) }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), doc: vi.fn(), query: vi.fn(), where: vi.fn(), onSnapshot: vi.fn(() => () => {}),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  addDoc: vi.fn(), setDoc: vi.fn(), deleteDoc: vi.fn(), serverTimestamp: vi.fn(),
}));

import App from './App';

// Rutes reals d'App.jsx: només l'admin hi entra.
describe('App: rutes dels usuaris de taquilla', () => {
  it.each([
    ['taquilla', { user: { uid: 't' }, role: 'taquilla' }],
    ['sense sessió', { user: null, role: null }],
  ])('%s: /usuaris-taquilla, /nou i la fitxa porten a l\'accés', (_nom, auth) => {
    mockUseAuth.mockReturnValue({ ...auth, loading: false, signIn: vi.fn(), signOut: vi.fn() });
    for (const ruta of ['/usuaris-taquilla', '/usuaris-taquilla/nou', '/usuaris-taquilla/u1']) {
      window.history.pushState({}, '', ruta);
      const { unmount } = render(<App />);
      expect(window.location.pathname).not.toBe(ruta);
      unmount();
    }
    expect(mockCrida).not.toHaveBeenCalled();
  });

  it('admin: hi entra i en demana el llistat', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'a' }, role: 'admin', loading: false, signIn: vi.fn(), signOut: vi.fn() });
    mockCrida.mockResolvedValue({ data: [] });
    window.history.pushState({}, '', '/usuaris-taquilla');
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Usuaris de taquilla' })).toBeInTheDocument();
    expect(mockCrida).toHaveBeenCalledWith('llistarUsuarisTaquilla', {});
  });
});
