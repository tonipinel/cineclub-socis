import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: vi.fn((q, callback) => {
    callback({
      docs: [
        { id: '1', data: () => ({ titol: 'The Artist', data: '2026-03-05', activa: false }) },
        { id: '2', data: () => ({ titol: 'Delicatessen', data: '2026-04-02', activa: true }) },
      ],
    });
    return () => {};
  }),
}));

import { onSnapshot } from 'firebase/firestore';
import SessionsList from './SessionsList';

describe('SessionsList', () => {
  it('mostra les sessions i marca quina és l\'activa', () => {
    render(<MemoryRouter><SessionsList /></MemoryRouter>);
    expect(screen.getByText(/The Artist/)).toBeInTheDocument();
    expect(screen.getByText(/Delicatessen/)).toBeInTheDocument();
    expect(screen.getByText('Activa')).toBeInTheDocument();
  });

  it('l\'enllaç de cada sessió porta a la seva fitxa', () => {
    render(<MemoryRouter><SessionsList /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /The Artist/ })).toHaveAttribute('href', '/sessions/1');
  });

  it('mostra el resum de socis, aportacions i balanç de cada sessió', async () => {
    onSnapshot
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [{ id: '1', data: () => ({ titol: 'The Artist', data: '2026-03-05', activa: false }) }] });
        return () => {};
      })
      .mockImplementationOnce((q, callback) => {
        callback({
          docs: [
            { data: () => ({ sessionId: '1', tipus: 'soci', numeroSoci: 7 }) },
            { data: () => ({ sessionId: '1', tipus: 'generic', codiTiquet: 'L1-001', preuAplicat: 5 }) },
          ],
        });
        return () => {};
      })
      .mockImplementationOnce((q, callback) => {
        callback({
          docs: [
            { data: () => ({ sessionId: '1', tipus: 'ingres', total: 100 }) },
            { data: () => ({ sessionId: '1', tipus: 'despesa', total: 40 }) },
          ],
        });
        return () => {};
      });
    render(<MemoryRouter><SessionsList /></MemoryRouter>);
    expect(await screen.findByText('Socis: 1')).toBeInTheDocument();
    expect(screen.getByText('Aportacions: 1')).toBeInTheDocument();
    expect(screen.getByText('Balanç: 60.00€')).toBeInTheDocument();
  });
});
