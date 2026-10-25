import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockUseAuth = vi.fn();
vi.mock('../../auth/useAuth', () => ({ useAuth: () => mockUseAuth() }));

import AjudaPage from './AjudaPage';

function renderAmbRol(role) {
  mockUseAuth.mockReturnValue({ user: { uid: '1' }, role });
  return render(<MemoryRouter initialEntries={['/ajuda']}><AjudaPage /></MemoryRouter>);
}

const titolsSeccions = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);

describe('AjudaPage', () => {
  it('admin: mostra les pantalles, les tasques i la guia d\'escaneig', () => {
    renderAmbRol('admin');
    expect(screen.getByRole('heading', { level: 1, name: 'Ajuda' })).toBeInTheDocument();
    expect(titolsSeccions()).toEqual(['Índex', 'Què fa cada pantalla', 'Tasques habituals pas a pas', "Guia d'escaneig a la porta"]);
    expect(screen.getByRole('heading', { level: 3, name: 'Marcar la sessió activa' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Mode prova' })).toBeInTheDocument();
  });

  it('taquilla: només veu la guia d\'escaneig', () => {
    renderAmbRol('taquilla');
    expect(titolsSeccions()).toEqual(['Índex', "Guia d'escaneig a la porta"]);
    expect(screen.queryByText('Què fa cada pantalla')).not.toBeInTheDocument();
    expect(screen.queryByText("Donar d'alta un soci")).not.toBeInTheDocument();
    expect(screen.queryByText('Registrar un pagament de quota')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: "El registre d'incidències (LOG)" })).toBeInTheDocument();
  });

  it.each(['admin', 'taquilla'])('%s: cada enllaç de l\'índex porta a una àncora que existeix', (role) => {
    const { container } = renderAmbRol(role);
    const enllacos = within(screen.getByRole('navigation', { name: 'Índex' })).getAllByRole('link');
    expect(enllacos.length).toBeGreaterThan(5);
    enllacos.forEach((a) => {
      const href = a.getAttribute('href');
      expect(href).toMatch(/^#/);
      const desti = container.querySelector(href);
      expect(desti, href).not.toBeNull();
      expect(['H2', 'H3']).toContain(desti.tagName);
    });
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
