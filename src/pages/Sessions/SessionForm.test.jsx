import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

describe('SessionForm — alta', () => {
  beforeEach(() => addDoc.mockClear());

  it('crea una sessió nova amb el preu convertit a número i lotActiu per defecte', async () => {
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
    expect(dadesDesades.lotActiu).toBe('lot1');
    expect(dadesDesades.activa).toBe(false);
  });
});

describe('SessionForm — marcar activa', () => {
  beforeEach(() => {
    getDoc.mockClear();
    getDocs.mockClear();
    writeBatch.mockClear();
  });

  function renderEnEdicio() {
    return render(
      <MemoryRouter initialEntries={['/sessions/1']}>
        <Routes><Route path="/sessions/:id" element={<SessionForm />} /></Routes>
      </MemoryRouter>
    );
  }

  it('desactiva qualsevol altra sessió activa i marca aquesta com a activa, en un sol batch', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'The Artist', data: '2026-03-05', preuEntrada: 5, lotActiu: 'lot1', activa: false }),
    });
    const refAltraActiva = { id: 'altra' };
    getDocs.mockResolvedValueOnce({ docs: [{ ref: refAltraActiva }] });
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
    updateDoc.mockClear();
  });

  it('en editar i desar una sessió ja activa, no sobreescriu el camp activa', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'The Artist', data: '2026-03-05', preuEntrada: 5, lotActiu: 'lot1', activa: true }),
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/sessions/1']}>
        <Routes><Route path="/sessions/:id" element={<SessionForm />} /></Routes>
      </MemoryRouter>
    );
    await screen.findByDisplayValue('The Artist');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await vi.waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
    const [, dadesDesades] = updateDoc.mock.calls[0];
    expect(dadesDesades.activa).toBeUndefined();
  });
});

describe('SessionForm — desglose econòmic', () => {
  it('mostra els subtotals per mètode de pagament i un enllaç per afegir un moviment', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'The Artist', data: '2026-03-05', preuEntrada: 5, lotActiu: 'lot1', activa: false }),
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
    render(
      <MemoryRouter initialEntries={['/sessions/1']}>
        <Routes><Route path="/sessions/:id" element={<SessionForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('efectiu: 50€')).toBeInTheDocument();
    expect(screen.getByText('datafon: 20€')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "Afegir moviment d'aquesta sessió" })).toHaveAttribute(
      'href', '/comptabilitat/nou?sessionId=1'
    );
  });

  it('mostra un missatge quan encara no hi ha cap moviment', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'The Artist', data: '2026-03-05', preuEntrada: 5, lotActiu: 'lot1', activa: false }),
    });
    render(
      <MemoryRouter initialEntries={['/sessions/1']}>
        <Routes><Route path="/sessions/:id" element={<SessionForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText("Encara no hi ha cap moviment d'aquesta sessió.")).toBeInTheDocument();
  });
});
