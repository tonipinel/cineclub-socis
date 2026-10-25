import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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

import { onSnapshot, runTransaction } from 'firebase/firestore';
import TicketsPage from './TicketsPage';
import {
  acceptaDialeg, cancellaDialeg, dialegConfirmacio, hiHaDialegConfirmacio, renderAmbConfirmacio, tancaDialegAmbEsc,
} from '../../test/confirmacio';

describe('TicketsPage', () => {
  beforeEach(() => {
    transactionMock.get.mockReset();
    transactionMock.set.mockReset();
    runTransaction.mockClear();
  });

  it('usa el layout de llista amb un únic h1 i el formulari de generar a la capçalera', () => {
    const { container } = renderAmbConfirmacio(<MemoryRouter><TicketsPage /></MemoryRouter>);
    expect(container.firstChild).toHaveClass('pagina-admin', 'pagina-admin--llista');
    const titols = screen.getAllByRole('heading', { level: 1 });
    expect(titols).toHaveLength(1);
    expect(titols[0]).toHaveTextContent('Tiquets genèrics');
    expect(screen.getByLabelText('Quantitat').closest('.pagina-admin__accions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generar tiquets nous' }).closest('.pagina-admin__accions')).toBeInTheDocument();
  });

  it('llista els lots existents amb el seu estat', () => {
    renderAmbConfirmacio(<MemoryRouter><TicketsPage /></MemoryRouter>);
    expect(screen.getByText(/T-000001.*T-000150/)).toBeInTheDocument();
    expect(screen.getByText("Pendent d'imprimir")).toBeInTheDocument();
  });

  it('demana confirmació abans de generar un lot nou', async () => {
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><TicketsPage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Generar tiquets nous' }));
    const dialeg = await dialegConfirmacio();
    expect(dialeg).toHaveTextContent(/^Es reservaran \d+ números de tiquet nous\. Un cop generats no es tornaran a repetir\. Vols continuar\?/);
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it.each([
    ['Cancel·lar', (user) => cancellaDialeg(user)],
    ['ESC', (user) => tancaDialegAmbEsc(user)],
  ])('no genera res si es tanca la confirmació amb %s', async (_nom, tanca) => {
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><TicketsPage /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Generar tiquets nous' }));
    await tanca(user);
    await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
    expect(runTransaction).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Generar tiquets nous' })).toBeEnabled();
  });

  it('en generar un lot nou, reserva el número següent, crea el lot i navega a la seva fitxa', async () => {
    transactionMock.get.mockResolvedValue({ exists: () => true, data: () => ({ seguentNumero: 151 }) });
    const user = userEvent.setup();
    renderAmbConfirmacio(
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
    await acceptaDialeg('Genera');
    await waitFor(() => expect(runTransaction).toHaveBeenCalledTimes(1));
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
    renderAmbConfirmacio(
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
    await acceptaDialeg('Genera');
    await waitFor(() => expect(runTransaction).toHaveBeenCalledTimes(1));
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
    renderAmbConfirmacio(<MemoryRouter><TicketsPage /></MemoryRouter>);
    await user.clear(screen.getByLabelText('Quantitat'));
    await user.type(screen.getByLabelText('Quantitat'), valor);
    await user.click(screen.getByRole('button', { name: 'Generar tiquets nous' }));
    expect(runTransaction).not.toHaveBeenCalled();
    expect(hiHaDialegConfirmacio()).toBe(false);
    expect(screen.getByText(/número enter entre 1 i 500/)).toBeInTheDocument();
  });
});

describe('TicketsPage: error de càrrega', () => {
  it('si l\'oient de lots falla, ho diu (no una llista buida) i «Torna-ho a provar» es torna a subscriure', async () => {
    const errorConsola = vi.spyOn(console, 'error').mockImplementation(() => {});
    onSnapshot.mockImplementationOnce((q, _cb, onError) => { onError(new Error('permission-denied')); return () => {}; });
    renderAmbConfirmacio(<MemoryRouter><TicketsPage /></MemoryRouter>);
    expect(screen.getByRole('alert')).toHaveTextContent("No s'han pogut carregar els lots de tiquets.");
    expect(screen.getByRole('button', { name: 'Generar tiquets nous' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Torna-ho a provar' }));
    expect(screen.getByText(/T-000001/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    errorConsola.mockRestore();
  });
});
