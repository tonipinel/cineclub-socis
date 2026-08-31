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
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
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

  it('crea una sessió nova amb el preu convertit a número', async () => {
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
    expect(dadesDesades.preuEntrada).toBe(5);
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
      data: () => ({ titol: 'The Artist', data: '2026-03-05', preuEntrada: 5, activa: false }),
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
      data: () => ({ titol: 'The Artist', data: '2026-03-05', preuEntrada: 5, activa: false }),
    });
    const refAltraActiva = { id: 'altra' };
    getDocs
      .mockResolvedValueOnce({ docs: [] }) // consulta de socis (efecte independent, en muntar)
      .mockResolvedValueOnce({ docs: [{ ref: refAltraActiva }] }); // activesAbans, dins handleMarcarActiva
    const batchUpdate = vi.fn();
    const batchCommit = vi.fn().mockResolvedValue(undefined);
    writeBatch.mockReturnValue({ update: batchUpdate, commit: batchCommit });

    const user = userEvent.setup();
    renderEnEdicio();
    await user.click(await screen.findByRole('button', { name: 'Marcar com a activa' }));

    expect(batchUpdate).toHaveBeenCalledWith(refAltraActiva, { activa: false });
    expect(batchCommit).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Aquesta sessió és l'activa.")).toBeInTheDocument();
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
      data: () => ({ titol: 'The Artist', data: '2026-03-05', preuEntrada: 5, activa: true }),
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

  it('mostra els subtotals per mètode de pagament i un enllaç per afegir un moviment', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'The Artist', data: '2026-03-05', preuEntrada: 5, activa: false }),
    });
    onSnapshot
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [] });
        return () => {};
      })
      .mockImplementationOnce((q, callback) => {
        callback({
          docs: [
            { data: () => ({ tipus: 'ingres', metodePagament: 'efectiu', total: 50 }) },
            { data: () => ({ tipus: 'ingres', metodePagament: 'datafon', total: 20 }) },
          ],
        });
        return () => {};
      });
    renderEnEdicio();
    expect(await screen.findByText('Efectiu: 50.00€')).toBeInTheDocument();
    expect(screen.getByText('Datàfon: 20.00€')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "Afegir moviment d'aquesta sessió" })).toHaveAttribute(
      'href', '/comptabilitat/nou?sessionId=1'
    );
  });

  it('mostra un missatge quan encara no hi ha cap moviment', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'The Artist', data: '2026-03-05', preuEntrada: 5, activa: false }),
    });
    renderEnEdicio();
    expect(await screen.findByText("Encara no hi ha cap moviment d'aquesta sessió.")).toBeInTheDocument();
  });
});

describe('SessionForm — detall de socis i aportacions', () => {
  beforeEach(() => {
    getDoc.mockClear();
    getDocs.mockReset();
  });

  it('llista els socis que han vingut amb enllaç a la seva fitxa i l\'hora, sense duplicar-ne un que ha escanejat dos cops', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'The Artist', data: '2026-03-05', preuEntrada: 5, activa: false }),
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
      data: () => ({ titol: 'The Artist', data: '2026-03-05', preuEntrada: 5, activa: false }),
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
