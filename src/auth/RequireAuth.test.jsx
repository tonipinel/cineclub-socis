import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireAuth } from './RequireAuth';

const mockUseAuth = vi.fn();
vi.mock('./useAuth', () => ({ useAuth: () => mockUseAuth() }));

function renderAmb(initialEntries) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/accedir" element={<p>Pàgina d'accedir</p>} />
        <Route path="/privat" element={<RequireAuth><p>Contingut privat</p></RequireAuth>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('RequireAuth', () => {
  it('redirigeix a /accedir quan no hi ha usuari', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    renderAmb(['/privat']);
    expect(screen.getByText("Pàgina d'accedir")).toBeInTheDocument();
  });

  it('mostra el contingut quan hi ha usuari', () => {
    mockUseAuth.mockReturnValue({ user: { uid: '1' }, loading: false });
    renderAmb(['/privat']);
    expect(screen.getByText('Contingut privat')).toBeInTheDocument();
  });
});
