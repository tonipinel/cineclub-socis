import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  onSnapshot: (q, callback) => {
    callback({
      docs: [
        {
          id: '1',
          data: () => ({
            data: '2026-03-01', concepte: 'Quotes de març', tipus: 'ingres',
            categoria: 'Quotes socis', metodePagament: 'efectiu', total: 100, sessionId: 's1',
          }),
        },
        {
          id: '2',
          data: () => ({
            data: '2026-04-01', concepte: 'Lloguer de sala', tipus: 'despesa',
            categoria: 'Gestió associació', metodePagament: 'banc', total: 40,
          }),
        },
        {
          id: '3',
          data: () => ({
            data: '2026-05-01', concepte: 'Traspàs a banc', tipus: 'traspas', total: 30,
          }),
        },
      ],
    });
    return () => {};
  },
}));

import { getDocs } from 'firebase/firestore';
import ComptabilitatPage from './ComptabilitatPage';

describe('ComptabilitatPage', () => {
  it('calcula i mostra els saldos', () => {
    render(<MemoryRouter><ComptabilitatPage /></MemoryRouter>);
    expect(screen.getByText('Caixa: 100.00€')).toBeInTheDocument();
    expect(screen.getByText('Banc: -40.00€')).toBeInTheDocument();
    expect(screen.getByText('Excedent: 60.00€')).toBeInTheDocument();
  });

  it('llista els moviments', () => {
    render(<MemoryRouter><ComptabilitatPage /></MemoryRouter>);
    expect(screen.getByText('Quotes de març')).toBeInTheDocument();
    expect(screen.getByText('Lloguer de sala')).toBeInTheDocument();
  });

  it('filtra per tipus', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ComptabilitatPage /></MemoryRouter>);
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'despesa');
    expect(screen.queryByText('Quotes de març')).not.toBeInTheDocument();
    expect(screen.getByText('Lloguer de sala')).toBeInTheDocument();
  });

  it('en clicar una fila, navega a la seva edició', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/comptabilitat']}>
        <Routes>
          <Route path="/comptabilitat" element={<ComptabilitatPage />} />
          <Route path="/comptabilitat/:id" element={<p>Editar moviment</p>} />
        </Routes>
      </MemoryRouter>
    );
    await user.click(screen.getByText('Quotes de març'));
    expect(await screen.findByText('Editar moviment')).toBeInTheDocument();
  });

  it('mostra un enllaç per afegir un moviment nou', () => {
    render(<MemoryRouter><ComptabilitatPage /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Afegir moviment' })).toBeInTheDocument();
  });

  it('no mostra cap badge de mètode buit a les files de traspàs', () => {
    render(<MemoryRouter><ComptabilitatPage /></MemoryRouter>);
    const fila = screen.getByText('Traspàs a banc').closest('tr');
    expect(within(fila).queryAllByRole('cell')[4].querySelector('.badge--metode')).not.toBeInTheDocument();
  });

  it('filtra per sessió', async () => {
    getDocs.mockResolvedValueOnce({ docs: [{ id: 's1', data: () => ({ titol: 'The Artist' }) }] });
    const user = userEvent.setup();
    render(<MemoryRouter><ComptabilitatPage /></MemoryRouter>);
    await screen.findByRole('option', { name: 'The Artist' });
    await user.selectOptions(screen.getAllByRole('combobox')[2], 's1');
    expect(screen.getByText('Quotes de març')).toBeInTheDocument();
    expect(screen.queryByText('Lloguer de sala')).not.toBeInTheDocument();
  });
});
