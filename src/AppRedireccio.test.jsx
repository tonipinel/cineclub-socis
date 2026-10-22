import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./firebase/firebase', () => ({ auth: {}, db: {} }));
vi.mock('./auth/useAuth', () => ({
  useAuth: () => ({ user: null, role: null, loading: false, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), doc: vi.fn(), query: vi.fn(), where: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  addDoc: vi.fn(), setDoc: vi.fn(), deleteDoc: vi.fn(), serverTimestamp: vi.fn(),
}));

import App from './App';

const replace = vi.fn();
const locationOriginal = window.location;

// jsdom no implementa location.replace: només es substitueix quan s'espera una redirecció.
function visita(ruta, redirigeix = true) {
  window.history.pushState({}, '', ruta);
  if (!redirigeix) return;
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, hash: ruta.includes('#') ? ruta.slice(ruta.indexOf('#')) : '', pathname: ruta.split('#')[0], replace },
  });
}

beforeEach(() => replace.mockClear());
afterEach(() => Object.defineProperty(window, 'location', { configurable: true, value: locationOriginal }));

describe('App: enllaços antics de la part pública', () => {
  it.each([
    ['/#abc123', 'https://cineclubrodadebera.cat/propostes/#abc123'],
    ['/#top', 'https://cineclubrodadebera.cat/propostes/#recents'],
    ['/propostes', 'https://cineclubrodadebera.cat/propostes/'],
    ['/propostes#recents', 'https://cineclubrodadebera.cat/propostes/#recents'],
    ['/propostes/proposar', 'https://cineclubrodadebera.cat/propostes/proposar/'],
  ])('%s redirigeix a %s', (ruta, desti) => {
    visita(ruta);
    render(<App />);
    expect(replace).toHaveBeenCalledWith(desti);
    expect(screen.getByRole('link', { name: /han canviat d'adreça/ })).toHaveAttribute('href', desti);
  });

  it('/ sense hash porta a /accedir sense redirigir', () => {
    visita('/', false);
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Accedir' })).toBeInTheDocument();
  });

  it('/propostes/pendents no es redirigeix (porta al login sense sessió)', () => {
    visita('/propostes/pendents', false);
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Accedir' })).toBeInTheDocument();
  });
});
