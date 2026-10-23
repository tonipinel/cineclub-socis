import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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
import {
  acceptaDialeg, cancellaDialeg, dialegConfirmacio, hiHaDialegConfirmacio, renderAmbConfirmacio, tancaDialegAmbEsc,
} from '../../test/confirmacio';

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
  });

  it('usa el layout de llista amb un únic h1', () => {
    const { container } = renderAmbConfirmacio(<SolicitudsPendents />);
    expect(container.firstChild).toHaveClass('pagina-admin', 'pagina-admin--llista');
    const titols = screen.getAllByRole('heading', { level: 1 });
    expect(titols).toHaveLength(1);
    expect(titols[0]).toHaveTextContent('Sol·licituds');
  });

  it('aprova una sol·licitud: assigna el següent número de soci disponible i crea el soci en un sol batch', async () => {
    const user = userEvent.setup();
    renderAmbConfirmacio(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    expect(getDocs).toHaveBeenCalledTimes(1);
    expect(writeBatch).toHaveBeenCalledTimes(1);
    expect(__batchSet).toHaveBeenCalledTimes(2);
    expect(__batchSet.mock.calls[0][1].nom).toBe('Anna');
    expect(__batchSet.mock.calls[0][1].numeroSoci).toBe(42);
    expect(__batchUpdate).toHaveBeenCalledWith('sol-1', { estat: 'aprovada' });
    expect(__batchCommit).toHaveBeenCalledTimes(1);
  });

  it('aprova una sol·licitud: també crea el doc socisPublic amb el token del nou soci', async () => {
    const user = userEvent.setup();
    renderAmbConfirmacio(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(1));
    expect(__batchSet).toHaveBeenCalledTimes(2);
    const [, sociData] = __batchSet.mock.calls[0];
    const [publicDocId, publicData] = __batchSet.mock.calls[1];
    expect(publicDocId).toBe(sociData.tokenCarnet);
    expect(publicData).toEqual({ numeroSoci: 42, nomPublic: 'Anna V.' });
  });

  it('després d\'aprovar, mostra un avís amb l\'opció de desfer', async () => {
    const user = userEvent.setup();
    renderAmbConfirmacio(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    expect(await screen.findByText(/aprovada/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desfer' })).toBeInTheDocument();
  });

  it('en desfer una aprovació, elimina el soci creat i torna la sol·licitud a pendent', async () => {
    const user = userEvent.setup();
    renderAmbConfirmacio(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    await user.click(await screen.findByRole('button', { name: 'Desfer' }));
    const dialeg = await dialegConfirmacio();
    expect(dialeg).toHaveAttribute('role', 'alertdialog');
    expect(dialeg).toHaveTextContent("Segur que vols desfer l'aprovació de Anna Vidal? S'eliminarà el soci creat i la sol·licitud tornarà a l'estat pendent.");
    expect(writeBatch).toHaveBeenCalledTimes(1);
    await acceptaDialeg('Desfés');
    await waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(2));
    expect(writeBatch).toHaveBeenCalledTimes(2);
    expect(__batchUpdate).toHaveBeenCalledWith('sol-1', { estat: 'pendent' });
    expect(screen.queryByRole('button', { name: 'Desfer' })).not.toBeInTheDocument();
  });

  it('en desfer una aprovació, també elimina el doc socisPublic del nou soci', async () => {
    const user = userEvent.setup();
    renderAmbConfirmacio(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(1));
    const tokenCarnet = __batchSet.mock.calls[0][1].tokenCarnet;
    await user.click(await screen.findByRole('button', { name: 'Desfer' }));
    await acceptaDialeg('Desfés');
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(2));
    expect(__batchDelete).toHaveBeenCalledWith(tokenCarnet);
  });

  it.each([
    ['Cancel·lar', (user) => cancellaDialeg(user)],
    ['ESC', (user) => tancaDialegAmbEsc(user)],
  ])('no desfà res si es tanca la confirmació de desfer amb %s', async (_nom, tanca) => {
    const user = userEvent.setup();
    renderAmbConfirmacio(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(1));
    await user.click(await screen.findByRole('button', { name: 'Desfer' }));
    await tanca(user);
    await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
    expect(writeBatch).toHaveBeenCalledTimes(1);
    expect(__batchCommit).toHaveBeenCalledTimes(1);
    expect(__batchDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Desfer' })).toBeInTheDocument();
  });

  it('el botó "Amagar" tanca l\'avís sense desfer res', async () => {
    const user = userEvent.setup();
    renderAmbConfirmacio(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    await user.click(await screen.findByRole('button', { name: 'Amagar' }));
    expect(screen.queryByRole('button', { name: 'Desfer' })).not.toBeInTheDocument();
    expect(writeBatch).toHaveBeenCalledTimes(1);
  });

  it('descarta una sol·licitud sense crear cap soci', async () => {
    const user = userEvent.setup();
    renderAmbConfirmacio(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(writeBatch).not.toHaveBeenCalled();
    expect(updateDoc).toHaveBeenCalledWith('sol-1', { estat: 'descartada' });
  });

  it('desactiva Aprovar i Descartar mentre l\'aprovació està en curs', async () => {
    let resolBatch;
    __batchCommit.mockReturnValue(new Promise((resolve) => { resolBatch = resolve; }));
    const user = userEvent.setup();
    renderAmbConfirmacio(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeDisabled();
    resolBatch();
  });

  it('mostra un error i reactiva els botons si l\'aprovació falla', async () => {
    __batchCommit.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    renderAmbConfirmacio(<SolicitudsPendents />);
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
    renderAmbConfirmacio(<SolicitudsPendents />);
    const files = screen.getAllByRole('listitem');
    expect(files[0]).toHaveTextContent('Anna');
    expect(files[0]).toHaveTextContent('28/08/2026');
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
    renderAmbConfirmacio(<SolicitudsPendents />);
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
    renderAmbConfirmacio(<SolicitudsPendents />);

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
    renderAmbConfirmacio(<SolicitudsPendents />);
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
    renderAmbConfirmacio(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Descartades' }));
    await user.click(await screen.findByRole('button', { name: 'Marcar com a pendent' }));
    expect(updateDoc).toHaveBeenCalledWith('sol-descartada', { estat: 'pendent' });
  });

  it('a la pestanya Descartades, elimina definitivament la sol·licitud amb confirmació', async () => {
    onSnapshot.mockImplementationOnce((q, callback) => {
      callback({
        docs: [{ id: 'sol-descartada', data: () => ({ nom: 'Marc', cognoms: 'Serra', telefon: '611111111', estat: 'descartada' }) }],
      });
      return () => {};
    });
    const user = userEvent.setup();
    renderAmbConfirmacio(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Descartades' }));
    await user.click(await screen.findByRole('button', { name: 'Eliminar definitivament' }));
    const dialeg = await dialegConfirmacio();
    expect(dialeg).toHaveAttribute('role', 'alertdialog');
    expect(dialeg).toHaveTextContent('Segur que vols eliminar definitivament la sol·licitud de Marc Serra? Aquesta acció no es pot desfer.');
    expect(deleteDoc).not.toHaveBeenCalled();
    await acceptaDialeg('Elimina');
    await waitFor(() => expect(deleteDoc).toHaveBeenCalledTimes(1));
    expect(deleteDoc).toHaveBeenCalledWith('sol-descartada');
  });

  it.each([
    ['Cancel·lar', (user) => cancellaDialeg(user)],
    ['ESC', (user) => tancaDialegAmbEsc(user)],
  ])('no elimina res si es tanca la confirmació amb %s', async (_nom, tanca) => {
    onSnapshot.mockImplementationOnce((q, callback) => {
      callback({
        docs: [{ id: 'sol-descartada', data: () => ({ nom: 'Marc', cognoms: 'Serra', telefon: '611111111', estat: 'descartada' }) }],
      });
      return () => {};
    });
    const user = userEvent.setup();
    renderAmbConfirmacio(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Descartades' }));
    await user.click(await screen.findByRole('button', { name: 'Eliminar definitivament' }));
    await tanca(user);
    await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Eliminar definitivament' })).toBeEnabled();
  });
});
