import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('barcode-detector/polyfill', () => ({}));
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

import { addDoc, getDocs, onSnapshot } from 'firebase/firestore';
import EscaneigPage from './EscaneigPage';

async function obrirCodiManual(user) {
  await user.click(await screen.findByRole('button', { name: 'Introduir codi manualment' }));
  return screen.getByLabelText('Codi manual');
}

describe('EscaneigPage', () => {
  beforeEach(() => {
    addDoc.mockClear();
    getDocs.mockReset();
  });

  it('per defecte mostra el botó Escanejar i l\'enllaç per introduir un codi manualment, sense el camp encara', async () => {
    render(<EscaneigPage />);
    expect(await screen.findByRole('button', { name: 'Escanejar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Introduir codi manualment' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Codi manual')).not.toBeInTheDocument();
  });

  it('en clicar l\'enllaç, mostra el camp de codi manual i amaga el botó Escanejar', async () => {
    const user = userEvent.setup();
    render(<EscaneigPage />);
    await obrirCodiManual(user);
    expect(screen.getByLabelText('Codi manual')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Escanejar' })).not.toBeInTheDocument();
  });

  it('en clicar "Cancel·lar" des del codi manual, torna a la pantalla inicial', async () => {
    const user = userEvent.setup();
    render(<EscaneigPage />);
    await obrirCodiManual(user);
    await user.click(screen.getByRole('button', { name: 'Cancel·lar' }));
    expect(screen.queryByLabelText('Codi manual')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Escanejar' })).toBeInTheDocument();
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
    const input = await obrirCodiManual(user);
    await user.type(input, 'SOCI-7');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Anna Vidal — Al dia')).toBeInTheDocument();
    expect(addDoc.mock.calls[0][1]).toEqual({
      sessionId: 'sessio-1', timestamp: 'TIMESTAMP', escanejatPer: 'staff-1', tipus: 'soci', numeroSoci: 7,
    });
  });

  it('mostra un error si el tiquet pertany a un lot anul·lat', async () => {
    onSnapshot
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [{ id: SESSIO_ACTIVA.id, data: () => SESSIO_ACTIVA }] });
        return () => {};
      })
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [{ data: () => ({ numeroInicial: 1, quantitat: 150, anulat: true }) }] });
        return () => {};
      })
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [] });
        return () => {};
      });
    const user = userEvent.setup();
    render(<EscaneigPage />);
    const input = await obrirCodiManual(user);
    await user.type(input, 'T-000047');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('El codi T-000047 ha estat anul·lat.')).toBeInTheDocument();
    expect(getDocs).not.toHaveBeenCalled();
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('mostra un error si el número de soci no existeix', async () => {
    getDocs.mockResolvedValueOnce({ empty: true, docs: [] });
    const user = userEvent.setup();
    render(<EscaneigPage />);
    const input = await obrirCodiManual(user);
    await user.type(input, 'SOCI-999');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('No hi ha cap soci amb el número 999')).toBeInTheDocument();
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('registra un tiquet genèric nou amb el preu de la sessió', async () => {
    getDocs.mockResolvedValueOnce({ empty: true, docs: [] });
    const user = userEvent.setup();
    render(<EscaneigPage />);
    const input = await obrirCodiManual(user);
    await user.type(input, 'L1-014');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Entrada genèrica registrada (5€)')).toBeInTheDocument();
    expect(addDoc.mock.calls[0][1]).toEqual({
      sessionId: 'sessio-1', timestamp: 'TIMESTAMP', escanejatPer: 'staff-1',
      tipus: 'generic', codiTiquet: 'L1-014', preuAplicat: 5,
    });
  });

  it('avisa si el tiquet genèric ja s\'ha escanejat i només el registra en confirmar', async () => {
    const dataEscaneigPrevi = new Date('2026-03-05T20:00:00');
    getDocs.mockResolvedValueOnce({
      empty: false,
      docs: [{ data: () => ({ timestamp: { toDate: () => dataEscaneigPrevi } }) }],
    });
    const user = userEvent.setup();
    render(<EscaneigPage />);
    const input = await obrirCodiManual(user);
    await user.type(input, 'L1-014');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    const dataFormatada = dataEscaneigPrevi.toLocaleString('ca-ES');
    expect(await screen.findByText(new RegExp(`ja s'ha escanejat \\(${dataFormatada.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`))).toBeInTheDocument();
    expect(addDoc).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Comptar igualment' }));
    expect(addDoc.mock.calls[0][1].codiTiquet).toBe('L1-014');
  });

  it('mostra un error per a un codi no reconegut', async () => {
    const user = userEvent.setup();
    render(<EscaneigPage />);
    const input = await obrirCodiManual(user);
    await user.type(input, 'XYZ');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Codi no reconegut: XYZ')).toBeInTheDocument();
    expect(getDocs).not.toHaveBeenCalled();
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('mostra un error si falla la consulta a Firestore', async () => {
    getDocs.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    render(<EscaneigPage />);
    const input = await obrirCodiManual(user);
    await user.type(input, 'SOCI-7');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText("No s'ha pogut registrar l'entrada. Torna-ho a provar.")).toBeInTheDocument();
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('ignora un mateix codi reenviat dins la finestra de debounce, sense duplicar el registre', async () => {
    getDocs.mockResolvedValueOnce({ empty: true, docs: [] });
    const user = userEvent.setup();
    render(<EscaneigPage />);
    const input = await obrirCodiManual(user);
    await user.type(input, 'L1-014');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Entrada genèrica registrada (5€)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Tornar a escanejar' }));
    const inputNou = screen.getByLabelText('Codi manual');
    await user.type(inputNou, 'L1-014');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    // El debounce ignora el segon enviament dins la finestra: no es torna a
    // consultar Firestore ni es duplica el registre, però s'informa l'operador.
    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Aquest codi ja s'ha registrat fa un moment.")).toBeInTheDocument();
  });

  it('després d\'un escaneig, amaga el formulari i mostra el missatge amb "Tornar a escanejar"', async () => {
    const ultimPagament = new Date().toISOString().slice(0, 10);
    getDocs.mockResolvedValueOnce({
      empty: false,
      docs: [{ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: 7, ultimPagament }) }],
    });
    const user = userEvent.setup();
    render(<EscaneigPage />);
    const input = await obrirCodiManual(user);
    await user.type(input, 'SOCI-7');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Anna Vidal — Al dia')).toBeInTheDocument();
    expect(screen.queryByLabelText('Codi manual')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tornar a escanejar' })).toBeInTheDocument();
  });

  it('en clicar "Tornar a escanejar", neteja el missatge anterior i torna a mostrar el camp manual', async () => {
    const user = userEvent.setup();
    render(<EscaneigPage />);
    const input = await obrirCodiManual(user);
    await user.type(input, 'XYZ');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Codi no reconegut: XYZ')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tornar a escanejar' }));
    expect(screen.queryByText('Codi no reconegut: XYZ')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Codi manual')).toBeInTheDocument();
  });

  it('el botó de tancar del footer no es mostra a l\'estat inicial', async () => {
    render(<EscaneigPage />);
    await screen.findByRole('button', { name: 'Escanejar' });
    expect(screen.queryByRole('button', { name: "Tancar i tornar a l'inici" })).not.toBeInTheDocument();
  });

  it('el botó de tancar del footer torna a l\'estat inicial des del mode manual', async () => {
    const user = userEvent.setup();
    render(<EscaneigPage />);
    await obrirCodiManual(user);
    await user.click(screen.getByRole('button', { name: "Tancar i tornar a l'inici" }));
    expect(screen.queryByLabelText('Codi manual')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Escanejar' })).toBeInTheDocument();
  });

  it('el botó de tancar del footer torna a l\'estat inicial des d\'un missatge', async () => {
    const user = userEvent.setup();
    render(<EscaneigPage />);
    const input = await obrirCodiManual(user);
    await user.type(input, 'XYZ');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    await screen.findByText('Codi no reconegut: XYZ');
    await user.click(screen.getByRole('button', { name: "Tancar i tornar a l'inici" }));
    expect(screen.queryByText('Codi no reconegut: XYZ')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Escanejar' })).toBeInTheDocument();
  });
});
