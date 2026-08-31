import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));

const transactionMock = { get: vi.fn(), set: vi.fn() };
const comptadorRefMock = { id: 'comptador-ref' };
const lotRefMock = { id: 'lot-nou' };
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  doc: vi.fn((...args) => (args.length > 1 ? comptadorRefMock : lotRefMock)),
  runTransaction: vi.fn(async (db, callback) => callback(transactionMock)),
  onSnapshot: vi.fn((q, callback) => {
    callback({
      docs: [
        {
          id: 'lot-1',
          data: () => ({
            numeroInicial: 1, quantitat: 150, preu: 5, dataGeneracio: '2026-08-31',
            impres: false, dataImpressio: null, anulat: false, codisAnulats: [],
          }),
        },
      ],
    });
    return () => {};
  }),
}));

import { runTransaction } from 'firebase/firestore';
import TicketsPage from './TicketsPage';

describe('TicketsPage', () => {
  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    window.confirm.mockClear();
    transactionMock.get.mockReset();
    transactionMock.set.mockReset();
    runTransaction.mockClear();
  });

  it('llista els lots existents amb el seu estat', () => {
    render(<MemoryRouter><TicketsPage /></MemoryRouter>);
    expect(screen.getByText(/T-000001.*T-000150/)).toBeInTheDocument();
    expect(screen.getByText("Pendent d'imprimir")).toBeInTheDocument();
  });

  it('demana confirmació abans de generar un lot nou', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><TicketsPage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Generar tiquets nous' }));
    expect(window.confirm).toHaveBeenCalledTimes(1);
  });

  it('no genera res si es cancel·la la confirmació', async () => {
    window.confirm.mockReturnValue(false);
    const user = userEvent.setup();
    render(<MemoryRouter><TicketsPage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Generar tiquets nous' }));
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('en generar un lot nou, reserva el número següent, crea el lot i navega a la seva fitxa', async () => {
    transactionMock.get.mockResolvedValue({ exists: () => true, data: () => ({ seguentNumero: 151 }) });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/tickets']}>
        <Routes>
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/tickets/:id" element={<p>Fitxa del lot</p>} />
        </Routes>
      </MemoryRouter>
    );
    await user.clear(screen.getByLabelText('Quantitat'));
    await user.type(screen.getByLabelText('Quantitat'), '150');
    await user.click(screen.getByRole('button', { name: 'Generar tiquets nous' }));
    expect(transactionMock.set).toHaveBeenCalledWith(comptadorRefMock, { seguentNumero: 301 }, { merge: true });
    expect(transactionMock.set).toHaveBeenCalledWith(
      lotRefMock,
      expect.objectContaining({ numeroInicial: 151, quantitat: 150, preu: 5 })
    );
    expect(await screen.findByText('Fitxa del lot')).toBeInTheDocument();
  });

  it('utilitza 1 com a número inicial si el comptador no té seguentNumero', async () => {
    transactionMock.get.mockResolvedValue({ exists: () => true, data: () => ({}) });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/tickets']}>
        <Routes>
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/tickets/:id" element={<p>Fitxa del lot</p>} />
        </Routes>
      </MemoryRouter>
    );
    await user.clear(screen.getByLabelText('Quantitat'));
    await user.type(screen.getByLabelText('Quantitat'), '10');
    await user.click(screen.getByRole('button', { name: 'Generar tiquets nous' }));
    expect(transactionMock.set).toHaveBeenCalledWith(comptadorRefMock, { seguentNumero: 11 }, { merge: true });
    expect(transactionMock.set).toHaveBeenCalledWith(
      lotRefMock,
      expect.objectContaining({ numeroInicial: 1, quantitat: 10 })
    );
  });

  it.each([
    ['0', '0'],
    ['negativa', '-5'],
    ['no entera', '3.5'],
    ['per sobre del límit', '501'],
  ])('rebutja una quantitat %s sense cridar la transacció', async (_descripcio, valor) => {
    const user = userEvent.setup();
    render(<MemoryRouter><TicketsPage /></MemoryRouter>);
    await user.clear(screen.getByLabelText('Quantitat'));
    await user.type(screen.getByLabelText('Quantitat'), valor);
    await user.click(screen.getByRole('button', { name: 'Generar tiquets nous' }));
    expect(runTransaction).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(screen.getByText(/número enter entre 1 i 500/)).toBeInTheDocument();
  });
});
