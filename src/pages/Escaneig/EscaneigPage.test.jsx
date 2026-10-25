import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  act, screen, fireEvent, waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('barcode-detector/polyfill', () => ({}));
vi.mock('../../firebase/firebase', () => ({ db: {} }));
const auth = vi.hoisted(() => ({ user: { uid: 'staff-1' } }));
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: auth.user }) }));

const SESSIO_ACTIVA = { id: 'sessio-1', titol: 'The Artist' };
const LOT_TIQUETS = { numeroInicial: 1, quantitat: 150, preu: 5 };

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_, nom) => nom),
  query: vi.fn(),
  where: vi.fn(),
  doc: vi.fn(),
  serverTimestamp: vi.fn(() => 'TIMESTAMP'),
  addDoc: vi.fn().mockResolvedValue({ id: 'log-1' }),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  getDocs: vi.fn(),
  getDocsFromServer: vi.fn(),
  onSnapshot: vi.fn((...args) => {
    const callback = args.at(-1);
    // La primera crida des del component és la subscripció a la sessió activa.
    callback({ docs: [{ id: SESSIO_ACTIVA.id, data: () => SESSIO_ACTIVA }] });
    return () => {};
  }),
}));

import {
  addDoc, getDocs, getDocsFromServer, onSnapshot, updateDoc, where,
} from 'firebase/firestore';
import EscaneigPage from './EscaneigPage';
import {
  acceptaDialeg, cancellaDialeg, dialegConfirmacio, hiHaDialegConfirmacio, renderAmbConfirmacio, tancaDialegAmbEsc,
} from '../../test/confirmacio';
import { formatData } from '../../lib/data';

async function obrirCodiManual(user) {
  await user.click(await screen.findByRole('button', { name: 'Introduir codi manualment' }));
  return screen.getByLabelText('Codi manual');
}

describe('EscaneigPage', () => {
  beforeEach(() => {
    addDoc.mockReset();
    addDoc.mockResolvedValue({ id: 'log-1' });
    updateDoc.mockClear();
    getDocs.mockReset();
    getDocsFromServer.mockReset();
    window.location.hash = '';
  });

  it('per defecte mostra el botó Escanejar i l\'enllaç per introduir un codi manualment, sense el camp encara', async () => {
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'Escanejar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Introduir codi manualment' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Codi manual')).not.toBeInTheDocument();
  });

  it('mostra un enllaç LOG al footer que porta al registre d\'incidències', async () => {
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    await screen.findByRole('button', { name: 'Escanejar' });
    expect(screen.getByRole('link', { name: 'LOG' })).toHaveAttribute('href', '/escaneig/log');
  });

  it('en clicar l\'enllaç, mostra el camp de codi manual i amaga el botó Escanejar', async () => {
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    await obrirCodiManual(user);
    expect(screen.getByLabelText('Codi manual')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Escanejar' })).not.toBeInTheDocument();
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
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    const input = await obrirCodiManual(user);
    await user.type(input, 'SOCI-7');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Anna Vidal')).toBeInTheDocument();
    expect(screen.getByText('Al dia')).toHaveClass('badge--al-dia');
    expect(screen.getByText(/Venç el/)).not.toHaveClass('escaneig__missatge-venciment--avis');
    expect(addDoc.mock.calls[0][1]).toEqual({
      sessionId: 'sessio-1', timestamp: 'TIMESTAMP', escanejatPer: 'staff-1', tipus: 'soci', numeroSoci: 7, metode: 'manual',
    });
  });

  it('registra l\'entrada d\'un soci identificat per un codi de carnet amb token (CARNET-)', async () => {
    const ultimPagament = new Date().toISOString().slice(0, 10);
    // El mock només retorna el soci si la consulta és per 'tokenCarnet': així
    // es demostra que el flux CARNET- consulta pel camp correcte i no pel
    // 'numeroSoci' que fa servir el flux SOCI-.
    getDocs.mockImplementation(async () => {
      const ultimaWhere = where.mock.calls.at(-1);
      if (ultimaWhere?.[0] === 'tokenCarnet' && ultimaWhere?.[2] === 'abc-123') {
        return {
          empty: false,
          docs: [{
            data: () => ({
              nom: 'Anna', cognoms: 'Vidal', numeroSoci: 7, actiu: true, tokenCarnet: 'abc-123', ultimPagament,
            }),
          }],
        };
      }
      return { empty: true, docs: [] };
    });
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    const input = await obrirCodiManual(user);
    await user.type(input, 'CARNET-abc-123');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Anna Vidal')).toBeInTheDocument();
    expect(addDoc.mock.calls[0][1]).toEqual({
      sessionId: 'sessio-1', timestamp: 'TIMESTAMP', escanejatPer: 'staff-1', tipus: 'soci', numeroSoci: 7, metode: 'manual',
    });
  });

  it('mostra el venciment en groc amb avís quan venç en menys de 30 dies', async () => {
    // ultimPagament = avui - 1 any + 10 dies, de manera que el venciment
    // (ultimPagament + 1 any, regla de calcularVenciment) cau 10 dies
    // després d'avui, independentment de quan s'executi el test.
    const ara = new Date();
    const ultimPagament = new Date(ara.getFullYear() - 1, ara.getMonth(), ara.getDate() + 10)
      .toLocaleDateString('sv-SE');
    // inicPeriode = ultimPagament simula un soci que ja va fer servir el
    // carnet fa un any (ja backfillat): així el venciment que es prova aquí
    // no queda tapat pel "primer escaneig des del pagament" (vegeu el
    // describe d'inicPeriode més avall).
    getDocs.mockResolvedValueOnce({
      empty: false,
      docs: [{ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: 7, ultimPagament, inicPeriode: ultimPagament }) }],
    });
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    const input = await obrirCodiManual(user);
    await user.type(input, 'SOCI-7');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText(/Venç el/)).toHaveClass('escaneig__missatge-venciment--avis');
  });

  it('rebutja un soci desactivat i no el registra a l\'accessLog', async () => {
    getDocs.mockResolvedValueOnce({
      empty: false,
      docs: [{ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: 7, actiu: false, motiuDesactivacio: 'Mal comportament' }) }],
    });
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    const input = await obrirCodiManual(user);
    await user.type(input, 'SOCI-7');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Anna Vidal')).toBeInTheDocument();
    expect(screen.getByText('Soci desactivat: Mal comportament')).toBeInTheDocument();
    expect(addDoc.mock.calls[0][0]).toBe('escaneigErrors');
    expect(addDoc.mock.calls[0][1]).toEqual({
      sessionId: 'sessio-1', timestamp: 'TIMESTAMP', escanejatPer: 'staff-1',
      motiu: 'soci-desactivat', codi: 'SOCI-7', metode: 'manual', numeroSoci: 7, detall: 'Mal comportament',
      online: true, ms: expect.any(Number),
    });
  });

  it('mostra un error si el tiquet pertany a un lot anul·lat', async () => {
    onSnapshot
      .mockImplementationOnce((...args) => {
        const callback = args.at(-1);
        callback({ docs: [{ id: SESSIO_ACTIVA.id, data: () => SESSIO_ACTIVA }] });
        return () => {};
      })
      .mockImplementationOnce((...args) => {
        const callback = args.at(-1);
        callback({ docs: [{ data: () => ({ numeroInicial: 1, quantitat: 150, anulat: true }) }] });
        return () => {};
      })
      .mockImplementationOnce((...args) => {
        const callback = args.at(-1);
        callback({ docs: [] });
        return () => {};
      });
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    const input = await obrirCodiManual(user);
    await user.type(input, 'T-000047');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('El codi T-000047 ha estat anul·lat.')).toBeInTheDocument();
    expect(screen.getByText('Aquest tiquet ja no és vàlid per accedir-hi')).toBeInTheDocument();
    expect(getDocs).not.toHaveBeenCalled();
    expect(addDoc.mock.calls[0][0]).toBe('escaneigErrors');
    expect(addDoc.mock.calls[0][1]).toEqual({
      sessionId: 'sessio-1', timestamp: 'TIMESTAMP', escanejatPer: 'staff-1',
      motiu: 'tiquet-anullat', codi: 'T-000047', codiTiquet: 'T-000047', metode: 'manual', online: true, ms: expect.any(Number),
    });
  });

  it('mostra un error si el tiquet no pertany a cap lot conegut, sense registrar-lo amb preu 0', async () => {
    onSnapshot
      .mockImplementationOnce((...args) => {
        const callback = args.at(-1);
        callback({ docs: [{ id: SESSIO_ACTIVA.id, data: () => SESSIO_ACTIVA }] });
        return () => {};
      })
      .mockImplementationOnce((...args) => {
        const callback = args.at(-1);
        callback({ docs: [{ data: () => LOT_TIQUETS }] });
        return () => {};
      })
      .mockImplementationOnce((...args) => {
        const callback = args.at(-1);
        callback({ docs: [] });
        return () => {};
      });
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    const input = await obrirCodiManual(user);
    await user.type(input, 'T-000999');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('El codi T-000999 no pertany a cap lot de tiquets conegut.')).toBeInTheDocument();
    expect(getDocs).not.toHaveBeenCalled();
    expect(addDoc.mock.calls[0][0]).toBe('escaneigErrors');
    expect(addDoc.mock.calls[0][1]).toEqual({
      sessionId: 'sessio-1', timestamp: 'TIMESTAMP', escanejatPer: 'staff-1',
      motiu: 'tiquet-desconegut', codi: 'T-000999', codiTiquet: 'T-000999', metode: 'manual', online: true, ms: expect.any(Number),
    });
  });

  it('mostra un error si el número de soci no existeix', async () => {
    getDocs.mockResolvedValueOnce({ empty: true, docs: [] });
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    const input = await obrirCodiManual(user);
    await user.type(input, 'SOCI-999');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('No hi ha cap soci amb el número 999')).toBeInTheDocument();
    expect(screen.getByText('Comprova el número al carnet o al llistat de socis')).toBeInTheDocument();
    expect(addDoc.mock.calls[0][0]).toBe('escaneigErrors');
    expect(addDoc.mock.calls[0][1]).toEqual({
      sessionId: 'sessio-1', timestamp: 'TIMESTAMP', escanejatPer: 'staff-1',
      motiu: 'soci-no-trobat', codi: 'SOCI-999', metode: 'manual', detall: 'No hi ha cap soci amb el número 999',
      online: true, ms: expect.any(Number),
    });
  });

  it('registra un tiquet genèric nou amb el preu del lot de tiquets', async () => {
    getDocsFromServer.mockResolvedValueOnce({ empty: true, docs: [] });
    onSnapshot
      .mockImplementationOnce((...args) => {
        const callback = args.at(-1);
        callback({ docs: [{ id: SESSIO_ACTIVA.id, data: () => SESSIO_ACTIVA }] });
        return () => {};
      })
      .mockImplementationOnce((...args) => {
        const callback = args.at(-1);
        callback({ docs: [{ data: () => LOT_TIQUETS }] });
        return () => {};
      })
      .mockImplementationOnce((...args) => {
        const callback = args.at(-1);
        callback({ docs: [] });
        return () => {};
      });
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    const input = await obrirCodiManual(user);
    await user.type(input, 'T-000014');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Entrada genèrica registrada (5€)')).toBeInTheDocument();
    expect(addDoc.mock.calls[0][1]).toEqual({
      sessionId: 'sessio-1', timestamp: 'TIMESTAMP', escanejatPer: 'staff-1',
      tipus: 'generic', codiTiquet: 'T-000014', preuAplicat: 5, metode: 'manual',
    });
  });

  it('avisa si el tiquet genèric ja s\'ha escanejat i només el registra en confirmar', async () => {
    const dataEscaneigPrevi = new Date('2026-03-05T20:00:00');
    getDocsFromServer.mockResolvedValueOnce({
      empty: false,
      docs: [{ data: () => ({ timestamp: { toDate: () => dataEscaneigPrevi } }) }],
    });
    onSnapshot
      .mockImplementationOnce((...args) => {
        const callback = args.at(-1);
        callback({ docs: [{ id: SESSIO_ACTIVA.id, data: () => SESSIO_ACTIVA }] });
        return () => {};
      })
      .mockImplementationOnce((...args) => {
        const callback = args.at(-1);
        callback({ docs: [{ data: () => LOT_TIQUETS }] });
        return () => {};
      })
      .mockImplementationOnce((...args) => {
        const callback = args.at(-1);
        callback({ docs: [] });
        return () => {};
      });
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    const input = await obrirCodiManual(user);
    await user.type(input, 'T-000014');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    const dataFormatada = `05/03/2026 ${dataEscaneigPrevi.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' })}`;
    expect(await screen.findByText('Codi ja utilitzat')).toBeInTheDocument();
    expect(await screen.findByText(new RegExp(`ja s'ha escanejat \\(${dataFormatada.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`))).toBeInTheDocument();
    expect(addDoc.mock.calls[0][0]).toBe('escaneigErrors');
    expect(addDoc.mock.calls[0][1]).toEqual({
      sessionId: 'sessio-1', timestamp: 'TIMESTAMP', escanejatPer: 'staff-1',
      motiu: 'tiquet-ja-utilitzat', codi: 'T-000014', metode: 'manual', codiTiquet: 'T-000014',
      online: true, ms: expect.any(Number), desdeCache: false,
    });
    await user.click(screen.getByRole('button', { name: 'Comptar igualment' }));
    const dialeg = await dialegConfirmacio();
    expect(dialeg).toHaveTextContent('Segur que vols comptar el codi T-000014 igualment?');
    expect(dialeg).not.toHaveAttribute('role', 'alertdialog');
    expect(addDoc).toHaveBeenCalledTimes(1);
    await acceptaDialeg('Compta igualment');
    await waitFor(() => expect(addDoc).toHaveBeenCalledTimes(2));
    expect(addDoc.mock.calls[1][1].codiTiquet).toBe('T-000014');
    expect(addDoc.mock.calls[1][1].tipus).toBe('generic');
  });

  it.each([
    ['Cancel·lar', (user) => cancellaDialeg(user)],
    ['ESC', (user) => tancaDialegAmbEsc(user)],
  ])('no registra el codi repetit si es tanca la confirmació amb %s, i l\'avís continua operatiu', async (_nom, tanca) => {
    getDocsFromServer.mockResolvedValueOnce({
      empty: false,
      docs: [{ data: () => ({ timestamp: null }) }],
    });
    onSnapshot
      .mockImplementationOnce((...args) => {
        const callback = args.at(-1);
        callback({ docs: [{ id: SESSIO_ACTIVA.id, data: () => SESSIO_ACTIVA }] });
        return () => {};
      })
      .mockImplementationOnce((...args) => {
        const callback = args.at(-1);
        callback({ docs: [{ data: () => LOT_TIQUETS }] });
        return () => {};
      })
      .mockImplementationOnce((...args) => {
        const callback = args.at(-1);
        callback({ docs: [] });
        return () => {};
      });
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    const input = await obrirCodiManual(user);
    await user.type(input, 'T-000014');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    await user.click(await screen.findByRole('button', { name: 'Comptar igualment' }));
    await tanca(user);
    await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(addDoc.mock.calls[0][1].motiu).toBe('tiquet-ja-utilitzat');
    // No queda bloquejat: l'avís segueix a la pantalla i es pot tornar a escanejar o comptar.
    expect(screen.getByText('Codi ja utilitzat')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comptar igualment' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Escanejar un altre' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Comptar igualment' }));
    await acceptaDialeg('Compta igualment');
    await waitFor(() => expect(addDoc).toHaveBeenCalledTimes(2));
    expect(addDoc.mock.calls[1][1].codiTiquet).toBe('T-000014');
  });

  it('mostra un error per a un codi no reconegut', async () => {
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    const input = await obrirCodiManual(user);
    await user.type(input, 'XYZ');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Codi no reconegut: XYZ')).toBeInTheDocument();
    expect(screen.getByText('Els codis vàlids comencen per SOCI- o T-')).toBeInTheDocument();
    expect(getDocs).not.toHaveBeenCalled();
    expect(addDoc.mock.calls[0][0]).toBe('escaneigErrors');
    expect(addDoc.mock.calls[0][1]).toEqual({
      sessionId: 'sessio-1', timestamp: 'TIMESTAMP', escanejatPer: 'staff-1', motiu: 'codi-desconegut', codi: 'XYZ', metode: 'manual',
      online: true, ms: expect.any(Number),
    });
  });

  it('mostra un error si falla la consulta a Firestore', async () => {
    getDocs.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    const input = await obrirCodiManual(user);
    await user.type(input, 'SOCI-7');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText("No s'ha pogut registrar l'entrada. Torna-ho a provar.")).toBeInTheDocument();
    expect(addDoc.mock.calls[0][0]).toBe('escaneigErrors');
    expect(addDoc.mock.calls[0][1]).toEqual({
      sessionId: 'sessio-1', timestamp: 'TIMESTAMP', escanejatPer: 'staff-1', motiu: 'excepcio', codi: 'SOCI-7', metode: 'manual', detall: 'offline',
      online: true, ms: expect.any(Number),
    });
  });

  it('ignora un mateix codi reenviat dins la finestra de debounce, sense duplicar el registre', async () => {
    getDocsFromServer.mockResolvedValueOnce({ empty: true, docs: [] });
    onSnapshot
      .mockImplementationOnce((...args) => {
        const callback = args.at(-1);
        callback({ docs: [{ id: SESSIO_ACTIVA.id, data: () => SESSIO_ACTIVA }] });
        return () => {};
      })
      .mockImplementationOnce((...args) => {
        const callback = args.at(-1);
        callback({ docs: [{ data: () => LOT_TIQUETS }] });
        return () => {};
      })
      .mockImplementationOnce((...args) => {
        const callback = args.at(-1);
        callback({ docs: [] });
        return () => {};
      });
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    const input = await obrirCodiManual(user);
    await user.type(input, 'T-000014');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Entrada genèrica registrada (5€)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Escanejar un altre' }));
    const inputNou = screen.getByLabelText('Codi manual');
    await user.type(inputNou, 'T-000014');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    // El debounce ignora el segon enviament dins la finestra: no es torna a
    // consultar Firestore ni es duplica el registre, però s'informa l'operador
    // (i queda constància al log de diagnòstic).
    expect(addDoc.mock.calls.filter(([col]) => col === 'accessLog')).toHaveLength(1);
    expect(getDocsFromServer).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Aquest codi ja s'ha registrat fa un moment.")).toBeInTheDocument();
  });

  it('després d\'un escaneig, amaga el formulari i mostra el missatge amb "Escanejar un altre"', async () => {
    const ultimPagament = new Date().toISOString().slice(0, 10);
    getDocs.mockResolvedValueOnce({
      empty: false,
      docs: [{ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: 7, ultimPagament }) }],
    });
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    const input = await obrirCodiManual(user);
    await user.type(input, 'SOCI-7');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Anna Vidal')).toBeInTheDocument();
    expect(screen.queryByLabelText('Codi manual')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Escanejar un altre' })).toBeInTheDocument();
  });

  it('en clicar "Escanejar un altre", neteja el missatge anterior i torna a mostrar el camp manual', async () => {
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    const input = await obrirCodiManual(user);
    await user.type(input, 'XYZ');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Codi no reconegut: XYZ')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Escanejar un altre' }));
    expect(screen.queryByText('Codi no reconegut: XYZ')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Codi manual')).toBeInTheDocument();
  });

  it('afegeix la classe escaneig-body al body i la treu en desmuntar', async () => {
    const { unmount } = renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    await screen.findByRole('button', { name: 'Escanejar' });
    expect(document.body).toHaveClass('escaneig-body');
    unmount();
    expect(document.body).not.toHaveClass('escaneig-body');
  });

  it('el botó de tancar del footer no es mostra a l\'estat inicial', async () => {
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    await screen.findByRole('button', { name: 'Escanejar' });
    expect(screen.queryByRole('button', { name: "Tancar i tornar a l'inici" })).not.toBeInTheDocument();
  });

  it('el botó de tancar del footer torna a l\'estat inicial des del mode manual', async () => {
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    await obrirCodiManual(user);
    await user.click(screen.getByRole('button', { name: "Tancar i tornar a l'inici" }));
    expect(screen.queryByLabelText('Codi manual')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Escanejar' })).toBeInTheDocument();
  });

  it('amb #ok a la URL mostra directament el missatge de prova (mode mockup)', async () => {
    window.location.hash = '#ok';
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    expect(await screen.findByText('Anna Vidal')).toBeInTheDocument();
    expect(screen.getByText('Al dia')).toHaveClass('badge--al-dia');
    expect(screen.getByText('Mode mockup: #ok')).toBeInTheDocument();
  });

  it('amb #codi a la URL mostra directament el formulari manual (mode mockup)', async () => {
    window.location.hash = '#codi';
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    expect(await screen.findByLabelText('Codi manual')).toBeInTheDocument();
  });

  it('sense DEV, el fragment de mockup s\'ignora i cal una sessió real activa', async () => {
    vi.stubEnv('DEV', false);
    onSnapshot.mockImplementationOnce((...args) => {
      const callback = args.at(-1);
      callback({ docs: [] });
      return () => {};
    });
    window.location.hash = '#ok';
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    expect(await screen.findByText(/No hi ha cap sessió activa/)).toBeInTheDocument();
    expect(screen.queryByText('Anna Vidal')).not.toBeInTheDocument();
    vi.unstubAllEnvs();
  });

  it('canviar el fragment de la URL sense recarregar actualitza el mockup mostrat', async () => {
    window.location.hash = '#ok';
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    await screen.findByText('Anna Vidal');

    window.location.hash = '#error';
    window.dispatchEvent(new Event('hashchange'));
    expect(await screen.findByText('Codi no reconegut: XYZ')).toBeInTheDocument();
    expect(screen.queryByText('Anna Vidal')).not.toBeInTheDocument();
  });

  it('treure el fragment de mockup de la URL torna a l\'estat inicial real', async () => {
    window.location.hash = '#ok';
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    await screen.findByText('Anna Vidal');

    window.location.hash = '';
    window.dispatchEvent(new Event('hashchange'));
    expect(await screen.findByRole('button', { name: 'Escanejar' })).toBeInTheDocument();
    expect(screen.queryByText('Anna Vidal')).not.toBeInTheDocument();
  });

  it('el botó de tancar del footer torna a l\'estat inicial des d\'un missatge', async () => {
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    const input = await obrirCodiManual(user);
    await user.type(input, 'XYZ');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    await screen.findByText('Codi no reconegut: XYZ');
    await user.click(screen.getByRole('button', { name: "Tancar i tornar a l'inici" }));
    expect(screen.queryByText('Codi no reconegut: XYZ')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Escanejar' })).toBeInTheDocument();
  });

  describe('mode prova', () => {
    it('per defecte està desactivat i no mostra l\'avís', () => {
      renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
      expect(screen.getByRole('button', { name: 'Mode prova: desactivat' })).toBeInTheDocument();
      expect(screen.queryByText('Mode prova: no es desa res')).not.toBeInTheDocument();
    });

    it('activar-lo mostra l\'avís permanent i canvia el text del botó', async () => {
      const user = userEvent.setup();
      renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
      await user.click(screen.getByRole('button', { name: 'Mode prova: desactivat' }));
      expect(screen.getByText('Mode prova: no es desa res')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Mode prova: activat' })).toBeInTheDocument();
    });

    it('comprova un soci sense desar res a l\'accessLog ni tocar el seu inicPeriode', async () => {
      const ultimPagament = new Date().toISOString().slice(0, 10);
      getDocs.mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: 7, ultimPagament }) }],
      });
      const user = userEvent.setup();
      renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
      await user.click(screen.getByRole('button', { name: 'Mode prova: desactivat' }));
      const input = await obrirCodiManual(user);
      await user.type(input, 'SOCI-7');
      await user.click(screen.getByRole('button', { name: 'Registrar' }));

      expect(await screen.findByText('Anna Vidal')).toBeInTheDocument();
      expect(screen.getByText('Mode prova: no s\'ha desat res. S\'afegiria a «The Artist».')).toBeInTheDocument();
      expect(addDoc).not.toHaveBeenCalled();
      expect(updateDoc).not.toHaveBeenCalled();
    });

    it('comprova un tiquet genèric sense registrar-lo', async () => {
      getDocsFromServer.mockResolvedValueOnce({ empty: true, docs: [] });
      onSnapshot
        .mockImplementationOnce((...args) => {
          const callback = args.at(-1);
          callback({ docs: [{ id: SESSIO_ACTIVA.id, data: () => SESSIO_ACTIVA }] });
          return () => {};
        })
        .mockImplementationOnce((...args) => {
          const callback = args.at(-1);
          callback({ docs: [{ data: () => LOT_TIQUETS }] });
          return () => {};
        })
        .mockImplementationOnce((...args) => {
          const callback = args.at(-1);
          callback({ docs: [] });
          return () => {};
        });
      const user = userEvent.setup();
      renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
      await user.click(screen.getByRole('button', { name: 'Mode prova: desactivat' }));
      const input = await obrirCodiManual(user);
      await user.type(input, 'T-000014');
      await user.click(screen.getByRole('button', { name: 'Registrar' }));

      expect(await screen.findByText('Entrada genèrica (5€)')).toBeInTheDocument();
      expect(screen.getByText('Mode prova: no s\'ha desat res. S\'afegiria a «The Artist».')).toBeInTheDocument();
      expect(addDoc).not.toHaveBeenCalled();
    });
  });

  describe('escaneig per càmera', () => {
    const originalBarcodeDetector = window.BarcodeDetector;
    const originalGetUserMedia = navigator.mediaDevices?.getUserMedia;
    const originalPlay = window.HTMLMediaElement?.prototype.play;

    beforeEach(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) },
      });
      window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
      window.BarcodeDetector = vi.fn().mockImplementation(function BarcodeDetectorMock() {
        this.detect = vi.fn().mockResolvedValue([{ rawValue: 'SOCI-7' }]);
      });
    });

    afterEach(() => {
      vi.useRealTimers();
      window.BarcodeDetector = originalBarcodeDetector;
      window.HTMLMediaElement.prototype.play = originalPlay;
      if (originalGetUserMedia) {
        Object.defineProperty(navigator, 'mediaDevices', {
          configurable: true,
          value: { getUserMedia: originalGetUserMedia },
        });
      }
    });

    it('un codi detectat per la càmera es desa amb metode: \'qr\'', async () => {
      const ultimPagament = new Date().toISOString().slice(0, 10);
      getDocs.mockResolvedValueOnce({
        empty: false,
        docs: [{ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: 7, ultimPagament }) }],
      });
      renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
      const botoEscanejar = await screen.findByRole('button', { name: 'Escanejar' });

      vi.useFakeTimers();
      fireEvent.click(botoEscanejar);

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(400);

      expect(addDoc.mock.calls[0][1]).toEqual({
        sessionId: 'sessio-1', timestamp: 'TIMESTAMP', escanejatPer: 'staff-1', tipus: 'soci', numeroSoci: 7, metode: 'qr',
      });
    });
  });
});

describe('EscaneigPage — inicPeriode (any de soci des del primer ús del carnet)', () => {
  beforeEach(() => {
    addDoc.mockReset();
    addDoc.mockResolvedValue({ id: 'log-1' });
    updateDoc.mockClear();
    getDocs.mockReset();
    window.location.hash = '';
  });

  it('fixa inicPeriode a avui si encara no s\'ha escanejat des de l\'últim pagament', async () => {
    const sociRef = { id: 'soci-7' };
    getDocs.mockResolvedValueOnce({
      empty: false,
      docs: [{ ref: sociRef, data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: 7, ultimPagament: '2026-01-01' }) }],
    });
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    const input = await obrirCodiManual(user);
    await user.type(input, 'SOCI-7');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    await screen.findByText('Anna Vidal');
    expect(updateDoc).toHaveBeenCalledWith(sociRef, { inicPeriode: new Date().toLocaleDateString('sv-SE') });

    // El venciment mostrat en aquest mateix escaneig ha de comptar des d'avui
    // (l'inicPeriode que s'acaba de fixar), no des de l'últim pagament
    // (2026-01-01): si es calculés abans de fixar-lo, mostraria un venciment
    // fins a un any més antic del que li correspon realment.
    const vencimentEsperat = new Date();
    vencimentEsperat.setFullYear(vencimentEsperat.getFullYear() + 1);
    expect(screen.getByText(`Venç el ${formatData(vencimentEsperat)}`)).toBeInTheDocument();
  });

  it('no toca inicPeriode si ja es va fixar des de l\'últim pagament', async () => {
    getDocs.mockResolvedValueOnce({
      empty: false,
      docs: [{
        ref: { id: 'soci-7' },
        data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: 7, ultimPagament: '2026-01-01', inicPeriode: '2026-01-15' }),
      }],
    });
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    const input = await obrirCodiManual(user);
    await user.type(input, 'SOCI-7');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    await screen.findByText('Anna Vidal');
    expect(updateDoc).not.toHaveBeenCalled();
  });

  // Renovació anticipada: ha pagat fa 5 dies, però la quota nova no comença fins que venci l'actual (d'aquí a 20
  // dies). Abans, cada escaneig fins aleshores fixava inicPeriode a avui i el soci perdia aquests 20 dies.
  it('abans que comenci la quota pagada (renovació anticipada), no toca inicPeriode i mostra el venciment nou', async () => {
    const ara = new Date();
    const dia = (dies, anys = 0) => new Date(ara.getFullYear() + anys, ara.getMonth(), ara.getDate() + dies);
    const sociRef = { id: 'soci-7' };
    getDocs.mockResolvedValueOnce({
      empty: false,
      docs: [{
        ref: sociRef,
        data: () => ({
          nom: 'Anna',
          cognoms: 'Vidal',
          numeroSoci: 7,
          ultimPagament: dia(-5).toLocaleDateString('sv-SE'),
          vigenciaDes: dia(20).toLocaleDateString('sv-SE'),
          inicPeriode: null,
        }),
      }],
    });
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    const input = await obrirCodiManual(user);
    await user.type(input, 'SOCI-7');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    await screen.findByText('Anna Vidal');
    expect(updateDoc).not.toHaveBeenCalled();
    expect(screen.getByText(`Venç el ${formatData(dia(20, 1))}`)).toBeInTheDocument();
  });
});

describe('EscaneigPage — sessions especials sense control', () => {
  beforeEach(() => {
    getDocs.mockReset();
    window.location.hash = '';
  });

  it('una sessió senseControl, encara que sigui activa, no es tria: es comporta com si no hi hagués sessió activa', async () => {
    onSnapshot.mockImplementationOnce((...args) => {
      const callback = args.at(-1);
      callback({
        docs: [{ id: 'e1', data: () => ({ titol: 'Carretera a Gusen', activa: true, senseControl: true }) }],
      });
      return () => {};
    });
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    expect(await screen.findByText(/No hi ha cap sessió activa/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Escanejar' })).not.toBeInTheDocument();
  });

  it('si la consulta retorna una senseControl i una de normal, tria la normal', async () => {
    onSnapshot.mockImplementationOnce((...args) => {
      const callback = args.at(-1);
      callback({
        docs: [
          { id: 'e1', data: () => ({ titol: 'Carretera a Gusen', activa: true, senseControl: true }) },
          { id: SESSIO_ACTIVA.id, data: () => SESSIO_ACTIVA },
        ],
      });
      return () => {};
    });
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'Escanejar' })).toBeInTheDocument();
    expect(screen.queryByText(/No hi ha cap sessió activa/)).not.toBeInTheDocument();
  });
});

describe('EscaneigPage — robustesa de l\'escaneig amb mala connexió', () => {
  const SOCI_7 = () => ({
    empty: false,
    docs: [{
      ref: { id: 'soci-7' },
      data: () => ({
        nom: 'Anna', cognoms: 'Vidal', numeroSoci: 7, ultimPagament: '2026-01-01', inicPeriode: '2026-01-15',
      }),
    }],
  });

  // Promesa controlable des del test (simula una escriptura que el servidor
  // encara no ha confirmat).
  function diferida() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }

  // Ordre de subscripcions del component: sessió activa, lots i accessLog.
  function mockSubscripcions({ lots = [LOT_TIQUETS], accessLogDocs = [], lotsCarregats = true } = {}) {
    let callbackLots;
    onSnapshot
      .mockImplementationOnce((...args) => {
        args.at(-1)({ docs: [{ id: SESSIO_ACTIVA.id, data: () => SESSIO_ACTIVA }] });
        return () => {};
      })
      .mockImplementationOnce((...args) => {
        callbackLots = args.at(-1);
        if (lotsCarregats) callbackLots({ docs: lots.map((l) => ({ data: () => l })) });
        return () => {};
      })
      .mockImplementationOnce((...args) => {
        args.at(-1)({ docs: accessLogDocs });
        return () => {};
      });
    return { carregarLots: () => callbackLots({ docs: lots.map((l) => ({ data: () => l })) }) };
  }

  // Avança els temporitzadors falsos dins act perquè React apliqui els canvis d'estat.
  const avancar = (ms) => act(() => vi.advanceTimersByTimeAsync(ms));

  const escripturesAccessLog = () => addDoc.mock.calls.filter(([col]) => col === 'accessLog');
  const registresLog = () => addDoc.mock.calls.filter(([col]) => col === 'escaneigErrors').map(([, d]) => d);

  function enviarCodiManual(codi) {
    fireEvent.change(screen.getByLabelText('Codi manual'), { target: { value: codi } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
  }

  beforeEach(() => {
    addDoc.mockReset();
    addDoc.mockResolvedValue({ id: 'log-1' });
    updateDoc.mockClear();
    getDocs.mockReset();
    getDocsFromServer.mockReset();
    onSnapshot.mockClear();
    auth.user = { uid: 'staff-1' };
    window.location.hash = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('amb la càmera', () => {
    const originalBarcodeDetector = window.BarcodeDetector;
    const originalPlay = window.HTMLMediaElement?.prototype.play;
    let codiDetectat;

    beforeEach(() => {
      codiDetectat = 'SOCI-7';
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) },
      });
      window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
      window.BarcodeDetector = vi.fn().mockImplementation(function BarcodeDetectorMock() {
        this.detect = vi.fn().mockImplementation(async () => [{ rawValue: codiDetectat }]);
      });
    });

    afterEach(() => {
      window.BarcodeDetector = originalBarcodeDetector;
      window.HTMLMediaElement.prototype.play = originalPlay;
    });

    it('amb el primer intent encara pendent, les deteccions repetides s\'ignoren en silenci: una sola escriptura i cap «ja registrat»', async () => {
      getDocs.mockResolvedValue(SOCI_7());
      const escriptura = diferida();
      addDoc.mockImplementation((col) => (col === 'accessLog' ? escriptura.promise : Promise.resolve({ id: 'e' })));
      renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
      const botoEscanejar = await screen.findByRole('button', { name: 'Escanejar' });

      vi.useFakeTimers();
      fireEvent.click(botoEscanejar);
      await avancar(0);
      // 5 deteccions del mateix QR mentre el servidor encara no ha confirmat.
      await avancar(2000);

      expect(escripturesAccessLog()).toHaveLength(1);
      expect(getDocs).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(/ja s'ha registrat/)).not.toBeInTheDocument();
      expect(screen.getByText('Comprovant el codi…')).toBeInTheDocument();

      escriptura.resolve({ id: 'log-1' });
      await avancar(0);
      expect(screen.getByText('Anna Vidal')).toBeInTheDocument();
      expect(screen.queryByText(/ja s'ha registrat/)).not.toBeInTheDocument();
      expect(registresLog()).toEqual([]);
    });

    it('una detecció que acaba després del resultat del primer intent s\'ignora: ni «ja registrat», ni segon processament, ni log', async () => {
      getDocs.mockResolvedValue(SOCI_7());
      const lectura = diferida();
      const escriptura = diferida();
      addDoc.mockImplementation((col) => (col === 'accessLog' ? escriptura.promise : Promise.resolve({ id: 'e' })));
      const detectades = [];
      window.BarcodeDetector = vi.fn().mockImplementation(function BarcodeDetectorMock() {
        this.detect = vi.fn().mockImplementation(() => {
          detectades.push(1);
          if (detectades.length === 1) return Promise.resolve([{ rawValue: 'SOCI-7' }]);
          if (detectades.length === 2) return lectura.promise;
          return Promise.resolve([]);
        });
      });
      renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
      const botoEscanejar = await screen.findByRole('button', { name: 'Escanejar' });

      vi.useFakeTimers();
      fireEvent.click(botoEscanejar);
      await avancar(0);
      // 1a detecció (400 ms) inicia l'intent; la 2a (800 ms) queda en curs.
      await avancar(800);
      expect(detectades).toHaveLength(2);
      // Mentre la 2a detecció no acaba, no se'n llança cap altra.
      await avancar(1200);
      expect(detectades).toHaveLength(2);

      escriptura.resolve({ id: 'log-1' });
      await avancar(0);
      expect(screen.getByText('Anna Vidal')).toBeInTheDocument();

      lectura.resolve([{ rawValue: 'SOCI-7' }]);
      await avancar(0);
      expect(screen.getByText('Anna Vidal')).toBeInTheDocument();
      expect(screen.queryByText(/ja s'ha registrat/)).not.toBeInTheDocument();
      expect(escripturesAccessLog()).toHaveLength(1);
      expect(getDocs).toHaveBeenCalledTimes(1);
      expect(registresLog()).toEqual([]);
    });

    it('fa servir els lots carregats després d\'obrir la càmera (no una versió antiga de l\'estat)', async () => {
      codiDetectat = 'T-000014';
      getDocsFromServer.mockResolvedValue({ empty: true, docs: [] });
      const { carregarLots } = mockSubscripcions({ lotsCarregats: false });
      renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
      const botoEscanejar = await screen.findByRole('button', { name: 'Escanejar' });

      vi.useFakeTimers();
      fireEvent.click(botoEscanejar);
      await avancar(0);
      act(() => carregarLots());
      await avancar(400);

      expect(screen.getByText('Entrada genèrica registrada (5€)')).toBeInTheDocument();
      expect(escripturesAccessLog()).toHaveLength(1);
    });

    it('durant el reintent d\'una lectura, la càmera no processa cap codi (ni el mateix ni un altre)', async () => {
      const segona = diferida();
      getDocs.mockImplementationOnce(() => new Promise(() => {})).mockImplementationOnce(() => segona.promise);
      renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
      const botoEscanejar = await screen.findByRole('button', { name: 'Escanejar' });

      vi.useFakeTimers();
      fireEvent.click(botoEscanejar);
      await avancar(0);
      await avancar(400);
      await avancar(5000);
      expect(screen.getByText('Reintentant…')).toBeInTheDocument();
      expect(getDocs).toHaveBeenCalledTimes(2);

      await avancar(2000);
      codiDetectat = 'SOCI-8';
      await avancar(2000);
      expect(getDocs).toHaveBeenCalledTimes(2);
      expect(registresLog()).toEqual([]);
      expect(screen.queryByText(/ja s'ha registrat/)).not.toBeInTheDocument();

      segona.resolve(SOCI_7());
      await avancar(0);
      expect(screen.getByText('Anna Vidal')).toBeInTheDocument();
      expect(escripturesAccessLog()).toHaveLength(1);
      expect(getDocs).toHaveBeenCalledTimes(2);
      expect(registresLog().map((r) => r.motiu)).toEqual(['lectura-lenta']);
    });
  });

  describe('reintent automàtic de lectures', () => {
    const lecturaPenjada = () => new Promise(() => {});

    it('si la primera lectura esgota el temps i el reintent funciona, registra l\'entrada una vegada i deixa «lectura-lenta» al log', async () => {
      const segona = diferida();
      getDocs.mockImplementationOnce(lecturaPenjada).mockImplementationOnce(() => segona.promise);
      const user = userEvent.setup();
      renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
      await obrirCodiManual(user);

      vi.useFakeTimers();
      enviarCodiManual('SOCI-7');
      await avancar(4900);
      expect(screen.getByText('Comprovant el codi…')).toBeInTheDocument();
      expect(getDocs).toHaveBeenCalledTimes(1);

      await avancar(100);
      expect(screen.getByRole('status')).toHaveTextContent('Reintentant…');
      expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
      expect(screen.queryByText('Comprovant el codi…')).not.toBeInTheDocument();
      expect(getDocs).toHaveBeenCalledTimes(2);
      expect(registresLog()).toEqual([]);

      await avancar(3000);
      segona.resolve(SOCI_7());
      await avancar(0);
      expect(screen.getByText('Anna Vidal')).toBeInTheDocument();
      expect(screen.queryByText('Reintentant…')).not.toBeInTheDocument();
      expect(screen.queryByText(/sense connexió/i)).not.toBeInTheDocument();
      expect(escripturesAccessLog()).toHaveLength(1);
      expect(registresLog()).toEqual([expect.objectContaining({
        motiu: 'lectura-lenta', codi: 'SOCI-7', metode: 'manual', intents: 2, online: true, ms: 8000,
      })]);
    });

    it('si els dos intents esgoten el temps, avisa de sense connexió als 13 s i el reescaneig es processa sense avís fals', async () => {
      getDocs.mockImplementationOnce(lecturaPenjada).mockImplementationOnce(lecturaPenjada).mockResolvedValue(SOCI_7());
      const user = userEvent.setup();
      renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
      await obrirCodiManual(user);

      vi.useFakeTimers();
      enviarCodiManual('SOCI-7');
      await avancar(5000);
      expect(screen.getByText('Reintentant…')).toBeInTheDocument();
      await avancar(7900);
      expect(screen.queryByText(/No es pot comprovar el soci/)).not.toBeInTheDocument();
      await avancar(100);

      expect(screen.getByText('No es pot comprovar el soci (sense connexió). Reintenta quan hi hagi xarxa.')).toBeInTheDocument();
      expect(escripturesAccessLog()).toHaveLength(0);
      expect(registresLog()).toEqual([expect.objectContaining({
        motiu: 'sense-connexio', codi: 'SOCI-7', intents: 2, ms: 13000, detall: expect.stringContaining('2 intents'),
      })]);

      fireEvent.click(screen.getByRole('button', { name: 'Escanejar un altre' }));
      enviarCodiManual('SOCI-7');
      await avancar(0);
      expect(screen.getByText('Anna Vidal')).toBeInTheDocument();
      expect(screen.queryByText(/ja s'ha registrat|pendent d'enviar-se/)).not.toBeInTheDocument();
      expect(getDocs).toHaveBeenCalledTimes(3);
      expect(escripturesAccessLog()).toHaveLength(1);
    });

    it('una lectura que arriba abans de 5 s no es reintenta ni deixa rastre al log', async () => {
      const lectura = diferida();
      getDocs.mockImplementationOnce(() => lectura.promise);
      const user = userEvent.setup();
      renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
      await obrirCodiManual(user);

      vi.useFakeTimers();
      enviarCodiManual('SOCI-7');
      await avancar(4900);
      lectura.resolve(SOCI_7());
      await avancar(0);
      expect(screen.getByText('Anna Vidal')).toBeInTheDocument();
      await avancar(10000);
      expect(getDocs).toHaveBeenCalledTimes(1);
      expect(registresLog()).toEqual([]);
    });

    it('la comprovació de tiquet repetit també es reintenta una vegada', async () => {
      getDocsFromServer.mockImplementationOnce(lecturaPenjada).mockResolvedValueOnce({ empty: true, docs: [] });
      mockSubscripcions();
      const user = userEvent.setup();
      renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
      await obrirCodiManual(user);

      vi.useFakeTimers();
      enviarCodiManual('T-000014');
      await avancar(5000);
      await avancar(0);
      expect(screen.getByText('Entrada genèrica registrada (5€)')).toBeInTheDocument();
      expect(getDocsFromServer).toHaveBeenCalledTimes(2);
      expect(escripturesAccessLog()).toHaveLength(1);
      expect(registresLog()).toEqual([expect.objectContaining({
        motiu: 'lectura-lenta', codi: 'T-000014', codiTiquet: 'T-000014', intents: 2,
      })]);
    });

    it('si la comprovació de tiquet esgota els dos intents, no el registra i ho deixa al log', async () => {
      getDocsFromServer.mockImplementation(lecturaPenjada);
      mockSubscripcions();
      const user = userEvent.setup();
      renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
      await obrirCodiManual(user);

      vi.useFakeTimers();
      enviarCodiManual('T-000014');
      await avancar(13000);
      expect(screen.getByText("No es pot comprovar si aquest tiquet ja s'ha utilitzat (sense connexió). Reintenta quan hi hagi xarxa.")).toBeInTheDocument();
      expect(getDocsFromServer).toHaveBeenCalledTimes(2);
      expect(escripturesAccessLog()).toHaveLength(0);
      expect(registresLog()).toEqual([expect.objectContaining({
        motiu: 'sense-connexio', codiTiquet: 'T-000014', intents: 2, detall: expect.stringContaining('2 intents'),
      })]);
    });

    it('les escriptures no es reintenten: un addDoc que no es resol dona l\'avís de pendent als 8 s, sense segon addDoc', async () => {
      getDocs.mockResolvedValue(SOCI_7());
      addDoc.mockImplementation((col) => (col === 'accessLog' ? new Promise(() => {}) : Promise.resolve({ id: 'e' })));
      const user = userEvent.setup();
      renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
      await obrirCodiManual(user);

      vi.useFakeTimers();
      enviarCodiManual('SOCI-7');
      await avancar(7900);
      expect(screen.queryByText('Reintentant…')).not.toBeInTheDocument();
      expect(screen.queryByText(/Sense connexió estable/)).not.toBeInTheDocument();
      await avancar(100);
      expect(screen.getByText(/Sense connexió estable/)).toBeInTheDocument();
      await avancar(30000);
      expect(escripturesAccessLog()).toHaveLength(1);
      expect(registresLog().map((r) => r.motiu)).toEqual(['timeout-escriptura']);
    });

    it('si es desmunta la pantalla durant el reintent, no escriu l\'entrada encara que la lectura arribi després (només «abandonat» al log)', async () => {
      const segona = diferida();
      getDocs.mockImplementationOnce(lecturaPenjada).mockImplementationOnce(() => segona.promise);
      const user = userEvent.setup();
      const { unmount } = renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
      await obrirCodiManual(user);

      vi.useFakeTimers();
      enviarCodiManual('SOCI-7');
      await avancar(5000);
      expect(screen.getByText('Reintentant…')).toBeInTheDocument();
      unmount();
      segona.resolve(SOCI_7());
      await avancar(0);
      await avancar(20000);
      expect(escripturesAccessLog()).toHaveLength(0);
      expect(registresLog()).toEqual([expect.objectContaining({
        motiu: 'abandonat', codi: 'SOCI-7', metode: 'manual', ms: 5000, sessionId: 'sessio-1',
      })]);
    });

    it('si es desmunta la pantalla durant el reintent i la lectura no arriba mai, només queda «abandonat» al log', async () => {
      getDocs.mockImplementation(lecturaPenjada);
      const user = userEvent.setup();
      const { unmount } = renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
      await obrirCodiManual(user);

      vi.useFakeTimers();
      enviarCodiManual('SOCI-7');
      await avancar(5000);
      unmount();
      await avancar(20000);
      expect(escripturesAccessLog()).toHaveLength(0);
      expect(registresLog().map((r) => r.motiu)).toEqual(['abandonat']);
    });

    it('si canvia la sessió activa durant el reintent, avisa, ho deixa al log i permet reescanejar de seguida', async () => {
      const segona = diferida();
      getDocs.mockImplementationOnce(lecturaPenjada).mockImplementationOnce(() => segona.promise)
        .mockResolvedValue(SOCI_7());
      let emetreSessio;
      onSnapshot.mockImplementationOnce((...args) => {
        emetreSessio = args.at(-1);
        emetreSessio({ docs: [{ id: SESSIO_ACTIVA.id, data: () => SESSIO_ACTIVA }] });
        return () => {};
      });
      const user = userEvent.setup();
      renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
      await obrirCodiManual(user);

      vi.useFakeTimers();
      enviarCodiManual('SOCI-7');
      await avancar(5000);
      expect(screen.getByText('Reintentant…')).toBeInTheDocument();
      act(() => emetreSessio({ docs: [{ id: 'sessio-2', data: () => ({ titol: 'Una altra' }) }] }));
      await avancar(0);
      expect(screen.queryByText('Reintentant…')).not.toBeInTheDocument();
      expect(screen.getByText('La sessió activa ha canviat. Torna a escanejar el codi.')).toBeInTheDocument();
      expect(registresLog()).toEqual([expect.objectContaining({
        motiu: 'sessio-canviada', codi: 'SOCI-7', metode: 'manual', ms: 5000, sessionId: 'sessio-1',
      })]);

      // La lectura tardana de l'intent abandonat no escriu res.
      segona.resolve(SOCI_7());
      await avancar(20000);
      expect(escripturesAccessLog()).toHaveLength(0);
      expect(screen.queryByText('Anna Vidal')).not.toBeInTheDocument();

      // Single-flight i ultimCodiRef alliberats: el reescaneig es processa a la sessió nova.
      fireEvent.click(screen.getByRole('button', { name: 'Escanejar un altre' }));
      enviarCodiManual('SOCI-7');
      await avancar(0);
      expect(screen.getByText('Anna Vidal')).toBeInTheDocument();
      expect(screen.queryByText(/ja s'ha registrat|pendent d'enviar-se/)).not.toBeInTheDocument();
      expect(escripturesAccessLog()).toHaveLength(1);
      expect(escripturesAccessLog()[0][1].sessionId).toBe('sessio-2');
    });

    it('si canvia la sessió amb l\'escriptura en curs, mostra el resultat normal i el reescaneig no duplica l\'entrada', async () => {
      getDocs.mockResolvedValue(SOCI_7());
      const escriptura = diferida();
      addDoc.mockImplementation((col) => (col === 'accessLog' ? escriptura.promise : Promise.resolve({ id: 'e' })));
      let emetreSessio;
      onSnapshot.mockImplementationOnce((...args) => {
        emetreSessio = args.at(-1);
        emetreSessio({ docs: [{ id: SESSIO_ACTIVA.id, data: () => SESSIO_ACTIVA }] });
        return () => {};
      });
      const user = userEvent.setup();
      renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
      await obrirCodiManual(user);

      vi.useFakeTimers();
      enviarCodiManual('SOCI-7');
      await avancar(1000);
      expect(escripturesAccessLog()).toHaveLength(1);
      act(() => emetreSessio({ docs: [{ id: 'sessio-2', data: () => ({ titol: 'Una altra' }) }] }));
      await avancar(0);
      escriptura.resolve({ id: 'log-1' });
      await avancar(0);

      expect(screen.getByText('Anna Vidal')).toBeInTheDocument();
      expect(screen.queryByText(/La sessió activa ha canviat/)).not.toBeInTheDocument();
      expect(escripturesAccessLog()[0][1].sessionId).toBe('sessio-1');
      expect(registresLog()).toEqual([expect.objectContaining({
        motiu: 'sessio-canviada-escrit', codi: 'SOCI-7', sessionId: 'sessio-1',
      })]);

      fireEvent.click(screen.getByRole('button', { name: 'Escanejar un altre' }));
      enviarCodiManual('SOCI-7');
      await avancar(0);
      expect(screen.getByText("Aquest codi ja s'ha registrat fa un moment.")).toBeInTheDocument();
      expect(escripturesAccessLog()).toHaveLength(1);
    });

    it('si el reintent respon buit des de la caché, només queda «sense-connexio» al log (sense «lectura-lenta»)', async () => {
      getDocs.mockImplementationOnce(lecturaPenjada)
        .mockResolvedValueOnce({ empty: true, docs: [], metadata: { fromCache: true } });
      const user = userEvent.setup();
      renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
      await obrirCodiManual(user);

      vi.useFakeTimers();
      enviarCodiManual('SOCI-7');
      await avancar(5000);
      await avancar(0);
      expect(screen.getByText('No es pot comprovar el soci (sense connexió). Reintenta quan hi hagi xarxa.')).toBeInTheDocument();
      expect(registresLog()).toEqual([expect.objectContaining({
        motiu: 'sense-connexio', codi: 'SOCI-7', desdeCache: true, intents: 2,
      })]);
    });

    it('en mode prova, el reintent no escriu res, ni al log', async () => {
      getDocs.mockImplementationOnce(lecturaPenjada).mockResolvedValueOnce(SOCI_7());
      const user = userEvent.setup();
      renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
      await user.click(screen.getByRole('button', { name: 'Mode prova: desactivat' }));
      await obrirCodiManual(user);

      vi.useFakeTimers();
      enviarCodiManual('SOCI-7');
      await avancar(5000);
      await avancar(0);
      expect(screen.getByText('Anna Vidal')).toBeInTheDocument();
      expect(getDocs).toHaveBeenCalledTimes(2);
      expect(addDoc).not.toHaveBeenCalled();
    });
  });

  it('si el primer intent falla per una excepció, el reintent immediat es processa sense el fals «ja registrat»', async () => {
    getDocs.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce(SOCI_7());
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    await obrirCodiManual(user);
    enviarCodiManual('SOCI-7');
    expect(await screen.findByText("No s'ha pogut registrar l'entrada. Torna-ho a provar.")).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Escanejar un altre' }));
    enviarCodiManual('SOCI-7');
    expect(await screen.findByText('Anna Vidal')).toBeInTheDocument();
    expect(screen.queryByText(/ja s'ha registrat/)).not.toBeInTheDocument();
    expect(escripturesAccessLog()).toHaveLength(1);
  });

  it('si l\'escriptura falla, ho registra com a error-escriptura i el reintent es processa', async () => {
    getDocs.mockResolvedValue(SOCI_7());
    addDoc
      .mockImplementationOnce(() => Promise.reject(new Error('permission-denied')))
      .mockResolvedValue({ id: 'log-1' });
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    await obrirCodiManual(user);
    enviarCodiManual('SOCI-7');
    expect(await screen.findByText("No s'ha pogut registrar l'entrada. Torna-ho a provar.")).toBeInTheDocument();
    expect(registresLog()).toEqual([expect.objectContaining({
      motiu: 'error-escriptura', codi: 'SOCI-7', metode: 'manual', detall: 'permission-denied', online: true, ms: expect.any(Number),
    })]);

    await user.click(screen.getByRole('button', { name: 'Escanejar un altre' }));
    enviarCodiManual('SOCI-7');
    expect(await screen.findByText('Anna Vidal')).toBeInTheDocument();
    expect(screen.queryByText(/ja s'ha registrat/)).not.toBeInTheDocument();
    expect(escripturesAccessLog()).toHaveLength(2);
  });

  it('el reescaneig d\'un codi ja registrat dins 3 s mostra l\'avís i queda al log com a debounce', async () => {
    getDocs.mockResolvedValue(SOCI_7());
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    await obrirCodiManual(user);
    enviarCodiManual('SOCI-7');
    expect(await screen.findByText('Anna Vidal')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Escanejar un altre' }));
    enviarCodiManual('SOCI-7');
    expect(await screen.findByText("Aquest codi ja s'ha registrat fa un moment.")).toBeInTheDocument();
    expect(escripturesAccessLog()).toHaveLength(1);
    expect(registresLog()).toEqual([expect.objectContaining({
      motiu: 'debounce', codi: 'SOCI-7', metode: 'manual', resultatAnterior: 'registrat', ms: expect.any(Number),
    })]);
  });

  it('si l\'escriptura no es confirma en 8 s, avisa, la deixa pendent i no la duplica en reescanejar', async () => {
    getDocs.mockResolvedValue(SOCI_7());
    const escriptura = diferida();
    addDoc.mockImplementation((col) => (col === 'accessLog' ? escriptura.promise : Promise.resolve({ id: 'e' })));
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    await obrirCodiManual(user);

    vi.useFakeTimers();
    enviarCodiManual('SOCI-7');
    await avancar(7900);
    expect(screen.queryByText(/Sense connexió estable/)).not.toBeInTheDocument();
    await avancar(200);

    expect(screen.getByText(/Sense connexió estable/)).toBeInTheDocument();
    expect(screen.getByText(/NO tornis a escanejar aquest codi/)).toBeInTheDocument();
    expect(registresLog()).toEqual([expect.objectContaining({
      motiu: 'timeout-escriptura', codi: 'SOCI-7', metode: 'manual', ms: expect.any(Number),
    })]);

    fireEvent.click(screen.getByRole('button', { name: 'Escanejar un altre' }));
    enviarCodiManual('SOCI-7');
    await avancar(0);
    expect(screen.getByText("Aquest codi és pendent d'enviar-se; espera que torni la connexió.")).toBeInTheDocument();
    expect(escripturesAccessLog()).toHaveLength(1);
    expect(registresLog().at(-1)).toEqual(expect.objectContaining({ motiu: 'pendent-enviar', codi: 'SOCI-7' }));

    // El servidor acaba confirmant l'escriptura original: el codi passa a registrat.
    escriptura.resolve({ id: 'log-1' });
    await avancar(0);
    fireEvent.click(screen.getByRole('button', { name: 'Escanejar un altre' }));
    enviarCodiManual('SOCI-7');
    await avancar(0);
    expect(screen.getByText("Aquest codi ja s'ha registrat fa un moment.")).toBeInTheDocument();
    expect(escripturesAccessLog()).toHaveLength(1);
  });

  it('comprova al servidor si el tiquet ja s\'ha utilitzat; si no pot, ho diu i no el registra', async () => {
    getDocsFromServer.mockRejectedValueOnce(new Error('Failed to get documents from server'));
    mockSubscripcions();
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    await obrirCodiManual(user);
    enviarCodiManual('T-000014');
    expect(await screen.findByText("No es pot comprovar si aquest tiquet ja s'ha utilitzat (sense connexió). Reintenta quan hi hagi xarxa.")).toBeInTheDocument();
    expect(getDocs).not.toHaveBeenCalled();
    expect(escripturesAccessLog()).toHaveLength(0);
    expect(screen.queryByText('Codi ja utilitzat')).not.toBeInTheDocument();
    expect(registresLog()).toEqual([expect.objectContaining({
      motiu: 'sense-connexio', codi: 'T-000014', codiTiquet: 'T-000014', detall: 'Failed to get documents from server',
    })]);
  });

  it('si la consulta de socis torna buida des de la caché, no diu que el soci no existeix', async () => {
    getDocs.mockResolvedValueOnce({ empty: true, docs: [], metadata: { fromCache: true } });
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    await obrirCodiManual(user);
    enviarCodiManual('SOCI-7');
    expect(await screen.findByText('No es pot comprovar el soci (sense connexió). Reintenta quan hi hagi xarxa.')).toBeInTheDocument();
    expect(screen.queryByText(/No hi ha cap soci/)).not.toBeInTheDocument();
    expect(registresLog()).toEqual([expect.objectContaining({ motiu: 'sense-connexio', codi: 'SOCI-7', desdeCache: true })]);
  });

  it('si els lots encara no s\'han carregat, ho diu i ho deixa al log', async () => {
    mockSubscripcions({ lotsCarregats: false });
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    await obrirCodiManual(user);
    enviarCodiManual('T-000014');
    expect(await screen.findByText('Encara carregant els lots de tiquets. Torna-ho a provar.')).toBeInTheDocument();
    expect(registresLog()).toEqual([expect.objectContaining({ motiu: 'lots-no-carregats', codi: 'T-000014' })]);
  });

  it('el registre de diagnòstic no peta si no hi ha usuari', async () => {
    auth.user = undefined;
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    await obrirCodiManual(user);
    enviarCodiManual('XYZ');
    expect(await screen.findByText('Codi no reconegut: XYZ')).toBeInTheDocument();
    expect(registresLog()).toEqual([expect.objectContaining({ motiu: 'codi-desconegut', escanejatPer: null })]);
  });

  it('«Comptar igualment» amb doble toc i xarxa lenta només crea una entrada i mostra «Registrant…»', async () => {
    getDocsFromServer.mockResolvedValueOnce({ empty: false, docs: [{ data: () => ({ timestamp: null }) }] });
    mockSubscripcions();
    const escriptura = diferida();
    addDoc.mockImplementation((col) => (col === 'accessLog' ? escriptura.promise : Promise.resolve({ id: 'e' })));
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    await obrirCodiManual(user);
    enviarCodiManual('T-000014');
    const boto = await screen.findByRole('button', { name: 'Comptar igualment' });
    fireEvent.click(boto);
    fireEvent.click(boto);
    await dialegConfirmacio();
    expect(document.querySelectorAll('dialog.dialeg-confirmacio')).toHaveLength(1);
    await acceptaDialeg('Compta igualment');
    expect(hiHaDialegConfirmacio()).toBe(false);
    await waitFor(() => expect(escripturesAccessLog()).toHaveLength(1));
    fireEvent.click(boto);
    expect(hiHaDialegConfirmacio()).toBe(false);
    expect(escripturesAccessLog()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Registrant…' })).toBeDisabled();

    await act(async () => { escriptura.resolve({ id: 'log-1' }); });
    expect(await screen.findByText('Entrada genèrica registrada (5€)')).toBeInTheDocument();
    expect(escripturesAccessLog()).toHaveLength(1);
  });

  it('si l\'avís desapareix mentre la confirmació és oberta, acceptar-la no registra res', async () => {
    getDocsFromServer.mockResolvedValueOnce({ empty: false, docs: [{ data: () => ({ timestamp: null }) }] });
    mockSubscripcions();
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    await obrirCodiManual(user);
    enviarCodiManual('T-000014');
    fireEvent.click(await screen.findByRole('button', { name: 'Comptar igualment' }));
    await dialegConfirmacio();
    // Sense showModal (jsdom) el fons no és inert: l'avís es pot tancar amb el diàleg obert.
    fireEvent.click(screen.getByRole('button', { name: 'Escanejar un altre' }));
    expect(screen.queryByText('Codi ja utilitzat')).not.toBeInTheDocument();
    await acceptaDialeg('Compta igualment');
    expect(hiHaDialegConfirmacio()).toBe(false);
    await act(async () => {});
    expect(escripturesAccessLog()).toHaveLength(0);
  });

  it('mentre «Comptar igualment» escriu, no es pot tornar a la càmera ni tancar (el resultat no cau sobre la persona següent)', async () => {
    getDocsFromServer.mockResolvedValueOnce({ empty: false, docs: [{ data: () => ({ timestamp: null }) }] });
    mockSubscripcions();
    const escriptura = diferida();
    addDoc.mockImplementation((col) => (col === 'accessLog' ? escriptura.promise : Promise.resolve({ id: 'e' })));
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    await obrirCodiManual(user);
    enviarCodiManual('T-000014');
    fireEvent.click(await screen.findByRole('button', { name: 'Comptar igualment' }));
    await acceptaDialeg('Compta igualment');
    await waitFor(() => expect(escripturesAccessLog()).toHaveLength(1));

    expect(screen.getByRole('button', { name: 'Escanejar un altre' })).toBeDisabled();
    expect(screen.getByRole('button', { name: "Tancar i tornar a l'inici" })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Escanejar un altre' }));
    expect(screen.queryByLabelText('Codi manual')).not.toBeInTheDocument();

    await act(async () => { escriptura.resolve({ id: 'log-1' }); });
    expect(await screen.findByText('Entrada genèrica registrada (5€)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Escanejar un altre' })).toBeEnabled();
  });

  it('«Comptar igualment» respecta el mode prova activat després de veure l\'avís', async () => {
    getDocsFromServer.mockResolvedValueOnce({ empty: false, docs: [{ data: () => ({ timestamp: null }) }] });
    mockSubscripcions();
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    await obrirCodiManual(user);
    enviarCodiManual('T-000014');
    await screen.findByRole('button', { name: 'Comptar igualment' });
    await user.click(screen.getByRole('button', { name: 'Mode prova: desactivat' }));
    await user.click(screen.getByRole('button', { name: 'Comptar igualment' }));
    await acceptaDialeg('Compta igualment');
    expect(await screen.findByText('Entrada genèrica (5€)')).toBeInTheDocument();
    expect(escripturesAccessLog()).toHaveLength(0);
  });

  it('si una escriptura pendent acaba fallant, ho avisa de manera persistent i allibera el codi', async () => {
    getDocs.mockResolvedValue(SOCI_7());
    const escriptura = diferida();
    addDoc.mockImplementation((col) => (col === 'accessLog' ? escriptura.promise : Promise.resolve({ id: 'e' })));
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    await obrirCodiManual(user);

    vi.useFakeTimers();
    enviarCodiManual('SOCI-7');
    await avancar(8000);
    expect(screen.getByText(/Sense connexió estable/)).toBeInTheDocument();

    escriptura.reject(new Error('permission-denied'));
    await avancar(0);
    const avis = screen.getByRole('alert');
    expect(avis).toHaveTextContent(/Una entrada no s'ha pogut enviar: SOCI-7 \(\d{2}:\d{2}\)\. Torna-la a escanejar\./);
    expect(registresLog().at(-1)).toEqual(expect.objectContaining({ motiu: 'error-escriptura', codi: 'SOCI-7' }));

    // No desapareix sol.
    await avancar(60000);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // El codi s'ha alliberat: es pot reescanejar i es registra de nou.
    addDoc.mockResolvedValue({ id: 'log-2' });
    fireEvent.click(screen.getByRole('button', { name: 'Escanejar un altre' }));
    enviarCodiManual('SOCI-7');
    await avancar(0);
    expect(screen.getByText('Anna Vidal')).toBeInTheDocument();
    expect(screen.queryByText(/pendent d'enviar-se/)).not.toBeInTheDocument();
    expect(escripturesAccessLog()).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: "Descartar l'avís d'entrada no enviada" }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un soci pendent d\'enviar amb SOCI-N també es detecta si s\'escaneja pel carnet (CARNET-)', async () => {
    const soci = {
      ref: { id: 'soci-7' },
      data: () => ({
        nom: 'Anna', cognoms: 'Vidal', numeroSoci: 7, ultimPagament: '2026-01-01', inicPeriode: '2026-01-15', tokenCarnet: 'abc',
      }),
    };
    getDocs.mockResolvedValue({ empty: false, docs: [soci] });
    addDoc.mockImplementation((col) => (col === 'accessLog' ? new Promise(() => {}) : Promise.resolve({ id: 'e' })));
    const user = userEvent.setup();
    renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
    await obrirCodiManual(user);

    vi.useFakeTimers();
    enviarCodiManual('SOCI-7');
    await avancar(8000);
    fireEvent.click(screen.getByRole('button', { name: 'Escanejar un altre' }));
    enviarCodiManual('CARNET-abc');
    await avancar(0);
    expect(screen.getByText("Aquest codi és pendent d'enviar-se; espera que torni la connexió.")).toBeInTheDocument();
    expect(escripturesAccessLog()).toHaveLength(1);
  });

  describe('indicador de connexió', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('mostra «Sense connexió» quan el dispositiu perd la xarxa i ho amaga quan torna', async () => {
      renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
      await screen.findByRole('button', { name: 'Escanejar' });
      expect(screen.queryByText('Sense connexió')).not.toBeInTheDocument();

      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      act(() => { window.dispatchEvent(new Event('offline')); });
      expect(screen.getByText('Sense connexió')).toHaveAttribute('role', 'status');
      expect(screen.getByText('Sense connexió')).toHaveAttribute('aria-live', 'polite');

      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
      act(() => { window.dispatchEvent(new Event('online')); });
      expect(screen.queryByText('Sense connexió')).not.toBeInTheDocument();
    });

    it('mostra quantes entrades de la sessió estan pendents d\'enviar al servidor', async () => {
      const entrada = (pendent) => ({
        data: () => ({ tipus: 'generic', preuAplicat: 5 }),
        metadata: { hasPendingWrites: pendent },
      });
      mockSubscripcions({ accessLogDocs: [entrada(true), entrada(true), entrada(false)] });
      renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
      expect(await screen.findByText("2 entrades pendents d'enviar")).toHaveAttribute('role', 'status');
      // La subscripció a l'accessLog inclou els canvis de metadades.
      expect(onSnapshot.mock.calls[2][1]).toEqual({ includeMetadataChanges: true });
    });
  });

  describe('fons amb la imatge de la sessió activa', () => {
    const ambSessio = (dades) => onSnapshot.mockImplementationOnce((...args) => {
      args.at(-1)({ docs: [{ id: SESSIO_ACTIVA.id, data: () => ({ ...SESSIO_ACTIVA, ...dades }) }] });
      return () => {};
    });
    const fons = (container) => container.querySelector('.escaneig__contingut').style.backgroundImage;

    it('fa servir publica.cartell encara que imatgeUrl estigui trencada o buida', async () => {
      for (const imatgeUrl of ['https://cineclubrodadebera.cat/programacio/2026/pig/poster_hu123.jpg', '']) {
        ambSessio({ imatgeUrl, publica: { cartell: 'https://firebasestorage.googleapis.com/v0/b/b/o/web%2Fsessions%2Fpig%2Fposter.jpg?alt=media' } });
        const { container, unmount } = renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
        await screen.findByRole('button', { name: 'Escanejar' });
        expect(fons(container)).toContain('https://firebasestorage.googleapis.com/v0/b/b/o/web%2Fsessions%2Fpig%2Fposter.jpg?alt=media');
        expect(fons(container)).not.toContain('poster_hu');
        unmount();
      }
    });

    it('sense publica fa servir imatgeUrl', async () => {
      ambSessio({ imatgeUrl: 'https://cineclubrodadebera.cat/programacio/2026/pig/poster_hu123.jpg' });
      const { container } = renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
      await screen.findByRole('button', { name: 'Escanejar' });
      expect(fons(container)).toContain('https://cineclubrodadebera.cat/programacio/2026/pig/poster_hu123.jpg');
    });

    it('sense cap imatge no posa fons', async () => {
      ambSessio({});
      const { container } = renderAmbConfirmacio(<MemoryRouter><EscaneigPage /></MemoryRouter>);
      await screen.findByRole('button', { name: 'Escanejar' });
      expect(fons(container)).toBe('');
    });
  });
});
