import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: (q, callback) => {
    callback({
      docs: [
        { id: '1', data: () => ({ titol: 'The Artist', data: '2026-03-05', activa: false }) },
        { id: '2', data: () => ({ titol: 'Delicatessen', data: '2026-04-02', activa: true }) },
      ],
    });
    return () => {};
  },
}));

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
});
