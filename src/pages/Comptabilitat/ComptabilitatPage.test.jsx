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
  it('calcula i mostra els saldos com a fórmula efectiu + bancària = tresoreria', () => {
    render(<MemoryRouter><ComptabilitatPage /></MemoryRouter>);
    expect(screen.getByText('Disponibilitat en efectiu')).toBeInTheDocument();
    expect(screen.getByText('100.00€')).toBeInTheDocument();
    expect(screen.getByText('Disponibilitat bancària')).toBeInTheDocument();
    expect(screen.getByText('-40.00€')).toBeInTheDocument();
    expect(screen.getByText('Fons total de tresoreria')).toBeInTheDocument();
    expect(screen.getByText('60.00€')).toBeInTheDocument();
  });

  it('llista els moviments', () => {
    render(<MemoryRouter><ComptabilitatPage /></MemoryRouter>);
    expect(screen.getByText('Quotes de març')).toBeInTheDocument();
    expect(screen.getByText('Lloguer de sala')).toBeInTheDocument();
  });

  it('el concepte és un enllaç real (obrible en pestanya nova), no només un clic de fila', () => {
    render(<MemoryRouter><ComptabilitatPage /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Quotes de març' })).toHaveAttribute('href', '/comptabilitat/1');
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
    expect(within(fila).queryAllByRole('cell')[1].querySelector('.badge')).not.toBeInTheDocument();
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

  it('filtra per rang de dates (des de / fins)', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ComptabilitatPage /></MemoryRouter>);
    await user.type(screen.getByLabelText('Data des de'), '2026-04-01');
    expect(screen.queryByText('Quotes de març')).not.toBeInTheDocument();
    expect(screen.getByText('Lloguer de sala')).toBeInTheDocument();
    expect(screen.getByText('Traspàs a banc')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Data fins'), '2026-04-01');
    expect(screen.getByText('Lloguer de sala')).toBeInTheDocument();
    expect(screen.queryByText('Traspàs a banc')).not.toBeInTheDocument();
  });

  it('el botó de filtres mostra i amaga el bloc de filtres', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ComptabilitatPage /></MemoryRouter>);
    const botoFiltres = screen.getByRole('button', { name: 'Mostrar filtres' });
    expect(botoFiltres).toHaveAttribute('aria-expanded', 'false');
    await user.click(botoFiltres);
    expect(screen.getByRole('button', { name: 'Amagar filtres' })).toBe(botoFiltres);
    expect(botoFiltres).toHaveAttribute('aria-expanded', 'true');
  });
});
