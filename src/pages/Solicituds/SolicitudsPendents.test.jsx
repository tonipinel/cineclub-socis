import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => {
  const batchSet = vi.fn();
  const batchUpdate = vi.fn();
  const batchCommit = vi.fn().mockResolvedValue(undefined);
  const writeBatch = vi.fn(() => ({ set: batchSet, update: batchUpdate, commit: batchCommit }));
  return {
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    doc: vi.fn((...args) => args[args.length - 1]),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    getDocs: vi.fn().mockResolvedValue({
      docs: [{ data: () => ({ numeroSoci: 12 }) }, { data: () => ({ numeroSoci: 41 }) }],
    }),
    writeBatch,
    onSnapshot: (q, callback) => {
      callback({
        docs: [{ id: 'sol-1', data: () => ({ nom: 'Anna', cognoms: 'Vidal', telefon: '600000000', estat: 'pendent' }) }],
      });
      return () => {};
    },
    __batchSet: batchSet,
    __batchUpdate: batchUpdate,
    __batchCommit: batchCommit,
  };
});

import { getDocs, updateDoc, writeBatch, __batchSet, __batchUpdate, __batchCommit } from 'firebase/firestore';
import SolicitudsPendents from './SolicitudsPendents';

describe('SolicitudsPendents', () => {
  beforeEach(() => {
    updateDoc.mockClear();
    getDocs.mockClear();
    writeBatch.mockClear();
    __batchSet.mockClear();
    __batchUpdate.mockClear();
    __batchCommit.mockClear();
    __batchCommit.mockResolvedValue(undefined);
  });

  it('aprova una sol·licitud: assigna el següent número de soci disponible i crea el soci en un sol batch', async () => {
    const user = userEvent.setup();
    render(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    expect(getDocs).toHaveBeenCalledTimes(1);
    expect(writeBatch).toHaveBeenCalledTimes(1);
    expect(__batchSet).toHaveBeenCalledTimes(1);
    expect(__batchSet.mock.calls[0][1].nom).toBe('Anna');
    expect(__batchSet.mock.calls[0][1].numeroSoci).toBe(42);
    expect(__batchUpdate).toHaveBeenCalledWith('sol-1', { estat: 'aprovada' });
    expect(__batchCommit).toHaveBeenCalledTimes(1);
  });

  it('descarta una sol·licitud sense crear cap soci', async () => {
    const user = userEvent.setup();
    render(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(writeBatch).not.toHaveBeenCalled();
    expect(updateDoc).toHaveBeenCalledWith('sol-1', { estat: 'descartada' });
  });

  it('desactiva Aprovar i Descartar mentre l\'aprovació està en curs', async () => {
    let resolBatch;
    __batchCommit.mockReturnValue(new Promise((resolve) => { resolBatch = resolve; }));
    const user = userEvent.setup();
    render(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeDisabled();
    resolBatch();
  });

  it('mostra un error i reactiva els botons si l\'aprovació falla', async () => {
    __batchCommit.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    render(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    expect(await screen.findByText("No s'ha pogut desar. Torna-ho a provar.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeEnabled();
  });
});
