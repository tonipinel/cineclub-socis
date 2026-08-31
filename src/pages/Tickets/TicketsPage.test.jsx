import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,ABC') },
}));

vi.mock('../../firebase/firebase', () => ({ db: {} }));

const transactionMock = { get: vi.fn(), set: vi.fn() };
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  runTransaction: vi.fn(async (db, callback) => callback(transactionMock)),
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

  it('no mostra cap tiquet fins que es genera un lot nou', () => {
    render(<TicketsPage />);
    expect(screen.queryAllByRole('img', { name: /Codi QR/ })).toHaveLength(0);
  });

  it('genera els tiquets començant pel primer número si encara no hi ha comptador', async () => {
    transactionMock.get.mockResolvedValue({ exists: () => false });
    const user = userEvent.setup();
    render(<TicketsPage />);
    await user.clear(screen.getByLabelText('Quantitat'));
    await user.type(screen.getByLabelText('Quantitat'), '3');
    await user.click(screen.getByRole('button', { name: 'Generar tiquets nous' }));
    expect(await screen.findByText('T-000001')).toBeInTheDocument();
    expect(screen.getByText('T-000003')).toBeInTheDocument();
    expect(transactionMock.set).toHaveBeenCalledWith(undefined, { seguentNumero: 4 }, { merge: true });
  });

  it('continua des del següent número guardat al comptador', async () => {
    transactionMock.get.mockResolvedValue({ exists: () => true, data: () => ({ seguentNumero: 151 }) });
    const user = userEvent.setup();
    render(<TicketsPage />);
    await user.clear(screen.getByLabelText('Quantitat'));
    await user.type(screen.getByLabelText('Quantitat'), '2');
    await user.click(screen.getByRole('button', { name: 'Generar tiquets nous' }));
    expect(await screen.findByText('T-000151')).toBeInTheDocument();
    expect(screen.getByText('T-000152')).toBeInTheDocument();
    expect(transactionMock.set).toHaveBeenCalledWith(undefined, { seguentNumero: 153 }, { merge: true });
  });

  it('demana confirmació abans de generar tiquets nous', async () => {
    transactionMock.get.mockResolvedValue({ exists: () => false });
    const user = userEvent.setup();
    render(<TicketsPage />);
    await user.click(screen.getByRole('button', { name: 'Generar tiquets nous' }));
    expect(window.confirm).toHaveBeenCalledTimes(1);
  });

  it('no genera res si es cancel·la la confirmació', async () => {
    window.confirm.mockReturnValue(false);
    const user = userEvent.setup();
    render(<TicketsPage />);
    await user.click(screen.getByRole('button', { name: 'Generar tiquets nous' }));
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('mostra el preu introduït a cada tiquet', async () => {
    transactionMock.get.mockResolvedValue({ exists: () => false });
    const user = userEvent.setup();
    render(<TicketsPage />);
    await user.clear(screen.getByLabelText('Quantitat'));
    await user.type(screen.getByLabelText('Quantitat'), '1');
    await user.clear(screen.getByLabelText('Preu'));
    await user.type(screen.getByLabelText('Preu'), '6');
    await user.click(screen.getByRole('button', { name: 'Generar tiquets nous' }));
    expect(await screen.findByText('APORTACIÓ (6€)')).toBeInTheDocument();
  });
});
