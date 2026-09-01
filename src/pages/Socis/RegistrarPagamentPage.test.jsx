import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => {
  const batchSet = vi.fn();
  const batchUpdate = vi.fn();
  const batchCommit = vi.fn().mockResolvedValue(undefined);
  const writeBatch = vi.fn(() => ({ set: batchSet, update: batchUpdate, commit: batchCommit }));
  return {
    getDoc: vi.fn(),
    getDocs: vi.fn().mockResolvedValue({ docs: [] }),
    collection: vi.fn((_, nom) => nom),
    doc: vi.fn((...args) => args[args.length - 1]),
    writeBatch,
    __batchSet: batchSet,
    __batchUpdate: batchUpdate,
    __batchCommit: batchCommit,
  };
});

import {
  getDoc, getDocs, writeBatch, __batchSet, __batchUpdate, __batchCommit,
} from 'firebase/firestore';
import RegistrarPagamentPage from './RegistrarPagamentPage';

function renderPagina() {
  return render(
    <MemoryRouter initialEntries={['/socis/1/pagament']}>
      <Routes>
        <Route path="/socis/:id/pagament" element={<RegistrarPagamentPage />} />
        <Route path="/socis/:id" element={<p>Fitxa del soci</p>} />
        <Route path="/socis" element={<p>Llistat de socis</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('RegistrarPagamentPage', () => {
  beforeEach(() => {
    writeBatch.mockClear();
    __batchSet.mockClear();
    __batchUpdate.mockClear();
    __batchCommit.mockClear();
    __batchCommit.mockResolvedValue(undefined);
    getDocs.mockClear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    window.confirm.mockClear();
  });

  it("omple l'import per defecte amb la quota anual configurada", async () => {
    getDoc
      .mockResolvedValueOnce({ id: '1', data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7' }) })
      .mockResolvedValueOnce({ data: () => ({ quotaAnual: 35 }) });
    renderPagina();
    expect(await screen.findByLabelText('Import (€)')).toHaveValue(35);
  });

  it('redirigeix al llistat si el soci no existeix', async () => {
    getDoc
      .mockResolvedValueOnce({ data: () => undefined })
      .mockResolvedValueOnce({ data: () => ({}) });
    renderPagina();
    expect(await screen.findByText('Llistat de socis')).toBeInTheDocument();
  });

  it('en desar, actualitza el soci i crea un ingrés a Comptabilitat amb categoria "Quotes socis", en un sol batch atòmic', async () => {
    getDoc
      .mockResolvedValueOnce({ id: '1', data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7' }) })
      .mockResolvedValueOnce({ data: () => ({ quotaAnual: 30 }) });
    const user = userEvent.setup();
    renderPagina();
    const campData = await screen.findByLabelText('Data del pagament');
    await user.clear(campData);
    await user.type(campData, '2026-03-10');
    await user.click(screen.getByRole('button', { name: 'Registrar pagament' }));
    expect(await screen.findByText('Fitxa del soci')).toBeInTheDocument();

    expect(writeBatch).toHaveBeenCalledTimes(1);
    expect(__batchUpdate.mock.calls[0][1].ultimPagament).toBe('2026-03-10');

    const [, moviment] = __batchSet.mock.calls[0];
    expect(moviment.categoria).toBe('Quotes socis');
    expect(moviment.tipus).toBe('ingres');
    expect(moviment.numeroSoci).toBe(7);
    expect(moviment.data).toBe('2026-03-10');
    expect(moviment.total).toBe(30);
    expect(moviment.metodePagament).toBe('efectiu');
    expect(__batchCommit).toHaveBeenCalledTimes(1);
  });

  it('no toca el número de soci ni consulta tots els socis si ja en té un', async () => {
    getDoc
      .mockResolvedValueOnce({ id: '1', data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7' }) })
      .mockResolvedValueOnce({ data: () => ({ quotaAnual: 30 }) });
    const user = userEvent.setup();
    renderPagina();
    await screen.findByLabelText('Import (€)');
    await user.click(screen.getByRole('button', { name: 'Registrar pagament' }));
    await screen.findByText('Fitxa del soci');
    expect(getDocs).not.toHaveBeenCalled();
    expect(__batchUpdate.mock.calls[0][1].numeroSoci).toBeUndefined();
  });

  it('assigna el següent número de soci disponible si encara no en té, i l\'usa al moviment', async () => {
    getDoc
      .mockResolvedValueOnce({ id: '1', data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '' }) })
      .mockResolvedValueOnce({ data: () => ({ quotaAnual: 30 }) });
    getDocs.mockResolvedValueOnce({
      docs: [{ data: () => ({ numeroSoci: 12 }) }, { data: () => ({ numeroSoci: 41 }) }],
    });
    const user = userEvent.setup();
    renderPagina();
    await screen.findByLabelText('Import (€)');
    await user.click(screen.getByRole('button', { name: 'Registrar pagament' }));
    await screen.findByText('Fitxa del soci');

    expect(__batchUpdate.mock.calls[0][1].numeroSoci).toBe(42);
    expect(__batchSet.mock.calls[0][1].numeroSoci).toBe(42);
  });

  it('demana confirmació abans de desar', async () => {
    getDoc
      .mockResolvedValueOnce({ id: '1', data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7' }) })
      .mockResolvedValueOnce({ data: () => ({ quotaAnual: 30 }) });
    window.confirm.mockReturnValueOnce(false);
    const user = userEvent.setup();
    renderPagina();
    await screen.findByLabelText('Import (€)');
    await user.click(screen.getByRole('button', { name: 'Registrar pagament' }));
    expect(writeBatch).not.toHaveBeenCalled();
  });

  it('avisa clarament si el soci està desactivat, sense bloquejar el pagament', async () => {
    getDoc
      .mockResolvedValueOnce({
        id: '1', data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', actiu: false, motiuDesactivacio: 'Mal comportament' }),
      })
      .mockResolvedValueOnce({ data: () => ({ quotaAnual: 30 }) });
    const user = userEvent.setup();
    renderPagina();
    expect(await screen.findByText(/Aquest soci està desactivat \(Mal comportament\)/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar pagament' }));
    expect(window.confirm.mock.calls[0][0]).toMatch(/continuarà desactivat/);
    await screen.findByText('Fitxa del soci');
    expect(writeBatch).toHaveBeenCalledTimes(1);
  });
});
