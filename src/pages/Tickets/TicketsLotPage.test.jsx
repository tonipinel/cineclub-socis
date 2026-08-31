import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,ABC') },
}));
vi.mock('../../firebase/firebase', () => ({ db: {} }));

const LOT = {
  numeroInicial: 1, quantitat: 3, preu: 5, dataGeneracio: '2026-08-31',
  impres: false, dataImpressio: null, anulat: false, codisAnulats: [],
};

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  doc: vi.fn(),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  arrayUnion: vi.fn((v) => ({ __op: 'arrayUnion', v })),
  arrayRemove: vi.fn((v) => ({ __op: 'arrayRemove', v })),
  onSnapshot: vi.fn(() => () => {}),
}));

import { onSnapshot, updateDoc } from 'firebase/firestore';
import TicketsLotPage from './TicketsLotPage';

function mockLotIAccessLog(lot, entradesGeneriques = []) {
  onSnapshot
    .mockImplementationOnce((q, callback) => {
      callback({ exists: () => true, data: () => lot });
      return () => {};
    })
    .mockImplementationOnce((q, callback) => {
      callback({ docs: entradesGeneriques.map((e) => ({ data: () => e })) });
      return () => {};
    });
}

function renderLot() {
  return render(
    <MemoryRouter initialEntries={['/tickets/lot-1']}>
      <Routes>
        <Route path="/tickets/:id" element={<TicketsLotPage />} />
        <Route path="/tickets" element={<p>Llistat de lots</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('TicketsLotPage', () => {
  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    window.confirm.mockClear();
    updateDoc.mockClear();
  });

  it('mostra el rang del lot i quants tiquets hi ha disponibles', async () => {
    mockLotIAccessLog(LOT, [{ tipus: 'generic', codiTiquet: 'T-000002' }]);
    renderLot();
    expect(await screen.findByText(/T-000001.*T-000003/)).toBeInTheDocument();
    expect(screen.getByText('2 de 3 disponibles')).toBeInTheDocument();
  });

  it('demana confirmació i marca el lot com imprès', async () => {
    mockLotIAccessLog(LOT);
    const user = userEvent.setup();
    renderLot();
    await user.click(await screen.findByRole('button', { name: 'Marcar com imprès' }));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(updateDoc.mock.calls[0][1]).toMatchObject({ impres: true });
  });

  it('demana confirmació i anul·la tot el lot', async () => {
    mockLotIAccessLog(LOT);
    const user = userEvent.setup();
    renderLot();
    await user.click(await screen.findByRole('button', { name: 'Anul·lar tot el lot' }));
    expect(updateDoc.mock.calls[0][1]).toMatchObject({ anulat: true });
  });

  it('permet anul·lar un tiquet individual no usat', async () => {
    mockLotIAccessLog(LOT);
    const user = userEvent.setup();
    renderLot();
    const botons = await screen.findAllByRole('button', { name: 'Anul·lar' });
    await user.click(botons[0]);
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(updateDoc.mock.calls[0][1].codisAnulats).toEqual({ __op: 'arrayUnion', v: 'T-000001' });
  });

  it('no mostra el botó d\'anul·lar per a un tiquet ja usat', async () => {
    mockLotIAccessLog(LOT, [{ tipus: 'generic', codiTiquet: 'T-000001' }]);
    renderLot();
    await screen.findByText('2 de 3 disponibles');
    expect(screen.getByText('Usat')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Anul·lar' })).toHaveLength(2);
  });

  it('mostra "0 disponibles" i cap botó d\'anul·lar quan tot el lot ja està anul·lat', async () => {
    mockLotIAccessLog({ ...LOT, anulat: true, dataAnulacio: '2026-09-01' });
    renderLot();
    expect(await screen.findByText('0 de 3 disponibles')).toBeInTheDocument();
    expect(screen.getByText('Anul·lat el 2026-09-01')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Anul·lar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Anul·lar tot el lot' })).not.toBeInTheDocument();
  });

  it('navega al llistat si el lot no existeix', async () => {
    onSnapshot.mockImplementationOnce((q, callback) => {
      callback({ exists: () => false });
      return () => {};
    });
    renderLot();
    expect(await screen.findByText('Llistat de lots')).toBeInTheDocument();
  });
});
