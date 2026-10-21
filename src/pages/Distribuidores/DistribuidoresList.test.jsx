import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
}));

import { getDocs } from 'firebase/firestore';
import DistribuidoresList from './DistribuidoresList';

const DISTRIBUIDORES = [
  {
    id: 'd2', nom: 'Surtsey Films', web: 'surtseyfilms.com', contacte: 'Marta', correu: 'marta@surtsey.test', preu: 150,
  },
  { id: 'd1', nom: 'Atalante', web: '', contacte: '', correu: '' },
];

describe('DistribuidoresList', () => {
  it('llista les distribuïdores per ordre alfabètic amb el web i el contacte', async () => {
    getDocs.mockResolvedValueOnce({ docs: DISTRIBUIDORES.map((d) => ({ id: d.id, data: () => d })) });
    render(<MemoryRouter><DistribuidoresList /></MemoryRouter>);
    const enllacos = await screen.findAllByRole('link', { name: /Atalante|Surtsey Films/ });
    expect(enllacos.map((a) => a.textContent)).toEqual(['Atalante', 'Surtsey Films']);
    expect(enllacos[1]).toHaveAttribute('href', '/distribuidores/d2');
    expect(screen.getByRole('link', { name: 'surtseyfilms.com' })).toHaveAttribute('href', 'https://surtseyfilms.com');
    expect(screen.getByRole('link', { name: 'marta@surtsey.test' })).toHaveAttribute('href', 'mailto:marta@surtsey.test');
    expect(screen.getByText('Preu per defecte: 150.00€')).toBeInTheDocument();
  });

  it('té un botó per afegir-ne una de nova', async () => {
    getDocs.mockResolvedValueOnce({ docs: [] });
    render(<MemoryRouter><DistribuidoresList /></MemoryRouter>);
    expect(await screen.findByText('Encara no hi ha cap distribuïdora.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nova distribuïdora' })).toHaveAttribute('href', '/distribuidores/nova');
  });
});
