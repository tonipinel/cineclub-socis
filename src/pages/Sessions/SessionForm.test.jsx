import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn().mockResolvedValue({ id: 'nova' }),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  getDoc: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  doc: vi.fn(),
  collection: vi.fn((_db, nom) => nom),
  query: vi.fn((collectionName, ...constraints) => ({ collectionName, constraints })),
  where: vi.fn((field, op, value) => ({ field, op, value })),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  writeBatch: vi.fn(),
  onSnapshot: vi.fn((q, callback) => {
    callback({ docs: [] });
    return () => {};
  }),
}));

import { addDoc, getDoc, getDocs, updateDoc, writeBatch, onSnapshot } from 'firebase/firestore';
import SessionForm from './SessionForm';

function renderEnEdicio() {
  return render(
    <MemoryRouter initialEntries={['/sessions/1']}>
      <Routes><Route path="/sessions/:id" element={<SessionForm />} /></Routes>
    </MemoryRouter>
  );
}

describe('SessionForm — alta', () => {
  beforeEach(() => addDoc.mockClear());

  it('crea una sessió nova', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/sessions/nova']}>
        <Routes>
          <Route path="/sessions/nova" element={<SessionForm />} />
          <Route path="/sessions" element={<p>Llistat de sessions</p>} />
        </Routes>
      </MemoryRouter>
    );
    await user.type(screen.getByLabelText('Títol'), 'The Artist');
    await user.type(screen.getByLabelText('Data'), '2026-03-05');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByText('Llistat de sessions')).toBeInTheDocument();
    const [, dadesDesades] = addDoc.mock.calls[0];
    expect(dadesDesades.titol).toBe('The Artist');
    expect(dadesDesades.activa).toBe(false);
  });
});

describe('SessionForm — edició, camps de només lectura per defecte', () => {
  beforeEach(() => {
    getDoc.mockClear();
    getDocs.mockReset();
    getDocs.mockResolvedValue({ docs: [] });
  });

  it('mostra els camps només de lectura fins que es clica "Editar dades"', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'The Artist', data: '2026-03-05', activa: false }),
    });
    const user = userEvent.setup();
    renderEnEdicio();
    const camp = await screen.findByLabelText('Títol');
    expect(camp).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Desar' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Editar dades' }));
    expect(camp).not.toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Desar' })).toBeInTheDocument();
  });
});

describe('SessionForm — marcar activa', () => {
  beforeEach(() => {
    getDoc.mockClear();
    getDocs.mockReset();
    writeBatch.mockClear();
  });

  it('desactiva qualsevol altra sessió activa i marca aquesta com a activa, en un sol batch', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'The Artist', data: '2026-03-05', activa: false }),
    });
    const refAltraActiva = { id: 'altra' };
    getDocs.mockImplementation((q) => {
      if (q?.collectionName === 'sessions' && q.constraints?.some((c) => c?.field === 'activa')) {
        return Promise.resolve({ docs: [{ ref: refAltraActiva }] });
      }
      return Promise.resolve({ docs: [] });
    });
    const batchUpdate = vi.fn();
    const batchCommit = vi.fn().mockResolvedValue(undefined);
    writeBatch.mockReturnValue({ update: batchUpdate, commit: batchCommit });

    const user = userEvent.setup();
    renderEnEdicio();
    await user.click(await screen.findByRole('button', { name: 'Marcar com a activa' }));

    expect(batchUpdate).toHaveBeenCalledWith(refAltraActiva, { activa: false });
    expect(batchCommit).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('img', { name: 'Sessió activa' })).toBeInTheDocument();
  });
});

describe('SessionForm — desar una sessió ja activa', () => {
  beforeEach(() => {
    getDoc.mockClear();
    getDocs.mockReset();
    getDocs.mockResolvedValue({ docs: [] });
    updateDoc.mockClear();
  });

  it('en editar i desar una sessió ja activa, no sobreescriu el camp activa', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'The Artist', data: '2026-03-05', activa: true }),
    });
    const user = userEvent.setup();
    renderEnEdicio();
    await screen.findByDisplayValue('The Artist');
    await user.click(screen.getByRole('button', { name: 'Editar dades' }));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await vi.waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
    const [, dadesDesades] = updateDoc.mock.calls[0];
    expect(dadesDesades.activa).toBeUndefined();
  });
});

describe('SessionForm — desglossament econòmic', () => {
  beforeEach(() => {
    getDoc.mockClear();
    getDocs.mockReset();
    getDocs.mockResolvedValue({ docs: [] });
  });

  it('mostra els ingressos per categoria i detall (preu i mètode), les despeses i el balanç', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'The Artist', data: '2026-03-05', activa: false }),
    });
    onSnapshot
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [] });
        return () => {};
      })
      .mockImplementationOnce((q, callback) => {
        callback({
          docs: [
            {
              data: () => ({
                tipus: 'ingres', categoria: 'Quotes socis', metodePagament: 'efectiu', preuUnitari: 30, quantitat: 1, total: 30,
              }),
            },
            {
              data: () => ({
                tipus: 'ingres', categoria: 'Quotes socis', metodePagament: 'datafon', preuUnitari: 5, quantitat: 4, total: 20,
              }),
            },
            {
              data: () => ({
                tipus: 'ingres', categoria: 'Aportacions', metodePagament: 'efectiu', preuUnitari: 8, quantitat: 2, total: 16,
              }),
            },
            { data: () => ({ tipus: 'despesa', metodePagament: 'banc', total: 30 }) },
          ],
        });
        return () => {};
      });
    renderEnEdicio();
    const desglossament = within(
      (await screen.findByText('Desglossament econòmic')).closest('.session-form__bloc')
    );
    const blocQuotes = desglossament.getByText('Quotes socis').closest('div').parentElement;
    expect(within(blocQuotes).getByText('+50.00€')).toBeInTheDocument();
    expect(within(blocQuotes).getByText('30.00€ × 1 · Efectiu')).toBeInTheDocument();
    expect(within(blocQuotes).getByText('+30.00€')).toBeInTheDocument();
    expect(within(blocQuotes).getByText('5.00€ × 4 · Datàfon')).toBeInTheDocument();
    expect(within(blocQuotes).getByText('+20.00€')).toBeInTheDocument();

    const blocAportacions = desglossament.getByText('Aportacions').closest('div').parentElement;
    expect(within(blocAportacions).getByText('8.00€ × 2 · Efectiu')).toBeInTheDocument();

    expect(desglossament.getByText('Despeses')).toBeInTheDocument();
    expect(desglossament.getByText('−30.00€')).toBeInTheDocument();
    expect(desglossament.getByText('Balanç')).toBeInTheDocument();
    expect(desglossament.getByText('36.00€')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "Afegir moviment d'aquesta sessió" })).toHaveAttribute(
      'href', '/comptabilitat/nou?sessionId=1'
    );
  });

  it('mostra un missatge quan encara no hi ha cap moviment', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'The Artist', data: '2026-03-05', activa: false }),
    });
    renderEnEdicio();
    expect(await screen.findByText('Sense moviments encara.')).toBeInTheDocument();
    expect(await screen.findByText("Encara no hi ha cap moviment d'aquesta sessió.")).toBeInTheDocument();
  });

  it('llista els moviments associats a la sessió amb enllaç al detall', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'The Artist', data: '2026-03-05', activa: false }),
    });
    onSnapshot
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [] });
        return () => {};
      })
      .mockImplementationOnce((q, callback) => {
        callback({
          docs: [
            {
              id: 'moviment-1',
              data: () => ({ data: '2026-03-05', concepte: 'Entrades', tipus: 'ingres', total: 50 }),
            },
          ],
        });
        return () => {};
      });
    renderEnEdicio();
    const enllac = await screen.findByRole('link', { name: 'Entrades' });
    expect(enllac).toHaveAttribute('href', '/comptabilitat/moviment-1');
    expect(within(enllac.closest('li')).getByText('+50.00€')).toBeInTheDocument();
  });
});

describe('SessionForm — avís d\'aportacions pendents', () => {
  beforeEach(() => {
    getDoc.mockClear();
    getDocs.mockReset();
    getDocs.mockResolvedValue({ docs: [] });
  });

  it('avisa si hi ha entrades genèriques escanejades però encara no s\'ha registrat el moviment d\'Aportacions', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'The Artist', data: '2026-03-05', activa: false }),
    });
    onSnapshot
      .mockImplementationOnce((q, callback) => {
        callback({
          docs: [
            { data: () => ({ tipus: 'generic', codiTiquet: 'T-1', preuAplicat: 5 }) },
            { data: () => ({ tipus: 'generic', codiTiquet: 'T-2', preuAplicat: 5 }) },
          ],
        });
        return () => {};
      })
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [] });
        return () => {};
      });
    renderEnEdicio();
    expect(await screen.findByText("Falta afegir les 2 aportacions d'aquesta sessió per un total de 10.00€.")).toBeInTheDocument();
    const enllac = screen.getByRole('link', { name: 'Afegir-les ara' });
    expect(enllac).toHaveAttribute(
      'href',
      '/comptabilitat/nou?sessionId=1&data=2026-03-05&tipus=ingres&categoria=Aportacions&concepte=Aportacions&preuUnitari=5&quantitat=2'
    );
  });

  it('no avisa si ja hi ha un moviment d\'Aportacions per a aquesta sessió', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'The Artist', data: '2026-03-05', activa: false }),
    });
    onSnapshot
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [{ data: () => ({ tipus: 'generic', codiTiquet: 'T-1', preuAplicat: 5 }) }] });
        return () => {};
      })
      .mockImplementationOnce((q, callback) => {
        callback({
          docs: [{
            id: 'moviment-1',
            data: () => ({
              tipus: 'ingres', categoria: 'Aportacions', metodePagament: 'efectiu', preuUnitari: 5, quantitat: 1, total: 5,
            }),
          }],
        });
        return () => {};
      });
    renderEnEdicio();
    await screen.findByText('Desglossament econòmic');
    expect(screen.queryByText(/Falta afegir/)).not.toBeInTheDocument();
  });

  it('no avisa si no hi ha cap entrada genèrica escanejada', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'The Artist', data: '2026-03-05', activa: false }),
    });
    renderEnEdicio();
    await screen.findByText('Desglossament econòmic');
    expect(screen.queryByText(/Falta afegir/)).not.toBeInTheDocument();
  });

  it('no compta les entrades genèriques a 0€ ni a l\'avís ni a l\'enllaç', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'The Artist', data: '2026-03-05', activa: false }),
    });
    onSnapshot
      .mockImplementationOnce((q, callback) => {
        callback({
          docs: [
            { data: () => ({ tipus: 'generic', codiTiquet: 'T-1', preuAplicat: 5 }) },
            { data: () => ({ tipus: 'generic', codiTiquet: 'T-2', preuAplicat: 0 }) },
          ],
        });
        return () => {};
      })
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [] });
        return () => {};
      });
    renderEnEdicio();
    expect(await screen.findByText("Falta afegir les 1 aportacions d'aquesta sessió per un total de 5.00€.")).toBeInTheDocument();
    const enllac = screen.getByRole('link', { name: 'Afegir-les ara' });
    expect(enllac).toHaveAttribute(
      'href',
      '/comptabilitat/nou?sessionId=1&data=2026-03-05&tipus=ingres&categoria=Aportacions&concepte=Aportacions&preuUnitari=5&quantitat=1'
    );
  });

  it('no avisa si totes les entrades genèriques són a 0€', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'The Artist', data: '2026-03-05', activa: false }),
    });
    onSnapshot
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [{ data: () => ({ tipus: 'generic', codiTiquet: 'T-1', preuAplicat: 0 }) }] });
        return () => {};
      })
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [] });
        return () => {};
      });
    renderEnEdicio();
    await screen.findByText('Desglossament econòmic');
    expect(screen.queryByText(/Falta afegir/)).not.toBeInTheDocument();
  });
});

describe('SessionForm — detall de socis i aportacions', () => {
  beforeEach(() => {
    getDoc.mockClear();
    getDocs.mockReset();
    getDocs.mockResolvedValue({ docs: [] });
  });

  it('llista els socis que han vingut amb enllaç a la seva fitxa i l\'hora, sense duplicar-ne un que ha escanejat dos cops', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'The Artist', data: '2026-03-05', activa: false }),
    });
    getDocs.mockResolvedValueOnce({
      docs: [{ id: 'soci-doc-7', data: () => ({ numeroSoci: 7, nom: 'Anna', cognoms: 'Vidal' }) }],
    });
    onSnapshot.mockImplementationOnce((q, callback) => {
      callback({
        docs: [
          { data: () => ({ tipus: 'soci', numeroSoci: 7, timestamp: { toDate: () => new Date(2026, 2, 5, 20, 15) } }) },
          { data: () => ({ tipus: 'soci', numeroSoci: 7, timestamp: { toDate: () => new Date(2026, 2, 5, 20, 20) } }) },
        ],
      });
      return () => {};
    });
    renderEnEdicio();
    const enllac = await screen.findByRole('link', { name: 'Anna Vidal' });
    expect(enllac).toHaveAttribute('href', '/socis/soci-doc-7');
    expect(screen.getAllByRole('link', { name: 'Anna Vidal' })).toHaveLength(1);
    expect(within(enllac.closest('li')).getByText('20:15')).toBeInTheDocument();
  });

  it('llista les aportacions amb el codi, l\'import i l\'hora', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'The Artist', data: '2026-03-05', activa: false }),
    });
    getDocs.mockResolvedValueOnce({ docs: [] });
    onSnapshot.mockImplementationOnce((q, callback) => {
      callback({
        docs: [
          {
            data: () => ({
              tipus: 'generic', codiTiquet: 'T-000012', preuAplicat: 5,
              timestamp: { toDate: () => new Date(2026, 2, 5, 20, 30) },
            }),
          },
        ],
      });
      return () => {};
    });
    renderEnEdicio();
    expect(await screen.findByText('T-000012')).toBeInTheDocument();
    expect(screen.getByText('5.00€')).toBeInTheDocument();
    expect(screen.getByText('20:30')).toBeInTheDocument();
  });
});

describe('SessionForm — comparativa amb la sessió anterior', () => {
  beforeEach(() => {
    getDoc.mockClear();
    getDocs.mockReset();
  });

  it('mostra la diferència de socis, aportacions i total de persones respecte a la sessió immediatament anterior', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'The Artist', data: '2026-03-05', activa: false }),
    });
    onSnapshot
      .mockImplementationOnce((q, callback) => {
        callback({
          docs: [
            { data: () => ({ tipus: 'soci', numeroSoci: 1 }) },
            { data: () => ({ tipus: 'soci', numeroSoci: 2 }) },
            { data: () => ({ tipus: 'generic', codiTiquet: 'T-000001', preuAplicat: 5 }) },
          ],
        });
        return () => {};
      })
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [] });
        return () => {};
      });
    getDocs.mockImplementation((q) => {
      if (q?.collectionName === 'sessions' && q.constraints?.some((c) => c?.field === 'data')) {
        return Promise.resolve({ docs: [{ id: 'sessio-anterior' }] });
      }
      if (q?.collectionName === 'accessLog') {
        return Promise.resolve({
          docs: [
            { data: () => ({ tipus: 'soci', numeroSoci: 9 }) },
            { data: () => ({ tipus: 'generic', codiTiquet: 'T-000002', preuAplicat: 5 }) },
            { data: () => ({ tipus: 'generic', codiTiquet: 'T-000003', preuAplicat: 5 }) },
            { data: () => ({ tipus: 'generic', codiTiquet: 'T-000004', preuAplicat: 5 }) },
          ],
        });
      }
      return Promise.resolve({ docs: [] });
    });

    renderEnEdicio();
    const resumAssistencia = within(
      (await screen.findByText("Resum d'assistència")).closest('.session-form__bloc')
    );
    const filaSocis = resumAssistencia.getByText('Socis').closest('.session-form__estadistica-fila');
    expect(await within(filaSocis).findByText('▲ 1')).toBeInTheDocument();

    const filaAportacions = resumAssistencia.getByText('No Socis').closest('.session-form__estadistica-fila');
    expect(within(filaAportacions).getByText('▼ 2')).toBeInTheDocument();

    const filaTotal = resumAssistencia.getByText('Total persones').closest('.session-form__estadistica-fila');
    expect(within(filaTotal).getByText('▼ 1')).toBeInTheDocument();
  });

  it('no mostra cap comparativa quan no hi ha cap sessió anterior', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'The Artist', data: '2026-03-05', activa: false }),
    });
    getDocs.mockResolvedValue({ docs: [] });
    renderEnEdicio();
    await screen.findByText('Socis');
    expect(screen.queryByText(/▲|▼/)).not.toBeInTheDocument();
  });
});
