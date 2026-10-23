import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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
import {
  acceptaDialeg, cancellaDialeg, dialegConfirmacio, hiHaDialegConfirmacio, renderAmbConfirmacio, tancaDialegAmbEsc,
} from '../../test/confirmacio';

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
  return renderAmbConfirmacio(
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
    updateDoc.mockClear();
  });

  it('usa el layout de fitxa amb un únic h1 i l\'enllaç estàndard per tornar als tiquets', async () => {
    mockLotIAccessLog(LOT);
    const { container } = renderLot();
    await screen.findByText(/T-000001.*T-000003/);
    expect(container.firstChild).toHaveClass('pagina-admin', 'pagina-admin--fitxa');
    const titols = screen.getAllByRole('heading', { level: 1 });
    expect(titols).toHaveLength(1);
    expect(titols[0]).toHaveTextContent('Tiquets T-000001 – T-000003');
    const tornar = screen.getByRole('link', { name: '← Tiquets' });
    expect(tornar).toHaveAttribute('href', '/tickets');
    expect(tornar).toHaveClass('pagina-admin__tornar');
    expect(screen.getByRole('button', { name: 'Imprimir' }).closest('.pagina-admin__accions')).toBeInTheDocument();
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
    const dialeg = await dialegConfirmacio();
    expect(dialeg).toHaveTextContent('Confirmes que has imprès aquest lot de tiquets?');
    expect(dialeg).not.toHaveAttribute('role', 'alertdialog');
    expect(updateDoc).not.toHaveBeenCalled();
    await acceptaDialeg('Marca com imprès');
    await waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
    expect(updateDoc.mock.calls[0][1]).toMatchObject({ impres: true });
  });

  it('no marca el lot com imprès si es cancel·la la confirmació', async () => {
    mockLotIAccessLog(LOT);
    const user = userEvent.setup();
    renderLot();
    await user.click(await screen.findByRole('button', { name: 'Marcar com imprès' }));
    await cancellaDialeg(user);
    await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('demana confirmació i anul·la tot el lot', async () => {
    mockLotIAccessLog(LOT);
    const user = userEvent.setup();
    renderLot();
    await user.click(await screen.findByRole('button', { name: 'Anul·lar tot el lot' }));
    const dialeg = await dialegConfirmacio();
    expect(dialeg).toHaveAttribute('role', 'alertdialog');
    expect(dialeg).toHaveTextContent('Segur que vols anul·lar tot el lot? Els tiquets encara no utilitzats deixaran de funcionar. Aquesta acció no es pot desfer.');
    expect(updateDoc).not.toHaveBeenCalled();
    await acceptaDialeg('Anul·la el lot');
    await waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
    expect(updateDoc.mock.calls[0][1]).toMatchObject({ anulat: true });
  });

  it.each([
    ['Cancel·lar', (user) => cancellaDialeg(user)],
    ['ESC', (user) => tancaDialegAmbEsc(user)],
  ])('no anul·la el lot si es tanca la confirmació amb %s', async (_nom, tanca) => {
    mockLotIAccessLog(LOT);
    const user = userEvent.setup();
    renderLot();
    await user.click(await screen.findByRole('button', { name: 'Anul·lar tot el lot' }));
    await tanca(user);
    await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('anul·la un tiquet individual no usat en clicar el seu botó "Anul·lar"', async () => {
    mockLotIAccessLog(LOT);
    const user = userEvent.setup();
    renderLot();
    const botons = await screen.findAllByRole('button', { name: 'Anul·lar' });
    expect(botons).toHaveLength(3);
    await user.click(botons[0]);
    const dialeg = await dialegConfirmacio();
    expect(dialeg).toHaveAttribute('role', 'alertdialog');
    expect(dialeg).toHaveTextContent('Segur que vols anul·lar el tiquet T-000001?');
    expect(updateDoc).not.toHaveBeenCalled();
    await acceptaDialeg('Anul·la');
    await waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
    expect(updateDoc.mock.calls[0][1].codisAnulats).toEqual({ __op: 'arrayUnion', v: 'T-000001' });
  });

  it.each([
    ['Cancel·lar', (user) => cancellaDialeg(user)],
    ['ESC', (user) => tancaDialegAmbEsc(user)],
  ])('no anul·la el tiquet si es tanca la confirmació amb %s', async (_nom, tanca) => {
    mockLotIAccessLog(LOT);
    const user = userEvent.setup();
    renderLot();
    const botons = await screen.findAllByRole('button', { name: 'Anul·lar' });
    await user.click(botons[0]);
    await tanca(user);
    await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
    expect(updateDoc).not.toHaveBeenCalled();
    expect(botons[0]).toHaveFocus();
  });

  it('reactiva un tiquet anul·lat individualment amb el botó "Reactivar"', async () => {
    mockLotIAccessLog({ ...LOT, codisAnulats: ['T-000001'] });
    const user = userEvent.setup();
    renderLot();
    await user.click(await screen.findByRole('button', { name: 'Reactivar' }));
    expect(hiHaDialegConfirmacio()).toBe(false);
    expect(updateDoc.mock.calls[0][1].codisAnulats).toEqual({ __op: 'arrayRemove', v: 'T-000001' });
  });

  it('un tiquet ja usat mostra el botó "Anul·lar" però no "Reactivar"', async () => {
    mockLotIAccessLog(LOT, [{ tipus: 'generic', codiTiquet: 'T-000001' }]);
    renderLot();
    await screen.findByText('2 de 3 disponibles');
    expect(screen.getByText('Usat')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Anul·lar' })).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Reactivar' })).not.toBeInTheDocument();
  });

  it('permet anul·lar un tiquet ja usat', async () => {
    mockLotIAccessLog(LOT, [{ tipus: 'generic', codiTiquet: 'T-000001' }]);
    const user = userEvent.setup();
    renderLot();
    const botons = await screen.findAllByRole('button', { name: 'Anul·lar' });
    await user.click(botons[0]);
    await acceptaDialeg('Anul·la');
    await waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
    expect(updateDoc.mock.calls[0][1].codisAnulats).toEqual({ __op: 'arrayUnion', v: 'T-000001' });
  });

  it('mostra "0 disponibles" i cap botó d\'anul·lar quan tot el lot ja està anul·lat', async () => {
    mockLotIAccessLog({ ...LOT, anulat: true, dataAnulacio: '2026-09-01' });
    renderLot();
    expect(await screen.findByText('0 de 3 disponibles')).toBeInTheDocument();
    expect(screen.getByText('Anul·lat el 01/09/2026')).toBeInTheDocument();
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
