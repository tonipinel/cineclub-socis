import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./firebase/firebase', () => ({ auth: {}, db: {} }));
vi.mock('./auth/useAuth', () => ({
  useAuth: () => ({ user: null, role: null, loading: false, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock('./auth/useIdentitatPublica', () => ({
  useIdentitatPublica: () => ({ identitat: null, setIdentitat: vi.fn() }),
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  addDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  serverTimestamp: vi.fn(),
}));

import App from './App';

describe('App', () => {
  it('mostra el logo del cineclub', () => {
    render(<App />);
    expect(screen.getByRole('img', { name: 'Cineclub Roda de Berà' })).toBeInTheDocument();
  });
});
