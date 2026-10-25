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
  // Aprovar ara és una transacció (comptador de números de soci). Els documents que llegeix són en `docsTransaccio`
  // (clau = darrer argument de doc(): 'socis' és configuracio/socis, el comptador; 'sol-1' la sol·licitud). Les
  // escriptures es registren a txSet/txUpdate i `txCommit` fa de confirmació: si falla, no s'aplica res al magatzem.
  const docsTransaccio = new Map();
  const txGet = vi.fn(async (ref) => {
    const dades = docsTransaccio.get(ref);
    return { exists: () => dades !== undefined, data: () => (dades === undefined ? undefined : { ...dades }) };
  });
  const txSet = vi.fn();
  const txUpdate = vi.fn();
  const txDelete = vi.fn();
  const txCommit = vi.fn().mockResolvedValue(undefined);
  const runTransaction = vi.fn(async (_db, fn) => {
    const pendents = [];
    const tx = {
      get: txGet,
      set: (ref, dades) => { txSet(ref, dades); pendents.push([ref, dades, false]); return tx; },
      update: (ref, dades) => { txUpdate(ref, dades); pendents.push([ref, dades, true]); return tx; },
      delete: (ref) => { txDelete(ref); pendents.push([ref, null, false]); return tx; },
    };
    const resultat = await fn(tx);
    await txCommit();
    pendents.forEach(([ref, dades, fusiona]) => {
      if (typeof ref !== 'string') return;
      if (dades === null) docsTransaccio.delete(ref);
      else docsTransaccio.set(ref, fusiona ? { ...docsTransaccio.get(ref), ...dades } : dades);
    });
    return resultat;
  });
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
    runTransaction,
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
    __docsTransaccio: docsTransaccio,
    __txGet: txGet,
    __txSet: txSet,
    __txUpdate: txUpdate,
    __txDelete: txDelete,
    __txCommit: txCommit,
  };
});

import {
  getDocs, updateDoc, deleteDoc, writeBatch, runTransaction, onSnapshot, __batchSet, __batchUpdate, __batchDelete, __batchCommit,
  __docsTransaccio, __txGet, __txSet, __txUpdate, __txDelete, __txCommit,
} from 'firebase/firestore';
import { MISSATGE_COMPTADOR_ABSENT } from '../../lib/numeroSoci';
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
    runTransaction.mockClear();
    __txGet.mockClear();
    __txSet.mockClear();
    __txUpdate.mockClear();
    __txDelete.mockClear();
    __txCommit.mockClear();
    __txCommit.mockResolvedValue(undefined);
    __docsTransaccio.clear();
    __docsTransaccio.set('socis', { ultimNumeroSoci: 41 });
    __docsTransaccio.set('sol-1', { nom: 'Anna', cognoms: 'Vidal', telefon: '600000000', estat: 'pendent' });
  });

  it('usa el layout de llista amb un únic h1', () => {
    const { container } = renderAmbConfirmacio(<SolicitudsPendents />);
    expect(container.firstChild).toHaveClass('pagina-admin', 'pagina-admin--llista');
    const titols = screen.getAllByRole('heading', { level: 1 });
    expect(titols).toHaveLength(1);
    expect(titols[0]).toHaveTextContent('Sol·licituds');
  });

  // Abans l'aprovació llegia tots els socis i escrivia en un writeBatch, i el número era max+1 d'aquella lectura (dues
  // aprovacions seguides podien donar el mateix número). Ara tot va en una sola runTransaction que llegeix i avança el
  // comptador configuracio/socis; les comprovacions d'abans sobre el batch es fan ara sobre les escriptures de la
  // transacció (__txSet/__txUpdate/__txCommit). El desfer també és una transacció (rellegeix el soci per esborrar el
  // socisPublic del token vigent).
  it('aprova una sol·licitud: reserva el número al comptador i crea el soci, socisPublic i l\'estat en una sola transacció', async () => {
    const user = userEvent.setup();
    renderAmbConfirmacio(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    await vi.waitFor(() => expect(__txCommit).toHaveBeenCalledTimes(1));
    expect(getDocs).toHaveBeenCalledTimes(1);
    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(writeBatch).not.toHaveBeenCalled();
    expect(__txGet.mock.calls).toEqual([['sol-1'], ['socis']]);
    const [[sociRef, sociData], [publicDocId, publicData]] = __txSet.mock.calls;
    expect(__txSet).toHaveBeenCalledTimes(2);
    expect(sociRef).toEqual({ id: 'nou-soci-id' });
    expect(sociData.nom).toBe('Anna');
    expect(sociData.numeroSoci).toBe(42);
    expect(publicDocId).toBe(sociData.tokenCarnet);
    expect(publicData).toEqual({ numeroSoci: 42, nomPublic: 'Anna V.' });
    expect(__txUpdate.mock.calls).toEqual([
      ['socis', { ultimNumeroSoci: 42 }],
      ['sol-1', { estat: 'aprovada' }],
    ]);
  });

  it('aprova una sol·licitud: també crea el doc socisPublic amb el token del nou soci', async () => {
    const user = userEvent.setup();
    renderAmbConfirmacio(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    await vi.waitFor(() => expect(__txCommit).toHaveBeenCalledTimes(1));
    expect(__txSet).toHaveBeenCalledTimes(2);
    const [, sociData] = __txSet.mock.calls[0];
    const [publicDocId, publicData] = __txSet.mock.calls[1];
    expect(publicDocId).toBe(sociData.tokenCarnet);
    expect(publicData).toEqual({ numeroSoci: 42, nomPublic: 'Anna V.' });
  });

  it('si el comptador va per davant dels socis existents (p. ex. el darrer soci s\'ha esborrat), no en reutilitza el número', async () => {
    __docsTransaccio.set('socis', { ultimNumeroSoci: 50 });
    const user = userEvent.setup();
    renderAmbConfirmacio(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    await vi.waitFor(() => expect(__txCommit).toHaveBeenCalledTimes(1));
    expect(__txSet.mock.calls[0][1].numeroSoci).toBe(51);
    expect(__txUpdate).toHaveBeenCalledWith('socis', { ultimNumeroSoci: 51 });
  });

  it('si el comptador va endarrerit respecte dels socis existents, salta per sobre del número més alt', async () => {
    __docsTransaccio.set('socis', { ultimNumeroSoci: 10 });
    const user = userEvent.setup();
    renderAmbConfirmacio(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    await vi.waitFor(() => expect(__txCommit).toHaveBeenCalledTimes(1));
    expect(__txSet.mock.calls[0][1].numeroSoci).toBe(42);
    expect(__txUpdate).toHaveBeenCalledWith('socis', { ultimNumeroSoci: 42 });
  });

  it('dues aprovacions seguides amb la mateixa lectura de socis (obsoleta) donen números diferents', async () => {
    onSnapshot.mockImplementationOnce((q, callback) => {
      callback({
        docs: [
          { id: 'sol-1', data: () => ({ nom: 'Anna', cognoms: 'Vidal', telefon: '600000000', estat: 'pendent' }) },
          { id: 'sol-2', data: () => ({ nom: 'Marc', cognoms: 'Serra', telefon: '611111111', estat: 'pendent' }) },
        ],
      });
      return () => {};
    });
    __docsTransaccio.set('sol-2', { nom: 'Marc', cognoms: 'Serra', telefon: '611111111', estat: 'pendent' });
    const user = userEvent.setup();
    renderAmbConfirmacio(<SolicitudsPendents />);
    const [aprovarAnna, aprovarMarc] = screen.getAllByRole('button', { name: 'Aprovar' });
    await user.click(aprovarAnna);
    await user.click(aprovarMarc);
    await vi.waitFor(() => expect(__txCommit).toHaveBeenCalledTimes(2));
    // getDocs (mock) retorna sempre el màxim 41: és la mateixa lectura obsoleta per a totes dues.
    expect(getDocs).toHaveBeenCalledTimes(2);
    const socisCreats = __txSet.mock.calls.filter(([ref]) => ref?.id === 'nou-soci-id').map(([, dades]) => dades);
    expect(socisCreats.map((s) => [s.nom, s.numeroSoci])).toEqual([['Anna', 42], ['Marc', 43]]);
    expect(__docsTransaccio.get('socis')).toEqual({ ultimNumeroSoci: 43 });
  });

  it('sense comptador inicialitzat, mostra un error clar i no escriu res', async () => {
    __docsTransaccio.delete('socis');
    const user = userEvent.setup();
    renderAmbConfirmacio(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    expect(await screen.findByText(MISSATGE_COMPTADOR_ABSENT)).toBeInTheDocument();
    expect(__txSet).not.toHaveBeenCalled();
    expect(__txUpdate).not.toHaveBeenCalled();
    expect(__txCommit).not.toHaveBeenCalled();
    expect(writeBatch).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Desfer' })).not.toBeInTheDocument();
  });

  it('no aprova una sol·licitud que ja no és pendent (p. ex. aprovada des d\'una altra sessió) i no reserva cap número', async () => {
    __docsTransaccio.set('sol-1', { nom: 'Anna', cognoms: 'Vidal', estat: 'aprovada' });
    const user = userEvent.setup();
    renderAmbConfirmacio(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    expect(await screen.findByText('Aquesta sol·licitud ja no està pendent. Torna a carregar la pàgina.')).toBeInTheDocument();
    expect(__txGet.mock.calls).toEqual([['sol-1']]);
    expect(__txSet).not.toHaveBeenCalled();
    expect(__txUpdate).not.toHaveBeenCalled();
    expect(__txCommit).not.toHaveBeenCalled();
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
    expect(runTransaction).toHaveBeenCalledTimes(1);
    await acceptaDialeg('Desfés');
    await waitFor(() => expect(__txCommit).toHaveBeenCalledTimes(2));
    expect(writeBatch).not.toHaveBeenCalled();
    expect(__txDelete).toHaveBeenCalledWith('nou-soci-id');
    expect(__txUpdate).toHaveBeenLastCalledWith('sol-1', { estat: 'pendent' });
    // Desfer no torna enrere el comptador: el número queda cremat (un forat), mai es reutilitza.
    expect(__docsTransaccio.get('socis')).toEqual({ ultimNumeroSoci: 42 });
    expect(screen.queryByRole('button', { name: 'Desfer' })).not.toBeInTheDocument();
  });

  it('en desfer una aprovació, també elimina el doc socisPublic del nou soci', async () => {
    const user = userEvent.setup();
    renderAmbConfirmacio(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    await vi.waitFor(() => expect(__txCommit).toHaveBeenCalledTimes(1));
    const tokenCarnet = __txSet.mock.calls[0][1].tokenCarnet;
    await user.click(await screen.findByRole('button', { name: 'Desfer' }));
    await acceptaDialeg('Desfés');
    await vi.waitFor(() => expect(__txCommit).toHaveBeenCalledTimes(2));
    expect(__txDelete).toHaveBeenCalledWith(tokenCarnet);
  });

  // Entre aprovar i desfer, el carnet del soci nou es pot haver regenerat (des de la seva fitxa): el socisPublic que
  // permet votar és el del token vigent, no el desat en aprovar.
  const aprovaIDesfes = async (sociAlDesfer) => {
    const user = userEvent.setup();
    renderAmbConfirmacio(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    await vi.waitFor(() => expect(__txCommit).toHaveBeenCalledTimes(1));
    const tokenAprovacio = __txSet.mock.calls[0][1].tokenCarnet;
    if (sociAlDesfer) __docsTransaccio.set('nou-soci-id', sociAlDesfer(tokenAprovacio));
    __txGet.mockClear();
    __txUpdate.mockClear();
    await user.click(await screen.findByRole('button', { name: 'Desfer' }));
    await acceptaDialeg('Desfés');
    await vi.waitFor(() => expect(__txCommit).toHaveBeenCalledTimes(2));
    return tokenAprovacio;
  };

  it('en desfer, si el carnet s\'ha regenerat mentrestant, esborra el socisPublic del token vigent i el de l\'aprovació', async () => {
    const tokenAprovacio = await aprovaIDesfes(() => ({ nom: 'Anna', numeroSoci: 42, tokenCarnet: 'tok-regenerat' }));
    expect(__txGet.mock.calls).toEqual([['nou-soci-id']]);
    expect(__txDelete.mock.calls).toEqual([['nou-soci-id'], ['tok-regenerat'], [tokenAprovacio]]);
    expect(__txUpdate.mock.calls).toEqual([['sol-1', { estat: 'pendent' }]]);
    expect(writeBatch).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Desfer' })).not.toBeInTheDocument();
  });

  it('en desfer amb el mateix token, l\'esborra una sola vegada', async () => {
    const tokenAprovacio = await aprovaIDesfes((token) => ({ nom: 'Anna', numeroSoci: 42, tokenCarnet: token }));
    expect(__txDelete.mock.calls).toEqual([['nou-soci-id'], [tokenAprovacio]]);
    expect(__txUpdate.mock.calls).toEqual([['sol-1', { estat: 'pendent' }]]);
  });

  it('en desfer, si el soci ja no existeix, esborra igualment el socisPublic de l\'aprovació i no falla', async () => {
    const tokenAprovacio = await aprovaIDesfes(null);
    expect(__txDelete.mock.calls).toEqual([['nou-soci-id'], [tokenAprovacio]]);
    expect(__txUpdate.mock.calls).toEqual([['sol-1', { estat: 'pendent' }]]);
    // Desfer no torna enrere el comptador: el número queda cremat.
    expect(__docsTransaccio.get('socis')).toEqual({ ultimNumeroSoci: 42 });
    expect(screen.queryByText("No s'ha pogut desar. Torna-ho a provar.")).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desfer' })).not.toBeInTheDocument();
  });

  it.each([
    ['Cancel·lar', (user) => cancellaDialeg(user)],
    ['ESC', (user) => tancaDialegAmbEsc(user)],
  ])('no desfà res si es tanca la confirmació de desfer amb %s', async (_nom, tanca) => {
    const user = userEvent.setup();
    renderAmbConfirmacio(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    await vi.waitFor(() => expect(__txCommit).toHaveBeenCalledTimes(1));
    await user.click(await screen.findByRole('button', { name: 'Desfer' }));
    await tanca(user);
    await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
    expect(writeBatch).not.toHaveBeenCalled();
    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(__txDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Desfer' })).toBeInTheDocument();
  });

  it('el botó "Amagar" tanca l\'avís sense desfer res', async () => {
    const user = userEvent.setup();
    renderAmbConfirmacio(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    await user.click(await screen.findByRole('button', { name: 'Amagar' }));
    expect(screen.queryByRole('button', { name: 'Desfer' })).not.toBeInTheDocument();
    expect(writeBatch).not.toHaveBeenCalled();
    expect(runTransaction).toHaveBeenCalledTimes(1);
  });

  it('descarta una sol·licitud sense crear cap soci', async () => {
    const user = userEvent.setup();
    renderAmbConfirmacio(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(writeBatch).not.toHaveBeenCalled();
    expect(runTransaction).not.toHaveBeenCalled();
    expect(updateDoc).toHaveBeenCalledWith('sol-1', { estat: 'descartada' });
  });

  it('desactiva Aprovar i Descartar mentre l\'aprovació està en curs', async () => {
    let resolCommit;
    __txCommit.mockReturnValue(new Promise((resolve) => { resolCommit = resolve; }));
    const user = userEvent.setup();
    renderAmbConfirmacio(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeDisabled();
    resolCommit();
  });

  it('mostra un error i reactiva els botons si l\'aprovació falla', async () => {
    __txCommit.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    renderAmbConfirmacio(<SolicitudsPendents />);
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));
    expect(await screen.findByText("No s'ha pogut desar. Torna-ho a provar.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeEnabled();
    // La transacció no s'ha confirmat: el comptador no s'ha mogut.
    expect(__docsTransaccio.get('socis')).toEqual({ ultimNumeroSoci: 41 });
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

describe('SolicitudsPendents: error de càrrega', () => {
  it('si l\'oient de sol·licituds falla, mostra l\'error i «Torna-ho a provar» es torna a subscriure', async () => {
    const errorConsola = vi.spyOn(console, 'error').mockImplementation(() => {});
    onSnapshot.mockImplementationOnce((q, _cb, onError) => { onError(new Error('permission-denied')); return () => {}; });
    renderAmbConfirmacio(<SolicitudsPendents />);
    expect(screen.getByRole('alert')).toHaveTextContent("No s'han pogut carregar les sol·licituds.");
    await userEvent.click(screen.getByRole('button', { name: 'Torna-ho a provar' }));
    expect(screen.getByText(/Anna/)).toBeInTheDocument();
    errorConsola.mockRestore();
  });
});
