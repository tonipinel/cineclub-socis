import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn().mockResolvedValue({ id: 'nou' }),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
}));

import { addDoc, getDoc, getDocs, updateDoc } from 'firebase/firestore';
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
});

describe('SociForm — mode lectura/edició', () => {
  beforeEach(() => {
    updateDoc.mockClear();
  });

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

describe('SociForm — registrar pagament', () => {
  beforeEach(() => {
    updateDoc.mockClear();
    getDocs.mockClear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  function renderEnEdicio() {
    return render(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes>
          <Route path="/socis/:id" element={<SociForm />} />
        </Routes>
      </MemoryRouter>
    );
  }

  it('demana confirmació abans de registrar el pagament', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7' }) });
    const user = userEvent.setup();
    renderEnEdicio();
    await user.click(await screen.findByRole('button', { name: "Registrar pagament d'avui" }));
    expect(window.confirm).toHaveBeenCalledTimes(1);
  });

  it('no fa res si es cancel·la la confirmació', async () => {
    window.confirm.mockReturnValue(false);
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7' }) });
    const user = userEvent.setup();
    renderEnEdicio();
    await user.click(await screen.findByRole('button', { name: "Registrar pagament d'avui" }));
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('assigna el següent número de soci disponible si encara no en té', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '' }) });
    getDocs.mockResolvedValueOnce({
      docs: [{ data: () => ({ numeroSoci: 12 }) }, { data: () => ({ numeroSoci: 41 }) }],
    });
    const user = userEvent.setup();
    renderEnEdicio();
    await user.click(await screen.findByRole('button', { name: "Registrar pagament d'avui" }));
    expect(getDocs).toHaveBeenCalledTimes(1);
    expect(updateDoc.mock.calls[0][1].numeroSoci).toBe(42);
    expect(await screen.findByText('Número de soci/a: 42')).toBeInTheDocument();
  });

  it('no toca el número de soci si ja en té un', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7' }) });
    const user = userEvent.setup();
    renderEnEdicio();
    await user.click(await screen.findByRole('button', { name: "Registrar pagament d'avui" }));
    expect(getDocs).not.toHaveBeenCalled();
    expect(updateDoc.mock.calls[0][1].numeroSoci).toBeUndefined();
  });
});
