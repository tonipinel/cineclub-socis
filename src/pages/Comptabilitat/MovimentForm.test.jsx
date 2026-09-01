import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn().mockResolvedValue({ id: 'nou' }),
  setDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  getDoc: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  doc: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}));

import { addDoc, deleteDoc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import MovimentForm from './MovimentForm';

const MOVIMENT_EXISTENT = {
  data: '2026-03-05', concepte: 'Quotes de març', tipus: 'ingres', categoria: 'Quotes socis',
  metodePagament: 'efectiu', preuUnitari: 100, quantitat: 1, total: 100, sessionId: '',
};

describe('MovimentForm — alta', () => {
  beforeEach(() => {
    addDoc.mockClear();
    getDocs.mockClear();
  });

  it('crea un ingrés amb categoria i mètode de pagament', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/comptabilitat/nou']}>
        <Routes>
          <Route path="/comptabilitat/nou" element={<MovimentForm />} />
          <Route path="/comptabilitat" element={<p>Llibre de moviments</p>} />
        </Routes>
      </MemoryRouter>
    );
    await user.type(screen.getByLabelText('Data'), '2026-03-05');
    await user.type(screen.getByLabelText('Concepte'), 'Quotes de març');
    await user.type(screen.getByLabelText('Preu unitari'), '100');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByText('Llibre de moviments')).toBeInTheDocument();
    const [, dadesDesades] = addDoc.mock.calls[0];
    expect(dadesDesades).toEqual({
      data: '2026-03-05',
      concepte: 'Quotes de març',
      tipus: 'ingres',
      categoria: 'Quotes socis',
      metodePagament: 'efectiu',
      preuUnitari: 100,
      quantitat: 1,
      total: 100,
      sessionId: '',
    });
  });

  it('en triar tipus Traspàs, desa la direcció en comptes de categoria i mètode', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/comptabilitat/nou']}>
        <Routes>
          <Route path="/comptabilitat/nou" element={<MovimentForm />} />
          <Route path="/comptabilitat" element={<p>Llibre de moviments</p>} />
        </Routes>
      </MemoryRouter>
    );
    await user.type(screen.getByLabelText('Data'), '2026-03-05');
    await user.type(screen.getByLabelText('Concepte'), 'Recaptació a banc');
    await user.selectOptions(screen.getByLabelText('Tipus'), 'traspas');
    expect(screen.queryByLabelText('Categoria')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Direcció')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Preu unitari'), '200');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await screen.findByText('Llibre de moviments');
    const [, dadesDesades] = addDoc.mock.calls[0];
    expect(dadesDesades.tipus).toBe('traspas');
    expect(dadesDesades.direccio).toBe('caixa-a-banc');
    expect(dadesDesades.categoria).toBeUndefined();
    expect(dadesDesades.metodePagament).toBeUndefined();
  });
});

describe('MovimentForm — mode lectura/edició', () => {
  it('en editar un moviment existent, els camps són de només lectura per defecte', async () => {
    getDoc.mockResolvedValueOnce({ data: () => MOVIMENT_EXISTENT });
    render(
      <MemoryRouter initialEntries={['/comptabilitat/1']}>
        <Routes><Route path="/comptabilitat/:id" element={<MovimentForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByLabelText('Concepte')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Tipus')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Desar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar dades' })).toBeInTheDocument();
  });

  it('en clicar "Editar dades" apareixen Desar i Eliminar', async () => {
    getDoc.mockResolvedValueOnce({ data: () => MOVIMENT_EXISTENT });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/comptabilitat/1']}>
        <Routes><Route path="/comptabilitat/:id" element={<MovimentForm />} /></Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    expect(screen.getByLabelText('Concepte')).not.toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Desar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
  });
});

describe('MovimentForm — canviar tipus en editar', () => {
  beforeEach(() => {
    setDoc.mockClear();
  });

  it('en canviar el tipus d\'un moviment existent, no deixa camps obsolets del tipus anterior', async () => {
    getDoc.mockResolvedValueOnce({ data: () => MOVIMENT_EXISTENT });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/comptabilitat/1']}>
        <Routes>
          <Route path="/comptabilitat/:id" element={<MovimentForm />} />
          <Route path="/comptabilitat" element={<p>Llibre de moviments</p>} />
        </Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    await user.selectOptions(screen.getByLabelText('Tipus'), 'traspas');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await screen.findByText('Llibre de moviments');
    const [, dadesDesades] = setDoc.mock.calls[0];
    expect(dadesDesades.tipus).toBe('traspas');
    expect(dadesDesades.direccio).toBe('caixa-a-banc');
    expect(Object.keys(dadesDesades)).not.toContain('categoria');
    expect(Object.keys(dadesDesades)).not.toContain('metodePagament');
  });
});

describe('MovimentForm — numeroSoci', () => {
  beforeEach(() => {
    setDoc.mockClear();
  });

  it('conserva el numeroSoci d\'un moviment de quota en desar, encara que no sigui un camp editable', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ ...MOVIMENT_EXISTENT, numeroSoci: 7 }) });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/comptabilitat/1']}>
        <Routes>
          <Route path="/comptabilitat/:id" element={<MovimentForm />} />
          <Route path="/comptabilitat" element={<p>Llibre de moviments</p>} />
        </Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await screen.findByText('Llibre de moviments');
    const [, dadesDesades] = setDoc.mock.calls[0];
    expect(dadesDesades.numeroSoci).toBe(7);
  });

  it('no afegeix numeroSoci a un moviment que no en tenia', async () => {
    getDoc.mockResolvedValueOnce({ data: () => MOVIMENT_EXISTENT });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/comptabilitat/1']}>
        <Routes>
          <Route path="/comptabilitat/:id" element={<MovimentForm />} />
          <Route path="/comptabilitat" element={<p>Llibre de moviments</p>} />
        </Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await screen.findByText('Llibre de moviments');
    const [, dadesDesades] = setDoc.mock.calls[0];
    expect(Object.keys(dadesDesades)).not.toContain('numeroSoci');
  });
});

describe('MovimentForm — sincronització d\'ultimPagament', () => {
  beforeEach(() => {
    setDoc.mockClear();
    deleteDoc.mockClear();
    updateDoc.mockClear();
    getDocs.mockReset();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    window.confirm.mockClear();
  });

  afterEach(() => {
    getDocs.mockResolvedValue({ docs: [] });
  });

  it('en editar un moviment de quota, recalcula ultimPagament del soci amb la data més recent', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ ...MOVIMENT_EXISTENT, numeroSoci: 7 }) });
    getDocs
      .mockResolvedValueOnce({ docs: [] }) // sessions (carregades al muntar el formulari)
      .mockResolvedValueOnce({
        docs: [
          { data: () => ({ data: '2026-03-05' }) },
          { data: () => ({ data: '2026-08-06' }) },
        ],
      })
      .mockResolvedValueOnce({ docs: [{ ref: 'socis/abc' }] });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/comptabilitat/1']}>
        <Routes>
          <Route path="/comptabilitat/:id" element={<MovimentForm />} />
          <Route path="/comptabilitat" element={<p>Llibre de moviments</p>} />
        </Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await screen.findByText('Llibre de moviments');
    expect(updateDoc).toHaveBeenCalledWith('socis/abc', { ultimPagament: '2026-08-06' });
  });

  it('no toca res si el moviment desat no té numeroSoci', async () => {
    getDoc.mockResolvedValueOnce({ data: () => MOVIMENT_EXISTENT });
    getDocs.mockResolvedValueOnce({ docs: [] }); // sessions (carregades al muntar el formulari)
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/comptabilitat/1']}>
        <Routes>
          <Route path="/comptabilitat/:id" element={<MovimentForm />} />
          <Route path="/comptabilitat" element={<p>Llibre de moviments</p>} />
        </Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await screen.findByText('Llibre de moviments');
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('en eliminar un moviment de quota, recalcula ultimPagament exclosent-lo', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ ...MOVIMENT_EXISTENT, numeroSoci: 7 }) });
    getDocs
      .mockResolvedValueOnce({ docs: [] }) // sessions (carregades al muntar el formulari)
      .mockResolvedValueOnce({ docs: [{ data: () => ({ data: '2026-03-05' }) }] })
      .mockResolvedValueOnce({ docs: [{ ref: 'socis/abc' }] });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/comptabilitat/1']}>
        <Routes>
          <Route path="/comptabilitat/:id" element={<MovimentForm />} />
          <Route path="/comptabilitat" element={<p>Llibre de moviments</p>} />
        </Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    await screen.findByText('Llibre de moviments');
    expect(updateDoc).toHaveBeenCalledWith('socis/abc', { ultimPagament: '2026-03-05' });
  });

  it('no actualitza ultimPagament si no queda cap moviment de quota per aquell soci', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ ...MOVIMENT_EXISTENT, numeroSoci: 7 }) });
    getDocs
      .mockResolvedValueOnce({ docs: [] }) // sessions (carregades al muntar el formulari)
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [{ ref: 'socis/abc' }] });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/comptabilitat/1']}>
        <Routes>
          <Route path="/comptabilitat/:id" element={<MovimentForm />} />
          <Route path="/comptabilitat" element={<p>Llibre de moviments</p>} />
        </Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    await screen.findByText('Llibre de moviments');
    expect(updateDoc).not.toHaveBeenCalled();
  });
});

describe('MovimentForm — eliminar', () => {
  beforeEach(() => {
    deleteDoc.mockClear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    window.confirm.mockClear();
  });

  function renderEnEdicio() {
    getDoc.mockResolvedValueOnce({ data: () => MOVIMENT_EXISTENT });
    return render(
      <MemoryRouter initialEntries={['/comptabilitat/1']}>
        <Routes>
          <Route path="/comptabilitat/:id" element={<MovimentForm />} />
          <Route path="/comptabilitat" element={<p>Llibre de moviments</p>} />
        </Routes>
      </MemoryRouter>
    );
  }

  it('demana confirmació i esborra el moviment', async () => {
    const user = userEvent.setup();
    renderEnEdicio();
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(deleteDoc).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Llibre de moviments')).toBeInTheDocument();
  });

  it('no esborra res si es cancel·la la confirmació', async () => {
    window.confirm.mockReturnValue(false);
    const user = userEvent.setup();
    renderEnEdicio();
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(deleteDoc).not.toHaveBeenCalled();
  });
});

describe('MovimentForm — preu, quantitat i total', () => {
  it('quan la quantitat és 1, editar el total actualitza també el preu unitari', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/comptabilitat/nou']}>
        <Routes><Route path="/comptabilitat/nou" element={<MovimentForm />} /></Routes>
      </MemoryRouter>
    );
    await user.type(screen.getByLabelText('Total'), '75');
    expect(screen.getByLabelText('Preu unitari')).toHaveValue(75);
  });

  it('quan la quantitat no és 1, el total es calcula i no és editable', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/comptabilitat/nou']}>
        <Routes><Route path="/comptabilitat/nou" element={<MovimentForm />} /></Routes>
      </MemoryRouter>
    );
    await user.clear(screen.getByLabelText('Quantitat'));
    await user.type(screen.getByLabelText('Quantitat'), '3');
    await user.type(screen.getByLabelText('Preu unitari'), '10');
    expect(screen.getByLabelText('Total')).toHaveValue(30);
    expect(screen.getByLabelText('Total')).toHaveAttribute('readonly');
  });
});

describe('MovimentForm — suggeriment d\'aportacions', () => {
  it('mostra el recompte de l\'accessLog i omple el total en clicar el botó', async () => {
    getDocs
      .mockResolvedValueOnce({ docs: [{ id: 's1', data: () => ({ titol: 'The Artist' }) }] })
      .mockResolvedValueOnce({
        docs: [
          { data: () => ({ tipus: 'generic', preuAplicat: 5 }) },
          { data: () => ({ tipus: 'generic', preuAplicat: 5 }) },
        ],
      });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/comptabilitat/nou']}>
        <Routes><Route path="/comptabilitat/nou" element={<MovimentForm />} /></Routes>
      </MemoryRouter>
    );
    await screen.findByRole('option', { name: 'The Artist' });
    await user.selectOptions(screen.getByLabelText('Categoria'), 'Aportacions');
    await user.selectOptions(screen.getByLabelText('Sessió (opcional)'), 's1');
    expect(await screen.findByText(/Aquesta sessió ha tingut 2 aportacions \(10€\)/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Omplir amb 10€' }));
    expect(screen.getByLabelText('Total')).toHaveValue(10);
    expect(screen.getByLabelText('Preu unitari')).toHaveValue(10);
  });

  it('no mostra cap suggeriment si la categoria no és Aportacions', async () => {
    getDocs.mockResolvedValueOnce({ docs: [{ id: 's1', data: () => ({ titol: 'The Artist' }) }] });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/comptabilitat/nou']}>
        <Routes><Route path="/comptabilitat/nou" element={<MovimentForm />} /></Routes>
      </MemoryRouter>
    );
    await screen.findByRole('option', { name: 'The Artist' });
    await user.selectOptions(screen.getByLabelText('Sessió (opcional)'), 's1');
    expect(screen.queryByText(/aportacions/)).not.toBeInTheDocument();
  });
});

describe('MovimentForm — preselecció de sessió des de la URL', () => {
  it('preselecciona la sessió quan arriba amb el paràmetre sessionId', async () => {
    getDocs.mockResolvedValueOnce({ docs: [{ id: 's1', data: () => ({ titol: 'The Artist' }) }] });
    render(
      <MemoryRouter initialEntries={['/comptabilitat/nou?sessionId=s1']}>
        <Routes><Route path="/comptabilitat/nou" element={<MovimentForm />} /></Routes>
      </MemoryRouter>
    );
    await screen.findByRole('option', { name: 'The Artist' });
    expect(screen.getByLabelText('Sessió (opcional)')).toHaveValue('s1');
  });
});

describe('MovimentForm — moviment inexistent', () => {
  it('navega al llistat si el moviment no existeix', async () => {
    getDoc.mockResolvedValueOnce({ data: () => undefined });
    render(
      <MemoryRouter initialEntries={['/comptabilitat/inexistent']}>
        <Routes>
          <Route path="/comptabilitat/:id" element={<MovimentForm />} />
          <Route path="/comptabilitat" element={<p>Llibre de moviments</p>} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Llibre de moviments')).toBeInTheDocument();
  });
});
