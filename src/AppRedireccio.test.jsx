import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./constants/routes', async (original) => ({ ...(await original()), REDIRIGIR_PROPOSTES: true }));
vi.mock('./firebase/firebase', () => ({ auth: {}, db: {} }));
vi.mock('./auth/useAuth', () => ({
  useAuth: () => ({ user: null, role: null, loading: false, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock('./auth/useIdentitatPublica', () => ({
  useIdentitatPublica: () => ({ identitat: null, setIdentitat: vi.fn() }),
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), doc: vi.fn(), query: vi.fn(), where: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  addDoc: vi.fn(), setDoc: vi.fn(), deleteDoc: vi.fn(), serverTimestamp: vi.fn(),
}));

import App from './App';

const replace = vi.fn();

function visita(ruta) {
  window.history.pushState({}, '', ruta);
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, hash: ruta.includes('#') ? ruta.slice(ruta.indexOf('#')) : '', pathname: ruta.split('#')[0], replace },
  });
}

beforeEach(() => replace.mockClear());

describe('App amb REDIRIGIR_PROPOSTES a true', () => {
  it('redirigeix / conservant el hash i mostra l\'enllaç', () => {
    visita('/#abc123');
    render(<App />);
    expect(replace).toHaveBeenCalledWith('https://cineclubrodadebera.cat/propostes/#abc123');
    expect(screen.getByRole('link', { name: /han canviat d'adreça/ })).toBeInTheDocument();
  });
});
