import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn().mockResolvedValue({ id: 'nova' }),
  setDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  doc: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}));

import {
  addDoc, deleteDoc, getDoc, getDocs, setDoc,
} from 'firebase/firestore';
import DistribuidoraForm from './DistribuidoraForm';
import {
  acceptaDialeg, cancellaDialeg, dialegConfirmacio, hiHaDialegConfirmacio, renderAmbConfirmacio, tancaDialegAmbEsc,
} from '../../test/confirmacio';

function renderNova() {
  return renderAmbConfirmacio(
    <MemoryRouter initialEntries={['/distribuidores/nova']}>
      <Routes>
        <Route path="/distribuidores/nova" element={<DistribuidoraForm />} />
        <Route path="/distribuidores" element={<p>Llistat de distribuïdores</p>} />
      </Routes>
    </MemoryRouter>
  );
}

function renderExistent() {
  return renderAmbConfirmacio(
    <MemoryRouter initialEntries={['/distribuidores/d1']}>
      <Routes>
        <Route path="/distribuidores/:id" element={<DistribuidoraForm />} />
        <Route path="/distribuidores" element={<p>Llistat de distribuïdores</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('DistribuidoraForm', () => {
  beforeEach(() => {
    addDoc.mockClear();
    setDoc.mockClear();
    deleteDoc.mockClear();
    getDoc.mockReset();
    getDocs.mockReset();
  });

  it('crea una distribuïdora amb nom, web, persona i correu de contacte', async () => {
    const user = userEvent.setup();
    renderNova();
    await user.type(screen.getByLabelText('Nom'), '  Surtsey Films ');
    await user.type(screen.getByLabelText('Web'), 'surtseyfilms.com');
    await user.type(screen.getByLabelText('Persona de contacte'), 'Marta');
    await user.type(screen.getByLabelText('Correu electrònic de contacte'), 'marta@surtsey.test');
    await user.type(screen.getByLabelText('Preu per defecte (€)'), '150');
    await user.type(screen.getByLabelText('Condicions per defecte'), ' Projecció només en dimecres ');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByText('Llistat de distribuïdores')).toBeInTheDocument();
    expect(addDoc.mock.calls[0][1]).toEqual({
      nom: 'Surtsey Films',
      web: 'surtseyfilms.com',
      contacte: 'Marta',
      correu: 'marta@surtsey.test',
      preu: 150,
      condicions: 'Projecció només en dimecres',
    });
  });

  it('el preu i les condicions per defecte són opcionals', async () => {
    const user = userEvent.setup();
    renderNova();
    await user.type(screen.getByLabelText('Nom'), 'Atalante');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await screen.findByText('Llistat de distribuïdores');
    expect(addDoc.mock.calls[0][1]).toMatchObject({ preu: null, condicions: '' });
  });

  it('no deixa desar sense nom (ni només amb espais)', async () => {
    const user = userEvent.setup();
    renderNova();
    expect(screen.getByLabelText('Nom')).toBeRequired();
    await user.type(screen.getByLabelText('Nom'), '   ');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByText('El nom no pot estar en blanc.')).toBeInTheDocument();
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('en editar, els camps són de només lectura fins que es desbloqueja', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Atalante', web: '', contacte: '', correu: '' }) });
    const user = userEvent.setup();
    renderExistent();
    expect(await screen.findByLabelText('Nom')).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Desar' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Editar dades' }));
    await user.type(screen.getByLabelText('Web'), 'atalante.test');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await screen.findByText('Llistat de distribuïdores');
    expect(setDoc.mock.calls[0][1]).toMatchObject({ nom: 'Atalante', web: 'atalante.test' });
  });

  it('elimina la distribuïdora després de confirmar si no la fa servir cap proposta', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Atalante' }) });
    getDocs.mockResolvedValueOnce({ empty: true, docs: [] });
    const user = userEvent.setup();
    renderExistent();
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    const dialeg = await dialegConfirmacio();
    expect(dialeg).toHaveAttribute('role', 'alertdialog');
    expect(dialeg).toHaveTextContent('Segur que vols eliminar aquesta distribuïdora? Aquesta acció no es pot desfer.');
    expect(deleteDoc).not.toHaveBeenCalled();
    await acceptaDialeg('Elimina');
    expect(await screen.findByText('Llistat de distribuïdores')).toBeInTheDocument();
    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Cancel·lar', (user) => cancellaDialeg(user)],
    ['ESC', (user) => tancaDialegAmbEsc(user)],
  ])('no elimina la distribuïdora si es tanca el diàleg amb %s', async (_nom, tanca) => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Atalante' }) });
    getDocs.mockResolvedValueOnce({ empty: true, docs: [] });
    const user = userEvent.setup();
    renderExistent();
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    await tanca(user);
    await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(screen.queryByText('Llistat de distribuïdores')).not.toBeInTheDocument();
  });

  it('no deixa eliminar una distribuïdora que ja fa servir alguna proposta', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Atalante' }) });
    getDocs.mockResolvedValueOnce({ empty: false, docs: [{}, {}] });
    const user = userEvent.setup();
    renderExistent();
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(await screen.findByText("No es pot eliminar: s'està fent servir en 2 proposta(es).")).toBeInTheDocument();
    expect(hiHaDialegConfirmacio()).toBe(false);
    expect(deleteDoc).not.toHaveBeenCalled();
  });
});

describe('DistribuidoraForm: layout estàndard', () => {
  beforeEach(() => {
    getDoc.mockReset();
    getDoc.mockResolvedValue({ data: () => ({ nom: 'Atalante', condicions: 'Només dimecres' }) });
  });

  it('nova: formulari estret amb un sol h1 i l\'enllaç «← Distribuïdores»', () => {
    const { container } = renderNova();
    expect(container.firstChild.tagName).toBe('FORM');
    expect(container.firstChild).toHaveClass('pagina-admin', 'pagina-admin--formulari');
    const titols = screen.getAllByRole('heading', { level: 1 });
    expect(titols).toHaveLength(1);
    expect(titols[0]).toHaveTextContent('Nova distribuïdora');
    expect(screen.getByRole('link', { name: '← Distribuïdores' })).toHaveAttribute('href', '/distribuidores');
  });

  it('les condicions creixen amb el text i, en lectura, segueixen sent de només lectura', async () => {
    const user = userEvent.setup();
    renderExistent();
    const condicions = await screen.findByLabelText('Condicions per defecte');
    expect(condicions).toHaveClass('textarea-automatic', 'form__input--nomes-lectura');
    expect(condicions).toHaveAttribute('readonly');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Editar dades' }));
    expect(screen.getByLabelText('Condicions per defecte')).not.toHaveClass('form__input--nomes-lectura');
    expect(screen.getByLabelText('Condicions per defecte')).not.toHaveAttribute('readonly');
  });
});
