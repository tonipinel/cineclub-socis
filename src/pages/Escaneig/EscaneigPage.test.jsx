import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'staff-1' } }) }));

const SESSIO_ACTIVA = { id: 'sessio-1', titol: 'The Artist', preuEntrada: 5 };

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  doc: vi.fn(),
  serverTimestamp: vi.fn(() => 'TIMESTAMP'),
  addDoc: vi.fn().mockResolvedValue({ id: 'log-1' }),
  getDocs: vi.fn(),
  onSnapshot: vi.fn((q, callback) => {
    // La primera crida des del component és la subscripció a la sessió activa.
    callback({ docs: [{ id: SESSIO_ACTIVA.id, data: () => SESSIO_ACTIVA }] });
    return () => {};
  }),
}));

import { addDoc, getDocs } from 'firebase/firestore';
import EscaneigPage from './EscaneigPage';

describe('EscaneigPage', () => {
  beforeEach(() => {
    addDoc.mockClear();
    getDocs.mockReset();
  });

  it('registra un soci vàlid escrivint el codi manualment', async () => {
    // ultimPagament = avui fa que calcularEstatSoci doni sempre "Al dia"
    // (el venciment cau un any sencer després d'avui), independentment de quan
    // s'executi aquest test.
    const ultimPagament = new Date().toISOString().slice(0, 10);
    getDocs.mockResolvedValueOnce({
      empty: false,
      docs: [{ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: 7, ultimPagament }) }],
    });
    const user = userEvent.setup();
    render(<EscaneigPage />);
    await user.type(await screen.findByLabelText('Codi manual'), 'SOCI-7');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Anna Vidal — Al dia')).toBeInTheDocument();
    expect(addDoc.mock.calls[0][1]).toEqual({
      sessionId: 'sessio-1', timestamp: 'TIMESTAMP', escanejatPer: 'staff-1', tipus: 'soci', numeroSoci: 7,
    });
  });

  it('mostra un error si el número de soci no existeix', async () => {
    getDocs.mockResolvedValueOnce({ empty: true, docs: [] });
    const user = userEvent.setup();
    render(<EscaneigPage />);
    await user.type(await screen.findByLabelText('Codi manual'), 'SOCI-999');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('No hi ha cap soci amb el número 999')).toBeInTheDocument();
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('registra un tiquet genèric nou amb el preu de la sessió', async () => {
    getDocs.mockResolvedValueOnce({ empty: true, docs: [] });
    const user = userEvent.setup();
    render(<EscaneigPage />);
    await user.type(await screen.findByLabelText('Codi manual'), 'L1-014');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Entrada genèrica registrada (5€)')).toBeInTheDocument();
    expect(addDoc.mock.calls[0][1]).toEqual({
      sessionId: 'sessio-1', timestamp: 'TIMESTAMP', escanejatPer: 'staff-1',
      tipus: 'generic', codiTiquet: 'L1-014', preuAplicat: 5,
    });
  });

  it('avisa si el tiquet genèric ja s\'ha escanejat i només el registra en confirmar', async () => {
    getDocs.mockResolvedValueOnce({ empty: false, docs: [{ data: () => ({}) }] });
    const user = userEvent.setup();
    render(<EscaneigPage />);
    await user.type(await screen.findByLabelText('Codi manual'), 'L1-014');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText(/ja s'ha escanejat aquesta sessió/)).toBeInTheDocument();
    expect(addDoc).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Comptar igualment' }));
    expect(addDoc.mock.calls[0][1].codiTiquet).toBe('L1-014');
  });

  it('mostra un error per a un codi no reconegut', async () => {
    const user = userEvent.setup();
    render(<EscaneigPage />);
    await user.type(await screen.findByLabelText('Codi manual'), 'XYZ');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Codi no reconegut: XYZ')).toBeInTheDocument();
    expect(getDocs).not.toHaveBeenCalled();
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('mostra un error si falla la consulta a Firestore', async () => {
    getDocs.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    render(<EscaneigPage />);
    await user.type(await screen.findByLabelText('Codi manual'), 'SOCI-7');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText("No s'ha pogut registrar l'entrada. Torna-ho a provar.")).toBeInTheDocument();
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('ignora un mateix codi reenviat dins la finestra de debounce, sense duplicar el registre', async () => {
    getDocs.mockResolvedValueOnce({ empty: true, docs: [] });
    const user = userEvent.setup();
    render(<EscaneigPage />);
    const input = await screen.findByLabelText('Codi manual');
    await user.type(input, 'L1-014');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Entrada genèrica registrada (5€)')).toBeInTheDocument();

    await user.type(input, 'L1-014');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    // El debounce ignora el segon enviament: no es torna a consultar Firestore
    // ni es duplica el registre, però el missatge de l'escaneig anterior es
    // manté visible (necessari perquè amb la càmera el mateix codi es torna a
    // detectar cada ~400ms mentre el QR és davant l'objectiu).
    expect(screen.getByText('Entrada genèrica registrada (5€)')).toBeInTheDocument();
    expect(addDoc).toHaveBeenCalledTimes(1);
  });
});
