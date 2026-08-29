import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: (q, callback) => {
    callback({
      docs: [
        { id: '1', data: () => ({ numeroSoci: 1, nom: 'Anna', cognoms: 'Vidal', ultimPagament: '2020-01-01' }) },
        { id: '2', data: () => ({ numeroSoci: 2, nom: 'Marc', cognoms: 'Serra', ultimPagament: '2099-01-01' }) },
      ],
    });
    return () => {};
  },
}));

import SocisList from './SocisList';

describe('SocisList', () => {
  it('mostra els socis carregats amb el seu estat', () => {
    render(<MemoryRouter><SocisList /></MemoryRouter>);
    expect(screen.getByText('Anna')).toBeInTheDocument();
    expect(screen.getByText('Vençut')).toBeInTheDocument();
    expect(screen.getByText('Marc')).toBeInTheDocument();
    expect(screen.getByText('Al dia')).toBeInTheDocument();
  });

  it('filtra per text de cerca', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><SocisList /></MemoryRouter>);
    await user.type(screen.getByPlaceholderText(/cerca per nom/i), 'Marc');
    expect(screen.queryByText('Anna')).not.toBeInTheDocument();
    expect(screen.getByText('Marc')).toBeInTheDocument();
  });
});
