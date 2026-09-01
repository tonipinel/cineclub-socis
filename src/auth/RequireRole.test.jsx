import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireRole } from './RequireRole';

const mockUseAuth = vi.fn();
vi.mock('./useAuth', () => ({ useAuth: () => mockUseAuth() }));

function renderAmb() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/accedir" element={<p>Accedir</p>} />
        <Route path="/admin" element={<RequireRole roles={['admin']}><p>Zona admin</p></RequireRole>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('RequireRole', () => {
  it('redirigeix a accedir quan el rol no és a la llista', () => {
    mockUseAuth.mockReturnValue({ role: 'taquilla', loading: false });
    renderAmb();
    expect(screen.getByText('Accedir')).toBeInTheDocument();
  });

  it('mostra el contingut quan el rol és a la llista', () => {
    mockUseAuth.mockReturnValue({ role: 'admin', loading: false });
    renderAmb();
    expect(screen.getByText('Zona admin')).toBeInTheDocument();
  });
});
