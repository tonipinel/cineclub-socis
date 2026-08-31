import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
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

import { getDocs, onSnapshot } from 'firebase/firestore';
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

  it('mostra el nombre d\'assistències dels últims 12 mesos per soci', async () => {
    const ara = new Date();
    onSnapshot.mockImplementationOnce((q, callback) => {
      callback({
        docs: [
          { id: '1', data: () => ({ numeroSoci: 1, nom: 'Anna', cognoms: 'Vidal', ultimPagament: '2020-01-01' }) },
          { id: '2', data: () => ({ numeroSoci: 2, nom: 'Marc', cognoms: 'Serra', ultimPagament: '2099-01-01' }) },
        ],
      });
      return () => {};
    });
    getDocs.mockResolvedValueOnce({
      docs: [
        { data: () => ({ tipus: 'soci', numeroSoci: 1, sessionId: 's1', timestamp: { toDate: () => ara } }) },
        { data: () => ({ tipus: 'soci', numeroSoci: 1, sessionId: 's2', timestamp: { toDate: () => ara } }) },
      ],
    });
    render(<MemoryRouter><SocisList /></MemoryRouter>);
    const files = screen.getAllByRole('row').slice(1);
    const filaAnna = files.find((f) => f.textContent.includes('Anna'));
    const filaMarc = files.find((f) => f.textContent.includes('Marc'));
    const cellesAnna = within(filaAnna).getAllByRole('cell');
    const cellesMarc = within(filaMarc).getAllByRole('cell');
    expect(await within(filaAnna).findByText('2')).toBe(cellesAnna[cellesAnna.length - 1]);
    expect(cellesMarc[cellesMarc.length - 1]).toHaveTextContent('0');
  });

  it('permet seleccionar socis i mostra un enllaç per imprimir-ne els carnets', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><SocisList /></MemoryRouter>);
    expect(screen.queryByRole('link', { name: /Imprimir carnets/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar Anna Vidal' }));
    const enllac = screen.getByRole('link', { name: 'Imprimir carnets (1)' });
    expect(enllac).toHaveAttribute('href', '/socis/carnets?ids=1');

    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar Marc Serra' }));
    expect(screen.getByRole('link', { name: 'Imprimir carnets (2)' })).toHaveAttribute(
      'href', '/socis/carnets?ids=1,2'
    );
  });

  it('la casella "seleccionar tots" selecciona i deselecciona tots els socis visibles', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><SocisList /></MemoryRouter>);
    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar tots els socis' }));
    expect(screen.getByRole('link', { name: 'Imprimir carnets (2)' })).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar tots els socis' }));
    expect(screen.queryByRole('link', { name: /Imprimir carnets/ })).not.toBeInTheDocument();
  });
});
