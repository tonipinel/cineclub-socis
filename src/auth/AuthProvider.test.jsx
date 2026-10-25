import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../firebase/firebase', () => ({ auth: {} }));
const mockOnAuthStateChanged = vi.fn();
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args) => mockOnAuthStateChanged(...args),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}));

import { AuthProvider } from './AuthProvider';
import { RequireAuth } from './RequireAuth';
import { useAuth } from './useAuth';

function Estat() {
  const { user, role, loading } = useAuth();
  return <p>{loading ? 'carregant' : `usuari:${user?.uid ?? 'cap'} rol:${role ?? 'cap'}`}</p>;
}

function renderApp() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/escaneig']}>
        <Routes>
          <Route path="/accedir" element={<p>Pàgina d&apos;accedir</p>} />
          <Route path="/escaneig" element={<RequireAuth><Estat /></RequireAuth>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

const usuari = (getIdTokenResult) => ({ uid: 'u1', email: 'a@b.c', getIdTokenResult });

describe('AuthProvider: arrencada', () => {
  let observador;
  beforeEach(() => {
    mockOnAuthStateChanged.mockReset();
    mockOnAuthStateChanged.mockImplementation((_auth, cb) => { observador = cb; return () => {}; });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('amb sessió vàlida, carrega l\'usuari i el rol', async () => {
    renderApp();
    await act(async () => { await observador(usuari(async () => ({ claims: { role: 'taquilla' } }))); });
    expect(screen.getByText('usuari:u1 rol:taquilla')).toBeInTheDocument();
  });

  it('si el token no es pot comprovar (sense connexió), surt del «Carregant» amb un missatge i «Torna-ho a provar»', async () => {
    renderApp();
    await act(async () => { await observador(usuari(async () => { throw new Error('auth/network-request-failed'); })); });
    expect(screen.getByRole('alert')).toHaveTextContent("No s'ha pogut comprovar la sessió");
    expect(document.querySelector('.carregant')).not.toBeInTheDocument();
    expect(console.error).toHaveBeenCalled();

    // Torna-ho a provar: es torna a subscriure i, ara amb connexió, entra.
    await userEvent.click(screen.getByRole('button', { name: 'Torna-ho a provar' }));
    expect(mockOnAuthStateChanged).toHaveBeenCalledTimes(2);
    await act(async () => { await observador(usuari(async () => ({ claims: { role: 'admin' } }))); });
    expect(screen.getByText('usuari:u1 rol:admin')).toBeInTheDocument();
  });

  it('si l\'observador d\'auth informa d\'un error, també surt del «Carregant»', async () => {
    let onError;
    mockOnAuthStateChanged.mockImplementation((_auth, _cb, err) => { onError = err; return () => {}; });
    renderApp();
    act(() => onError(new Error('fallada')));
    expect(screen.getByRole('alert')).toHaveTextContent("No s'ha pogut comprovar la sessió");
  });

  it('sense usuari, porta a l\'accés com sempre', async () => {
    renderApp();
    await act(async () => { await observador(null); });
    expect(screen.getByText("Pàgina d'accedir")).toBeInTheDocument();
  });
});
