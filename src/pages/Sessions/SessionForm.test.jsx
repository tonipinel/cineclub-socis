import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {}, storage: { app: { options: { storageBucket: 'bucket-prova' } } } }));
vi.mock('firebase/storage', () => ({ ref: vi.fn(), uploadBytes: vi.fn() }));
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

function renderEnEdicio(ruta = '/sessions/1') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/sessions/:id" element={<SessionForm />} />
        <Route path="/sessions" element={<p>Llistat de sessions</p>} />
      </Routes>
    </MemoryRouter>
  );
}

const pestanya = (nom) => screen.getByRole('tab', { name: new RegExp(`^${nom}`) });
const textBarra = () => document.querySelector('.barra-desar__text').textContent;

describe('SessionForm — alta', () => {
  beforeEach(() => addDoc.mockClear());

  function FitxaNova() {
    const { pathname, search } = useLocation();
    return (
      <>
        <p>Fitxa de la sessió nova</p>
        <p data-testid="ubicacio">{pathname + search}</p>
      </>
    );
  }

  // Migrada: abans tornava a la llista; ara obre la fitxa de la sessió nova.
  it('crea una sessió nova i obre la seva fitxa', async () => {
    addDoc.mockResolvedValueOnce({ id: 'abc' });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/sessions/nova']}>
        <Routes>
          <Route path="/sessions/nova" element={<SessionForm />} />
          <Route path="/sessions/abc" element={<FitxaNova />} />
          <Route path="/sessions" element={<p>Llistat de sessions</p>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desar' })).toBeDisabled();
    await user.type(screen.getByLabelText('Títol'), 'The Artist');
    await user.type(screen.getByLabelText('Data'), '2026-03-05');
    expect(screen.getByRole('button', { name: 'Desar' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByText('Fitxa de la sessió nova')).toBeInTheDocument();
    expect(screen.getByTestId('ubicacio')).toHaveTextContent('/sessions/abc?pestanya=dades');
    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(addDoc.mock.calls[0][1]).toEqual({
      titol: 'The Artist', data: '2026-03-05', hora: '19:00', urlProgramacio: '', imatgeUrl: '', activa: false,
    });
  });
});

// Migrada: ja no hi ha mode «Editar»; els camps de «Dades» són sempre editables.
describe('SessionForm — edició, camps sempre editables', () => {
  beforeEach(() => {
    getDoc.mockClear();
    getDocs.mockReset();
    getDocs.mockResolvedValue({ docs: [] });
  });

  it('a la pestanya Dades els camps són editables i no hi ha botó «Editar»', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'The Artist', data: '2026-03-05', activa: false }),
    });
    renderEnEdicio('/sessions/1?pestanya=dades');
    const camp = await screen.findByLabelText('Títol');
    expect(camp).not.toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument();
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

  it('no deixa activar una sessió sense data (esborrany creat des d\'una proposta)', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'Pig', data: '', slug: '', activa: false }),
    });
    getDocs.mockResolvedValue({ docs: [] });
    renderEnEdicio();
    const boto = await screen.findByRole('button', { name: 'Marcar com a activa' });
    expect(boto).toBeDisabled();
    expect(screen.getByText('Cal una data per poder-la activar.')).toBeInTheDocument();
  });
});

describe('SessionForm — desar una sessió ja activa', () => {
  beforeEach(() => {
    getDoc.mockClear();
    getDocs.mockReset();
    getDocs.mockResolvedValue({ docs: [] });
    updateDoc.mockClear();
  });

  // Migrada: sense canvis «Desar» està desactivat, així que es canvia l'hora abans de desar.
  it('en editar i desar una sessió ja activa, no sobreescriu el camp activa', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'The Artist', data: '2026-03-05', activa: true }),
    });
    const user = userEvent.setup();
    renderEnEdicio('/sessions/1?pestanya=dades');
    await screen.findByDisplayValue('The Artist');
    await user.clear(screen.getByLabelText("Hora d'inici"));
    await user.type(screen.getByLabelText("Hora d'inici"), '20:00');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await vi.waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
    const [, dadesDesades] = updateDoc.mock.calls[0];
    expect(dadesDesades.activa).toBeUndefined();
  });
});

describe('SessionForm — camps de la web pública', () => {
  beforeEach(() => {
    getDoc.mockClear();
    getDocs.mockReset();
    getDocs.mockResolvedValue({ docs: [] });
    updateDoc.mockClear();
  });

  it('en desar una sessió, no esborra ni modifica `publica`, `slug` ni `publicada`', async () => {
    const publica = { titolOriginal: 'The Artist', directors: ['Michel Hazanavicius'], galeria: [], cos: '## Sinopsi' };
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'The Artist', data: '2026-03-05', activa: false, slug: 'the-artist', publicada: true, publica }),
    });
    const user = userEvent.setup();
    renderEnEdicio('/sessions/1?pestanya=dades');
    // Migrat: la fitxa pública ja és visible a «Dades» i «Títol original» també val «The Artist».
    await screen.findByLabelText('Títol');
    await user.clear(screen.getByLabelText('Títol'));
    await user.type(screen.getByLabelText('Títol'), "L'artista");
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await vi.waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
    const [, dadesDesades] = updateDoc.mock.calls[0];
    expect(dadesDesades.titol).toBe("L'artista");
    // `updateDoc` només toca els camps que rep: si hi són, han de tenir el mateix valor.
    for (const [camp, valor] of Object.entries({ slug: 'the-artist', publicada: true, publica })) {
      if (camp in dadesDesades) expect(dadesDesades[camp]).toEqual(valor);
    }
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
    // Migrat: les estadístiques es carreguen amb React.lazy; s'espera que arribin els moviments.
    const blocQuotes = (await desglossament.findByText('Quotes socis')).closest('div').parentElement;
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
    // Migrada: la fitxa ara també llegeix les altres sessions en muntar-se; el soci es retorna per col·lecció.
    getDocs.mockImplementation((q) => Promise.resolve(q === 'socis'
      ? { docs: [{ id: 'soci-doc-7', data: () => ({ numeroSoci: 7, nom: 'Anna', cognoms: 'Vidal' }) }] }
      : { docs: [] }));
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
        return Promise.resolve({ docs: [{ id: 'sessio-anterior', data: () => ({}) }] });
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

describe('SessionForm — sessions especials sense control', () => {
  beforeEach(() => {
    getDoc.mockClear();
    getDocs.mockReset();
    getDocs.mockResolvedValue({ docs: [] });
  });

  // Migrada: obre directament «Dades» (sense «Editar») i no hi ha la pestanya «Estadístiques».
  it('mostra les dades editables però amaga assistència, desglossament econòmic, moviments i socis', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'Carretera a Gusen', data: '2026-03-05', activa: false, senseControl: true }),
    });
    renderEnEdicio();
    expect(await screen.findByLabelText('Títol')).toBeInTheDocument();
    expect(pestanya('Dades')).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: /Estadístiques/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desar' })).toBeInTheDocument();
    expect(screen.queryByText("Resum d'assistència")).not.toBeInTheDocument();
    expect(screen.queryByText('Desglossament econòmic')).not.toBeInTheDocument();
    expect(screen.queryByText('Moviments')).not.toBeInTheDocument();
    expect(screen.queryByText('Socis que han vingut')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marcar com a activa' })).not.toBeInTheDocument();
  });

  it('la comparativa amb la sessió anterior salta les sessions senseControl', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'The Artist', data: '2026-03-05', activa: false }),
    });
    onSnapshot
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [{ data: () => ({ tipus: 'soci', numeroSoci: 1 }) }] });
        return () => {};
      })
      .mockImplementationOnce((q, callback) => {
        callback({ docs: [] });
        return () => {};
      });
    getDocs.mockImplementation((q) => {
      if (q?.collectionName === 'sessions' && q.constraints?.some((c) => c?.field === 'data')) {
        return Promise.resolve({
          docs: [
            { id: 'especial', data: () => ({ senseControl: true }) },
            { id: 'normal', data: () => ({}) },
          ],
        });
      }
      if (q?.collectionName === 'accessLog' && q.constraints?.some((c) => c?.value === 'normal')) {
        return Promise.resolve({ docs: [{ data: () => ({ tipus: 'soci', numeroSoci: 9 }) }] });
      }
      if (q?.collectionName === 'accessLog' && q.constraints?.some((c) => c?.value === 'especial')) {
        return Promise.resolve({
          docs: [1, 2, 3].map((n) => ({ data: () => ({ tipus: 'soci', numeroSoci: n }) })),
        });
      }
      return Promise.resolve({ docs: [] });
    });
    renderEnEdicio();
    const resumAssistencia = within(
      (await screen.findByText("Resum d'assistència")).closest('.session-form__bloc')
    );
    const filaSocis = resumAssistencia.getByText('Socis').closest('.session-form__estadistica-fila');
    // 1 soci ara vs 1 soci a la sessió normal anterior: diferència 0.
    expect(await within(filaSocis).findByText('0')).toBeInTheDocument();
  });
});

describe('SessionForm — pàgina pública', () => {
  const ARA = new Date('2026-10-22T10:00:00Z');
  const GESTIO = {
    titol: 'Pig', data: '2026-10-08', hora: '19:00', activa: true, senseControl: false, propostaId: 'p1',
    urlProgramacio: '', imatgeUrl: '',
  };

  beforeEach(() => {
    getDoc.mockReset();
    getDocs.mockReset();
    getDocs.mockResolvedValue({ docs: [] });
    updateDoc.mockClear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(ARA);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // Migrat: en lloc de «Editar» + desplegar «Pàgina pública», s'obre la fitxa a la pestanya indicada.
  function carregar(sessio, pestanyaInicial = 'dades') {
    getDoc.mockResolvedValueOnce({ data: () => structuredClone(sessio) });
    const user = userEvent.setup();
    renderEnEdicio(`/sessions/1?pestanya=${pestanyaInicial}`);
    return user;
  }

  async function obrir() {
    await screen.findByRole('tabpanel');
  }

  const desat = async () => {
    await vi.waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
    return updateDoc.mock.calls[0][1];
  };

  it('publicar sense slug, data ni títol dona errors i no desa', async () => {
    const user = carregar({ ...GESTIO, titol: '', data: '' });
    await obrir();
    await user.click(screen.getByRole('checkbox', { name: 'Publicada' }));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    const alerta = await screen.findByRole('alert', { name: 'No es pot publicar' });
    expect(alerta).toHaveTextContent('Cal un slug.');
    expect(alerta).toHaveTextContent('Cal una data vàlida.');
    expect(alerta).toHaveTextContent('Cal un títol.');
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('publicar amb tot correcte desa publicada, slug, urlProgramacio i la publica neta amb actualitzatEl', async () => {
    const user = carregar({ ...GESTIO, slug: '', publicada: false, publica: { titol: 'Pig', directors: ['Michael Sarnoski'], seccio: 'cartellera' } });
    await obrir();
    await user.click(screen.getByRole('checkbox', { name: 'Publicada' }));
    await user.click(screen.getByRole('button', { name: 'Fer servir «pig»' }));
    await user.type(screen.getByLabelText('Guió'), 'Michael Sarnoski');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    const dades = await desat();
    expect(dades.publicada).toBe(true);
    expect(dades.slug).toBe('pig');
    expect(dades.urlProgramacio).toBe('https://cineclubrodadebera.cat/programacio/2026/pig/');
    expect(dades.publica).toEqual({
      titol: 'Pig', seccio: 'cartellera', guio: 'Michael Sarnoski', actualitzatEl: '2026-10-22',
      directors: ['Michael Sarnoski'], interprets: [], generes: [], participa: [], collabora: [], aliases: [],
    });
    expect(screen.queryByRole('alert', { name: 'No es pot publicar' })).not.toBeInTheDocument();
  });

  it('el slug repetit el mateix any no deixa publicar', async () => {
    getDocs.mockImplementation((q) => Promise.resolve(q === 'sessions'
      ? { docs: [{ id: 'altra', data: () => ({ slug: 'pig', data: '2026-03-01' }) }] }
      : { docs: [] }));
    const user = carregar({ ...GESTIO, slug: 'pig', publicada: false });
    await obrir();
    await user.click(screen.getByRole('checkbox', { name: 'Publicada' }));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByRole('alert', { name: 'No es pot publicar' }))
      .toHaveTextContent('Ja hi ha una altra sessió amb aquest slug el mateix any.');
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('l\'avís de cartell absent no impedeix publicar', async () => {
    const user = carregar({ ...GESTIO, slug: 'pig', publicada: false });
    await obrir();
    await user.click(screen.getByRole('checkbox', { name: 'Publicada' }));
    expect(screen.getByText(/La sessió no té cartell/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect((await desat()).publicada).toBe(true);
  });

  // Migrada: sense canvis «Desar» està desactivat i no s'escriu res; canviar un camp i desfer-lo tampoc compta com a canvi.
  it('desar sense canvis públics no toca publica ni actualitzatEl ni cap camp de gestió', async () => {
    const publica = { titol: 'Pig', actualitzatEl: '2026-01-01', directors: [], interprets: [], generes: [], participa: [], collabora: [], aliases: [] };
    const user = carregar({ ...GESTIO, slug: 'pig', publicada: false, publica });
    await obrir();
    expect(screen.getByRole('button', { name: 'Desar' })).toBeDisabled();
    await user.type(screen.getByLabelText('Guió'), 'x');
    expect(screen.getByRole('button', { name: 'Desar' })).toBeEnabled();
    await user.clear(screen.getByLabelText('Guió'));
    expect(screen.getByRole('button', { name: 'Desar' })).toBeDisabled();
    expect(textBarra()).toBe('Sense canvis');
    fireEvent.submit(screen.getByRole('button', { name: 'Desar' }).closest('form'));
    await new Promise((r) => setTimeout(r, 0));
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('una sessió sense publica es desa sense crear-ne una de buida', async () => {
    const user = carregar({ ...GESTIO });
    await obrir();
    await user.clear(screen.getByLabelText('Hora d\'inici'));
    await user.type(screen.getByLabelText('Hora d\'inici'), '20:00');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await desat()).toEqual({ hora: '20:00' });
  });

  it('el preu 0 es desa com a 0, el buit no es desa i el text dona error', async () => {
    const user = carregar({ ...GESTIO, publica: { titol: 'Pig', preu: 5 } });
    await obrir();
    const preu = screen.getByLabelText("Preu d'entrada (€)");
    await user.clear(preu);
    await user.type(preu, 'gratis');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByText('El preu ha de ser un número igual o superior a 0.')).toBeInTheDocument();
    expect(updateDoc).not.toHaveBeenCalled();

    await user.clear(preu);
    await user.type(preu, '0');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect((await desat()).publica.preu).toBe(0);
  });

  it('el preu buit no es desa', async () => {
    const user = carregar({ ...GESTIO, publica: { titol: 'Pig', preu: 5 } });
    await obrir();
    await user.clear(screen.getByLabelText("Preu d'entrada (€)"));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await desat()).toHaveProperty('publica');
    expect(updateDoc.mock.calls[0][1].publica).not.toHaveProperty('preu');
  });

  it('canviar el slug d\'una sessió publicada demana confirmació i afegeix l\'URL antiga als aliases', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = carregar({ ...GESTIO, slug: 'pig', publicada: true, publica: { titol: 'Pig', aliases: ['/programacio/25-de-juny-pig/'] } });
    await obrir();
    await user.clear(screen.getByLabelText('Slug'));
    await user.type(screen.getByLabelText('Slug'), 'pig-2026');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(confirm).toHaveBeenCalledWith("Això trencarà l'URL anterior; s'afegirà com a alias perquè continuï funcionant.");
    expect(updateDoc).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    const dades = await desat();
    expect(dades.slug).toBe('pig-2026');
    expect(dades.urlProgramacio).toBe('https://cineclubrodadebera.cat/programacio/2026/pig-2026/');
    expect(dades.publica.aliases).toEqual(['/programacio/25-de-juny-pig/', '/programacio/2026/pig/']);
    expect(dades.publica.actualitzatEl).toBe('2026-10-22');
  });

  // Migrada: l'enllaç «Veure la pàgina pública» ara és a la capçalera.
  it('enllaça a la pàgina pública només si la sessió desada està publicada', async () => {
    const user = carregar({ ...GESTIO, slug: 'pig', publicada: false });
    await obrir();
    await user.click(screen.getByRole('checkbox', { name: 'Publicada' }));
    expect(screen.queryByRole('link', { name: /Veure la pàgina pública/ })).not.toBeInTheDocument();
  });

  it('l\'enllaç a la pàgina pública apunta a la URL desada', async () => {
    const user = carregar({ ...GESTIO, slug: 'pig', publicada: true });
    await obrir();
    await user.type(screen.getByLabelText('Slug'), '-nou');
    expect(screen.getByRole('link', { name: /Veure la pàgina pública/ }))
      .toHaveAttribute('href', 'https://cineclubrodadebera.cat/programacio/2026/pig/');
  });

  it('desar una sessió publicada sense tocar res públic no envia urlProgramacio, publica ni actualitzatEl', async () => {
    const user = carregar({
      ...GESTIO, slug: 'pig', publicada: true, urlProgramacio: 'https://cineclubrodadebera.cat/programacio/pig-de-hugo/',
      publica: { titol: 'Pig', actualitzatEl: '2026-01-01' },
    });
    await obrir();
    await user.clear(screen.getByLabelText('Hora d\'inici'));
    await user.type(screen.getByLabelText('Hora d\'inici'), '20:00');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await desat()).toEqual({ hora: '20:00' });
  });

  it('una descripció llarga ja desada no impedeix desar altres canvis', async () => {
    const llarga = 'a'.repeat(200);
    const user = carregar({ ...GESTIO, slug: 'pig', publicada: true, publica: { titol: 'Pig', descripcio: llarga } }, 'continguts');
    await obrir();
    expect(screen.getByText(/passa de 160 caràcters/)).toBeInTheDocument();
    await user.click(pestanya('Dades'));
    await user.clear(screen.getByLabelText('Hora d\'inici'));
    await user.type(screen.getByLabelText('Hora d\'inici'), '20:00');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await desat()).toEqual({ hora: '20:00' });
  });

  it('editar la descripció d\'una sessió publicada a més de 160 caràcters avisa però desa', async () => {
    const user = carregar({ ...GESTIO, slug: 'pig', publicada: true, publica: { titol: 'Pig' } }, 'continguts');
    await obrir();
    await user.type(screen.getByLabelText('Descripció (SEO)'), 'a'.repeat(161));
    expect(screen.getByText(/passa de 160 caràcters/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect((await desat()).publica.descripcio).toBe('a'.repeat(161));
  });

  it('publicar per primer cop amb una descripció de més de 160 caràcters no desa', async () => {
    const user = carregar({ ...GESTIO, slug: 'pig', publicada: false, publica: { titol: 'Pig' } }, 'continguts');
    await obrir();
    await user.type(screen.getByLabelText('Descripció (SEO)'), 'a'.repeat(161));
    await user.click(pestanya('Dades'));
    await user.click(screen.getByRole('checkbox', { name: 'Publicada' }));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    // Torna a «Continguts», on hi ha el camp amb l'error, i hi posa el focus.
    expect(await screen.findByText('La descripció no pot passar de 160 caràcters.')).toBeInTheDocument();
    expect(pestanya('Continguts')).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toHaveAttribute('id', 'publica-descripcio');
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('un error a la fitxa pública sense tocar no bloqueja el desat', async () => {
    const user = carregar({ ...GESTIO, publica: { titol: 'Pig', durada: '92 min' } });
    await obrir();
    await user.clear(screen.getByLabelText('Hora d\'inici'));
    await user.type(screen.getByLabelText('Hora d\'inici'), '20:00');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await desat()).toEqual({ hora: '20:00' });
  });

  it('no escriu els valors per defecte dels camps que la sessió no tenia', async () => {
    const user = carregar({ titol: 'Pig', data: '2026-10-08', activa: false });
    await obrir();
    await user.clear(screen.getByLabelText('Títol'));
    await user.type(screen.getByLabelText('Títol'), 'Pig 2');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await desat()).toEqual({ titol: 'Pig 2' });
  });

  it('despublicar i canviar el slug alhora també afegeix l\'URL antiga als aliases', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = carregar({ ...GESTIO, slug: 'pig', publicada: true, publica: { titol: 'Pig' } });
    await obrir();
    await user.click(screen.getByRole('checkbox', { name: 'Publicada' }));
    await user.clear(screen.getByLabelText('Slug'));
    await user.type(screen.getByLabelText('Slug'), 'pig-nou');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    const dades = await desat();
    expect(dades.publicada).toBe(false);
    expect(dades.publica.aliases).toEqual(['/programacio/2026/pig/']);
    expect(dades).not.toHaveProperty('urlProgramacio');
  });

  it('un cartell nou es desa també com a imatgeUrl de la sessió', async () => {
    const { uploadBytes } = await import('firebase/storage');
    uploadBytes.mockResolvedValue({});
    const user = carregar({ ...GESTIO, slug: 'pig', publica: { titol: 'Pig' } }, 'mitjans');
    await obrir();
    await user.upload(screen.getByLabelText('Pujar cartell'), new File(['x'], 'p.jpg', { type: 'image/jpeg' }));
    await screen.findByRole('img', { name: 'Cartell' });
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    const dades = await desat();
    expect(dades.publica.cartell).toMatch(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/bucket-prova\/o\/web%2Fsessions%2Fpig%2Fposter-\d+\.jpg\?alt=media$/);
    expect(dades.imatgeUrl).toBe(dades.publica.cartell);
  });
});

describe('SessionForm — imatge de la fitxa', () => {
  beforeEach(() => {
    getDoc.mockReset();
    getDocs.mockReset();
    getDocs.mockResolvedValue({ docs: [] });
  });

  // Migrat: la imatge és el cartell petit de la capçalera; s'espera el títol de la capçalera.
  const carrega = async (dades, ruta) => {
    getDoc.mockResolvedValueOnce({ data: () => ({ titol: 'Pig', data: '2026-06-25', activa: false, ...dades }) });
    renderEnEdicio(ruta);
    await screen.findByRole('heading', { level: 1, name: 'Pig' });
  };

  it('fa servir publica.cartell encara que imatgeUrl estigui trencada o buida', async () => {
    await carrega({ imatgeUrl: 'https://cineclubrodadebera.cat/programacio/2026/pig/poster_hu123.jpg', publica: { cartell: 'https://firebasestorage.googleapis.com/v0/b/b/o/web%2Fsessions%2Fpig%2Fposter.jpg?alt=media' } });
    expect(screen.getByRole('img', { name: 'Pig' })).toHaveAttribute('src', 'https://firebasestorage.googleapis.com/v0/b/b/o/web%2Fsessions%2Fpig%2Fposter.jpg?alt=media');
  });

  it('amb imatgeUrl buida també mostra el cartell', async () => {
    await carrega({ imatgeUrl: '', publica: { cartell: 'https://firebasestorage.googleapis.com/v0/b/b/o/web%2Fsessions%2Fpig%2Fposter.jpg?alt=media' } });
    expect(screen.getByRole('img', { name: 'Pig' })).toHaveAttribute('src', 'https://firebasestorage.googleapis.com/v0/b/b/o/web%2Fsessions%2Fpig%2Fposter.jpg?alt=media');
  });

  it('sense publica fa servir imatgeUrl', async () => {
    await carrega({ imatgeUrl: 'https://cineclubrodadebera.cat/programacio/2026/pig/poster_hu123.jpg' });
    expect(screen.getByRole('img', { name: 'Pig' })).toHaveAttribute('src', 'https://cineclubrodadebera.cat/programacio/2026/pig/poster_hu123.jpg');
  });

  it('sense cap imatge no pinta cap <img>', async () => {
    await carrega({});
    expect(screen.queryByRole('img', { name: 'Pig' })).not.toBeInTheDocument();
  });

  it('el camp imatgeUrl s\'edita com a imatge de reserva', async () => {
    const user = userEvent.setup();
    await carrega({ imatgeUrl: 'https://cineclubrodadebera.cat/programacio/2026/pig/poster_hu123.jpg', publica: { cartell: 'https://firebasestorage.googleapis.com/v0/b/b/o/web%2Fsessions%2Fpig%2Fposter.jpg?alt=media' } }, '/sessions/1?pestanya=dades');
    await user.type(screen.getByLabelText('URL de la imatge de reserva (si no hi ha cartell públic)'), '?v=2');
    expect(screen.getByLabelText('URL de la imatge de reserva (si no hi ha cartell públic)')).toHaveValue('https://cineclubrodadebera.cat/programacio/2026/pig/poster_hu123.jpg?v=2');
  });
});

describe('SessionForm — pestanyes i barra de desar', () => {
  const SESSIO = { titol: 'Pig', data: '2026-10-08', hora: '19:00', activa: false };

  beforeEach(() => {
    getDoc.mockReset();
    getDocs.mockReset();
    getDocs.mockResolvedValue({ docs: [] });
    updateDoc.mockReset();
    updateDoc.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function carregar(sessio, ruta = '/sessions/ses2') {
    getDoc.mockResolvedValueOnce({ data: () => structuredClone(sessio) });
    const user = userEvent.setup();
    renderEnEdicio(ruta);
    return user;
  }

  it('per defecte obre «Estadístiques» i en carrega el contingut', async () => {
    carregar(SESSIO);
    expect(await screen.findByText("Resum d'assistència")).toBeInTheDocument();
    expect(pestanya('Estadístiques')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Estadístiques', 'Dades', 'Continguts', 'Mitjans']);
    // A «Estadístiques» no hi ha res a desar.
    expect(screen.queryByRole('button', { name: 'Desar' })).not.toBeInTheDocument();
  });

  it('una sessió senseControl obre «Dades» i no té la pestanya «Estadístiques»', async () => {
    carregar({ ...SESSIO, senseControl: true });
    expect(await screen.findByLabelText('Títol')).toHaveValue('Pig');
    expect(pestanya('Dades')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Dades', 'Continguts', 'Mitjans']);
  });

  it('una pestanya desconeguda a l\'adreça cau a «Estadístiques»', async () => {
    carregar(SESSIO, '/sessions/ses2?pestanya=xyz');
    expect(await screen.findByText("Resum d'assistència")).toBeInTheDocument();
    expect(pestanya('Estadístiques')).toHaveAttribute('aria-selected', 'true');
  });

  it('?pestanya=estadistiques en una sessió senseControl cau a «Dades»', async () => {
    carregar({ ...SESSIO, senseControl: true }, '/sessions/ses2?pestanya=estadistiques');
    expect(await screen.findByLabelText('Títol')).toBeInTheDocument();
    expect(pestanya('Dades')).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText("Resum d'assistència")).not.toBeInTheDocument();
  });

  it('canviar de pestanya actualitza l\'adreça i el panell', async () => {
    const user = carregar(SESSIO);
    await screen.findByText("Resum d'assistència");
    await user.click(pestanya('Continguts'));
    expect(pestanya('Continguts')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'panell-continguts');
    expect(screen.getByLabelText('Textos editorials (Markdown)')).toBeInTheDocument();
  });

  it('sense canvis diu «Sense canvis» i «Desar» està desactivat; en editar, diu quina pestanya té canvis', async () => {
    const user = carregar(SESSIO, '/sessions/ses2?pestanya=dades');
    await screen.findByLabelText('Títol');
    expect(textBarra()).toBe('Sense canvis');
    expect(screen.getByRole('button', { name: 'Desar' })).toBeDisabled();
    await user.type(screen.getByLabelText('Títol'), ' 2');
    expect(textBarra()).toBe('Hi ha canvis sense desar · Dades');
    expect(screen.getByRole('button', { name: 'Desar' })).toBeEnabled();
  });

  it('canviar de pestanya no perd els canvis sense desar', async () => {
    const user = carregar(SESSIO, '/sessions/ses2?pestanya=dades');
    await user.clear(await screen.findByLabelText('Títol'));
    await user.type(screen.getByLabelText('Títol'), 'Nou');
    await user.click(pestanya('Continguts'));
    await user.type(screen.getByLabelText('Textos editorials (Markdown)'), '## Context');
    await user.click(pestanya('Mitjans'));
    await user.click(pestanya('Dades'));
    expect(screen.getByLabelText('Títol')).toHaveValue('Nou');
    await user.click(pestanya('Continguts'));
    expect(screen.getByLabelText('Textos editorials (Markdown)')).toHaveValue('## Context');
    expect(textBarra()).toBe('Hi ha canvis sense desar · Dades, Continguts');
  });

  it('desar envia només el títol, es queda a la fitxa i torna a «Sense canvis»', async () => {
    const user = carregar(SESSIO, '/sessions/ses2?pestanya=dades');
    await user.clear(await screen.findByLabelText('Títol'));
    await user.type(screen.getByLabelText('Títol'), 'Nou');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await vi.waitFor(() => expect(textBarra()).toBe('Desat ✓'));
    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(updateDoc.mock.calls[0][1]).toEqual({ titol: 'Nou' });
    expect(screen.getByRole('heading', { level: 1, name: 'Nou' })).toBeInTheDocument();
    expect(screen.queryByText('Llistat de sessions')).not.toBeInTheDocument();
    await vi.waitFor(() => expect(textBarra()).toBe('Sense canvis'), { timeout: 4000 });
    expect(screen.getByRole('button', { name: 'Desar' })).toBeDisabled();
    expect(screen.getByLabelText('Títol')).toHaveValue('Nou');
  });

  it('un doble clic ràpid o dos submits seguits només escriuen una vegada', async () => {
    let resoldre;
    updateDoc.mockImplementation(() => new Promise((r) => { resoldre = r; }));
    const user = carregar(SESSIO, '/sessions/ses2?pestanya=dades');
    await user.type(await screen.findByLabelText('Títol'), '!');
    const boto = screen.getByRole('button', { name: 'Desar' });
    await user.dblClick(boto);
    fireEvent.submit(boto.closest('form'));
    fireEvent.submit(boto.closest('form'));
    await vi.waitFor(() => expect(textBarra()).toBe('Desant…'));
    expect(boto).toBeDisabled();
    resoldre();
    await vi.waitFor(() => expect(textBarra()).toBe('Desat ✓'));
    expect(updateDoc).toHaveBeenCalledTimes(1);
  });

  it('si updateDoc falla, mostra l\'error, manté els canvis i es pot reintentar', async () => {
    updateDoc.mockRejectedValueOnce(new Error('xarxa'));
    const user = carregar(SESSIO, '/sessions/ses2?pestanya=dades');
    await user.clear(await screen.findByLabelText('Títol'));
    await user.type(screen.getByLabelText('Títol'), 'Nou');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'ha pogut desar. Torna-ho a provar.");
    expect(screen.getByRole('button', { name: 'Desar' })).toBeEnabled();
    expect(screen.getByRole('heading', { level: 1, name: 'Pig' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await vi.waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(2));
    expect(updateDoc.mock.calls[1][1]).toEqual({ titol: 'Nou' });
    await vi.waitFor(() => expect(textBarra()).toBe('Desat ✓'));
  });

  it('el que s\'escriu mentre es desa no es perd i queda pendent', async () => {
    let resoldre;
    updateDoc.mockImplementationOnce(() => new Promise((r) => { resoldre = r; }));
    const user = carregar(SESSIO, '/sessions/ses2?pestanya=dades');
    await user.clear(await screen.findByLabelText('Títol'));
    await user.type(screen.getByLabelText('Títol'), 'Nou');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await vi.waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
    await user.type(screen.getByLabelText('Títol'), ' 2');
    await user.clear(screen.getByLabelText("Hora d'inici"));
    await user.type(screen.getByLabelText("Hora d'inici"), '20:00');
    resoldre();
    await vi.waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Nou' })).toBeInTheDocument());
    expect(updateDoc.mock.calls[0][1]).toEqual({ titol: 'Nou' });
    expect(screen.getByLabelText('Títol')).toHaveValue('Nou 2');
    expect(screen.getByLabelText("Hora d'inici")).toHaveValue('20:00');
    expect(textBarra()).toBe('Hi ha canvis sense desar · Dades');
    expect(screen.getByRole('button', { name: 'Desar' })).toBeEnabled();
    // El segon desat només envia el que ha canviat respecte del que ja s'havia desat.
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await vi.waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(2));
    expect(updateDoc.mock.calls[1][1]).toEqual({ titol: 'Nou 2', hora: '20:00' });
  });

  it('en tornar a editar després d\'un error, el resum d\'error desapareix', async () => {
    updateDoc.mockRejectedValueOnce(new Error('xarxa'));
    const user = carregar(SESSIO, '/sessions/ses2?pestanya=dades');
    await user.type(await screen.findByLabelText('Títol'), '!');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'ha pogut desar. Torna-ho a provar.");
    await user.type(screen.getByLabelText('Títol'), '?');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(textBarra()).toBe('Hi ha canvis sense desar · Dades');
  });

  it('el resum d\'errors de validació desapareix en editar i torna si el desat torna a fallar', async () => {
    const user = carregar({ ...SESSIO, slug: '' }, '/sessions/ses2?pestanya=dades');
    await user.click(await screen.findByRole('checkbox', { name: 'Publicada' }));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByRole('button', { name: 'Dades: Cal un slug.' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Guió'), 'x');
    expect(screen.queryByRole('button', { name: 'Dades: Cal un slug.' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByRole('button', { name: 'Dades: Cal un slug.' })).toBeInTheDocument();
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('publicar sense slug porta a «Dades», hi posa el focus i la barra enllaça a la pestanya', async () => {
    const user = carregar({ ...SESSIO, slug: '' }, '/sessions/ses2?pestanya=dades');
    await user.click(await screen.findByRole('checkbox', { name: 'Publicada' }));
    await user.click(pestanya('Continguts'));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    const enllac = await screen.findByRole('button', { name: 'Dades: Cal un slug.' });
    expect(pestanya('Dades')).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toHaveAttribute('id', 'publica-slug');
    expect(updateDoc).not.toHaveBeenCalled();
    await user.click(pestanya('Mitjans'));
    await user.click(enllac);
    expect(pestanya('Dades')).toHaveAttribute('aria-selected', 'true');
  });

  it('després de desar un alies, un segon desat el conserva', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = carregar({ ...SESSIO, slug: 'pig', publicada: true, publica: { titol: 'Pig' } }, '/sessions/ses2?pestanya=dades');
    await user.clear(await screen.findByLabelText('Slug'));
    await user.type(screen.getByLabelText('Slug'), 'pig-2');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await vi.waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
    expect(updateDoc.mock.calls[0][1].publica.aliases).toEqual(['/programacio/2026/pig/']);
    expect(await screen.findByText('/programacio/2026/pig/')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Guió'), 'Sarnoski');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await vi.waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(2));
    expect(updateDoc.mock.calls[1][1].publica.aliases).toEqual(['/programacio/2026/pig/']);
    expect(updateDoc.mock.calls[1][1].publica.guio).toBe('Sarnoski');
    expect(updateDoc.mock.calls[1][1]).not.toHaveProperty('slug');
  });

  it('la capçalera mostra l\'estat de publicació, l\'enllaç públic i «Marcar com a activa»', async () => {
    carregar({ ...SESSIO, data: '', slug: 'pig', publicada: false });
    await screen.findByRole('heading', { level: 1, name: 'Pig' });
    expect(screen.getByText('Esborrany')).toBeInTheDocument();
    expect(screen.queryByText('Publicada')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Veure la pàgina pública/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Marcar com a activa' })).toBeDisabled();
    expect(screen.getByRole('link', { name: '← Sessions' })).toHaveAttribute('href', '/sessions');
  });

  it('la capçalera d\'una sessió publicada i activa', async () => {
    carregar({ ...SESSIO, slug: 'pig', publicada: true, activa: true });
    const titol = await screen.findByRole('heading', { level: 1, name: /Pig$/ });
    expect(within(titol).getByRole('img', { name: 'Sessió activa' })).toBeInTheDocument();
    expect(screen.getByText('Publicada')).toBeInTheDocument();
    expect(screen.getByText('Activa')).toBeInTheDocument();
    expect(screen.getByText('08/10/2026 · 19:00')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Veure la pàgina pública/ }))
      .toHaveAttribute('href', 'https://cineclubrodadebera.cat/programacio/2026/pig/');
    expect(screen.queryByRole('button', { name: 'Marcar com a activa' })).not.toBeInTheDocument();
  });
});

describe('SessionForm — entitats del catàleg', () => {
  const ENTITATS = [
    { id: 'e2', nom: "L'Ateneu Rodenc" },
    { id: 'e1', nom: 'Ajuntament de Roda de Berà' },
  ];
  const SESSIO = {
    titol: 'Pig', data: '2026-10-08', hora: '19:00', activa: false, senseControl: false, slug: 'pig', publicada: false,
    urlProgramacio: '', imatgeUrl: '',
    publica: {
      titol: 'Pig', organitza: 'cineclub', participa: ['Entitat Vella'], collabora: [], actualitzatEl: '2026-01-01',
    },
  };

  beforeEach(() => {
    getDoc.mockReset();
    getDocs.mockReset();
    getDocs.mockImplementation((q) => Promise.resolve(q === 'entitats'
      ? { docs: ENTITATS.map(({ id, ...dades }) => ({ id, data: () => dades })) }
      : { docs: [] }));
    updateDoc.mockClear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-22T10:00:00Z'));
  });

  afterEach(() => vi.useRealTimers());

  function carregar() {
    getDoc.mockResolvedValueOnce({ data: () => structuredClone(SESSIO) });
    const user = userEvent.setup();
    renderEnEdicio('/sessions/1?pestanya=dades');
    return user;
  }

  it('carrega el catàleg ordenat per nom i mostra els noms antics com a «no és al catàleg»', async () => {
    carregar();
    const participen = await screen.findByRole('group', { name: 'Participen' });
    expect(within(participen).getByRole('listitem')).toHaveTextContent('Entitat Vella — no és al catàleg');
    await vi.waitFor(() => expect(within(within(participen).getByLabelText('Participen')).getAllByRole('option')
      .map((o) => o.textContent)).toEqual(['— Tria una entitat —', 'Ajuntament de Roda de Berà', "L'Ateneu Rodenc"]));
    expect(screen.getByLabelText('Organitza')).toHaveValue('cineclub');
    expect(screen.getByRole('button', { name: 'Desar' })).toBeDisabled();
  });

  it('canviar només el títol desa exactament el títol, sense tocar publica', async () => {
    const user = carregar();
    await screen.findByRole('group', { name: 'Participen' });
    await user.clear(screen.getByLabelText('Títol'));
    await user.type(screen.getByLabelText('Títol'), 'Pig (2021)');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await vi.waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
    expect(updateDoc.mock.calls[0][1]).toEqual({ titol: 'Pig (2021)' });
  });

  it('afegir una entitat del catàleg a «Participen» conserva el nom antic i l\'organitzador', async () => {
    const user = carregar();
    const participen = await screen.findByRole('group', { name: 'Participen' });
    await vi.waitFor(() => expect(within(participen).getByRole('option', { name: "L'Ateneu Rodenc" })).toBeInTheDocument());
    await user.selectOptions(within(participen).getByLabelText('Participen'), "L'Ateneu Rodenc");
    await user.click(within(participen).getByRole('button', { name: 'Afegir' }));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await vi.waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
    const { publica } = updateDoc.mock.calls[0][1];
    expect(publica.participa).toEqual(['Entitat Vella', "L'Ateneu Rodenc"]);
    expect(publica.collabora).toEqual([]);
    expect(publica.organitza).toBe('cineclub');
    expect(Object.keys(updateDoc.mock.calls[0][1])).toEqual(['publica']);
  });

  it('si el catàleg no es pot llegir, la fitxa es mostra igualment amb els noms existents', async () => {
    getDocs.mockImplementation((q) => (q === 'entitats' ? Promise.reject(new Error('xarxa')) : Promise.resolve({ docs: [] })));
    carregar();
    const participen = await screen.findByRole('group', { name: 'Participen' });
    expect(within(participen).getByRole('listitem')).toHaveTextContent('Entitat Vella — no és al catàleg');
    expect(within(within(participen).getByLabelText('Participen')).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['— Tria una entitat —']);
  });

  it('«cineclub» amb «Cineclub Roda de Berà» al catàleg es mostra sense avís i desar el títol escriu només el títol', async () => {
    getDocs.mockImplementation((q) => Promise.resolve(q === 'entitats'
      ? { docs: [...ENTITATS, { id: 'e3', nom: 'Cineclub Roda de Berà' }].map(({ id, ...dades }) => ({ id, data: () => dades })) }
      : { docs: [] }));
    getDoc.mockResolvedValueOnce({ data: () => ({ ...structuredClone(SESSIO), publica: { titol: 'Pig', organitza: 'cineclub' } }) });
    const user = userEvent.setup();
    renderEnEdicio('/sessions/1?pestanya=dades');
    const select = await screen.findByLabelText('Organitza');
    await vi.waitFor(() => expect(screen.getByRole('option', { name: 'Cineclub Roda de Berà', selected: true })).toBeInTheDocument());
    expect(select).toHaveValue('cineclub');
    expect(screen.queryByText(/no és al catàleg/)).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('Títol'));
    await user.type(screen.getByLabelText('Títol'), 'Pig (2021)');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await vi.waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
    expect(updateDoc.mock.calls[0][1]).toEqual({ titol: 'Pig (2021)' });
  });

  it('tornar a triar l\'organitzador antic després de canviar-lo deixa la fitxa sense canvis', async () => {
    const user = carregar();
    const select = await screen.findByLabelText('Organitza');
    await vi.waitFor(() => expect(within(select).getByRole('option', { name: "L'Ateneu Rodenc" })).toBeInTheDocument());
    await user.selectOptions(select, "L'Ateneu Rodenc");
    expect(textBarra()).toBe('Hi ha canvis sense desar · Dades');
    await user.selectOptions(select, 'cineclub (no és al catàleg)');
    expect(select).toHaveValue('cineclub');
    expect(textBarra()).toBe('Sense canvis');
    expect(screen.getByRole('button', { name: 'Desar' })).toBeDisabled();
  });

  it('una entitat sense nom no buida el catàleg', async () => {
    getDocs.mockImplementation((q) => Promise.resolve(q === 'entitats'
      ? { docs: [{ id: 'x', data: () => ({ url: 'https://x.example/' }) }, ...ENTITATS.map(({ id, ...dades }) => ({ id, data: () => dades }))] }
      : { docs: [] }));
    carregar();
    const participen = await screen.findByRole('group', { name: 'Participen' });
    await vi.waitFor(() => expect(within(within(participen).getByLabelText('Participen')).getAllByRole('option')
      .map((o) => o.textContent)).toEqual(['— Tria una entitat —', 'Ajuntament de Roda de Berà', "L'Ateneu Rodenc"]));
  });
});
