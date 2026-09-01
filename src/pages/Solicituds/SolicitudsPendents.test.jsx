import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => {
  const batchSet = vi.fn();
  const batchUpdate = vi.fn();
  const batchDelete = vi.fn();
  const batchCommit = vi.fn().mockResolvedValue(undefined);
  const writeBatch = vi.fn(() => ({ set: batchSet, update: batchUpdate, delete: batchDelete, commit: batchCommit }));
  return {
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    // Amb un sol argument (doc(collection(...))) simula la generació d'un id
    // nou aleatori; amb més arguments (doc(db, 'colleccio', id)) es comporta
    // com abans, retornant l'id passat.
    doc: vi.fn((...args) => (args.length <= 1 ? { id: 'nou-soci-id' } : args[args.length - 1])),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    deleteDoc: vi.fn().mockResolvedValue(undefined),
    getDocs: vi.fn().mockResolvedValue({
      docs: [{ data: () => ({ numeroSoci: 12 }) }, { data: () => ({ numeroSoci: 41 }) }],
    }),
    writeBatch,
    onSnapshot: vi.fn((q, callback) => {
      callback({
        docs: [{ id: 'sol-1', data: () => ({ nom: 'Anna', cognoms: 'Vidal', telefon: '600000000', estat: 'pendent' }) }],
      });
      return () => {};
    }),
    __batchSet: batchSet,
    __batchUpdate: batchUpdate,
    __batchDelete: batchDelete,
    __batchCommit: batchCommit,
  };
});

import {
  getDocs, updateDoc, deleteDoc, writeBatch, onSnapshot, __batchSet, __batchUpdate, __batchDelete, __batchCommit,
} from 'firebase/firestore';
import SolicitudsPendents from './SolicitudsPendents';

describe('SolicitudsPendents', () => {
  beforeEach(() => {
    updateDoc.mockClear();
    deleteDoc.mockClear();
    getDocs.mockClear();
    writeBatch.mockClear();
    __batchSet.mockClear();
    __batchUpdate.mockClear();
    __batchDelete.mockClear();
    __batchCommit.mockClear();
    __batchCommit.mockResolvedValue(undefined);
    window.confirm?.mockClear?.();
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

  it('després d\'aprovar, mostra un avís amb l\'opció de desfer', async () => {
    const user = userEvent.setup();
    render(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    expect(await screen.findByText(/aprovada/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desfer' })).toBeInTheDocument();
  });

  it('en desfer una aprovació, elimina el soci creat i torna la sol·licitud a pendent', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    await user.click(await screen.findByRole('button', { name: 'Desfer' }));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(writeBatch).toHaveBeenCalledTimes(2);
    expect(__batchUpdate).toHaveBeenCalledWith('sol-1', { estat: 'pendent' });
    expect(screen.queryByRole('button', { name: 'Desfer' })).not.toBeInTheDocument();
  });

  it('no desfà res si es cancel·la la confirmació de desfer', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    render(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    await user.click(await screen.findByRole('button', { name: 'Desfer' }));
    expect(writeBatch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Desfer' })).toBeInTheDocument();
  });

  it('el botó "Amagar" tanca l\'avís sense desfer res', async () => {
    const user = userEvent.setup();
    render(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    await user.click(await screen.findByRole('button', { name: 'Amagar' }));
    expect(screen.queryByRole('button', { name: 'Desfer' })).not.toBeInTheDocument();
    expect(writeBatch).toHaveBeenCalledTimes(1);
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

  it('ordena les sol·licituds de més noves a més antigues i en mostra la data', async () => {
    onSnapshot.mockImplementationOnce((q, callback) => {
      callback({
        docs: [
          {
            id: 'antiga',
            data: () => ({
              nom: 'Marc', cognoms: 'Serra', telefon: '611111111', estat: 'pendent',
              timestamp: { toDate: () => new Date(2026, 2, 1, 10, 0) },
            }),
          },
          {
            id: 'nova',
            data: () => ({
              nom: 'Anna', cognoms: 'Vidal', telefon: '600000000', estat: 'pendent',
              timestamp: { toDate: () => new Date(2026, 7, 28, 15, 53) },
            }),
          },
        ],
      });
      return () => {};
    });
    render(<SolicitudsPendents />);
    const files = screen.getAllByRole('listitem');
    expect(files[0]).toHaveTextContent('Anna');
    expect(files[0]).toHaveTextContent('28/8/2026');
    expect(files[1]).toHaveTextContent('Marc');
  });

  it('mostra totes les dades de la sol·licitud', async () => {
    onSnapshot.mockImplementationOnce((q, callback) => {
      callback({
        docs: [
          {
            id: 'sol-1',
            data: () => ({
              nom: 'Anna', cognoms: 'Vidal', telefon: '600000000', estat: 'pendent',
              dni: '12345678Z', poblacio: 'Roda de Berà', codiPostal: '43883',
              correuElectronic: 'anna@example.com', comentaris: 'Vull venir amb un amic',
            }),
          },
        ],
      });
      return () => {};
    });
    render(<SolicitudsPendents />);
    expect(await screen.findByText('12345678Z', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Roda de Berà', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('43883', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('anna@example.com', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Vull venir amb un amic', { exact: false })).toBeInTheDocument();
  });

  it('per defecte mostra només les pendents, i permet canviar de pestanya', async () => {
    onSnapshot.mockImplementationOnce((q, callback) => {
      callback({
        docs: [
          { id: 'sol-pendent', data: () => ({ nom: 'Anna', cognoms: 'Vidal', telefon: '600000000', estat: 'pendent' }) },
          { id: 'sol-descartada', data: () => ({ nom: 'Marc', cognoms: 'Serra', telefon: '611111111', estat: 'descartada' }) },
          { id: 'sol-aprovada', data: () => ({ nom: 'Joan', cognoms: 'Puig', telefon: '622222222', estat: 'aprovada' }) },
        ],
      });
      return () => {};
    });
    const user = userEvent.setup();
    render(<SolicitudsPendents />);

    expect(await screen.findByText('Anna Vidal')).toBeInTheDocument();
    expect(screen.queryByText('Marc Serra')).not.toBeInTheDocument();
    expect(screen.queryByText('Joan Puig')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Descartades' }));
    expect(screen.getByText('Marc Serra')).toBeInTheDocument();
    expect(screen.queryByText('Anna Vidal')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument();
    expect(screen.queryByText('Joan Puig')).not.toBeInTheDocument();
  });

  it('no mostra la pestanya Aprovades, ja que en aprovar-se passa a ser un soci', async () => {
    render(<SolicitudsPendents />);
    await screen.findByText('Anna Vidal');
    expect(screen.queryByRole('button', { name: 'Aprovades' })).not.toBeInTheDocument();
  });

  it('a la pestanya Descartades, permet tornar una sol·licitud a pendent', async () => {
    onSnapshot.mockImplementationOnce((q, callback) => {
      callback({
        docs: [{ id: 'sol-descartada', data: () => ({ nom: 'Marc', cognoms: 'Serra', telefon: '611111111', estat: 'descartada' }) }],
      });
      return () => {};
    });
    const user = userEvent.setup();
    render(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Descartades' }));
    await user.click(await screen.findByRole('button', { name: 'Marcar com a pendent' }));
    expect(updateDoc).toHaveBeenCalledWith('sol-descartada', { estat: 'pendent' });
  });

  it('a la pestanya Descartades, elimina definitivament la sol·licitud amb confirmació', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    onSnapshot.mockImplementationOnce((q, callback) => {
      callback({
        docs: [{ id: 'sol-descartada', data: () => ({ nom: 'Marc', cognoms: 'Serra', telefon: '611111111', estat: 'descartada' }) }],
      });
      return () => {};
    });
    const user = userEvent.setup();
    render(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Descartades' }));
    await user.click(await screen.findByRole('button', { name: 'Eliminar definitivament' }));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(deleteDoc).toHaveBeenCalledWith('sol-descartada');
  });

  it('no elimina res si es cancel·la la confirmació', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    onSnapshot.mockImplementationOnce((q, callback) => {
      callback({
        docs: [{ id: 'sol-descartada', data: () => ({ nom: 'Marc', cognoms: 'Serra', telefon: '611111111', estat: 'descartada' }) }],
      });
      return () => {};
    });
    const user = userEvent.setup();
    render(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Descartades' }));
    await user.click(await screen.findByRole('button', { name: 'Eliminar definitivament' }));
    expect(deleteDoc).not.toHaveBeenCalled();
  });
});
