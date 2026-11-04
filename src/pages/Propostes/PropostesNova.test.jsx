import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter, Routes, Route, useNavigationType, useParams,
} from 'react-router-dom';

const SOCIS = { docs: [{ id: 's1', data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: 7 }) }] };

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('../../lib/pellicules', () => ({ cercarPellicules: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  // Un id diferent de «nova»: la ruta de la fitxa creada no ha de coincidir amb la del formulari d'alta.
  addDoc: vi.fn().mockResolvedValue({ id: 'p42' }),
  collection: vi.fn((_, nom) => nom),
  getDocs: vi.fn(),
  query: vi.fn((col, ...condicions) => ({ col, condicions })),
  where: vi.fn((...args) => args),
  serverTimestamp: vi.fn(() => 'TIMESTAMP'),
}));

import { addDoc, getDocs } from 'firebase/firestore';
import { cercarPellicules } from '../../lib/pellicules';
import PropostesNova from './PropostesNova';

// Fitxa de la proposta: diu quina i com s'hi ha arribat (REPLACE: «enrere» no torna al formulari d'alta).
function FitxaProva() {
  const { id } = useParams();
  return <p>Fitxa de la proposta {id} ({useNavigationType()})</p>;
}

function renderPagina() {
  return render(
    <MemoryRouter initialEntries={['/propostes/pendents/nova']}>
      <Routes>
        <Route path="/propostes/pendents/nova" element={<PropostesNova />} />
        <Route path="/propostes/pendents" element={<p>Llistat de propostes</p>} />
        <Route path="/propostes/pendents/:id" element={<FitxaProva />} />
      </Routes>
    </MemoryRouter>
  );
}

// `obertes`: propostes 'pendent'/'aprovada' que retorna la consulta de duplicats.
function preparar(obertes = []) {
  getDocs.mockImplementation(async (consulta) => (consulta === 'socis'
    ? SOCIS
    : { docs: obertes.map((dades, i) => ({ id: `o${i}`, data: () => dades })) }));
}

async function omplir(user, { soci = 'Anna Vidal — núm. 7' } = {}) {
  await user.type(await screen.findByLabelText('Soci'), soci);
  await user.type(screen.getByLabelText('Pel·lícula'), 'Amé');
  await user.click(await screen.findByRole('button', { name: 'Amélie (2001)' }));
}

describe('PropostesNova', () => {
  beforeEach(() => {
    addDoc.mockClear();
    preparar();
    cercarPellicules.mockReset();
    cercarPellicules.mockResolvedValue([{ tmdbId: 194, titol: 'Amélie', any: '2001', posterUrl: null }]);
  });

  it('crea una proposta pendent de la pel·lícula de TMDB en nom del soci i obre la seva fitxa', async () => {
    const user = userEvent.setup();
    renderPagina();
    await omplir(user);
    await user.type(screen.getByLabelText('Comentari (opcional)'), ' La recomano ');
    await user.click(screen.getByRole('button', { name: 'Crear proposta' }));

    expect(await screen.findByText('Fitxa de la proposta p42 (REPLACE)')).toBeInTheDocument();
    expect(screen.queryByText('Llistat de propostes')).not.toBeInTheDocument();
    expect(cercarPellicules).toHaveBeenCalledWith('Amé', undefined);
    expect(addDoc).toHaveBeenCalledTimes(1);
    const [col, dadesDesades] = addDoc.mock.calls[0];
    expect(col).toBe('propostes');
    expect(dadesDesades).toEqual({
      titol: 'Amélie',
      any: '2001',
      tmdbId: 194,
      comentari: 'La recomano',
      numeroSoci: 7,
      nomProposant: 'Anna V.',
      estat: 'pendent',
      timestamp: 'TIMESTAMP',
    });
  });

  it('«Crear proposta» està desactivat fins que hi ha soci i pel·lícula triada', async () => {
    const user = userEvent.setup();
    renderPagina();
    const boto = await screen.findByRole('button', { name: 'Crear proposta' });
    expect(boto).toBeDisabled();
    await user.type(screen.getByLabelText('Soci'), 'Anna Vidal — núm. 7');
    expect(boto).toBeDisabled();
    await user.type(screen.getByLabelText('Pel·lícula'), 'Amé');
    await user.click(await screen.findByRole('button', { name: 'Amélie (2001)' }));
    expect(boto).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Canviar' }));
    expect(boto).toBeDisabled();
  });

  it('el comentari és un camp de text llarg de com a màxim 1000 caràcters', async () => {
    renderPagina();
    const comentari = await screen.findByLabelText('Comentari (opcional)');
    expect(comentari.tagName).toBe('TEXTAREA');
    expect(comentari).toHaveAttribute('maxLength', '1000');
  });

  it('no desa si el text del soci no coincideix amb cap soci de la llista', async () => {
    const user = userEvent.setup();
    renderPagina();
    await omplir(user, { soci: 'Algú que no existeix' });
    await user.click(screen.getByRole('button', { name: 'Crear proposta' }));

    expect(await screen.findByText('Selecciona un soci vàlid de la llista.')).toBeInTheDocument();
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('no desa si ja hi ha una proposta oberta de la mateixa pel·lícula', async () => {
    preparar([{ titol: 'Amélie', tmdbId: 194, estat: 'aprovada' }]);
    const user = userEvent.setup();
    renderPagina();
    await omplir(user);
    await user.click(screen.getByRole('button', { name: 'Crear proposta' }));

    expect(await screen.findByText('Aquesta pel·lícula ja està proposada.')).toBeInTheDocument();
    expect(addDoc).not.toHaveBeenCalled();
    const consulta = getDocs.mock.calls.at(-1)[0];
    expect(consulta).toEqual({ col: 'propostes', condicions: [['estat', 'in', ['pendent', 'aprovada']]] });
  });

  it('una proposta oberta d\'una altra pel·lícula no bloqueja', async () => {
    preparar([{ titol: 'Amélie', tmdbId: 999, estat: 'pendent' }]);
    const user = userEvent.setup();
    renderPagina();
    await omplir(user);
    await user.click(screen.getByRole('button', { name: 'Crear proposta' }));

    expect(await screen.findByText('Fitxa de la proposta p42 (REPLACE)')).toBeInTheDocument();
  });

  it('si no es pot desar, ho diu i deixa tornar-ho a provar', async () => {
    addDoc.mockRejectedValueOnce(new Error('unavailable'));
    const user = userEvent.setup();
    renderPagina();
    await omplir(user);
    await user.click(screen.getByRole('button', { name: 'Crear proposta' }));

    expect(await screen.findByText("No s'ha pogut desar. Torna-ho a provar.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear proposta' })).toBeEnabled();
  });
});

describe('PropostesNova: layout estàndard', () => {
  beforeEach(() => preparar());

  it('és un formulari estret amb un sol h1 i l\'enllaç «← Propostes»', async () => {
    const { container } = renderPagina();
    await screen.findByLabelText('Soci');
    expect(container.firstChild.tagName).toBe('FORM');
    expect(container.firstChild).toHaveClass('pagina-admin', 'pagina-admin--formulari');
    const titols = screen.getAllByRole('heading', { level: 1 });
    expect(titols).toHaveLength(1);
    expect(titols[0]).toHaveTextContent("Nova proposta en nom d'un soci");
    expect(screen.getByRole('link', { name: '← Propostes' })).toHaveAttribute('href', '/propostes/pendents');
  });
});

describe('PropostesNova: error de càrrega', () => {
  beforeEach(() => preparar());

  it('si no es poden llegir els socis, ho diu i «Torna-ho a provar» els torna a llegir', async () => {
    const errorConsola = vi.spyOn(console, 'error').mockImplementation(() => {});
    getDocs.mockRejectedValueOnce(new Error('unavailable'));
    renderPagina();
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'han pogut carregar els socis.");
    fireEvent.click(screen.getByRole('button', { name: 'Torna-ho a provar' }));
    expect(await screen.findByLabelText('Pel·lícula')).toBeInTheDocument();
    errorConsola.mockRestore();
  });
});
