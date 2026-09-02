import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,ABC') },
}));
vi.mock('firebase/firestore', () => {
  const batchSet = vi.fn();
  const batchUpdate = vi.fn();
  const batchDelete = vi.fn();
  const batchCommit = vi.fn().mockResolvedValue(undefined);
  const writeBatch = vi.fn(() => ({ set: batchSet, update: batchUpdate, delete: batchDelete, commit: batchCommit }));
  return {
    addDoc: vi.fn().mockResolvedValue({ id: 'nou' }),
    getDoc: vi.fn(),
    getDocs: vi.fn().mockResolvedValue({ docs: [] }),
    collection: vi.fn((_, nom) => nom),
    doc: vi.fn((...args) => args[args.length - 1]),
    query: vi.fn(),
    where: vi.fn(),
    writeBatch,
    __batchSet: batchSet,
    __batchUpdate: batchUpdate,
    __batchDelete: batchDelete,
    __batchCommit: batchCommit,
  };
});

import {
  addDoc, getDoc, getDocs, writeBatch, __batchSet, __batchUpdate, __batchDelete, __batchCommit,
} from 'firebase/firestore';
import SociForm from './SociForm';

describe('SociForm — alta', () => {
  beforeEach(() => addDoc.mockClear());

  it('crea un soci nou amb dataAlta i ultimPagament iguals', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/socis/nou']}>
        <Routes>
          <Route path="/socis/nou" element={<SociForm />} />
          <Route path="/socis" element={<p>Llistat de socis</p>} />
        </Routes>
      </MemoryRouter>
    );
    await user.type(screen.getByLabelText('Nom'), 'Anna');
    await user.type(screen.getByLabelText('Cognoms'), 'Vidal');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByText('Llistat de socis')).toBeInTheDocument();
    const [, dadesDesades] = addDoc.mock.calls[0];
    expect(dadesDesades.nom).toBe('Anna');
    expect(dadesDesades.dataAlta).toBe(dadesDesades.ultimPagament);
  });

  it('mostra un error i no navega si la creació falla', async () => {
    addDoc.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/socis/nou']}>
        <Routes>
          <Route path="/socis/nou" element={<SociForm />} />
          <Route path="/socis" element={<p>Llistat de socis</p>} />
        </Routes>
      </MemoryRouter>
    );
    await user.type(screen.getByLabelText('Nom'), 'Anna');
    await user.type(screen.getByLabelText('Cognoms'), 'Vidal');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByText("No s'ha pogut desar. Torna-ho a provar.")).toBeInTheDocument();
    expect(screen.queryByText('Llistat de socis')).not.toBeInTheDocument();
  });

  it('en crear un soci nou, es genera un token de carnet', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/socis/nou']}>
        <Routes>
          <Route path="/socis/nou" element={<SociForm />} />
          <Route path="/socis" element={<p>Llistat de socis</p>} />
        </Routes>
      </MemoryRouter>
    );
    await user.type(screen.getByLabelText('Nom'), 'Anna');
    await user.type(screen.getByLabelText('Cognoms'), 'Vidal');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await screen.findByText('Llistat de socis');
    const [, dadesDesades] = addDoc.mock.calls[0];
    expect(typeof dadesDesades.tokenCarnet).toBe('string');
    expect(dadesDesades.tokenCarnet.length).toBeGreaterThan(0);
  });
});

describe('SociForm — mode lectura/edició', () => {
  it('en editar un soci existent, els camps són de només lectura per defecte', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7' }) });
    render(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByLabelText('Nom')).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Desar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar dades' })).toBeInTheDocument();
  });

  it('en clicar "Editar dades", els camps es tornen editables i apareix Desar', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7' }) });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    expect(screen.getByLabelText('Nom')).not.toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Desar' })).toBeInTheDocument();
  });

  it('mostra la data de sol·licitud i la de l\'últim pagament, sense poder-les editar directament', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({
        nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', dataAlta: '2026-02-15', ultimPagament: '2026-08-29',
      }),
    });
    render(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Data de sol·licitud: 15/02/2026')).toBeInTheDocument();
    expect(screen.getByText('Últim pagament: 29/08/2026')).toBeInTheDocument();
  });

  it('mostra la data d\'activació del carnet (inicPeriode) quan ja s\'ha fixat', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({
        nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', ultimPagament: '2026-07-23', inicPeriode: '2026-08-06',
      }),
    });
    render(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Activació del carnet: 06/08/2026')).toBeInTheDocument();
  });

  it('indica que encara no s\'ha activat el carnet quan no hi ha inicPeriode', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', ultimPagament: '2026-07-23' }),
    });
    render(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Activació del carnet: Encara no ha escanejat des del pagament')).toBeInTheDocument();
  });

  it('en crear un soci nou, els camps ja són editables sense cal clicar res', () => {
    render(
      <MemoryRouter initialEntries={['/socis/nou']}>
        <Routes><Route path="/socis/nou" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(screen.getByLabelText('Nom')).not.toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Desar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar dades' })).not.toBeInTheDocument();
  });
});

describe('SociForm — accions', () => {
  it('mostra a la columna d\'accions un enllaç per registrar un pagament', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7' }) });
    render(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    const enllacos = await screen.findAllByRole('link', { name: 'Registrar pagament' });
    expect(enllacos.every((e) => e.getAttribute('href') === '/socis/1/pagament')).toBe(true);
  });
});

describe('SociForm — pagaments de la quota', () => {
  beforeEach(() => {
    getDocs.mockReset();
  });

  afterEach(() => {
    getDocs.mockResolvedValue({ docs: [] });
  });

  it('mostra el llistat de pagaments de la quota registrats per aquest soci', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7' }) });
    getDocs
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({
        docs: [{ id: 'moviment-1', data: () => ({ data: '2026-03-05', total: 30, metodePagament: 'efectiu' }) }],
      });
    render(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Pagaments de la quota')).toBeInTheDocument();
    const enllac = await screen.findByText(/30\.00€/);
    expect(enllac).toBeInTheDocument();
    expect(screen.getByText(/Efectiu/)).toBeInTheDocument();
    expect(enllac.closest('a')).toHaveAttribute('href', '/comptabilitat/moviment-1');
  });
});

describe('SociForm — previsualització del carnet', () => {
  it('no mostra el carnet si el soci encara no té número de soci', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '' }) });
    render(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    await screen.findByLabelText('Nom');
    expect(screen.queryByText('Carnet')).not.toBeInTheDocument();
  });

  it('mostra el carnet clicable si el soci ja té número de soci, i porta a la pàgina del carnet', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', tokenCarnet: 'tok-1' }) });
    render(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Anna Vidal')).toBeInTheDocument();
    const enllac = screen.getByText('Anna Vidal').closest('a');
    expect(enllac).toHaveAttribute('href', '/socis/1/carnet');
  });
});

describe('SociForm — assistència a sessions', () => {
  beforeEach(() => {
    getDocs.mockReset();
  });

  afterEach(() => {
    getDocs.mockResolvedValue({ docs: [] });
  });

  it('separa les sessions assistides (amb cartell) de les no assistides (en llista), dins del període actual', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', ultimPagament: '2026-01-01' }),
    });
    getDocs
      .mockResolvedValueOnce({
        docs: [
          { id: 's1', data: () => ({ titol: 'The Artist', data: '2026-03-05' }) },
          { id: 's2', data: () => ({ titol: 'Pig', data: '2026-06-25', imatgeUrl: 'https://exemple.cat/pig.jpg' }) },
        ],
      })
      .mockResolvedValueOnce({ docs: [{ data: () => ({ sessionId: 's2' }) }] })
      .mockResolvedValueOnce({ docs: [] });
    render(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Pel·lícules a les que ha assistit (període actual)')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Pig' })).toHaveAttribute('src', 'https://exemple.cat/pig.jpg');
    expect(screen.getByText('Sessions a les que no ha assistit (període actual)')).toBeInTheDocument();
    expect(screen.getByText('The Artist')).toBeInTheDocument();
  });

  it('mostra un marcador de posició quan la sessió assistida no té imatge', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', ultimPagament: '2026-01-01' }),
    });
    getDocs
      .mockResolvedValueOnce({ docs: [{ id: 's1', data: () => ({ titol: 'Pig', data: '2026-06-25' }) }] })
      .mockResolvedValueOnce({ docs: [{ data: () => ({ sessionId: 's1' }) }] })
      .mockResolvedValueOnce({ docs: [] });
    render(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Pel·lícules a les que ha assistit (període actual)')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Pig' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Pig')).toHaveLength(2);
  });

  it('no mostra les seccions d\'assistència si el soci no té número de soci', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '' }) });
    render(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    await screen.findByLabelText('Nom');
    expect(screen.queryByText('Sessions assistides (període actual)')).not.toBeInTheDocument();
    expect(screen.queryByText('Pel·lícules a les que ha assistit (període actual)')).not.toBeInTheDocument();
    expect(screen.queryByText('Sessions a les que no ha assistit (període actual)')).not.toBeInTheDocument();
  });

  it('no mostra les sessions futures', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', ultimPagament: '2026-01-01' }),
    });
    getDocs
      .mockResolvedValueOnce({
        docs: [
          { id: 's1', data: () => ({ titol: 'The Artist', data: '2026-03-05' }) },
          { id: 's2', data: () => ({ titol: 'Pel·lícula del futur', data: '2099-01-01' }) },
        ],
      })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] });
    render(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Sessions a les que no ha assistit (període actual)')).toBeInTheDocument();
    expect(screen.getByText('The Artist')).toBeInTheDocument();
    expect(screen.queryByText('Pel·lícula del futur')).not.toBeInTheDocument();
  });

  it('calcula el cost per sessió del període actual (des de l\'últim pagament)', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', ultimPagament: '2026-03-05' }),
    });
    getDocs
      .mockResolvedValueOnce({
        docs: [
          { id: 's0', data: () => ({ titol: 'Pel·lícula antiga', data: '2026-01-10' }) },
          { id: 's1', data: () => ({ titol: 'The Artist', data: '2026-03-05' }) },
        ],
      })
      .mockResolvedValueOnce({ docs: [{ data: () => ({ sessionId: 's0' }) }, { data: () => ({ sessionId: 's1' }) }] })
      .mockResolvedValueOnce({ docs: [{ id: 'm1', data: () => ({ data: '2026-03-05', total: 30, metodePagament: 'efectiu' }) }] });
    render(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Cost per sessió (període actual)')).toBeInTheDocument();
    expect(screen.getByText('30.00€')).toBeInTheDocument();
  });

  it('exclou del període actual les sessions posteriors al venciment de la quota', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', ultimPagament: '2026-01-01' }),
    });
    getDocs
      .mockResolvedValueOnce({
        docs: [
          { id: 's1', data: () => ({ titol: 'Dins del període', data: '2026-06-01' }) },
          { id: 's2', data: () => ({ titol: 'Ja renovat un cop', data: '2027-06-01' }) },
        ],
      })
      .mockResolvedValueOnce({
        docs: [{ data: () => ({ sessionId: 's1' }) }, { data: () => ({ sessionId: 's2' }) }],
      })
      .mockResolvedValueOnce({ docs: [] });
    render(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Pel·lícules a les que ha assistit (període actual)')).toBeInTheDocument();
    expect(screen.getAllByText('Dins del període').length).toBeGreaterThan(0);
    expect(screen.queryByText('Ja renovat un cop')).not.toBeInTheDocument();
  });

  it('usa inicPeriode (no ultimPagament) com a inici del període actual', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({
        nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', ultimPagament: '2026-01-01', inicPeriode: '2026-05-01',
      }),
    });
    getDocs
      .mockResolvedValueOnce({
        docs: [
          { id: 's1', data: () => ({ titol: 'Abans de l\'activació', data: '2026-02-01' }) },
          { id: 's2', data: () => ({ titol: 'Després de l\'activació', data: '2026-06-01' }) },
        ],
      })
      .mockResolvedValueOnce({
        docs: [{ data: () => ({ sessionId: 's1' }) }, { data: () => ({ sessionId: 's2' }) }],
      })
      .mockResolvedValueOnce({ docs: [] });
    render(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Pel·lícules a les que ha assistit (període actual)')).toBeInTheDocument();
    expect(screen.getAllByText('Després de l\'activació').length).toBeGreaterThan(0);
    expect(screen.queryByText('Abans de l\'activació')).not.toBeInTheDocument();
  });

  it('si ha assistit a sessions però no hi ha cap pagament registrat, ho diu explícitament (no que no ha assistit)', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', ultimPagament: '2026-03-05' }),
    });
    getDocs
      .mockResolvedValueOnce({ docs: [{ id: 's1', data: () => ({ titol: 'The Artist', data: '2026-03-05' }) }] })
      .mockResolvedValueOnce({ docs: [{ data: () => ({ sessionId: 's1' }) }] })
      .mockResolvedValueOnce({ docs: [] });
    render(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Cost per sessió (període actual)')).toBeInTheDocument();
    expect(screen.getByText('No hi ha cap pagament de quota registrat.')).toBeInTheDocument();
    expect(screen.queryByText(/Encara no ha assistit/)).not.toBeInTheDocument();
  });
});

describe('SociForm — desactivació', () => {
  beforeEach(() => {
    writeBatch.mockClear();
    __batchSet.mockClear();
    __batchUpdate.mockClear();
    __batchDelete.mockClear();
    __batchCommit.mockClear();
    __batchCommit.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('per defecte mostra l\'estat Actiu i el formulari de desactivació amagat', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7' }) });
    render(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Actiu')).toBeInTheDocument();
    expect(screen.queryByLabelText('Motiu de la desactivació')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desactivar soci' })).toBeInTheDocument();
  });

  it('en clicar "Desactivar soci" mostra el formulari, i exigeix un motiu abans de desar', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7' }) });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Desactivar soci' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar desactivació' }));
    expect(await screen.findByText('Cal indicar el motiu de la desactivació.')).toBeInTheDocument();
    expect(__batchCommit).not.toHaveBeenCalled();
  });

  it('desactiva el soci amb el motiu indicat, després de confirmar, i esborra el seu socisPublic', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', tokenCarnet: 'tok-1' }),
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Desactivar soci' }));
    await user.type(screen.getByLabelText('Motiu de la desactivació'), 'Mal comportament');
    await user.click(screen.getByRole('button', { name: 'Confirmar desactivació' }));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(1));
    const [, actualitzacio] = __batchUpdate.mock.calls[0];
    expect(actualitzacio.actiu).toBe(false);
    expect(actualitzacio.motiuDesactivacio).toBe('Mal comportament');
    expect(__batchDelete).toHaveBeenCalledWith('tok-1');
    expect(await screen.findByText('Desactivat')).toBeInTheDocument();
  });

  it('esborra socisPublic pel token en desactivar, encara que el soci no tingui numeroSoci (esborrar per token és inofensiu)', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '', tokenCarnet: 'tok-1' }) });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Desactivar soci' }));
    await user.type(screen.getByLabelText('Motiu de la desactivació'), 'Mal comportament');
    await user.click(screen.getByRole('button', { name: 'Confirmar desactivació' }));
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(1));
    expect(__batchDelete).toHaveBeenCalledWith('tok-1');
  });

  it('no toca socisPublic en desactivar un soci sense tokenCarnet', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7' }) });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Desactivar soci' }));
    await user.type(screen.getByLabelText('Motiu de la desactivació'), 'Mal comportament');
    await user.click(screen.getByRole('button', { name: 'Confirmar desactivació' }));
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(1));
    expect(__batchDelete).not.toHaveBeenCalled();
  });

  it('mostra el motiu i permet reactivar un soci desactivat, tornant a escriure socisPublic', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({
        nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', tokenCarnet: 'tok-1', actiu: false,
        motiuDesactivacio: 'Mal comportament', dataDesactivacio: '2026-06-01',
      }),
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Desactivat')).toBeInTheDocument();
    expect(screen.getByText(/Mal comportament/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reactivar soci' }));
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(1));
    const [, actualitzacio] = __batchUpdate.mock.calls[0];
    expect(actualitzacio.actiu).toBe(true);
    expect(actualitzacio.motiuDesactivacio).toBe(null);
    expect(__batchSet).toHaveBeenCalledWith('tok-1', { numeroSoci: 7, nomPublic: 'Anna V.' });
  });
});

describe('SociForm — sincronització de socisPublic en desar', () => {
  beforeEach(() => {
    writeBatch.mockClear();
    __batchSet.mockClear();
    __batchUpdate.mockClear();
    __batchCommit.mockClear();
    __batchCommit.mockResolvedValue(undefined);
  });

  it('en editar un soci amb numeroSoci i tokenCarnet, sincronitza socisPublic', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ nom: 'Isabel', cognoms: 'Mondéjar', numeroSoci: '7', tokenCarnet: 'tok-1' }),
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(1));
    expect(__batchSet).toHaveBeenCalledWith('tok-1', { numeroSoci: 7, nomPublic: 'Isabel M.' });
  });

  it('en editar un soci sense numeroSoci encara, no toca socisPublic', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ nom: 'Isabel', cognoms: 'Mondéjar', numeroSoci: '', tokenCarnet: 'tok-1' }),
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(1));
    expect(__batchSet).not.toHaveBeenCalled();
  });

  it('en editar un soci desactivat, no torna a escriure socisPublic', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ nom: 'Isabel', cognoms: 'Mondéjar', numeroSoci: '7', tokenCarnet: 'tok-1', actiu: false }),
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(1));
    expect(__batchSet).not.toHaveBeenCalled();
  });
});

describe('SociForm — regenerar carnet', () => {
  beforeEach(() => {
    writeBatch.mockClear();
    __batchSet.mockClear();
    __batchUpdate.mockClear();
    __batchDelete.mockClear();
    __batchCommit.mockClear();
    __batchCommit.mockResolvedValue(undefined);
    // mockReset (not mockReturnValue directly): vi.spyOn reuses the mock
    // already installed by the "desactivació" tests above, so its call
    // count must be cleared here too, or toHaveBeenCalledTimes below would
    // count clicks from earlier describe blocks.
    vi.spyOn(window, 'confirm').mockReset().mockReturnValue(true);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('token-nou');
  });

  it('regenera el token del carnet després de confirmar, i sincronitza socisPublic', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', tokenCarnet: 'token-vell' }),
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Regenerar carnet' }));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(1));
    const [, actualitzacio] = __batchUpdate.mock.calls[0];
    expect(actualitzacio.tokenCarnet).toBe('token-nou');
    expect(__batchDelete).toHaveBeenCalledWith('token-vell');
    expect(__batchSet).toHaveBeenCalledWith('token-nou', { numeroSoci: 7, nomPublic: 'Anna V.' });
  });

  it('no regenera el token si es cancel·la la confirmació', async () => {
    window.confirm.mockReturnValue(false);
    getDoc.mockResolvedValueOnce({
      data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', tokenCarnet: 'token-vell' }),
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Regenerar carnet' }));
    expect(__batchCommit).not.toHaveBeenCalled();
  });
});
