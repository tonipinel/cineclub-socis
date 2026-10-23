import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

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
  query: vi.fn((c) => c),
  where: vi.fn(),
  runTransaction: vi.fn(),
}));

import {
  collection, deleteDoc, doc, getDoc, getDocs, runTransaction, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { assignarPellicula, cercarPellicules } from '../../lib/pellicules';
import PropostaForm from './PropostaForm';
import {
  acceptaDialeg, cancellaDialeg, dialegConfirmacio, hiHaDialegConfirmacio, renderAmbConfirmacio, tancaDialegAmbEsc,
} from '../../test/confirmacio';

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

function UbicacioProva() {
  return <p>Edició de sessió a {useLocation().pathname}</p>;
}

function renderFormulari() {
  return renderAmbConfirmacio(
    <MemoryRouter initialEntries={['/propostes/pendents/p1']}>
      <Routes>
        <Route path="/propostes/pendents/:id" element={<PropostaForm />} />
        <Route path="/propostes/pendents" element={<p>Llistat de propostes</p>} />
        <Route path="/sessions/:id" element={<UbicacioProva />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PropostaForm', () => {
  beforeEach(() => {
    updateDoc.mockClear();
    deleteDoc.mockClear();
    setDoc.mockClear();
    getDocs.mockReset().mockResolvedValue({ docs: [] });
    cercarPellicules.mockReset().mockResolvedValue([]);
    assignarPellicula.mockReset();
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

    const dialeg = await dialegConfirmacio();
    expect(dialeg).toHaveAttribute('role', 'alertdialog');
    expect(dialeg).toHaveTextContent(
      'Segur que vols eliminar definitivament la proposta "Amélie"? Aquesta acció no es pot desfer.'
    );
    expect(deleteDoc).not.toHaveBeenCalled();
    await acceptaDialeg('Elimina');
    expect(await screen.findByText('Llistat de propostes')).toBeInTheDocument();
    expect(deleteDoc).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['Cancel·lar', (user) => cancellaDialeg(user)],
    ['ESC', (user) => tancaDialegAmbEsc(user)],
  ])('no elimina la proposta si es tanca la confirmació amb %s', async (_nom, tanca) => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ titol: 'Amélie', numeroSoci: 7, estat: 'pendent' }),
    });
    mockSocis();
    const user = userEvent.setup();
    renderFormulari();
    await obrirEdicio(user);

    await user.click(screen.getByRole('button', { name: 'Eliminar proposta' }));
    await tanca(user);
    await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));

    expect(deleteDoc).not.toHaveBeenCalled();
    expect(screen.getByText('Amélie')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar proposta' })).toHaveFocus();
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

    // L'ordre de getDocs segueix el dels efectes: socis, distribuïdores.
    function mockCarrega({ proposta, interna }) {
      getDoc.mockResolvedValueOnce({ data: () => proposta }).mockResolvedValueOnce({ data: () => interna });
      getDocs
        .mockResolvedValueOnce({ docs: SOCIS.map((s) => ({ id: s.id, data: () => s })) })
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
      const buit = (etiqueta) => screen.getByText(etiqueta).nextElementSibling;
      expect(buit('Tandes')).toHaveTextContent('—');
      expect(buit('Sessió')).toHaveTextContent('—');
      for (const etiqueta of ['Distribuïdora', 'Preu', 'Condicions especials']) {
        expect(buit(etiqueta)).toHaveTextContent('—');
      }
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

  describe('Programar sessió', () => {
    let tx;
    const PROPOSTA = {
      titol: 'Amélie', titolLocal: 'Amèlie', numeroSoci: 7, estat: 'aprovada', any: '2001', directors: ['Jean-Pierre Jeunet'], sinopsi: 'Una noia a París.',
      distribuidora: 'Secreta SL', preu: 500,
    };
    const INTERNA = { preu: 500, condicions: 'secret', distribuidoraId: 'd1' };

    // `estatTx` i `sessioTx`: l'estat de la proposta i si la sessió existeix DINS de la transacció.
    function preparar({ sessionsExistents = [], estatTx = 'aprovada', sessioTx = false, proposta = PROPOSTA } = {}) {
      runTransaction.mockReset();
      where.mockClear();
      getDoc.mockImplementation(async (ref) => ({ data: () => (ref.path === 'propostes/p1' ? proposta : INTERNA) }));
      collection.mockImplementation((_db, ...path) => ({ path: path.join('/') }));
      doc.mockImplementation((_db, ...path) => ({ path: path.join('/'), id: path[path.length - 1] }));
      getDocs.mockImplementation(async (ref) => {
        if (ref.path === 'socis') return { docs: SOCIS.map((s) => ({ id: s.id, data: () => s })) };
        if (ref.path === 'sessions') return { docs: sessionsExistents.map((x) => ({ id: x.id, data: () => x })) };
        return { docs: [] };
      });
      tx = {
        get: vi.fn(async (ref) => (ref.path === 'propostes/p1'
          ? { data: () => ({ estat: estatTx }) }
          : { exists: () => sessioTx })),
        set: vi.fn(),
        update: vi.fn(),
      };
      runTransaction.mockImplementation(async (_db, fn) => fn(tx));
    }

    async function obrirProgramar(user) {
      await user.click(await screen.findByRole('button', { name: 'Programar sessió' }));
      return dialegConfirmacio();
    }

    async function programar(user) {
      await obrirProgramar(user);
      await acceptaDialeg('Programa');
    }

    function senseEscripturesFora() {
      expect(updateDoc).not.toHaveBeenCalled();
      expect(setDoc).not.toHaveBeenCalled();
    }

    it('no llegeix ni mostra el recompte de vots antic (propostes/*/vots)', async () => {
      preparar();
      renderFormulari();
      await screen.findByRole('heading', { name: 'Amélie' });
      expect(collection.mock.calls.some((c) => c.includes('vots'))).toBe(false);
      expect(screen.queryByText('Vots')).not.toBeInTheDocument();
    });

    it('només mostra el botó en propostes aprovades', async () => {
      preparar({ proposta: { ...PROPOSTA, estat: 'pendent' } });
      renderFormulari();
      await screen.findByRole('heading', { name: 'Amélie' });
      expect(screen.queryByRole('button', { name: 'Programar sessió' })).not.toBeInTheDocument();
    });

    it('crea la sessió amb id determinista i passa la proposta a programada dins la transacció', async () => {
      preparar();
      const user = userEvent.setup();
      renderFormulari();
      await screen.findByRole('button', { name: 'Programar sessió' });
      const consultesPropostaId = () => where.mock.calls.filter((c) => c[0] === 'propostaId' && c[1] === '==' && c[2] === 'p1').length;
      const lecturesSessions = () => getDocs.mock.calls.filter(([ref]) => ref.path === 'sessions').length;
      const whereAbans = consultesPropostaId();
      const lecturesAbans = lecturesSessions();
      await programar(user);
      expect(await screen.findByText('Edició de sessió a /sessions/proposta-p1')).toBeInTheDocument();
      // La fitxa ja ha fet la seva pròpia consulta en carregar: «Programar» n'afegeix exactament una.
      expect(consultesPropostaId()).toBe(whereAbans + 1);
      expect(lecturesSessions()).toBe(lecturesAbans + 1);
      expect(tx.set).toHaveBeenCalledTimes(1);
      const [ref, sessio] = tx.set.mock.calls[0];
      expect(ref.path).toBe('sessions/proposta-p1');
      expect(sessio).toMatchObject({ titol: 'Amèlie', propostaId: 'p1', publicada: false, data: '', slug: '' });
      expect(tx.update).toHaveBeenCalledWith({ path: 'propostes/p1', id: 'p1' }, { estat: 'programada' });
      expect(runTransaction).toHaveBeenCalledTimes(1);
      senseEscripturesFora();
    });

    it('la sessió no conté cap dada interna de la proposta', async () => {
      preparar();
      const user = userEvent.setup();
      renderFormulari();
      await programar(user);
      await screen.findByText(/Edició de sessió/);
      const text = JSON.stringify(tx.set.mock.calls[0][1]);
      expect(text).not.toMatch(/Secreta|secret|500|preu|condicions|distribuidor/);
    });

    it('si ja hi ha una sessió amb aquest propostaId, hi navega i només passa la proposta a programada', async () => {
      preparar({ sessionsExistents: [{ id: 'sX', propostaId: 'p1' }], sessioTx: true });
      const user = userEvent.setup();
      renderFormulari();
      await programar(user);
      expect(await screen.findByText("Aquesta proposta ja té una sessió: s'obre per editar-la.")).toBeInTheDocument();
      // L'avís surt abans de navegar, i navega en tancar-lo.
      expect(screen.queryByText(/Edició de sessió/)).not.toBeInTheDocument();
      const avis = await dialegConfirmacio();
      expect(avis.querySelectorAll('button')).toHaveLength(1);
      await acceptaDialeg('Entesos');
      expect(await screen.findByText('Edició de sessió a /sessions/sX')).toBeInTheDocument();
      expect(tx.set).not.toHaveBeenCalled();
      expect(tx.update).toHaveBeenCalledWith({ path: 'propostes/p1', id: 'p1' }, { estat: 'programada' });
      expect(runTransaction).toHaveBeenCalledTimes(1);
      senseEscripturesFora();
    });

    it('cursa: si dins la transacció la sessió ja existeix, no la sobreescriu i hi navega', async () => {
      preparar({ sessioTx: true });
      const user = userEvent.setup();
      renderFormulari();
      await programar(user);
      expect(await screen.findByText("Aquesta proposta ja té una sessió: s'obre per editar-la.")).toBeInTheDocument();
      await acceptaDialeg('Entesos');
      expect(await screen.findByText('Edició de sessió a /sessions/proposta-p1')).toBeInTheDocument();
      expect(tx.set).not.toHaveBeenCalled();
    });

    it('si la proposta ja no és aprovada i no hi ha sessió, no escriu res i mostra l\'error', async () => {
      preparar({ estatTx: 'programada' });
      const user = userEvent.setup();
      renderFormulari();
      await programar(user);
      expect(await screen.findByRole('alert')).toHaveTextContent('Aquesta proposta ja no és aprovada.');
      expect(tx.set).not.toHaveBeenCalled();
      expect(tx.update).not.toHaveBeenCalled();
      expect(screen.queryByText(/Edició de sessió/)).not.toBeInTheDocument();
    });

    it('la confirmació explica què passarà, sense perill i amb «Programa»', async () => {
      preparar();
      const user = userEvent.setup();
      renderFormulari();
      await screen.findByRole('button', { name: 'Programar sessió' });
      const lecturesSessions = () => getDocs.mock.calls.filter(([ref]) => ref.path === 'sessions').length;
      const abans = lecturesSessions();
      const dialeg = await obrirProgramar(user);
      expect(dialeg).toHaveTextContent('Vols programar una sessió amb "Amélie"? Es crearà una sessió sense publicar i la proposta passarà a «Programada».');
      expect(dialeg).not.toHaveAttribute('role', 'alertdialog');
      expect(runTransaction).not.toHaveBeenCalled();
      // La lectura de la fitxa ja ha consultat les sessions; programar no n'hi afegeix cap abans de confirmar.
      expect(lecturesSessions()).toBe(abans);
    });

    it.each([
      ['Cancel·lar', (user) => cancellaDialeg(user)],
      ['ESC', (user) => tancaDialegAmbEsc(user)],
    ])('si tanques la confirmació amb %s no fa res i es pot tornar a programar', async (_nom, tanca) => {
      preparar();
      const user = userEvent.setup();
      renderFormulari();
      await obrirProgramar(user);
      await tanca(user);
      await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
      expect(runTransaction).not.toHaveBeenCalled();
      expect(tx.set).not.toHaveBeenCalled();
      expect(tx.update).not.toHaveBeenCalled();
      expect(screen.queryByText(/Edició de sessió/)).not.toBeInTheDocument();
      senseEscripturesFora();
      // El bloqueig contra dobles execucions s'allibera en cancel·lar.
      expect(screen.getByRole('button', { name: 'Programar sessió' })).toBeEnabled();
      await programar(user);
      expect(await screen.findByText('Edició de sessió a /sessions/proposta-p1')).toBeInTheDocument();
      expect(runTransaction).toHaveBeenCalledTimes(1);
    });

    it('si la transacció falla mostra l\'error i no navega', async () => {
      preparar();
      runTransaction.mockRejectedValue(new Error('boom'));
      const user = userEvent.setup();
      renderFormulari();
      await programar(user);
      expect(await screen.findByRole('alert')).toHaveTextContent("No s'ha pogut programar la sessió");
      expect(screen.queryByText(/Edició de sessió/)).not.toBeInTheDocument();
      senseEscripturesFora();
    });

    it('un doble clic fa una sola transacció', async () => {
      preparar();
      runTransaction.mockImplementation(async (_db, fn) => {
        await new Promise((r) => setTimeout(r, 30));
        return fn(tx);
      });
      const user = userEvent.setup();
      renderFormulari();
      await user.dblClick(await screen.findByRole('button', { name: 'Programar sessió' }));
      await dialegConfirmacio();
      expect(document.querySelectorAll('dialog.dialeg-confirmacio')).toHaveLength(1);
      await acceptaDialeg('Programa');
      await screen.findByText(/Edició de sessió/);
      expect(runTransaction).toHaveBeenCalledTimes(1);
      expect(hiHaDialegConfirmacio()).toBe(false);
    });
  });
});

describe('PropostaForm: layout estàndard', () => {
  beforeEach(() => {
    getDocs.mockReset().mockResolvedValue({ docs: [] });
    getDoc.mockReset();
    getDoc.mockResolvedValueOnce({ data: () => ({ titol: 'Amélie', numeroSoci: 7, estat: 'pendent' }) });
    getDoc.mockResolvedValue({ data: () => undefined });
    mockSocis();
  });

  it('en lectura: amplada de fitxa, un sol h1 i l\'enllaç «← Propostes»', async () => {
    const { container } = renderFormulari();
    await screen.findByRole('heading', { level: 1, name: 'Amélie' });
    expect(container.firstChild).toHaveClass('pagina-admin', 'pagina-admin--fitxa');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: '← Propostes' })).toHaveAttribute('href', '/propostes/pendents');
  });

  it('en edició: formulari d\'amplada de fitxa, un sol h1, «← Propostes» i textareas que creixen', async () => {
    const user = userEvent.setup();
    const { container } = renderFormulari();
    await obrirEdicio(user);
    expect(container.firstChild.tagName).toBe('FORM');
    expect(container.firstChild).toHaveClass('pagina-admin', 'pagina-admin--fitxa');
    const titols = screen.getAllByRole('heading', { level: 1 });
    expect(titols).toHaveLength(1);
    expect(titols[0]).toHaveTextContent('Amélie');
    expect(screen.getByRole('link', { name: '← Propostes' })).toHaveAttribute('href', '/propostes/pendents');
    for (const etiqueta of ['Sinopsi', 'Comentari del soci', 'Condicions especials']) {
      expect(screen.getByLabelText(etiqueta)).toHaveClass('textarea-automatic');
    }
  });
});

describe('PropostaForm: enllaços amb tandes i sessió', () => {
  const futur = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const passat = new Date('2026-01-31T20:00:00');
  const TANDES = [
    { id: 't1', nom: 'Gener', propostes: ['p1', 'p9'], tanca: { toDate: () => passat } },
    { id: 't2', nom: 'Novembre', propostes: ['p1'], tanca: { toDate: () => futur } },
    { id: 't3', nom: 'Altra', propostes: ['p9'], tanca: { toDate: () => passat } },
    { id: 't4', nom: 'Corrupta', propostes: 'p1', tanca: { toDate: () => passat } },
  ];
  const docsDe = (llista) => ({ docs: llista.map((d) => ({ id: d.id, data: () => d })) });

  function mockCarrega({ tandes = [], sessions = [], falla = [] } = {}) {
    getDoc.mockReset();
    getDoc.mockResolvedValueOnce({ data: () => ({ titol: 'Amélie', numeroSoci: 7, estat: 'aprovada' }) });
    getDoc.mockResolvedValue({ data: () => undefined });
    collection.mockImplementation((_db, nom) => nom);
    getDocs.mockReset();
    getDocs.mockImplementation((ruta) => {
      if (falla.includes(ruta)) return Promise.reject(new Error('boom'));
      return Promise.resolve(docsDe({ socis: SOCIS, distribuidores: [], tandes, sessions }[ruta]));
    });
  }

  afterEach(() => collection.mockReset());

  it('mostra les tandes que contenen la proposta (amb «(oberta)») i la sessió, enllaçades', async () => {
    mockCarrega({
      tandes: TANDES,
      sessions: [{ id: 's5', titol: 'Sessió Amélie', propostaId: 'p1' }, { id: 's8', titol: 'Una altra', propostaId: 'p9' }],
    });
    renderFormulari();
    const gener = await screen.findByRole('link', { name: 'Gener' });
    expect(gener).toHaveAttribute('href', '/tandes/t1');
    expect(screen.getByRole('link', { name: 'Novembre' })).toHaveAttribute('href', '/tandes/t2');
    expect(screen.queryByRole('link', { name: 'Altra' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Corrupta' })).not.toBeInTheDocument();
    const dd = gener.closest('dd');
    expect(dd).toHaveTextContent('Novembre (oberta)');
    expect(dd).not.toHaveTextContent('Gener (oberta)');
    expect(screen.getByText('Tandes').nextElementSibling).toBe(dd);
    const sessio = await screen.findByRole('link', { name: 'Sessió Amélie' });
    expect(sessio).toHaveAttribute('href', '/sessions/s5');
    expect(screen.getByText('Sessió').nextElementSibling).toContainElement(sessio);
    expect(where).toHaveBeenCalledWith('propostaId', '==', 'p1');
  });

  it('llista les tandes com al llistat (oberta primer, després per tancament descendent), una per línia', async () => {
    const tanca = (iso) => ({ toDate: () => new Date(iso) });
    mockCarrega({
      tandes: [
        { id: 'a', nom: 'Tanda antiga amb un nom molt llarg', propostes: ['p1'], tanca: tanca('2025-03-01T20:00:00') },
        { id: 'o', nom: 'Oberta', propostes: ['p1'], tanca: { toDate: () => futur } },
        { id: 'r', nom: 'Recent', propostes: ['p1'], tanca: tanca('2026-05-01T20:00:00') },
      ],
    });
    renderFormulari();
    await screen.findByRole('link', { name: 'Oberta' });
    const dd = screen.getByText('Tandes').nextElementSibling;
    const items = within(dd).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['Oberta (oberta)', 'Recent', 'Tanda antiga amb un nom molt llarg']);
    expect(within(items[0]).getByRole('link', { name: 'Oberta' })).toHaveAttribute('href', '/tandes/o');
  });

  it('si diverses sessions comparteixen proposta, tria la de data més recent', async () => {
    mockCarrega({
      sessions: [
        { id: 'a', titol: 'Antiga', propostaId: 'p1', data: '2026-01-10' },
        { id: 'b', titol: 'Recent', propostaId: 'p1', data: '2026-03-10' },
      ],
    });
    renderFormulari();
    expect(await screen.findByRole('link', { name: 'Recent' })).toHaveAttribute('href', '/sessions/b');
    expect(screen.queryByRole('link', { name: 'Antiga' })).not.toBeInTheDocument();
  });

  it('sense tandes ni sessió mostra «—» a les dues files', async () => {
    mockCarrega({ tandes: [TANDES[2]] });
    renderFormulari();
    await screen.findByRole('heading', { name: 'Amélie' });
    await waitFor(() => {
      const llegides = getDocs.mock.calls.map(([ref]) => ref);
      expect(llegides).toEqual(expect.arrayContaining(['tandes', 'sessions']));
    });
    expect(screen.getByText('Tandes').nextElementSibling).toHaveTextContent('—');
    expect(screen.getByText('Sessió').nextElementSibling).toHaveTextContent('—');
  });

  it.each([['tandes'], ['sessions']])('si falla la lectura de %s, la fitxa es mostra igualment amb «—»', async (ruta) => {
    mockCarrega({ tandes: TANDES, sessions: [{ id: 's5', titol: 'Sessió Amélie', propostaId: 'p1' }], falla: [ruta] });
    renderFormulari();
    expect(await screen.findByRole('heading', { name: 'Amélie' })).toBeInTheDocument();
    const fila = ruta === 'tandes' ? 'Tandes' : 'Sessió';
    // L'altra lectura sí que arriba: la seva fila es renderitza.
    if (ruta === 'tandes') await screen.findByRole('link', { name: 'Sessió Amélie' });
    else await screen.findByRole('link', { name: 'Gener' });
    expect(screen.getByText(fila).nextElementSibling).toHaveTextContent('—');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('el mode edició no mostra aquestes files', async () => {
    mockCarrega({ tandes: TANDES });
    const user = userEvent.setup();
    renderFormulari();
    await obrirEdicio(user);
    expect(screen.queryByText('Tandes')).not.toBeInTheDocument();
  });
});
