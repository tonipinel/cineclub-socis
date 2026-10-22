import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_, nom) => nom),
  getDocs: vi.fn(),
}));

import { getDocs } from 'firebase/firestore';
import PropostesPendents from './PropostesPendents';

const PROPOSTES = [
  { id: 'p1', data: () => ({ titol: 'Amélie', estat: 'pendent', numeroSoci: 3 }) },
  { id: 'p2', data: () => ({ titol: 'El padrí', estat: 'aprovada', numeroSoci: 5 }) },
];

// Respon segons la col·lecció demanada.
function mockColleccions({ propostes = PROPOSTES, internes = [], distribuidores = [] } = {}) {
  getDocs.mockImplementation(async (nom) => ({
    docs: { propostes, propostesInternes: internes, distribuidores }[nom],
  }));
}

beforeEach(() => mockColleccions());

describe('PropostesPendents', () => {
  it('llista totes les propostes amb el seu estat i un enllaç per editar-les', async () => {
    render(<MemoryRouter><PropostesPendents /></MemoryRouter>);
    expect(await screen.findByText('Amélie')).toBeInTheDocument();
    expect(screen.getByText('El padrí')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Amélie' })).toHaveAttribute('href', '/propostes/pendents/p1');
  });

  it('mostra un enllaç per crear una proposta nova en nom d\'un soci', async () => {
    render(<MemoryRouter><PropostesPendents /></MemoryRouter>);
    await screen.findByText('Amélie');
    expect(screen.getByRole('link', { name: /nova proposta/i })).toHaveAttribute('href', '/propostes/pendents/nova');
  });

  it('no duplica l\'enllaç a distribuïdores (ja és al submenú de la capçalera)', async () => {
    render(<MemoryRouter><PropostesPendents /></MemoryRouter>);
    await screen.findByText('Amélie');
    expect(screen.queryByRole('link', { name: 'Distribuïdores' })).not.toBeInTheDocument();
  });

  it('mostra un missatge si no hi ha cap proposta', async () => {
    mockColleccions({ propostes: [] });
    render(<MemoryRouter><PropostesPendents /></MemoryRouter>);
    expect(await screen.findByText('Encara no hi ha cap proposta.')).toBeInTheDocument();
  });

  describe('distribuïdora i preu', () => {
    const DISTRIBUIDORES = [
      { id: 'd1', data: () => ({ nom: 'Surtsey Films', preu: 150 }) },
      { id: 'd2', data: () => ({ nom: 'Atalante' }) },
    ];

    it('mostra la distribuïdora i el preu propi de cada proposta', async () => {
      mockColleccions({
        internes: [{ id: 'p1', data: () => ({ preu: 350, distribuidoraId: 'd1' }) }],
        distribuidores: DISTRIBUIDORES,
      });
      render(<MemoryRouter><PropostesPendents /></MemoryRouter>);
      const fila = (await screen.findByRole('link', { name: 'Amélie' })).closest('tr');
      expect(within(fila).getByText('Surtsey Films')).toBeInTheDocument();
      expect(within(fila).getByText('350.00€')).toBeInTheDocument();
      expect(screen.queryByText(/Preu per defecte de la distribuïdora/)).not.toBeInTheDocument();
    });

    it('si la proposta no té preu propi, mostra el per defecte de la distribuïdora i ho marca amb un asterisc', async () => {
      mockColleccions({
        internes: [{ id: 'p1', data: () => ({ preu: null, distribuidoraId: 'd1' }) }],
        distribuidores: DISTRIBUIDORES,
      });
      render(<MemoryRouter><PropostesPendents /></MemoryRouter>);
      const fila = (await screen.findByRole('link', { name: 'Amélie' })).closest('tr');
      expect(within(fila).getByText('150.00€')).toBeInTheDocument();
      expect(within(fila).getByTitle('Preu per defecte de la distribuïdora')).toBeInTheDocument();
      expect(screen.getByText('* Preu per defecte de la distribuïdora.')).toBeInTheDocument();
    });

    it('una proposta sense dades internes mostra guions', async () => {
      render(<MemoryRouter><PropostesPendents /></MemoryRouter>);
      const fila = (await screen.findByRole('link', { name: 'El padrí' })).closest('tr');
      expect(within(fila).getAllByText('—')).toHaveLength(2);
    });

    it('un preu de 0 € és un preu propi i no cau al per defecte', async () => {
      mockColleccions({
        internes: [{ id: 'p1', data: () => ({ preu: 0, distribuidoraId: 'd1' }) }],
        distribuidores: DISTRIBUIDORES,
      });
      render(<MemoryRouter><PropostesPendents /></MemoryRouter>);
      const fila = (await screen.findByRole('link', { name: 'Amélie' })).closest('tr');
      expect(within(fila).getByText('0.00€')).toBeInTheDocument();
    });

    it('si no es poden llegir les dades internes, el llistat es mostra igualment', async () => {
      getDocs.mockImplementation(async (nom) => {
        if (nom === 'propostes') return { docs: PROPOSTES };
        throw new Error('permission-denied');
      });
      render(<MemoryRouter><PropostesPendents /></MemoryRouter>);
      expect(await screen.findByRole('link', { name: 'Amélie' })).toBeInTheDocument();
    });
  });
});

describe('sense vista pública', () => {
  it('no té pestanyes i mostra directament la gestió sota la capçalera', async () => {
    render(<MemoryRouter><PropostesPendents /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: 'Amélie' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByText(/vista pública/i)).not.toBeInTheDocument();
  });
});
