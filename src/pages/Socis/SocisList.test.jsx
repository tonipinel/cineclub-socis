import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: vi.fn((q, callback) => {
    callback({
      docs: [
        { id: '1', data: () => ({ numeroSoci: 1, nom: 'Anna', cognoms: 'Vidal', ultimPagament: '2020-01-01' }) },
        { id: '2', data: () => ({ numeroSoci: 2, nom: 'Marc', cognoms: 'Serra', ultimPagament: '2099-01-01' }) },
      ],
    });
    return () => {};
  }),
}));

import { onSnapshot } from 'firebase/firestore';
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

  it('per defecte ordena per número de soci descendent', () => {
    render(<MemoryRouter><SocisList /></MemoryRouter>);
    const files = screen.getAllByRole('row').slice(1);
    expect(files[0]).toHaveTextContent('Marc');
    expect(files[1]).toHaveTextContent('Anna');
  });

  it('en clicar una capçalera, ordena per aquella columna', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><SocisList /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: /^Nom/ }));
    const files = screen.getAllByRole('row').slice(1);
    expect(files[0]).toHaveTextContent('Anna');
    expect(files[1]).toHaveTextContent('Marc');
  });

  it('el nom i els cognoms enllacen a la fitxa del soci', () => {
    render(<MemoryRouter><SocisList /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Anna' })).toHaveAttribute('href', '/socis/1');
    expect(screen.getByRole('link', { name: 'Vidal' })).toHaveAttribute('href', '/socis/1');
  });

  it('mostra el nombre d\'assistències dels últims 12 mesos per soci', () => {
    const ara = new Date();
    onSnapshot
      .mockImplementationOnce((q, callback) => {
        callback({
          docs: [
            { id: '1', data: () => ({ numeroSoci: 1, nom: 'Anna', cognoms: 'Vidal', ultimPagament: '2020-01-01' }) },
            { id: '2', data: () => ({ numeroSoci: 2, nom: 'Marc', cognoms: 'Serra', ultimPagament: '2099-01-01' }) },
          ],
        });
        return () => {};
      })
      .mockImplementationOnce((q, callback) => {
        callback({
          docs: [
            { data: () => ({ tipus: 'soci', numeroSoci: 1, timestamp: { toDate: () => ara } }) },
            { data: () => ({ tipus: 'soci', numeroSoci: 1, timestamp: { toDate: () => ara } }) },
          ],
        });
        return () => {};
      });
    render(<MemoryRouter><SocisList /></MemoryRouter>);
    const files = screen.getAllByRole('row').slice(1);
    expect(files.find((f) => f.textContent.includes('Anna'))).toHaveTextContent('2');
    expect(files.find((f) => f.textContent.includes('Marc'))).toHaveTextContent('0');
  });
});
