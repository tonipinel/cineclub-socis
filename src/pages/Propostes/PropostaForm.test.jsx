import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('../../lib/pellicules', () => ({ cercarPellicules: vi.fn(), assignarPellicula: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  setDoc: vi.fn().mockResolvedValue(undefined),
}));

import {
  deleteDoc, getDoc, getDocs, setDoc, updateDoc,
} from 'firebase/firestore';
import { assignarPellicula, cercarPellicules } from '../../lib/pellicules';
import PropostaForm from './PropostaForm';

const SOCIS = [
  { id: 's7', nom: 'Anna', cognoms: 'Vidal', numeroSoci: 7 },
  { id: 's9', nom: 'Toni', cognoms: 'Pinel', numeroSoci: 9 },
];

function mockSocis() {
  getDocs.mockResolvedValueOnce({ docs: SOCIS.map((s) => ({ id: s.id, data: () => s })) });
}

async function obrirEdicio(user) {
  await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
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
    setDoc.mockClear();
    getDocs.mockReset();
    cercarPellicules.mockReset().mockResolvedValue([]);
    assignarPellicula.mockReset();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('per defecte mostra la fitxa en només lectura, amb el soci, el comentari i l\'estat', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({
        titol: 'Amélie', comentari: 'Molt bona!', numeroSoci: 7, estat: 'pendent', directors: ['Jean-Pierre Jeunet'], any: '2001',
      }),
    });
    mockSocis();
    renderFormulari();
    expect(await screen.findByRole('heading', { name: 'Amélie' })).toBeInTheDocument();
    expect(screen.getByText('Anna Vidal — núm. 7')).toBeInTheDocument();
    expect(screen.getByText('Molt bona!')).toBeInTheDocument();
    expect(screen.getByText('Jean-Pierre Jeunet')).toBeInTheDocument();
    expect(screen.queryByLabelText('Estat')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desar' })).not.toBeInTheDocument();
  });

  it('permet aprovar, canviar el soci vinculat i afegir cartell, tràiler i sinopsi, i desa i torna al llistat', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'Amélie', numeroSoci: 7, estat: 'pendent' }),
    });
    mockSocis();
    const user = userEvent.setup();
    renderFormulari();
    await obrirEdicio(user);

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
      comentari: '',
      sinopsiIdioma: 'ca',
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
    await obrirEdicio(user);

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
    await obrirEdicio(user);

    await user.click(screen.getByRole('button', { name: 'Eliminar proposta' }));

    expect(window.confirm).toHaveBeenCalledWith(
      'Segur que vols eliminar definitivament la proposta "Amélie"? Aquesta acció no es pot desfer.'
    );
    expect(await screen.findByText('Llistat de propostes')).toBeInTheDocument();
    expect(deleteDoc).toHaveBeenCalledTimes(2);
  });

  it('no elimina la proposta si es cancel·la la confirmació', async () => {
    window.confirm.mockReturnValue(false);
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'Amélie', numeroSoci: 7, estat: 'pendent' }),
    });
    mockSocis();
    const user = userEvent.setup();
    renderFormulari();
    await obrirEdicio(user);

    await user.click(screen.getByRole('button', { name: 'Eliminar proposta' }));

    expect(deleteDoc).not.toHaveBeenCalled();
    expect(screen.getByText('Amélie')).toBeInTheDocument();
  });

  it('el cercador comença amb el títol de la proposta i, en triar una pel·lícula, carrega la fitxa de TMDB al formulari', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ titol: 'El odio', numeroSoci: 7, estat: 'pendent' }) });
    mockSocis();
    cercarPellicules.mockResolvedValue([{ tmdbId: 5, titol: 'El odio', any: '1995', posterUrl: null }]);
    assignarPellicula.mockResolvedValue({
      tmdbId: 5, titol: 'El odio', any: '1995', sinopsi: 'Tres joves…', imatgeUrl: 'https://storage.test/odio.jpg',
    });
    const user = userEvent.setup();
    renderFormulari();
    await obrirEdicio(user);
    expect(await screen.findByLabelText('Pel·lícula')).toHaveValue('El odio');

    await user.click(await screen.findByRole('button', { name: /El odio \(1995\)/ }));

    expect(assignarPellicula).toHaveBeenCalledWith('p1', 5);
    expect(await screen.findByDisplayValue('https://storage.test/odio.jpg')).toBeInTheDocument();
    expect(screen.getByLabelText('Sinopsi')).toHaveValue('Tres joves…');
  });

  it('mostra un error si no es pot carregar la fitxa de la pel·lícula', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ titol: 'El odio', numeroSoci: 7, estat: 'pendent' }) });
    mockSocis();
    cercarPellicules.mockResolvedValue([{ tmdbId: 5, titol: 'El odio', any: '1995', posterUrl: null }]);
    assignarPellicula.mockRejectedValue(new Error('fail'));
    const user = userEvent.setup();
    renderFormulari();
    await obrirEdicio(user);
    await user.click(await screen.findByRole('button', { name: /El odio \(1995\)/ }));
    expect(await screen.findByText("No s'ha pogut carregar la fitxa de la pel·lícula. Torna-ho a provar.")).toBeInTheDocument();
  });

  it('si la proposta ja té pel·lícula de TMDB (triada pel soci), la mostra fixa i el cercador només surt en "Canviar"', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'El odio', any: '1995', tmdbId: 5, imatgeUrl: 'https://storage.test/odio.jpg', numeroSoci: 7, estat: 'pendent' }),
    });
    mockSocis();
    const user = userEvent.setup();
    renderFormulari();
    await obrirEdicio(user);
    expect(await screen.findByText('El odio (1995)')).toBeInTheDocument();
    expect(screen.queryByLabelText('Pel·lícula')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Canviar' }));
    expect(screen.getByLabelText('Pel·lícula')).toBeInTheDocument();
    expect(assignarPellicula).not.toHaveBeenCalled();
  });

  it('la fitxa mostra les dades de TMDB i permet actualitzar-les', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({
        titol: 'La Haine', tmdbId: 5, numeroSoci: 7, estat: 'aprovada', titolLocal: 'El odio', sinopsi: 'Tres joves…',
        repartiment: [{ nom: 'Vincent Cassel', personatge: 'Vinz' }],
      }),
    });
    mockSocis();
    assignarPellicula.mockResolvedValue({ lema: 'Fins ara tot va bé' });
    const user = userEvent.setup();
    renderFormulari();
    expect(await screen.findByRole('heading', { name: 'La Haine' })).toBeInTheDocument();
    expect(screen.getByText('Títol a Espanya')).toBeInTheDocument();
    expect(screen.getByText('El odio')).toBeInTheDocument();
    expect(screen.getByText('Vincent Cassel (Vinz)')).toBeInTheDocument();
    expect(screen.getByText('Tres joves…')).toBeInTheDocument();
    expect(screen.getByText('Aprovada')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Actualitzar fitxa des de TMDB' }));
    expect(assignarPellicula).toHaveBeenCalledWith('p1', 5);
    expect(await screen.findByText('Fins ara tot va bé')).toBeInTheDocument();
  });

  it('una proposta sense pel·lícula de TMDB ho avisa i no ofereix actualitzar', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ titol: 'Amélie', numeroSoci: 7, estat: 'pendent' }) });
    mockSocis();
    renderFormulari();
    expect(await screen.findByText(/encara no té pel·lícula de TMDB/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Actualitzar fitxa/ })).not.toBeInTheDocument();
  });

  it('"Cancel·lar" torna a la fitxa sense desar', async () => {
    getDoc.mockResolvedValue({ data: () => ({ titol: 'Amélie', numeroSoci: 7, estat: 'pendent' }) });
    getDocs.mockResolvedValue({ docs: SOCIS.map((s) => ({ id: s.id, data: () => s })) });
    const user = userEvent.setup();
    renderFormulari();
    await obrirEdicio(user);
    await user.click(screen.getByRole('button', { name: 'Cancel·lar' }));
    expect(await screen.findByRole('button', { name: 'Editar dades' })).toBeInTheDocument();
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('avisa que la sinopsi és en castellà i, en editar-la, la desa marcada com a catalana', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({
        titol: 'El odio', tmdbId: 5, numeroSoci: 7, estat: 'aprovada', sinopsi: 'Tres jóvenes…', sinopsiIdioma: 'es',
      }),
    });
    mockSocis();
    const user = userEvent.setup();
    renderFormulari();
    expect(await screen.findByText(/Aquesta sinopsi és en castellà/)).toBeInTheDocument();

    await obrirEdicio(user);
    const sinopsi = screen.getByLabelText('Sinopsi');
    await user.clear(sinopsi);
    await user.type(sinopsi, 'Tres joves…');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await screen.findByText('Llistat de propostes');
    expect(updateDoc.mock.calls[0][1]).toMatchObject({ sinopsi: 'Tres joves…', sinopsiIdioma: 'ca' });
  });

  it('si no es toca la sinopsi, no canvia el seu idioma en desar', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'El odio', numeroSoci: 7, estat: 'aprovada', sinopsi: 'Tres jóvenes…', sinopsiIdioma: 'es' }),
    });
    mockSocis();
    const user = userEvent.setup();
    renderFormulari();
    await obrirEdicio(user);
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await screen.findByText('Llistat de propostes');
    expect(updateDoc.mock.calls[0][1]).not.toHaveProperty('sinopsiIdioma');
  });

  describe('gestió interna (privada)', () => {
    const DISTRIBUIDORES = [
      {
        id: 'd2', nom: 'Surtsey Films', web: 'surtseyfilms.com', contacte: 'Marta', correu: 'marta@surtsey.test', preu: 150, condicions: 'Només en dimecres',
      },
      { id: 'd1', nom: 'Atalante', web: '', contacte: '', correu: '' },
    ];

    // L'ordre de getDocs segueix el dels efectes: socis, vots, distribuïdores.
    function mockCarrega({ proposta, interna }) {
      getDoc.mockResolvedValueOnce({ data: () => proposta }).mockResolvedValueOnce({ data: () => interna });
      getDocs
        .mockResolvedValueOnce({ docs: SOCIS.map((s) => ({ id: s.id, data: () => s })) })
        .mockResolvedValueOnce({ docs: [] })
        .mockResolvedValueOnce({ docs: DISTRIBUIDORES.map((d) => ({ id: d.id, data: () => d })) });
    }

    it('la fitxa mostra la distribuïdora (amb contacte), el preu i les condicions especials', async () => {
      mockCarrega({
        proposta: { titol: 'Amélie', numeroSoci: 7, estat: 'aprovada' },
        interna: { preu: 350, condicions: 'Només 35mm\nProjectar abans del 30/11', distribuidoraId: 'd2' },
      });
      renderFormulari();
      expect(await screen.findByRole('link', { name: 'Surtsey Films' })).toHaveAttribute('href', '/distribuidores/d2');
      expect(screen.getByRole('link', { name: 'surtseyfilms.com' })).toHaveAttribute('href', 'https://surtseyfilms.com');
      expect(screen.getByRole('link', { name: 'marta@surtsey.test' })).toHaveAttribute('href', 'mailto:marta@surtsey.test');
      expect(screen.getByText('350.00€')).toBeInTheDocument();
      expect(screen.getByText(/Només 35mm/)).toBeInTheDocument();
      expect(screen.getByText('Privat')).toBeInTheDocument();
    });

    it('si la pel·lícula no té preu ni condicions propis, hereta els de la distribuïdora', async () => {
      mockCarrega({
        proposta: { titol: 'Amélie', numeroSoci: 7, estat: 'aprovada' },
        interna: { preu: null, condicions: '', distribuidoraId: 'd2' },
      });
      renderFormulari();
      expect(await screen.findByText('150.00€')).toBeInTheDocument();
      expect(screen.getByText('Només en dimecres')).toBeInTheDocument();
      expect(screen.getAllByText(/per defecte de la distribuïdora/)).toHaveLength(2);
    });

    it('si la pel·lícula té preu o condicions propis, no s\'apliquen els per defecte (inclòs un preu de 0)', async () => {
      mockCarrega({
        proposta: { titol: 'Amélie', numeroSoci: 7, estat: 'aprovada' },
        interna: { preu: 0, condicions: 'Gratis per ser cicle escolar', distribuidoraId: 'd2' },
      });
      renderFormulari();
      expect(await screen.findByText('0.00€')).toBeInTheDocument();
      expect(screen.getByText('Gratis per ser cicle escolar')).toBeInTheDocument();
      expect(screen.queryByText(/per defecte de la distribuïdora/)).not.toBeInTheDocument();
      expect(screen.queryByText('150.00€')).not.toBeInTheDocument();
    });

    it('en editar, avisa de quins són els valors per defecte de la distribuïdora triada', async () => {
      mockCarrega({
        proposta: { titol: 'Amélie', numeroSoci: 7, estat: 'aprovada' },
        interna: { preu: null, condicions: '', distribuidoraId: 'd2' },
      });
      const user = userEvent.setup();
      renderFormulari();
      await obrirEdicio(user);
      expect(await screen.findByLabelText('Preu (€)')).toHaveAttribute('placeholder', '150 (per defecte)');
      expect(screen.getByText(/s'aplica el preu per defecte de Surtsey Films/)).toBeInTheDocument();
      expect(screen.getByText(/s'apliquen les condicions per defecte de Surtsey Films/)).toBeInTheDocument();
    });

    it('sense dades internes, ho mostra buit', async () => {
      mockCarrega({ proposta: { titol: 'Amélie', numeroSoci: 7, estat: 'aprovada' }, interna: undefined });
      renderFormulari();
      await screen.findByText('Gestió interna');
      expect(screen.getAllByText('—')).toHaveLength(3);
    });

    it('en editar, desa el preu, les condicions i la distribuïdora a la col·lecció privada', async () => {
      mockCarrega({ proposta: { titol: 'Amélie', numeroSoci: 7, estat: 'aprovada' }, interna: undefined });
      const user = userEvent.setup();
      renderFormulari();
      await obrirEdicio(user);
      await user.selectOptions(await screen.findByLabelText('Distribuïdora'), 'd1');
      await user.type(screen.getByLabelText('Preu (€)'), '120.5');
      await user.type(screen.getByLabelText('Condicions especials'), '  Cal copia digital  ');
      await user.click(screen.getByRole('button', { name: 'Desar' }));

      await screen.findByText('Llistat de propostes');
      expect(setDoc.mock.calls[0][1]).toEqual({ preu: 120.5, condicions: 'Cal copia digital', distribuidoraId: 'd1' });
      expect(updateDoc.mock.calls[0][1]).not.toHaveProperty('preu');
    });

    it('un preu en blanc es desa com a null', async () => {
      mockCarrega({ proposta: { titol: 'Amélie', numeroSoci: 7, estat: 'aprovada' }, interna: undefined });
      const user = userEvent.setup();
      renderFormulari();
      await obrirEdicio(user);
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      await screen.findByText('Llistat de propostes');
      expect(setDoc.mock.calls[0][1]).toEqual({ preu: null, condicions: '', distribuidoraId: '' });
    });
  });

  it('permet editar el comentari que va escriure el soci i el desa retallat', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'Amélie', numeroSoci: 7, estat: 'aprovada', comentari: 'Molt bona!' }),
    });
    mockSocis();
    const user = userEvent.setup();
    renderFormulari();
    await obrirEdicio(user);
    const comentari = screen.getByLabelText('Comentari del soci');
    expect(comentari).toHaveValue('Molt bona!');
    await user.clear(comentari);
    await user.type(comentari, '  Una pel·lícula tendra i divertida  ');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await screen.findByText('Llistat de propostes');
    expect(updateDoc.mock.calls[0][1]).toMatchObject({ comentari: 'Una pel·lícula tendra i divertida' });
  });

  it('es pot esborrar el comentari del soci', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'Amélie', numeroSoci: 7, estat: 'aprovada', comentari: 'Molt bona!' }),
    });
    mockSocis();
    const user = userEvent.setup();
    renderFormulari();
    await obrirEdicio(user);
    await user.clear(screen.getByLabelText('Comentari del soci'));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await screen.findByText('Llistat de propostes');
    expect(updateDoc.mock.calls[0][1]).toMatchObject({ comentari: '' });
  });
});
