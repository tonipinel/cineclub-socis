import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
}));

import { deleteDoc, getDoc, getDocs, updateDoc } from 'firebase/firestore';
import PropostaForm from './PropostaForm';

const SOCIS = [
  { id: 's7', nom: 'Anna', cognoms: 'Vidal', numeroSoci: 7 },
  { id: 's9', nom: 'Toni', cognoms: 'Pinel', numeroSoci: 9 },
];

function mockSocis() {
  getDocs.mockResolvedValueOnce({ docs: SOCIS.map((s) => ({ id: s.id, data: () => s })) });
}

function renderFormulari() {
  return render(
    <MemoryRouter initialEntries={['/propostes/pendents/p1']}>
      <Routes>
        <Route path="/propostes/pendents/:id" element={<PropostaForm />} />
        <Route path="/propostes/pendents" element={<p>Llistat de propostes</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PropostaForm', () => {
  beforeEach(() => {
    updateDoc.mockClear();
    deleteDoc.mockClear();
    getDocs.mockReset();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mostra les dades enviades pel soci de només lectura, i el soci vinculat pre-omplert', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({
        titol: 'Amélie', enllac: 'https://filmaffinity.com/x', comentari: 'Molt bona!', numeroSoci: 7, estat: 'pendent',
      }),
    });
    mockSocis();
    renderFormulari();
    expect(await screen.findByText('Amélie')).toBeInTheDocument();
    expect(screen.getByLabelText('Soci')).toHaveValue('Anna Vidal — núm. 7');
    expect(screen.getByText('"Molt bona!"')).toBeInTheDocument();
  });

  it('permet aprovar, canviar el soci vinculat i afegir cartell, tràiler i sinopsi, i desa i torna al llistat', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'Amélie', numeroSoci: 7, estat: 'pendent' }),
    });
    mockSocis();
    const user = userEvent.setup();
    renderFormulari();
    await screen.findByText('Amélie');

    const campSoci = screen.getByLabelText('Soci');
    await user.clear(campSoci);
    await user.type(campSoci, 'Toni Pinel — núm. 9');
    await user.selectOptions(screen.getByLabelText('Estat'), 'aprovada');
    await user.type(screen.getByLabelText('URL del cartell'), 'https://exemple.com/cartell.jpg');
    await user.type(screen.getByLabelText('URL del tràiler'), 'https://youtube.com/x');
    await user.type(screen.getByLabelText('Sinopsi'), 'Una noia parisenca...');
    await user.click(screen.getByRole('button', { name: 'Desar' }));

    expect(await screen.findByText('Llistat de propostes')).toBeInTheDocument();
    expect(updateDoc).toHaveBeenCalledWith(undefined, {
      estat: 'aprovada',
      imatgeUrl: 'https://exemple.com/cartell.jpg',
      trailerUrl: 'https://youtube.com/x',
      sinopsi: 'Una noia parisenca...',
      numeroSoci: 9,
      nomProposant: 'Toni P.',
    });
  });

  it('no desa si el text del soci no coincideix amb cap soci de la llista', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'Amélie', numeroSoci: 7, estat: 'pendent' }),
    });
    mockSocis();
    const user = userEvent.setup();
    renderFormulari();
    await screen.findByText('Amélie');

    const campSoci = screen.getByLabelText('Soci');
    await user.clear(campSoci);
    await user.type(campSoci, 'Algú que no existeix');
    await user.click(screen.getByRole('button', { name: 'Desar' }));

    expect(await screen.findByText('Selecciona un soci vàlid de la llista.')).toBeInTheDocument();
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('elimina la proposta després de confirmar i torna al llistat', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'Amélie', numeroSoci: 7, estat: 'pendent' }),
    });
    mockSocis();
    const user = userEvent.setup();
    renderFormulari();
    await screen.findByText('Amélie');

    await user.click(screen.getByRole('button', { name: 'Eliminar proposta' }));

    expect(window.confirm).toHaveBeenCalledWith(
      'Segur que vols eliminar definitivament la proposta "Amélie"? Aquesta acció no es pot desfer.'
    );
    expect(await screen.findByText('Llistat de propostes')).toBeInTheDocument();
    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it('no elimina la proposta si es cancel·la la confirmació', async () => {
    window.confirm.mockReturnValue(false);
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'Amélie', numeroSoci: 7, estat: 'pendent' }),
    });
    mockSocis();
    const user = userEvent.setup();
    renderFormulari();
    await screen.findByText('Amélie');

    await user.click(screen.getByRole('button', { name: 'Eliminar proposta' }));

    expect(deleteDoc).not.toHaveBeenCalled();
    expect(screen.getByText('Amélie')).toBeInTheDocument();
  });
});
