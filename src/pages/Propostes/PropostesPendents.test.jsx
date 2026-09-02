import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({
    docs: [
      { id: 'p1', data: () => ({ titol: 'Amélie', estat: 'pendent', numeroSoci: 3 }) },
      { id: 'p2', data: () => ({ titol: 'El padrí', estat: 'aprovada', numeroSoci: 5 }) },
    ],
  }),
}));

import PropostesPendents from './PropostesPendents';

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

  it('mostra un missatge si no hi ha cap proposta', async () => {
    const { getDocs } = await import('firebase/firestore');
    getDocs.mockResolvedValueOnce({ docs: [] });
    render(<MemoryRouter><PropostesPendents /></MemoryRouter>);
    expect(await screen.findByText('Encara no hi ha cap proposta.')).toBeInTheDocument();
  });
});
