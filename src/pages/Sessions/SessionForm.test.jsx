import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

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
    renderEnEdicio();
    await screen.findByDisplayValue('The Artist');
    await user.click(screen.getByRole('button', { name: 'Editar dades' }));
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

  it('mostra les dades editables però amaga assistència, desglossament econòmic, moviments i socis', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'Carretera a Gusen', data: '2026-03-05', activa: false, senseControl: true }),
    });
    const user = userEvent.setup();
    renderEnEdicio();
    expect(await screen.findByLabelText('Títol')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Editar dades' }));
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

  function carregar(sessio) {
    getDoc.mockResolvedValueOnce({ data: () => structuredClone(sessio) });
    const user = userEvent.setup();
    renderEnEdicio();
    return user;
  }

  async function obrir(user) {
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    await user.click(screen.getByRole('button', { name: 'Pàgina pública' }));
  }

  const desat = async () => {
    await vi.waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
    return updateDoc.mock.calls[0][1];
  };

  it('publicar sense slug, data ni títol dona errors i no desa', async () => {
    const user = carregar({ ...GESTIO, titol: '', data: '' });
    await obrir(user);
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
    await obrir(user);
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
    await obrir(user);
    await user.click(screen.getByRole('checkbox', { name: 'Publicada' }));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByRole('alert', { name: 'No es pot publicar' }))
      .toHaveTextContent('Ja hi ha una altra sessió amb aquest slug el mateix any.');
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('l\'avís de cartell absent no impedeix publicar', async () => {
    const user = carregar({ ...GESTIO, slug: 'pig', publicada: false });
    await obrir(user);
    await user.click(screen.getByRole('checkbox', { name: 'Publicada' }));
    expect(screen.getByText(/La sessió no té cartell/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect((await desat()).publicada).toBe(true);
  });

  it('desar sense canvis públics no toca publica ni actualitzatEl ni cap camp de gestió', async () => {
    const publica = { titol: 'Pig', actualitzatEl: '2026-01-01', directors: [], interprets: [], generes: [], participa: [], collabora: [], aliases: [] };
    const user = carregar({ ...GESTIO, slug: 'pig', publicada: false, publica });
    await obrir(user);
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    const dades = await desat();
    expect(dades).not.toHaveProperty('publica');
    for (const camp of ['activa', 'senseControl', 'propostaId', 'hora', 'data', 'titol', 'slug', 'publicada', 'urlProgramacio', 'imatgeUrl']) {
      expect(dades).not.toHaveProperty(camp);
    }
  });

  it('una sessió sense publica es desa sense crear-ne una de buida', async () => {
    const user = carregar({ ...GESTIO });
    await obrir(user);
    await user.clear(screen.getByLabelText('Hora d\'inici'));
    await user.type(screen.getByLabelText('Hora d\'inici'), '20:00');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await desat()).toEqual({ hora: '20:00' });
  });

  it('el preu 0 es desa com a 0, el buit no es desa i el text dona error', async () => {
    const user = carregar({ ...GESTIO, publica: { titol: 'Pig', preu: 5 } });
    await obrir(user);
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
    await obrir(user);
    await user.clear(screen.getByLabelText("Preu d'entrada (€)"));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await desat()).toHaveProperty('publica');
    expect(updateDoc.mock.calls[0][1].publica).not.toHaveProperty('preu');
  });

  it('canviar el slug d\'una sessió publicada demana confirmació i afegeix l\'URL antiga als aliases', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = carregar({ ...GESTIO, slug: 'pig', publicada: true, publica: { titol: 'Pig', aliases: ['/programacio/25-de-juny-pig/'] } });
    await obrir(user);
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

  it('enllaça a la pàgina pública només si la sessió desada està publicada', async () => {
    const user = carregar({ ...GESTIO, slug: 'pig', publicada: false });
    await obrir(user);
    await user.click(screen.getByRole('checkbox', { name: 'Publicada' }));
    expect(screen.queryByRole('link', { name: /Veure la pàgina pública/ })).not.toBeInTheDocument();
  });

  it('l\'enllaç a la pàgina pública apunta a la URL desada', async () => {
    const user = carregar({ ...GESTIO, slug: 'pig', publicada: true });
    await obrir(user);
    await user.type(screen.getByLabelText('Slug'), '-nou');
    expect(screen.getByRole('link', { name: /Veure la pàgina pública/ }))
      .toHaveAttribute('href', 'https://cineclubrodadebera.cat/programacio/2026/pig/');
  });

  it('desar una sessió publicada sense tocar res públic no envia urlProgramacio, publica ni actualitzatEl', async () => {
    const user = carregar({
      ...GESTIO, slug: 'pig', publicada: true, urlProgramacio: 'https://cineclubrodadebera.cat/programacio/pig-de-hugo/',
      publica: { titol: 'Pig', actualitzatEl: '2026-01-01' },
    });
    await obrir(user);
    await user.clear(screen.getByLabelText('Hora d\'inici'));
    await user.type(screen.getByLabelText('Hora d\'inici'), '20:00');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await desat()).toEqual({ hora: '20:00' });
  });

  it('una descripció llarga ja desada no impedeix desar altres canvis', async () => {
    const llarga = 'a'.repeat(200);
    const user = carregar({ ...GESTIO, slug: 'pig', publicada: true, publica: { titol: 'Pig', descripcio: llarga } });
    await obrir(user);
    expect(screen.getByText(/passa de 160 caràcters/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Hora d\'inici'));
    await user.type(screen.getByLabelText('Hora d\'inici'), '20:00');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await desat()).toEqual({ hora: '20:00' });
  });

  it('editar la descripció d\'una sessió publicada a més de 160 caràcters avisa però desa', async () => {
    const user = carregar({ ...GESTIO, slug: 'pig', publicada: true, publica: { titol: 'Pig' } });
    await obrir(user);
    await user.type(screen.getByLabelText('Descripció (SEO)'), 'a'.repeat(161));
    expect(screen.getByText(/passa de 160 caràcters/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect((await desat()).publica.descripcio).toBe('a'.repeat(161));
  });

  it('publicar per primer cop amb una descripció de més de 160 caràcters no desa', async () => {
    const user = carregar({ ...GESTIO, slug: 'pig', publicada: false, publica: { titol: 'Pig' } });
    await obrir(user);
    await user.type(screen.getByLabelText('Descripció (SEO)'), 'a'.repeat(161));
    await user.click(screen.getByRole('checkbox', { name: 'Publicada' }));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByText('La descripció no pot passar de 160 caràcters.')).toBeInTheDocument();
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('un error a la fitxa pública sense tocar no bloqueja el desat', async () => {
    const user = carregar({ ...GESTIO, publica: { titol: 'Pig', durada: '92 min' } });
    await obrir(user);
    await user.clear(screen.getByLabelText('Hora d\'inici'));
    await user.type(screen.getByLabelText('Hora d\'inici'), '20:00');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await desat()).toEqual({ hora: '20:00' });
  });

  it('no escriu els valors per defecte dels camps que la sessió no tenia', async () => {
    const user = carregar({ titol: 'Pig', data: '2026-10-08', activa: false });
    await obrir(user);
    await user.clear(screen.getByLabelText('Títol'));
    await user.type(screen.getByLabelText('Títol'), 'Pig 2');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await desat()).toEqual({ titol: 'Pig 2' });
  });

  it('despublicar i canviar el slug alhora també afegeix l\'URL antiga als aliases', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = carregar({ ...GESTIO, slug: 'pig', publicada: true, publica: { titol: 'Pig' } });
    await obrir(user);
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
    const user = carregar({ ...GESTIO, slug: 'pig', publica: { titol: 'Pig' } });
    await obrir(user);
    await user.upload(screen.getByLabelText('Pujar cartell'), new File(['x'], 'p.jpg', { type: 'image/jpeg' }));
    await screen.findByRole('img', { name: 'Cartell' });
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    const dades = await desat();
    expect(dades.publica.cartell).toMatch(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/bucket-prova\/o\/web%2Fsessions%2Fpig%2Fposter-\d+\.jpg\?alt=media$/);
    expect(dades.imatgeUrl).toBe(dades.publica.cartell);
  });
});
