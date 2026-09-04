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
      categoria: 'Aportacions',
      metodePagament: 'efectiu',
      preuUnitari: 100,
      quantitat: 1,
      total: 100,
      sessionId: '',
    });
  });

  it('no deixa desar un moviment amb el concepte en blanc (el navegador el bloqueja com a camp requerit)', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/comptabilitat/nou']}>
        <Routes><Route path="/comptabilitat/nou" element={<MovimentForm />} /></Routes>
      </MemoryRouter>
    );
    expect(screen.getByLabelText('Concepte')).toBeRequired();
    await user.type(screen.getByLabelText('Preu unitari'), '100');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('no deixa desar un moviment amb el concepte només amb espais, i el retalla en desar-lo', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/comptabilitat/nou']}>
        <Routes>
          <Route path="/comptabilitat/nou" element={<MovimentForm />} />
          <Route path="/comptabilitat" element={<p>Llibre de moviments</p>} />
        </Routes>
      </MemoryRouter>
    );
    await user.type(screen.getByLabelText('Concepte'), '   ');
    await user.type(screen.getByLabelText('Preu unitari'), '100');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByText('El concepte no pot estar en blanc.')).toBeInTheDocument();
    expect(addDoc).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Concepte'));
    await user.type(screen.getByLabelText('Concepte'), '  Quotes de març  ');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByText('Llibre de moviments')).toBeInTheDocument();
    const [, dadesDesades] = addDoc.mock.calls[0];
    expect(dadesDesades.concepte).toBe('Quotes de març');
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

  it('no permet triar "Quotes socis" com a categoria (només es crea des de la fitxa del soci)', async () => {
    render(
      <MemoryRouter initialEntries={['/comptabilitat/nou']}>
        <Routes>
          <Route path="/comptabilitat/nou" element={<MovimentForm />} />
        </Routes>
      </MemoryRouter>
    );
    const opcions = Array.from(screen.getByLabelText('Categoria').querySelectorAll('option')).map((o) => o.value);
    expect(opcions).not.toContain('Quotes socis');
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

  it('en editar un moviment de "Quotes socis" existent, la categoria es manté visible i seleccionada', async () => {
    getDoc.mockResolvedValueOnce({ data: () => MOVIMENT_EXISTENT });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/comptabilitat/1']}>
        <Routes><Route path="/comptabilitat/:id" element={<MovimentForm />} /></Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    expect(screen.getByLabelText('Categoria')).toHaveValue('Quotes socis');
  });
});

describe('MovimentForm — canviar tipus en editar', () => {
  beforeEach(() => {
    setDoc.mockClear();
  });

  it('en canviar el tipus d\'un moviment existent, no deixa camps obsolets del tipus anterior', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ ...MOVIMENT_EXISTENT, categoria: 'Aportacions' }) });
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

  it('en editar un moviment de "Quotes socis", Tipus i Categoria queden bloquejats', async () => {
    getDoc.mockResolvedValueOnce({ data: () => MOVIMENT_EXISTENT });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/comptabilitat/1']}>
        <Routes><Route path="/comptabilitat/:id" element={<MovimentForm />} /></Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    expect(screen.getByLabelText('Tipus')).toBeDisabled();
    expect(screen.getByLabelText('Categoria')).toBeDisabled();
    expect(screen.getByLabelText('Mètode de pagament')).not.toBeDisabled();
  });

  it('en editar un moviment de "Quotes socis" de tipusQuota "renovacio", Tipus i Categoria també queden bloquejats', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ ...MOVIMENT_EXISTENT, tipusQuota: 'renovacio', sessionId: '' }) });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/comptabilitat/1']}>
        <Routes><Route path="/comptabilitat/:id" element={<MovimentForm />} /></Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    expect(screen.getByLabelText('Tipus')).toBeDisabled();
    expect(screen.getByLabelText('Categoria')).toBeDisabled();
    expect(screen.getByLabelText('Categoria')).toHaveValue('Quotes socis');
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

  it('conserva el tipusQuota d\'un moviment de quota en desar, encara que no sigui un camp editable', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ ...MOVIMENT_EXISTENT, tipusQuota: 'renovacio' }) });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/comptabilitat/1']}>
        <Routes>
          <Route path="/comptabilitat/:id" element={<MovimentForm />} />
          <Route path="/comptabilitat" element={<p>Llibre de moviments</p>} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByLabelText('Tipus de quota')).toHaveValue('Renovació');
    await user.click(screen.getByRole('button', { name: 'Editar dades' }));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await screen.findByText('Llibre de moviments');
    const [, dadesDesades] = setDoc.mock.calls[0];
    expect(dadesDesades.tipusQuota).toBe('renovacio');
  });

  it('mostra "Alta nova" com a tipus de quota per defecte', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ ...MOVIMENT_EXISTENT, tipusQuota: 'alta' }) });
    render(
      <MemoryRouter initialEntries={['/comptabilitat/1']}>
        <Routes><Route path="/comptabilitat/:id" element={<MovimentForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByLabelText('Tipus de quota')).toHaveValue('Alta nova');
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
    expect(updateDoc).toHaveBeenCalledWith('socis/abc', { ultimPagament: '2026-08-06', inicPeriode: null });
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
    expect(updateDoc).toHaveBeenCalledWith('socis/abc', { ultimPagament: '2026-03-05', inicPeriode: null });
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
  it('el total sempre és de només lectura, encara que el formulari estigui desbloquejat', async () => {
    render(
      <MemoryRouter initialEntries={['/comptabilitat/nou']}>
        <Routes><Route path="/comptabilitat/nou" element={<MovimentForm />} /></Routes>
      </MemoryRouter>
    );
    expect(screen.getByLabelText('Total')).toHaveAttribute('readonly');
  });

  it('quan la quantitat és 1, el total es calcula a partir del preu unitari', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/comptabilitat/nou']}>
        <Routes><Route path="/comptabilitat/nou" element={<MovimentForm />} /></Routes>
      </MemoryRouter>
    );
    await user.type(screen.getByLabelText('Preu unitari'), '75');
    expect(screen.getByLabelText('Total')).toHaveValue(75);
  });

  it('quan la quantitat no és 1, el total es calcula com preu unitari × quantitat', async () => {
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

describe('MovimentForm — "Gestió pel·lícules" requereix sessió', () => {
  beforeEach(() => {
    addDoc.mockClear();
  });

  it('no deixa desar un moviment de "Gestió pel·lícules" sense sessió', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/comptabilitat/nou']}>
        <Routes><Route path="/comptabilitat/nou" element={<MovimentForm />} /></Routes>
      </MemoryRouter>
    );
    await user.selectOptions(screen.getByLabelText('Tipus'), 'despesa');
    await user.selectOptions(screen.getByLabelText('Categoria'), 'Gestió pel·lícules');
    await user.type(screen.getByLabelText('Concepte'), 'Lloguer sala');
    await user.type(screen.getByLabelText('Preu unitari'), '100');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByText(/ha d'estar vinculat a una sessió/)).toBeInTheDocument();
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('desa correctament un moviment de "Gestió pel·lícules" amb sessió vinculada', async () => {
    getDocs.mockResolvedValueOnce({ docs: [{ id: 's1', data: () => ({ titol: 'The Artist' }) }] });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/comptabilitat/nou']}>
        <Routes>
          <Route path="/comptabilitat/nou" element={<MovimentForm />} />
          <Route path="/comptabilitat" element={<p>Llibre de moviments</p>} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByRole('option', { name: 'The Artist' });
    await user.selectOptions(screen.getByLabelText('Tipus'), 'despesa');
    await user.selectOptions(screen.getByLabelText('Categoria'), 'Gestió pel·lícules');
    await user.selectOptions(screen.getByLabelText('Sessió (pel·lícula)'), 's1');
    await user.type(screen.getByLabelText('Concepte'), 'Lloguer sala');
    await user.type(screen.getByLabelText('Preu unitari'), '100');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByText('Llibre de moviments')).toBeInTheDocument();
    const [, dadesDesades] = addDoc.mock.calls[0];
    expect(dadesDesades.sessionId).toBe('s1');
  });
});

describe('MovimentForm — categories vàlides per tipus', () => {
  it('un ingrés només ofereix "Aportacions" com a categoria', async () => {
    render(
      <MemoryRouter initialEntries={['/comptabilitat/nou']}>
        <Routes><Route path="/comptabilitat/nou" element={<MovimentForm />} /></Routes>
      </MemoryRouter>
    );
    const opcions = Array.from(screen.getByLabelText('Categoria').querySelectorAll('option')).map((o) => o.value);
    expect(opcions).toEqual(['Aportacions']);
  });

  it('una despesa només ofereix "Gestió pel·lícules" i "Gestió associació" com a categoria', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/comptabilitat/nou']}>
        <Routes><Route path="/comptabilitat/nou" element={<MovimentForm />} /></Routes>
      </MemoryRouter>
    );
    await user.selectOptions(screen.getByLabelText('Tipus'), 'despesa');
    const opcions = Array.from(screen.getByLabelText('Categoria').querySelectorAll('option')).map((o) => o.value);
    expect(opcions).toEqual(['Gestió pel·lícules', 'Gestió associació']);
  });
});

describe('MovimentForm — un traspàs no es pot vincular a cap sessió', () => {
  it('no mostra el selector de sessió quan el tipus és Traspàs', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/comptabilitat/nou']}>
        <Routes><Route path="/comptabilitat/nou" element={<MovimentForm />} /></Routes>
      </MemoryRouter>
    );
    await user.selectOptions(screen.getByLabelText('Tipus'), 'traspas');
    expect(screen.queryByLabelText('Sessió (opcional)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Sessió (pel·lícula)')).not.toBeInTheDocument();
  });

  it('desa un traspàs sense sessionId encara que se n\'hagués triat una abans', async () => {
    getDocs.mockResolvedValueOnce({ docs: [{ id: 's1', data: () => ({ titol: 'The Artist' }) }] });
    const user = userEvent.setup();
    addDoc.mockClear();
    render(
      <MemoryRouter initialEntries={['/comptabilitat/nou']}>
        <Routes>
          <Route path="/comptabilitat/nou" element={<MovimentForm />} />
          <Route path="/comptabilitat" element={<p>Llibre de moviments</p>} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByRole('option', { name: 'The Artist' });
    await user.selectOptions(screen.getByLabelText('Sessió (opcional)'), 's1');
    await user.selectOptions(screen.getByLabelText('Tipus'), 'traspas');
    await user.type(screen.getByLabelText('Concepte'), 'Traspàs a banc');
    await user.type(screen.getByLabelText('Preu unitari'), '50');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await screen.findByText('Llibre de moviments');
    const [, dadesDesades] = addDoc.mock.calls[0];
    expect(dadesDesades.sessionId).toBe('');
  });
});

describe('MovimentForm — preomplenat via paràmetres d\'URL', () => {
  it('preomple data, tipus, categoria, concepte, preu unitari i quantitat des de la URL', async () => {
    render(
      <MemoryRouter initialEntries={[
        '/comptabilitat/nou?sessionId=s1&data=2026-03-05&tipus=ingres&categoria=Aportacions&concepte=Aportacions&preuUnitari=5&quantitat=10',
      ]}
      >
        <Routes><Route path="/comptabilitat/nou" element={<MovimentForm />} /></Routes>
      </MemoryRouter>
    );
    expect(screen.getByLabelText('Data')).toHaveValue('2026-03-05');
    expect(screen.getByLabelText('Categoria')).toHaveValue('Aportacions');
    expect(screen.getByLabelText('Concepte')).toHaveValue('Aportacions');
    expect(screen.getByLabelText('Preu unitari')).toHaveValue(5);
    expect(screen.getByLabelText('Quantitat')).toHaveValue(10);
    expect(screen.getByLabelText('Total')).toHaveValue(50);
  });

  it('ignora una categoria de la URL que no és vàlida per al tipus indicat', async () => {
    render(
      <MemoryRouter initialEntries={['/comptabilitat/nou?tipus=ingres&categoria=Gestió pel·lícules']}>
        <Routes><Route path="/comptabilitat/nou" element={<MovimentForm />} /></Routes>
      </MemoryRouter>
    );
    expect(screen.getByLabelText('Categoria')).toHaveValue('Aportacions');
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

  it('bloqueja el selector de sessió quan ve preseleccionada per URL', async () => {
    getDocs.mockResolvedValueOnce({ docs: [{ id: 's1', data: () => ({ titol: 'The Artist' }) }] });
    render(
      <MemoryRouter initialEntries={['/comptabilitat/nou?sessionId=s1']}>
        <Routes><Route path="/comptabilitat/nou" element={<MovimentForm />} /></Routes>
      </MemoryRouter>
    );
    await screen.findByRole('option', { name: 'The Artist' });
    expect(screen.getByLabelText('Sessió (opcional)')).toBeDisabled();
  });

  it('no bloqueja el selector de sessió quan s\'obre el formulari sense sessió a la URL', async () => {
    getDocs.mockResolvedValueOnce({ docs: [{ id: 's1', data: () => ({ titol: 'The Artist' }) }] });
    render(
      <MemoryRouter initialEntries={['/comptabilitat/nou']}>
        <Routes><Route path="/comptabilitat/nou" element={<MovimentForm />} /></Routes>
      </MemoryRouter>
    );
    await screen.findByRole('option', { name: 'The Artist' });
    expect(screen.getByLabelText('Sessió (opcional)')).not.toBeDisabled();
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
