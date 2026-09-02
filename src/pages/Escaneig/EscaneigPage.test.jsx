import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('barcode-detector/polyfill', () => ({}));
vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'staff-1' } }) }));

const SESSIO_ACTIVA = { id: 'sessio-1', titol: 'The Artist' };
const LOT_TIQUETS = { numeroInicial: 1, quantitat: 150, preu: 5 };

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  doc: vi.fn(),
  serverTimestamp: vi.fn(() => 'TIMESTAMP'),
  addDoc: vi.fn().mockResolvedValue({ id: 'log-1' }),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  getDocs: vi.fn(),
  onSnapshot: vi.fn((q, callback) => {
    // La primera crida des del component és la subscripció a la sessió activa.
    callback({ docs: [{ id: SESSIO_ACTIVA.id, data: () => SESSIO_ACTIVA }] });
    return () => {};
  }),
}));

import {
  addDoc, getDocs, onSnapshot, updateDoc, where,
} from 'firebase/firestore';
import EscaneigPage from './EscaneigPage';
import { formatData } from '../../lib/data';

async function obrirCodiManual(user) {
  await user.click(await screen.findByRole('button', { name: 'Introduir codi manualment' }));
  return screen.getByLabelText('Codi manual');
}

describe('EscaneigPage', () => {
  beforeEach(() => {
    addDoc.mockClear();
    updateDoc.mockClear();
    getDocs.mockReset();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    window.confirm.mockClear();
    window.location.hash = '';
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
    expect(await screen.findByText('Anna Vidal')).toBeInTheDocument();
    expect(screen.getByText('Al dia')).toHaveClass('badge--al-dia');
    expect(screen.getByText(/Venç el/)).not.toHaveClass('escaneig__missatge-venciment--avis');
    expect(addDoc.mock.calls[0][1]).toEqual({
      sessionId: 'sessio-1', timestamp: 'TIMESTAMP', escanejatPer: 'staff-1', tipus: 'soci', numeroSoci: 7,
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
    render(<EscaneigPage />);
    const input = await obrirCodiManual(user);
    await user.type(input, 'CARNET-abc-123');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Anna Vidal')).toBeInTheDocument();
    expect(addDoc.mock.calls[0][1]).toEqual({
      sessionId: 'sessio-1', timestamp: 'TIMESTAMP', escanejatPer: 'staff-1', tipus: 'soci', numeroSoci: 7,
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
    render(<EscaneigPage />);
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
    render(<EscaneigPage />);
    const input = await obrirCodiManual(user);
    await user.type(input, 'SOCI-7');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Anna Vidal')).toBeInTheDocument();
    expect(screen.getByText('Soci desactivat: Mal comportament')).toBeInTheDocument();
    expect(addDoc).not.toHaveBeenCalled();
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
    expect(screen.getByText('Aquest tiquet ja no és vàlid per accedir-hi')).toBeInTheDocument();
    expect(getDocs).not.toHaveBeenCalled();
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('mostra un error si el tiquet no pertany a cap lot conegut, sense registrar-lo amb preu 0', async () => {
    onSnapshot
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [{ id: SESSIO_ACTIVA.id, data: () => SESSIO_ACTIVA }] });
        return () => {};
      })
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [{ data: () => LOT_TIQUETS }] });
        return () => {};
      })
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [] });
        return () => {};
      });
    const user = userEvent.setup();
    render(<EscaneigPage />);
    const input = await obrirCodiManual(user);
    await user.type(input, 'T-000999');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('El codi T-000999 no pertany a cap lot de tiquets conegut.')).toBeInTheDocument();
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
    expect(screen.getByText('Comprova el número al carnet o al llistat de socis')).toBeInTheDocument();
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('registra un tiquet genèric nou amb el preu del lot de tiquets', async () => {
    getDocs.mockResolvedValueOnce({ empty: true, docs: [] });
    onSnapshot
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [{ id: SESSIO_ACTIVA.id, data: () => SESSIO_ACTIVA }] });
        return () => {};
      })
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [{ data: () => LOT_TIQUETS }] });
        return () => {};
      })
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [] });
        return () => {};
      });
    const user = userEvent.setup();
    render(<EscaneigPage />);
    const input = await obrirCodiManual(user);
    await user.type(input, 'T-000014');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Entrada genèrica registrada (5€)')).toBeInTheDocument();
    expect(addDoc.mock.calls[0][1]).toEqual({
      sessionId: 'sessio-1', timestamp: 'TIMESTAMP', escanejatPer: 'staff-1',
      tipus: 'generic', codiTiquet: 'T-000014', preuAplicat: 5,
    });
  });

  it('avisa si el tiquet genèric ja s\'ha escanejat i només el registra en confirmar', async () => {
    const dataEscaneigPrevi = new Date('2026-03-05T20:00:00');
    getDocs.mockResolvedValueOnce({
      empty: false,
      docs: [{ data: () => ({ timestamp: { toDate: () => dataEscaneigPrevi } }) }],
    });
    onSnapshot
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [{ id: SESSIO_ACTIVA.id, data: () => SESSIO_ACTIVA }] });
        return () => {};
      })
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [{ data: () => LOT_TIQUETS }] });
        return () => {};
      })
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [] });
        return () => {};
      });
    const user = userEvent.setup();
    render(<EscaneigPage />);
    const input = await obrirCodiManual(user);
    await user.type(input, 'T-000014');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    const dataFormatada = `05/03/2026 ${dataEscaneigPrevi.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' })}`;
    expect(await screen.findByText('Codi ja utilitzat')).toBeInTheDocument();
    expect(await screen.findByText(new RegExp(`ja s'ha escanejat \\(${dataFormatada.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`))).toBeInTheDocument();
    expect(addDoc).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Comptar igualment' }));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(addDoc.mock.calls[0][1].codiTiquet).toBe('T-000014');
  });

  it('no registra el codi repetit si es cancel·la la confirmació', async () => {
    window.confirm.mockReturnValueOnce(false);
    getDocs.mockResolvedValueOnce({
      empty: false,
      docs: [{ data: () => ({ timestamp: null }) }],
    });
    onSnapshot
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [{ id: SESSIO_ACTIVA.id, data: () => SESSIO_ACTIVA }] });
        return () => {};
      })
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [{ data: () => LOT_TIQUETS }] });
        return () => {};
      })
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [] });
        return () => {};
      });
    const user = userEvent.setup();
    render(<EscaneigPage />);
    const input = await obrirCodiManual(user);
    await user.type(input, 'T-000014');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    await user.click(await screen.findByRole('button', { name: 'Comptar igualment' }));
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('mostra un error per a un codi no reconegut', async () => {
    const user = userEvent.setup();
    render(<EscaneigPage />);
    const input = await obrirCodiManual(user);
    await user.type(input, 'XYZ');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Codi no reconegut: XYZ')).toBeInTheDocument();
    expect(screen.getByText('Els codis vàlids comencen per SOCI- o T-')).toBeInTheDocument();
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
    onSnapshot
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [{ id: SESSIO_ACTIVA.id, data: () => SESSIO_ACTIVA }] });
        return () => {};
      })
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [{ data: () => LOT_TIQUETS }] });
        return () => {};
      })
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [] });
        return () => {};
      });
    const user = userEvent.setup();
    render(<EscaneigPage />);
    const input = await obrirCodiManual(user);
    await user.type(input, 'T-000014');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Entrada genèrica registrada (5€)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Escanejar un altre' }));
    const inputNou = screen.getByLabelText('Codi manual');
    await user.type(inputNou, 'T-000014');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    // El debounce ignora el segon enviament dins la finestra: no es torna a
    // consultar Firestore ni es duplica el registre, però s'informa l'operador.
    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Aquest codi ja s'ha registrat fa un moment.")).toBeInTheDocument();
  });

  it('després d\'un escaneig, amaga el formulari i mostra el missatge amb "Escanejar un altre"', async () => {
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
    expect(await screen.findByText('Anna Vidal')).toBeInTheDocument();
    expect(screen.queryByLabelText('Codi manual')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Escanejar un altre' })).toBeInTheDocument();
  });

  it('en clicar "Escanejar un altre", neteja el missatge anterior i torna a mostrar el camp manual', async () => {
    const user = userEvent.setup();
    render(<EscaneigPage />);
    const input = await obrirCodiManual(user);
    await user.type(input, 'XYZ');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Codi no reconegut: XYZ')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Escanejar un altre' }));
    expect(screen.queryByText('Codi no reconegut: XYZ')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Codi manual')).toBeInTheDocument();
  });

  it('afegeix la classe escaneig-body al body i la treu en desmuntar', async () => {
    const { unmount } = render(<EscaneigPage />);
    await screen.findByRole('button', { name: 'Escanejar' });
    expect(document.body).toHaveClass('escaneig-body');
    unmount();
    expect(document.body).not.toHaveClass('escaneig-body');
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

  it('amb #ok a la URL mostra directament el missatge de prova (mode mockup)', async () => {
    window.location.hash = '#ok';
    render(<EscaneigPage />);
    expect(await screen.findByText('Anna Vidal')).toBeInTheDocument();
    expect(screen.getByText('Al dia')).toHaveClass('badge--al-dia');
    expect(screen.getByText('Mode mockup: #ok')).toBeInTheDocument();
  });

  it('amb #codi a la URL mostra directament el formulari manual (mode mockup)', async () => {
    window.location.hash = '#codi';
    render(<EscaneigPage />);
    expect(await screen.findByLabelText('Codi manual')).toBeInTheDocument();
  });

  it('sense DEV, el fragment de mockup s\'ignora i cal una sessió real activa', async () => {
    vi.stubEnv('DEV', false);
    onSnapshot.mockImplementationOnce((q, callback) => {
      callback({ docs: [] });
      return () => {};
    });
    window.location.hash = '#ok';
    render(<EscaneigPage />);
    expect(await screen.findByText(/No hi ha cap sessió activa/)).toBeInTheDocument();
    expect(screen.queryByText('Anna Vidal')).not.toBeInTheDocument();
    vi.unstubAllEnvs();
  });

  it('canviar el fragment de la URL sense recarregar actualitza el mockup mostrat', async () => {
    window.location.hash = '#ok';
    render(<EscaneigPage />);
    await screen.findByText('Anna Vidal');

    window.location.hash = '#error';
    window.dispatchEvent(new Event('hashchange'));
    expect(await screen.findByText('Codi no reconegut: XYZ')).toBeInTheDocument();
    expect(screen.queryByText('Anna Vidal')).not.toBeInTheDocument();
  });

  it('treure el fragment de mockup de la URL torna a l\'estat inicial real', async () => {
    window.location.hash = '#ok';
    render(<EscaneigPage />);
    await screen.findByText('Anna Vidal');

    window.location.hash = '';
    window.dispatchEvent(new Event('hashchange'));
    expect(await screen.findByRole('button', { name: 'Escanejar' })).toBeInTheDocument();
    expect(screen.queryByText('Anna Vidal')).not.toBeInTheDocument();
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

  describe('mode prova', () => {
    it('per defecte està desactivat i no mostra l\'avís', () => {
      render(<EscaneigPage />);
      expect(screen.getByRole('button', { name: 'Mode prova: desactivat' })).toBeInTheDocument();
      expect(screen.queryByText('Mode prova: no es desa res')).not.toBeInTheDocument();
    });

    it('activar-lo mostra l\'avís permanent i canvia el text del botó', async () => {
      const user = userEvent.setup();
      render(<EscaneigPage />);
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
      render(<EscaneigPage />);
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
      getDocs.mockResolvedValueOnce({ empty: true, docs: [] });
      onSnapshot
        .mockImplementationOnce((q, callback) => {
          callback({ docs: [{ id: SESSIO_ACTIVA.id, data: () => SESSIO_ACTIVA }] });
          return () => {};
        })
        .mockImplementationOnce((q, callback) => {
          callback({ docs: [{ data: () => LOT_TIQUETS }] });
          return () => {};
        })
        .mockImplementationOnce((q, callback) => {
          callback({ docs: [] });
          return () => {};
        });
      const user = userEvent.setup();
      render(<EscaneigPage />);
      await user.click(screen.getByRole('button', { name: 'Mode prova: desactivat' }));
      const input = await obrirCodiManual(user);
      await user.type(input, 'T-000014');
      await user.click(screen.getByRole('button', { name: 'Registrar' }));

      expect(await screen.findByText('Entrada genèrica (5€)')).toBeInTheDocument();
      expect(screen.getByText('Mode prova: no s\'ha desat res. S\'afegiria a «The Artist».')).toBeInTheDocument();
      expect(addDoc).not.toHaveBeenCalled();
    });
  });
});

describe('EscaneigPage — inicPeriode (any de soci des del primer ús del carnet)', () => {
  beforeEach(() => {
    addDoc.mockClear();
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
    render(<EscaneigPage />);
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
    render(<EscaneigPage />);
    const input = await obrirCodiManual(user);
    await user.type(input, 'SOCI-7');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    await screen.findByText('Anna Vidal');
    expect(updateDoc).not.toHaveBeenCalled();
  });
});
