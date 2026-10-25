import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./firebase/firebase', () => ({ auth: {}, db: {}, functions: {} }));
vi.mock('./auth/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'a' }, role: 'admin', loading: false, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), doc: vi.fn(), query: vi.fn(), where: vi.fn(), onSnapshot: vi.fn(() => () => {}),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
}));
vi.mock('./pages/Dashboard/DashboardPage', () => ({
  default: () => { throw new Error('error de render al dashboard'); },
}));
vi.mock('./pages/Socis/SocisList', () => ({ default: () => <h1>Llista de socis</h1> }));

import App from './App';

describe('App: error de render d\'una pantalla', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it('mostra el missatge amable, manté la capçalera i en canviar de ruta torna a funcionar', async () => {
    window.history.pushState({}, '', '/dashboard');
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Alguna cosa ha anat malament' })).toBeInTheDocument();
    expect(document.querySelector('.site-header')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('link', { name: 'Socis' })[0]);
    expect(await screen.findByRole('heading', { level: 1, name: 'Llista de socis' })).toBeInTheDocument();
  });
});
