// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IdentitatPublicaProvider } from '../../src/auth/IdentitatPublica.jsx';

vi.mock('../../src/firebase/client.js', () => ({ db: {}, functions: {} }));
vi.mock('../../src/components/propostes/LectorCarnet.jsx', () => ({
  default: ({ onIdentificat }) => (
    <button type="button" onClick={() => onIdentificat({ numeroSoci: 7, nomPublic: 'Isabel M.', token: 'tok-7' })}>
      Simular escaneig
    </button>
  ),
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_, nom) => nom),
  query: vi.fn((collectionName, ...constraints) => ({ collectionName, constraints })),
  where: vi.fn((field, op, value) => ({ field, op, value })),
  orderBy: vi.fn((field, direccio) => ({ orderBy: field, direccio })),
  limit: vi.fn((n) => ({ limit: n })),
  getDocs: vi.fn(),
}));
// L'ordre barrejat es manté (determinista) però sense barrejar, perquè les proves siguin previsibles.
vi.mock('../../src/lib/propostes/votacio.js', () => ({
  carregarEstat: vi.fn(),
  votar: vi.fn(),
  carregarRanking: vi.fn(),
  carregarRankingPublic: vi.fn(),
  ordreBarrejat: vi.fn((ids) => [...ids]),
}));

import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import {
  carregarEstat, votar, carregarRanking, carregarRankingPublic, ordreBarrejat,
} from '../../src/lib/propostes/votacio.js';
import PropostesPublic from '../../src/components/propostes/PropostesPublic.jsx';

const IDENTITAT = { numeroSoci: 7, nomPublic: 'Isabel M.', token: 'tok-7' };
const TRES_MINUTS_MS = 3 * 60 * 1000;

const APROVADES = [
  {
    id: 'p1',
    dades: {
      titol: 'Amélie', estat: 'aprovada', numeroSoci: 3, sinopsi: 'Una noia parisenca.', trailerUrl: 'https://www.youtube.com/watch?v=abc123', nomProposant: 'Anna M.', generes: ['Comèdia'],
    },
  },
  { id: 'p2', dades: { titol: 'El padrí', estat: 'aprovada', numeroSoci: 5 } },
  { id: 'p3', dades: { titol: 'Stalker', estat: 'aprovada', numeroSoci: 5 } },
  { id: 'p4', dades: { titol: 'Fora de tanda', estat: 'aprovada', numeroSoci: 5 } },
];

// `tanda` és null (cap tanda) o { id, nom, tanca: Date, propostes: string[] }.
// `tandes` (opcional) en substitueix la tanda única per diverses: [{ id, tanca, creada?, propostes }].
function mockFirestore({ propostes = APROVADES, tanda = null, tandes = null } = {}) {
  const totes = tandes ?? (tanda ? [tanda] : []);
  getDocs.mockImplementation((q) => {
    const nom = q?.collectionName ?? q;
    if (nom === 'propostes') {
      return Promise.resolve({ docs: propostes.map((p) => ({ id: p.id, data: () => p.dades })) });
    }
    if (nom === 'tandes') {
      const docs = totes.map((t) => ({
        id: t.id,
        data: () => ({
          nom: t.nom ?? 'Tanda',
          tanca: { toDate: () => t.tanca },
          creada: { toDate: () => t.creada ?? new Date('2026-01-01') },
          propostes: t.propostes,
        }),
      }));
      return Promise.resolve({ docs });
    }
    return Promise.resolve({ docs: [] });
  });
}

const FUTUR = new Date('2099-01-01T00:00:00Z');
const PASSAT = new Date('2020-01-01T00:00:00Z');
const tandaFirestore = (tanca = FUTUR) => ({ id: 't1', tanca, propostes: ['p1', 'p2', 'p3'] });

const estatObert = (extra = {}) => ({
  tanda: { id: 't1', nom: 'Tanda de tardor', tanca: '2099-01-01T00:00:00.000Z', tancada: false, propostes: ['p1', 'p2', 'p3'] },
  valors: {},
  bloquejat: false,
  completa: false,
  ...extra,
});
const estatTancat = () => estatObert({ tanda: { ...estatObert().tanda, tancada: true, tanca: '2020-01-01T00:00:00.000Z' } });
const TOTES = { p1: 'like', p2: 'dislike', p3: 'like' };

const errorCallable = (codi) => Object.assign(new Error(codi), { code: `functions/${codi}` });

function renderPagina() {
  return render(
    <IdentitatPublicaProvider>
      <PropostesPublic />
    </IdentitatPublicaProvider>
  );
}

// Una pàgina que es munta amb la identitat ja a sessionStorage (p. ex. venint de la pàgina de proposar).
function renderPaginaPreIdentificat() {
  sessionStorage.setItem('cineclub.identitat', JSON.stringify(IDENTITAT));
  return renderPagina();
}

// jsdom no implementa la navegació: `location` es substitueix per un objecte que
// només intercepta `assign` i deixa la resta (hash, pathname...) en el real.
function simulaNavegacio() {
  const assign = vi.fn();
  const real = window.location;
  vi.stubGlobal('location', {
    assign,
    get hash() { return real.hash; },
    set hash(valor) { real.hash = valor; },
    get pathname() { return real.pathname; },
    get search() { return real.search; },
  });
  return assign;
}

const titolTargeta = () => screen.getByRole('heading', { level: 2 }).textContent;
const SENSE_TANDA = 'Encara no hi ha cap tanda de votació.';
// Graella de cartells de la tanda activa: cada cartell és un botó amb el títol com a nom accessible.
const cartellsTanda = async () => within(await screen.findByRole('list', { name: 'Pel·lícules de la tanda' })).getAllByRole('button');

describe('PropostesPublic', () => {
  beforeEach(() => {
    getDocs.mockReset();
    collection.mockClear();
    query.mockClear();
    where.mockClear();
    orderBy.mockClear();
    limit.mockClear();
    carregarEstat.mockReset();
    votar.mockReset();
    carregarRanking.mockReset();
    carregarRankingPublic.mockReset();
    ordreBarrejat.mockClear();
    carregarEstat.mockResolvedValue({ tanda: null });
    votar.mockResolvedValue({ votats: 1, total: 3, completa: false });
    carregarRanking.mockResolvedValue({
      tancada: false,
      files: [
        { propostaId: 'p2', percentatge: 80 },
        { propostaId: 'p1', percentatge: 40 },
        { propostaId: 'p3', percentatge: null },
      ],
    });
    carregarRankingPublic.mockResolvedValue({ files: [{ propostaId: 'p3', percentatge: 90 }, { propostaId: 'p1', percentatge: 10 }] });
    window.location.hash = '';
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('bloc de la tanda', () => {
    it('sense cap tanda: diu que encara no n\'hi ha cap, sense llista general de propostes, vot, rànquing ni avís de privacitat', async () => {
      mockFirestore();
      renderPagina();
      expect(await screen.findByText(SENSE_TANDA)).toBeInTheDocument();
      expect(screen.queryByText('Amélie')).not.toBeInTheDocument();
      expect(screen.queryByText('Fora de tanda')).not.toBeInTheDocument();
      expect(document.querySelector('.propostes-public__llista')).toBeNull();
      expect(screen.queryByRole('button', { name: /m'agrada/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /votar/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('tab')).not.toBeInTheDocument();
      expect(screen.queryByText('Més votades')).not.toBeInTheDocument();
      expect(screen.queryByText(/Els teus vots només els veu la junta/)).not.toBeInTheDocument();
      expect(carregarRankingPublic).not.toHaveBeenCalled();
    });

    it('no llegeix ni escriu mai vots antics ni activitat (només propostes i tandes)', async () => {
      mockFirestore({ tanda: tandaFirestore() });
      renderPagina();
      await screen.findAllByText('Amélie');
      const noms = collection.mock.calls.map((c) => c[c.length - 1]);
      expect(noms.length).toBeGreaterThan(0);
      for (const nom of noms) expect(['propostes', 'tandes']).toContain(nom);
    });

    it('amb tanda activa: títol, aclariment amb la data de tancament i les targetes de la tanda; no demana cap rànquing', async () => {
      mockFirestore({ tanda: { id: 't1', nom: 'Tanda de tardor', tanca: new Date(2099, 0, 15, 20, 0), propostes: ['p1', 'p2', 'p3'] } });
      renderPagina();
      expect(await screen.findByRole('heading', { level: 2, name: 'Tanda activa: Tanda de tardor' })).toBeInTheDocument();
      expect(screen.getByText('Aquesta és la tanda que es pot votar ara, fins al 15/01/2099.')).toBeInTheDocument();
      expect(screen.getAllByRole('listitem')).toHaveLength(3);
      expect(screen.queryByText('Fora de tanda')).not.toBeInTheDocument();
      expect(screen.queryByText(/Última tanda/)).not.toBeInTheDocument();
      expect(carregarRankingPublic).not.toHaveBeenCalled();
      expect(carregarRanking).not.toHaveBeenCalled();
    });

    it('amb tanda activa sense cap proposta carregable (p. ex. retirades), ho diu i no ofereix votar-la', async () => {
      mockFirestore({ tanda: { id: 't1', nom: 'Buida', tanca: FUTUR, propostes: ['retirada'] } });
      renderPagina();
      expect(await screen.findByRole('heading', { level: 2, name: 'Tanda activa: Buida' })).toBeInTheDocument();
      expect(screen.getByText('Aquesta tanda encara no té pel·lícules per votar.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Votar aquesta tanda' })).not.toBeInTheDocument();
      expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    });

    it('amb tanda activa sense cap proposta a la llista, tampoc ofereix votar-la', async () => {
      mockFirestore({ tanda: { id: 't1', nom: 'Buida', tanca: FUTUR, propostes: [] } });
      renderPagina();
      expect(await screen.findByText('Aquesta tanda encara no té pel·lícules per votar.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Votar aquesta tanda' })).not.toBeInTheDocument();
    });

    it('mentre es llegeixen les tandes (soci identificat fora de votació), la càrrega és una regió role="status"', async () => {
      getDocs.mockImplementation((q) => ((q?.collectionName ?? q) === 'tandes'
        ? new Promise(() => {})
        : Promise.resolve({ docs: APROVADES.map((p) => ({ id: p.id, data: () => p.dades })) })));
      carregarEstat.mockResolvedValue({ tanda: null });
      renderPaginaPreIdentificat();
      const estat = await screen.findByRole('status');
      expect(within(estat).getByAltText('Carregant…')).toBeInTheDocument();
    });

    it('amb tanda activa, el visitant té un botó per votar-la que demana el carnet i, un cop escanejat, entra a votar', async () => {
      mockFirestore({ tanda: tandaFirestore() });
      carregarEstat.mockResolvedValue(estatObert());
      const user = userEvent.setup();
      renderPagina();
      await user.click(await screen.findByRole('button', { name: 'Votar aquesta tanda' }));
      expect(screen.getByText('Escaneja el teu carnet per votar')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Simular escaneig' }));
      expect(await screen.findByText('Has votat 0 de 3')).toBeInTheDocument();
      expect(votar).not.toHaveBeenCalled();
    });

    it('sense tanda activa, mostra l\'última tancada amb l\'aclariment i el rànquing públic carregat sol, sense vot', async () => {
      mockFirestore({ tanda: { id: 't1', nom: 'Tanda d\'estiu', tanca: new Date(2020, 2, 10, 21, 0), propostes: ['p1', 'p3'] } });
      renderPagina();
      expect(await screen.findByRole('heading', { level: 2, name: 'Última tanda: Tanda d\'estiu' })).toBeInTheDocument();
      expect(screen.getByText('Aquesta va ser l\'última tanda; va tancar el 10/03/2020.')).toBeInTheDocument();
      expect(await screen.findByText('90 %')).toBeInTheDocument();
      expect(carregarRankingPublic).toHaveBeenCalledWith('t1');
      expect(carregarRanking).not.toHaveBeenCalled();
      expect(carregarEstat).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: /rànquing/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /m'agrada/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /votar/i })).not.toBeInTheDocument();
      expect(screen.queryByText('Fora de tanda')).not.toBeInTheDocument();
      expect(screen.queryByText(/Els teus vots només els veu la junta/)).not.toBeInTheDocument();
    });

    it('el rànquing públic només mostra posició, títol i percentatge (ni qui va votar, ni recomptes, ni qui l\'ha proposada)', async () => {
      mockFirestore({ tanda: { id: 't1', tanca: PASSAT, propostes: ['p1', 'p3'] } });
      renderPagina();
      await screen.findByText('90 %');
      const files = screen.getAllByRole('listitem');
      // Sense cartell, la fila porta el marcador 🎬 (aria-hidden); la resta és posició, títol i percentatge.
      expect(files.map((f) => f.textContent)).toEqual(['🎬1Stalker90 %', '🎬2Amélie10 %']);
      expect(screen.queryByText(/Anna M\./)).not.toBeInTheDocument();
      expect(screen.queryByText(/Proposada per/)).not.toBeInTheDocument();
      expect(screen.queryByText(/El teu vot/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Gràcies per participar/)).not.toBeInTheDocument();
    });

    it('mentre es carrega el rànquing mostra «Carregant…» dins una regió role="status"', async () => {
      mockFirestore({ tanda: tandaFirestore(PASSAT) });
      let resol;
      carregarRankingPublic.mockReturnValue(new Promise((r) => { resol = r; }));
      renderPagina();
      await screen.findByRole('heading', { level: 2, name: /^Última tanda/ });
      expect(within(screen.getByRole('status')).getByAltText('Carregant…')).toBeInTheDocument();
      await act(async () => { resol({ files: [{ propostaId: 'p1', percentatge: 50 }] }); });
      expect(await screen.findByText('50 %')).toBeInTheDocument();
      expect(screen.queryByAltText('Carregant…')).not.toBeInTheDocument();
    });

    it('si el rànquing públic falla, ho diu i «Tornar-ho a provar» el torna a demanar', async () => {
      mockFirestore({ tanda: tandaFirestore(PASSAT) });
      carregarRankingPublic.mockRejectedValueOnce(errorCallable('internal'));
      const user = userEvent.setup();
      renderPagina();
      expect(await screen.findByRole('alert')).toHaveTextContent("No s'ha pogut carregar el rànquing.");
      await user.click(screen.getByRole('button', { name: 'Tornar-ho a provar' }));
      expect(await screen.findByText('90 %')).toBeInTheDocument();
      expect(carregarRankingPublic).toHaveBeenCalledTimes(2);
      expect(screen.queryByText("No s'ha pogut carregar el rànquing.")).not.toBeInTheDocument();
    });

    it('amb dues tandes tancades tria la de tancament més recent', async () => {
      mockFirestore({
        tandes: [
          { id: 'recent', nom: 'Recent', tanca: new Date('2021-06-01'), creada: new Date('2021-01-01'), propostes: ['p1'] },
          { id: 'antiga', nom: 'Antiga', tanca: new Date('2020-06-01'), creada: new Date('2021-02-01'), propostes: ['p2'] },
        ],
      });
      renderPagina();
      expect(await screen.findByRole('heading', { level: 2, name: 'Última tanda: Recent' })).toBeInTheDocument();
      await waitFor(() => expect(carregarRankingPublic).toHaveBeenCalledWith('recent'));
      expect(carregarRankingPublic).toHaveBeenCalledTimes(1);
    });

    it('la tanda activa és una graella de cartells: només el cartell i el títol (ni títol local, ni sinopsi, ni data, ni vot)', async () => {
      mockFirestore({
        propostes: [
          {
            id: 'p1',
            dades: {
              titol: 'La Haine', titolLocal: 'El odio', estat: 'aprovada', numeroSoci: 3, sinopsi: 'Tres amics de la banlieue.',
              imatgeUrl: 'https://exemple.com/haine.jpg', trailerUrl: 'https://www.youtube.com/watch?v=abc123', timestamp: { toDate: () => new Date(2026, 0, 1) },
            },
          },
          { id: 'p2', dades: { titol: 'El padrí', estat: 'aprovada', numeroSoci: 5 } },
        ],
        tanda: { id: 't1', tanca: FUTUR, propostes: ['p1', 'p2'] },
      });
      renderPagina();
      const cartells = await cartellsTanda();
      expect(cartells.map((c) => c.getAttribute('aria-label'))).toEqual(['La Haine', 'El padrí']);
      expect(screen.getByRole('button', { name: 'La Haine' })).toBe(cartells[0]);
      expect(screen.queryByText('(El odio)')).not.toBeInTheDocument();
      expect(screen.queryByText('Tres amics de la banlieue.')).not.toBeInTheDocument();
      expect(screen.queryByText('01/01/2026')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /tràiler/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /m'agrada/i })).not.toBeInTheDocument();
      expect(within(cartells[0]).getByText('La Haine', { selector: '.cartell-tanda__titol' })).toBeInTheDocument();
    });

    it('el cartell amb imatge porta el títol com a alt i es carrega en diferit; sense imatge, un marcador amb el títol', async () => {
      mockFirestore({
        propostes: [
          { id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3, imatgeUrl: 'https://exemple.com/amelie.jpg' } },
          { id: 'p2', dades: { titol: 'El padrí', estat: 'aprovada', numeroSoci: 5 } },
        ],
        tanda: { id: 't1', tanca: FUTUR, propostes: ['p1', 'p2'] },
      });
      renderPagina();
      const [ambImatge, senseImatge] = await cartellsTanda();
      const img = within(ambImatge).getByRole('img', { name: 'Amélie' });
      expect(img).toHaveAttribute('src', 'https://exemple.com/amelie.jpg');
      expect(img).toHaveAttribute('loading', 'lazy');
      expect(senseImatge.querySelector('.proposta-carta__cartell-placeholder')).toHaveTextContent('El padrí');
      expect(within(senseImatge).queryByRole('img')).not.toBeInTheDocument();
    });

    it('els cartells de la tanda activa van de la proposta més nova a la més antiga', async () => {
      mockFirestore({
        propostes: [
          { id: 'antiga', dades: { titol: 'Antiga', estat: 'aprovada', numeroSoci: 3, imatgeUrl: 'https://exemple.com/antiga.jpg', timestamp: { toDate: () => new Date(2026, 0, 1) } } },
          { id: 'nova', dades: { titol: 'Nova', estat: 'aprovada', numeroSoci: 3, imatgeUrl: 'https://exemple.com/nova.jpg', timestamp: { toDate: () => new Date(2026, 5, 1) } } },
        ],
        tanda: { id: 't1', tanca: FUTUR, propostes: ['antiga', 'nova'] },
      });
      renderPagina();
      expect((await cartellsTanda()).map((c) => c.getAttribute('aria-label'))).toEqual(['Nova', 'Antiga']);
    });

    it('sense cap tanda ni cap proposta, també diu que encara no hi ha cap tanda', async () => {
      mockFirestore({ propostes: [] });
      renderPagina();
      expect(await screen.findByText(SENSE_TANDA)).toBeInTheDocument();
    });

    it('identificat amb una tanda tancada: el rànquing públic es mostra sol, sense haver votat tot', async () => {
      mockFirestore({ tanda: tandaFirestore(PASSAT) });
      carregarEstat.mockResolvedValue(estatTancat());
      renderPaginaPreIdentificat();
      expect(await screen.findByText('90 %')).toBeInTheDocument();
      expect(carregarRankingPublic).toHaveBeenCalledWith('t1');
      expect(carregarRanking).not.toHaveBeenCalled();
      expect(within(screen.getAllByRole('listitem')[0]).getByText('Stalker')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /m'agrada/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/Ja no pots canviar/)).not.toBeInTheDocument();
      // Sense vots del soci en aquella tanda: ni polzes ni agraïment.
      expect(screen.queryByText(/El teu vot: /)).not.toBeInTheDocument();
      expect(screen.queryByText(/Gràcies per participar/)).not.toBeInTheDocument();
    });

    it('el rànquing d\'una tanda tancada mostra el vot del soci identificat a cada fila (només els seus) i un agraïment final', async () => {
      mockFirestore({ tanda: tandaFirestore(PASSAT) });
      carregarEstat.mockResolvedValue({ ...estatTancat(), valors: { p3: 'dislike', p1: 'like' } });
      renderPaginaPreIdentificat();
      expect(await screen.findByText('90 %')).toBeInTheDocument();
      const files = screen.getAllByRole('listitem');
      expect(within(files[0]).getByText("El teu vot: no m'agrada")).toBeInTheDocument();
      expect(within(files[1]).getByText("El teu vot: m'agrada")).toBeInTheDocument();
      expect(screen.getAllByText(/El teu vot: /)).toHaveLength(2);
      expect(screen.getByText('Gràcies per participar! Aquest és el resultat final de la tanda.')).toBeInTheDocument();
    });

    it('els vots del soci d\'una altra tanda no es mostren al rànquing de l\'última', async () => {
      mockFirestore({ tanda: tandaFirestore(PASSAT) });
      carregarEstat.mockResolvedValue({ ...estatTancat(), tanda: { ...estatTancat().tanda, id: 'una-altra' }, valors: { p3: 'like' } });
      renderPaginaPreIdentificat();
      expect(await screen.findByText('90 %')).toBeInTheDocument();
      expect(screen.queryByText(/El teu vot: /)).not.toBeInTheDocument();
    });

    it('carrega les propostes aprovades i programades, però només mostra les de la tanda', async () => {
      mockFirestore({
        propostes: [...APROVADES, { id: 'p5', dades: { titol: 'Ja programada', estat: 'programada', numeroSoci: 5 } }],
        tanda: tandaFirestore(),
      });
      renderPagina();
      await screen.findAllByText('Amélie');
      expect(where).toHaveBeenCalledWith('estat', 'in', ['aprovada', 'programada']);
      expect(screen.queryByText('Ja programada')).not.toBeInTheDocument();
      expect(screen.queryByText('Fora de tanda')).not.toBeInTheDocument();
    });

    it('el rànquing d\'una tanda tancada resol el títol d\'una proposta que la junta ha programat després', async () => {
      mockFirestore({
        propostes: [...APROVADES, { id: 'p5', dades: { titol: 'Ja programada', estat: 'programada', numeroSoci: 5 } }],
        tanda: { id: 't1', tanca: PASSAT, propostes: ['p1', 'p5'] },
      });
      carregarRankingPublic.mockResolvedValue({ files: [{ propostaId: 'p5', percentatge: 90 }, { propostaId: 'p1', percentatge: 10 }] });
      renderPagina();
      expect(await screen.findByText('90 %')).toBeInTheDocument();
      expect(within(screen.getAllByRole('listitem')[0]).getByText('Ja programada')).toBeInTheDocument();
      expect(screen.queryByText('Proposta retirada')).not.toBeInTheDocument();
    });

    it('identificat sense cap tanda: ni rànquing ni vot, només el missatge', async () => {
      mockFirestore();
      carregarEstat.mockResolvedValue({ tanda: null });
      renderPaginaPreIdentificat();
      expect(await screen.findByText(SENSE_TANDA)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /rànquing/i })).not.toBeInTheDocument();
      expect(carregarRankingPublic).not.toHaveBeenCalled();
    });
  });

  describe('tanda oberta, visitant sense identificar', () => {
    it('llegeix les tandes i mostra en obert només les propostes de la tanda', async () => {
      mockFirestore({ tanda: tandaFirestore() });
      renderPagina();
      expect((await screen.findAllByText('Amélie')).length).toBeGreaterThan(0);
      expect(screen.getAllByText('El padrí').length).toBeGreaterThan(0);
      expect(screen.queryByText('Fora de tanda')).not.toBeInTheDocument();
      expect(getDocs).toHaveBeenCalledWith('tandes');
      expect(await cartellsTanda()).toHaveLength(3);
      expect(screen.queryByRole('button', { name: /m'agrada/i })).not.toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /votar/i })).toHaveLength(1);
      expect(carregarEstat).not.toHaveBeenCalled();
    });

    it('amb diverses tandes obertes tria la de creada més recent (com el servidor)', async () => {
      mockFirestore({
        tandes: [
          { id: 'vella', tanca: FUTUR, creada: new Date('2026-09-01'), propostes: ['p4'] },
          { id: 'nova', tanca: FUTUR, creada: new Date('2026-10-01'), propostes: ['p1', 'p2'] },
        ],
      });
      renderPagina();
      expect((await screen.findAllByText('Amélie')).length).toBeGreaterThan(0);
      expect(screen.queryByText('Fora de tanda')).not.toBeInTheDocument();
      expect(await cartellsTanda()).toHaveLength(2);
    });

    it('una tanda oberta més antiga guanya a una de tancada que tanca més tard però ja ha passat', async () => {
      mockFirestore({
        tandes: [
          { id: 'tancada', tanca: PASSAT, creada: new Date('2026-10-05'), propostes: ['p4'] },
          { id: 'oberta', tanca: FUTUR, creada: new Date('2026-09-01'), propostes: ['p1'] },
        ],
      });
      renderPagina();
      expect((await screen.findAllByText('Amélie')).length).toBeGreaterThan(0);
      expect(screen.queryByText('Fora de tanda')).not.toBeInTheDocument();
      expect(await cartellsTanda()).toHaveLength(1);
    });

    it('mostra l\'avís de privacitat d\'una línia', async () => {
      mockFirestore({ tanda: tandaFirestore() });
      renderPagina();
      expect(await screen.findByText(
        'Els teus vots només els veu la junta del Cineclub i serveixen per programar millor; la resta de persones sòcies només veuen el rànquing agregat.'
      )).toBeInTheDocument();
    });

    it('«Votar aquesta tanda» obre el lector del carnet, amb l\'enllaç per fer-se soci/a, i no vota res', async () => {
      mockFirestore({ tanda: tandaFirestore() });
      const user = userEvent.setup();
      renderPagina();
      await user.click(await screen.findByRole('button', { name: 'Votar aquesta tanda' }));
      expect(screen.getByText('Escaneja el teu carnet per votar')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Simular escaneig' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Fes-te Soci/a' })).toHaveAttribute('href', '/fes-te-socia/');
      expect(votar).not.toHaveBeenCalled();
    });

    it('es pot cancel·lar l\'escaneig sense votar', async () => {
      mockFirestore({ tanda: tandaFirestore() });
      const user = userEvent.setup();
      renderPagina();
      await user.click(await screen.findByRole('button', { name: 'Votar aquesta tanda' }));
      await user.click(screen.getByRole('button', { name: 'Cancel·lar' }));
      expect(screen.queryByRole('button', { name: 'Simular escaneig' })).not.toBeInTheDocument();
      expect(votar).not.toHaveBeenCalled();
    });

    it('en escanejar, carrega l\'estat del soci sense votar res i desa la identitat només a sessionStorage', async () => {
      mockFirestore({ tanda: tandaFirestore() });
      carregarEstat.mockResolvedValue(estatObert());
      const user = userEvent.setup();
      renderPagina();
      await user.click(await screen.findByRole('button', { name: 'Votar aquesta tanda' }));
      await user.click(screen.getByRole('button', { name: 'Simular escaneig' }));

      expect(await screen.findByText('Has votat 0 de 3')).toBeInTheDocument();
      expect(carregarEstat).toHaveBeenCalledWith('tok-7');
      expect(votar).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Simular escaneig' })).not.toBeInTheDocument();
      expect(JSON.parse(sessionStorage.getItem('cineclub.identitat'))).toEqual(IDENTITAT);
      expect(localStorage.length).toBe(0);
    });

    it('el detall d\'una proposta de la tanda no té botons de vot (es vota la tanda sencera)', async () => {
      mockFirestore({ tanda: tandaFirestore() });
      const user = userEvent.setup();
      renderPagina();
      await user.click(await screen.findByRole('button', { name: 'Amélie' }));
      const dialeg = await screen.findByRole('dialog');
      expect(within(dialeg).getByRole('heading', { level: 2, name: 'Amélie' })).toBeInTheDocument();
      expect(within(dialeg).queryByRole('button', { name: /m'agrada/i })).not.toBeInTheDocument();
      expect(dialeg.querySelector('.proposta-detall__footer')).toBeNull();
    });

    it('si la llista de tandes no es pot llegir, ho diu (sense vot ni «cap tanda») i «Tornar-ho a provar» la torna a llegir', async () => {
      getDocs.mockImplementation((q) => (
        (q?.collectionName ?? q) === 'tandes'
          ? Promise.reject(new Error('xarxa'))
          : Promise.resolve({ docs: APROVADES.map((p) => ({ id: p.id, data: () => p.dades })) })
      ));
      const user = userEvent.setup();
      renderPagina();
      expect(await screen.findByRole('alert')).toHaveTextContent("No s'ha pogut carregar la tanda de votació.");
      expect(screen.queryByRole('button', { name: 'Votar aquesta tanda' })).not.toBeInTheDocument();
      expect(screen.queryByText(SENSE_TANDA)).not.toBeInTheDocument();

      mockFirestore({ tanda: tandaFirestore() });
      await user.click(screen.getByRole('button', { name: 'Tornar-ho a provar' }));
      expect(await cartellsTanda()).toHaveLength(3);
    });
  });

  describe('identificat amb tanda oberta', () => {
    beforeEach(() => {
      mockFirestore({ tanda: tandaFirestore() });
      carregarEstat.mockResolvedValue(estatObert());
    });

    it('carrega l\'estat amb el token, mostra «Has votat 0 de 3» i una sola targeta, barrejada per soci i tanda', async () => {
      renderPaginaPreIdentificat();
      expect(await screen.findByText('Has votat 0 de 3')).toBeInTheDocument();
      expect(carregarEstat).toHaveBeenCalledWith('tok-7');
      expect(ordreBarrejat).toHaveBeenCalledWith(['p1', 'p2', 'p3'], '7-t1');
      expect(titolTargeta()).toBe('Amélie');
      expect(screen.getAllByRole('button', { name: "M'agrada" })).toHaveLength(1);
      expect(screen.queryByText('Fora de tanda')).not.toBeInTheDocument();
      expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    });

    it('mostra l\'avís de privacitat i «Identificat com: …» amb el botó «Sortir»', async () => {
      renderPaginaPreIdentificat();
      await screen.findByText('Has votat 0 de 3');
      expect(screen.getByText(/Els teus vots només els veu la junta del Cineclub/)).toBeInTheDocument();
      expect(document.querySelector('.votacio__identitat')).toHaveTextContent('Identificat com: Isabel M.');
      expect(screen.getByRole('button', { name: 'Sortir: deixar de votar com a Isabel M.' })).toHaveTextContent('Sortir');
    });

    it('comença per la primera proposta pendent', async () => {
      carregarEstat.mockResolvedValue(estatObert({ valors: { p1: 'like' } }));
      renderPaginaPreIdentificat();
      expect(await screen.findByText('Has votat 1 de 3')).toBeInTheDocument();
      expect(titolTargeta()).toBe('El padrí');
    });

    it('en votar, el progrés passa a 1 i la targeta següent pendent apareix; tornar enrere permet canviar el valor', async () => {
      const user = userEvent.setup();
      renderPaginaPreIdentificat();
      await screen.findByText('Has votat 0 de 3');

      await user.click(screen.getByRole('button', { name: "M'agrada" }));
      expect(votar).toHaveBeenCalledWith('tok-7', 't1', 'p1', 'like');
      expect(await screen.findByText('Has votat 1 de 3')).toBeInTheDocument();
      expect(titolTargeta()).toBe('El padrí');

      await user.click(screen.getByRole('button', { name: 'Anterior' }));
      expect(titolTargeta()).toBe('Amélie');
      expect(screen.getByRole('button', { name: "M'agrada" })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: "No m'agrada" })).toHaveAttribute('aria-pressed', 'false');

      await user.click(screen.getByRole('button', { name: "No m'agrada" }));
      expect(votar).toHaveBeenLastCalledWith('tok-7', 't1', 'p1', 'dislike');
      // Canviar un vot ja fet torna a la primera proposta pendent i no el compta dues vegades.
      await waitFor(() => expect(titolTargeta()).toBe('El padrí'));
      expect(screen.getByText('Has votat 1 de 3')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Anterior' }));
      expect(screen.getByRole('button', { name: "No m'agrada" })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: "M'agrada" })).toHaveAttribute('aria-pressed', 'false');
    });

    it('la targeta mostra la fitxa completa: tràiler, sinopsi, gèneres i qui l\'ha proposada', async () => {
      renderPaginaPreIdentificat();
      await screen.findByText('Has votat 0 de 3');
      expect(screen.getByRole('button', { name: 'Veure el tràiler de Amélie' })).toBeInTheDocument();
      expect(screen.getByText('Una noia parisenca.')).toBeInTheDocument();
      expect(screen.getByText('Comèdia')).toBeInTheDocument();
      expect(screen.getByText(/Proposada per/)).toHaveTextContent('Proposada per Anna M.');
    });

    it('en votar, el focus passa al títol de la targeta nova i es fa scroll a dalt; a la càrrega inicial no', async () => {
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      try {
        const user = userEvent.setup();
        renderPaginaPreIdentificat();
        await screen.findByText('Has votat 0 de 3');
        expect(screen.getByRole('heading', { level: 2 })).not.toHaveFocus();
        expect(scrollIntoView).not.toHaveBeenCalled();

        await user.click(screen.getByRole('button', { name: "M'agrada" }));
        await waitFor(() => expect(titolTargeta()).toBe('El padrí'));
        expect(screen.getByRole('heading', { level: 2 })).toHaveFocus();
        expect(scrollIntoView).toHaveBeenCalled();
      } finally {
        delete Element.prototype.scrollIntoView;
      }
    });

    it('el tràiler que s\'ha començat a reproduir no es carrega sol a la proposta següent', async () => {
      const conTrailer = APROVADES.map((p) => (
        p.id === 'p2' ? { ...p, dades: { ...p.dades, trailerUrl: 'https://www.youtube.com/watch?v=def456' } } : p
      ));
      mockFirestore({ propostes: conTrailer, tanda: tandaFirestore() });
      const user = userEvent.setup();
      const { container } = renderPaginaPreIdentificat();
      await user.click(await screen.findByRole('button', { name: 'Veure el tràiler de Amélie' }));
      expect(container.querySelector('iframe')).not.toBeNull();
      await user.click(screen.getByRole('button', { name: "M'agrada" }));
      await waitFor(() => expect(titolTargeta()).toBe('El padrí'));
      expect(container.querySelector('iframe')).toBeNull();
      expect(screen.getByRole('button', { name: 'Veure el tràiler de El padrí' })).toBeInTheDocument();
    });

    it('«Revisar els meus vots» deixa el focus al títol de la primera targeta, amb «Anterior»/«Següent»', async () => {
      carregarEstat.mockResolvedValue(estatObert({ valors: TOTES, completa: true }));
      const user = userEvent.setup();
      renderPaginaPreIdentificat();
      await user.click(await screen.findByRole('button', { name: 'Revisar els meus vots' }));
      expect(titolTargeta()).toBe('Amélie');
      expect(screen.getByRole('heading', { level: 2 })).toHaveFocus();
      expect(screen.getByRole('button', { name: 'Següent' })).toBeInTheDocument();
    });

    it('«Anterior» i «Següent» recorren les targetes i s\'inhabiliten als extrems', async () => {
      const user = userEvent.setup();
      renderPaginaPreIdentificat();
      await screen.findByText('Has votat 0 de 3');
      expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
      await user.click(screen.getByRole('button', { name: 'Següent' }));
      expect(titolTargeta()).toBe('El padrí');
      await user.click(screen.getByRole('button', { name: 'Següent' }));
      expect(titolTargeta()).toBe('Stalker');
      expect(screen.getByRole('button', { name: 'Següent' })).toBeDisabled();
    });

    it('en completar, mostra la pantalla final i no cap targeta', async () => {
      carregarEstat.mockResolvedValue(estatObert({ valors: { p1: 'like', p2: 'dislike' } }));
      votar.mockResolvedValue({ votats: 3, total: 3, completa: true });
      const user = userEvent.setup();
      renderPaginaPreIdentificat();
      await screen.findByText('Has votat 2 de 3');
      await user.click(screen.getByRole('button', { name: "M'agrada" }));
      expect(await screen.findByRole('heading', { name: 'El teu resum' })).toBeInTheDocument();
      expect(screen.getByText('Has votat 3 de 3')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: "M'agrada" })).not.toBeInTheDocument();
      expect(carregarRanking).not.toHaveBeenCalled();
    });

    it('si ja ho havia votat tot (sense bloqueig), també arriba a la pantalla final', async () => {
      carregarEstat.mockResolvedValue(estatObert({ valors: TOTES, completa: true }));
      renderPaginaPreIdentificat();
      expect(await screen.findByRole('heading', { name: 'El teu resum' })).toBeInTheDocument();
    });

    it('«Confirmar i veure el rànquing» mostra NOMÉS el rànquing: agraïment, el teu vot a cada fila, sense «Els teus vots» ni fitxa ni resum', async () => {
      carregarEstat.mockResolvedValue(estatObert({ valors: TOTES, completa: true }));
      const user = userEvent.setup();
      renderPaginaPreIdentificat();
      await user.click(await screen.findByRole('button', { name: 'Confirmar i veure el rànquing' }));
      expect(carregarRanking).toHaveBeenCalledWith('tok-7', 't1');

      expect(await screen.findByText('80 %')).toBeInTheDocument();
      const files = screen.getAllByRole('listitem');
      expect(files).toHaveLength(3);
      expect(within(files[0]).getByText('El padrí')).toBeInTheDocument();
      expect(within(files[0]).getByText("El teu vot: no m'agrada")).toBeInTheDocument();
      expect(within(files[1]).getByText('Amélie')).toBeInTheDocument();
      expect(within(files[1]).getByText("El teu vot: m'agrada")).toBeInTheDocument();
      expect(within(files[2]).getByText('pocs vots')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Gràcies per participar!' })).toBeInTheDocument();
      expect(screen.getByText(/Els teus vots ja són definitius/)).toBeInTheDocument();
      expect(screen.queryByText(/Ja no pots canviar els vots/)).not.toBeInTheDocument();
      expect(screen.queryByText('Els teus vots')).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'El teu resum' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: "M'agrada" })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: "No m'agrada" })).not.toBeInTheDocument();
      expect(document.querySelector('.targeta-vot')).toBeNull();
      expect(votar).not.toHaveBeenCalled();
    });

    it('en confirmar, el focus va al títol del rànquing i s\'hi fa scroll; no es munta cap targeta', async () => {
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      try {
        carregarEstat.mockResolvedValue(estatObert({ valors: TOTES, completa: true }));
        const user = userEvent.setup();
        renderPaginaPreIdentificat();
        await user.click(await screen.findByRole('button', { name: 'Confirmar i veure el rànquing' }));
        const titol = await screen.findByRole('heading', { name: 'Gràcies per participar!' });
        await waitFor(() => expect(titol).toHaveFocus());
        expect(scrollIntoView).toHaveBeenCalled();
        expect(document.querySelector('.targeta-vot')).toBeNull();
      } finally {
        delete Element.prototype.scrollIntoView;
      }
    });

    it('amb els vots ja bloquejats (tornant més tard), carrega el rànquing sol, només el rànquing, i no mou el focus', async () => {
      carregarEstat.mockResolvedValue(estatObert({ valors: TOTES, completa: true, bloquejat: true }));
      renderPaginaPreIdentificat();
      expect(await screen.findByText('80 %')).toBeInTheDocument();
      expect(carregarRanking).toHaveBeenCalledWith('tok-7', 't1');
      expect(screen.queryByRole('button', { name: "M'agrada" })).not.toBeInTheDocument();
      expect(screen.queryByText('Els teus vots')).not.toBeInTheDocument();
      expect(document.querySelector('.targeta-vot')).toBeNull();
      expect(screen.getByRole('heading', { name: 'Gràcies per participar!' })).not.toHaveFocus();
      expect(screen.getAllByText(/El teu vot: /)).toHaveLength(3);
    });

    it('doble clic a «Confirmar»: una sola crida a carregarRanking i el botó diu «Confirmant…» mentre espera', async () => {
      carregarEstat.mockResolvedValue(estatObert({ valors: TOTES, completa: true }));
      let resol;
      carregarRanking.mockReturnValue(new Promise((r) => { resol = r; }));
      const user = userEvent.setup();
      renderPaginaPreIdentificat();
      const boto = await screen.findByRole('button', { name: 'Confirmar i veure el rànquing' });
      await user.dblClick(boto);
      expect(carregarRanking).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Confirmant…' })).toBeDisabled();
      await act(async () => { resol({ files: [{ propostaId: 'p1', percentatge: 50 }] }); });
      expect(await screen.findByText('50 %')).toBeInTheDocument();
      expect(carregarRanking).toHaveBeenCalledTimes(1);
    });

    it('en mode revisió, canviar un vot no salta al resum: s\'hi continua fins prémer «Tornar al resum»', async () => {
      carregarEstat.mockResolvedValue(estatObert({ valors: TOTES, completa: true }));
      votar.mockResolvedValue({ votats: 3, total: 3, completa: true });
      const user = userEvent.setup();
      renderPaginaPreIdentificat();
      await user.click(await screen.findByRole('button', { name: 'Revisar els meus vots' }));
      await user.click(screen.getByRole('button', { name: "No m'agrada" }));
      expect(votar).toHaveBeenCalledWith('tok-7', 't1', 'p1', 'dislike');
      await waitFor(() => expect(screen.getByRole('button', { name: "No m'agrada" })).toHaveAttribute('aria-pressed', 'true'));
      expect(titolTargeta()).toBe('Amélie');
      expect(screen.queryByRole('heading', { name: 'El teu resum' })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Tornar al resum' }));
      expect(screen.getByRole('heading', { name: 'El teu resum' })).toBeInTheDocument();
      expect(screen.getByText('1 👍 · 2 👎')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2 })).toHaveFocus();
      expect(carregarRanking).not.toHaveBeenCalled();
    });

    it('en mode revisió hi ha «Tornar al resum» dins la franja sticky de la barra de progrés; fora de la revisió no hi és', async () => {
      carregarEstat.mockResolvedValue(estatObert({ valors: TOTES, completa: true }));
      const user = userEvent.setup();
      renderPaginaPreIdentificat();
      await screen.findByRole('heading', { name: 'El teu resum' });
      expect(screen.queryByRole('button', { name: 'Tornar al resum' })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Revisar els meus vots' }));
      const tornar = screen.getByRole('button', { name: 'Tornar al resum' });
      expect(tornar.closest('.votacio__capcalera')).toContainElement(screen.getByRole('progressbar'));
      expect(screen.getAllByRole('button', { name: 'Tornar al resum' })).toHaveLength(1);
      await user.click(screen.getByRole('button', { name: 'Següent' }));
      expect(screen.getByRole('button', { name: 'Tornar al resum' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Tornar al resum' }));
      expect(screen.getByRole('heading', { name: 'El teu resum' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Tornar al resum' })).not.toBeInTheDocument();
    });

    it('cada cartell del resum és un botó que obre la fitxa d\'aquella pel·lícula en mode revisió', async () => {
      carregarEstat.mockResolvedValue(estatObert({ valors: TOTES, completa: true }));
      const user = userEvent.setup();
      renderPaginaPreIdentificat();
      await screen.findByRole('heading', { name: 'El teu resum' });
      expect(screen.getAllByRole('button', { name: /^Canviar el vot de/ })).toHaveLength(3);
      await user.click(screen.getByRole('button', { name: "Canviar el vot de El padrí (ara: no m'agrada)" }));
      expect(titolTargeta()).toBe('El padrí');
      expect(screen.getByRole('button', { name: "No m'agrada" })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Tornar al resum' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'El teu resum' })).not.toBeInTheDocument();
    });

    it('«Canviar» → votar es queda a la mateixa fitxa (ni resum ni la següent) i «Tornar al resum» mostra el vot nou', async () => {
      carregarEstat.mockResolvedValue(estatObert({ valors: TOTES, completa: true }));
      votar.mockResolvedValue({ votats: 3, total: 3, completa: true });
      const user = userEvent.setup();
      renderPaginaPreIdentificat();
      await user.click(await screen.findByRole('button', { name: "Canviar el vot de El padrí (ara: no m'agrada)" }));
      await user.click(screen.getByRole('button', { name: "M'agrada" }));
      expect(votar).toHaveBeenCalledWith('tok-7', 't1', 'p2', 'like');
      await waitFor(() => expect(screen.getByRole('button', { name: "M'agrada" })).toHaveAttribute('aria-pressed', 'true'));
      expect(titolTargeta()).toBe('El padrí');
      expect(screen.queryByRole('heading', { name: 'El teu resum' })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Tornar al resum' }));
      expect(screen.getByRole('button', { name: "Canviar el vot de El padrí (ara: m'agrada)" })).toBeInTheDocument();
      expect(screen.getByText('3 👍 · 0 👎')).toBeInTheDocument();
    });

    it('a la pantalla final, la barra de progrés diu «Has votat 3 de 3» (única línia) i és la completa', async () => {
      carregarEstat.mockResolvedValue(estatObert({ valors: TOTES, completa: true }));
      renderPaginaPreIdentificat();
      await screen.findByRole('heading', { name: 'El teu resum' });
      expect(screen.getAllByText(/Has votat/)).toHaveLength(1);
      expect(document.querySelector('.barra-progres')).toHaveClass('barra-progres--completa');
    });

    it('«Sortir» a la pantalla final esborra la identitat i torna al mode visitant', async () => {
      carregarEstat.mockResolvedValue(estatObert({ valors: TOTES, completa: true }));
      const user = userEvent.setup();
      renderPaginaPreIdentificat();
      await user.click(await screen.findByRole('button', { name: /^Sortir/ }));
      expect(sessionStorage.getItem('cineclub.identitat')).toBeNull();
      expect(await cartellsTanda()).toHaveLength(3);
      expect(screen.queryByText(/Has votat/)).not.toBeInTheDocument();
    });

    it('«Sortir» esborra la identitat des de la targeta', async () => {
      const user = userEvent.setup();
      renderPaginaPreIdentificat();
      await user.click(await screen.findByRole('button', { name: /^Sortir/ }));
      expect(sessionStorage.getItem('cineclub.identitat')).toBeNull();
      expect(await cartellsTanda()).toHaveLength(3);
    });

    it('la pantalla final es neteja sola als 3 minuts (la identitat s\'esborra)', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      carregarEstat.mockResolvedValue(estatObert({ valors: TOTES, completa: true }));
      renderPaginaPreIdentificat();
      await screen.findByRole('heading', { name: 'El teu resum' });
      // findBy resol en pintar-se el DOM; el temporitzador el posa un useEffect que pot no haver corregut encara.
      await act(async () => {});

      act(() => { vi.advanceTimersByTime(TRES_MINUTS_MS - 5000); });
      expect(sessionStorage.getItem('cineclub.identitat')).not.toBeNull();
      act(() => { vi.advanceTimersByTime(10000); });
      expect(sessionStorage.getItem('cineclub.identitat')).toBeNull();
      expect(await cartellsTanda()).toHaveLength(3);
    });

    it('també es neteja als 3 minuts de veure el rànquing', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      carregarEstat.mockResolvedValue(estatObert({ valors: TOTES, completa: true, bloquejat: true }));
      renderPaginaPreIdentificat();
      await screen.findByText('80 %');
      // Com a la prova anterior: cal que el useEffect que posa el temporitzador hagi corregut abans d'avançar el rellotge.
      await act(async () => {});
      act(() => { vi.advanceTimersByTime(TRES_MINUTS_MS + 1000); });
      expect(sessionStorage.getItem('cineclub.identitat')).toBeNull();
    });

    it('el temporitzador es cancel·la en desmuntar la pàgina', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      carregarEstat.mockResolvedValue(estatObert({ valors: TOTES, completa: true }));
      const { unmount } = renderPaginaPreIdentificat();
      await screen.findByRole('heading', { name: 'El teu resum' });
      unmount();
      act(() => { vi.advanceTimersByTime(TRES_MINUTS_MS * 2); });
      expect(sessionStorage.getItem('cineclub.identitat')).not.toBeNull();
    });

    it('mentre es vota (sense pantalla final) no hi ha temporitzador', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      renderPaginaPreIdentificat();
      await screen.findByText('Has votat 0 de 3');
      act(() => { vi.advanceTimersByTime(TRES_MINUTS_MS * 2); });
      expect(sessionStorage.getItem('cineclub.identitat')).not.toBeNull();
    });
  });

  describe('mode votació immersiu', () => {
    // L'h1 i l'explicació es renderitzen al servidor (index.astro) i s'amaguen amb CSS quan el cos porta
    // `propostes-immersiu-body`; l'illa només pinta el botó gran.
    const hiHaCapcalera = () => ({
      introAmagada: document.body.classList.contains('propostes-immersiu-body'),
      proposar: screen.queryByRole('button', { name: 'Proposar pel·lícula' }),
    });
    const IMMERSIU = { introAmagada: true, proposar: null };

    beforeEach(() => {
      mockFirestore({ tanda: tandaFirestore() });
    });

    it('identificat amb tanda oberta: intro amagada i sense el botó «Proposar pel·lícula»; només la barra de progrés i la fitxa', async () => {
      carregarEstat.mockResolvedValue(estatObert());
      renderPaginaPreIdentificat();
      await screen.findByText('Has votat 0 de 3');
      expect(hiHaCapcalera()).toEqual(IMMERSIU);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(titolTargeta()).toBe('Amélie');
      expect(document.querySelector('.propostes-public__llista')).toBeNull();
    });

    it('també és immersiu a la pantalla final i al rànquing', async () => {
      carregarEstat.mockResolvedValue(estatObert({ valors: TOTES, completa: true }));
      const user = userEvent.setup();
      renderPaginaPreIdentificat();
      await user.click(await screen.findByRole('button', { name: 'Confirmar i veure el rànquing' }));
      await screen.findByText('80 %');
      expect(hiHaCapcalera()).toEqual(IMMERSIU);
    });

    it('mentre es carrega l\'estat d\'un soci identificat la intro és amagada (no parpelleja), també quan les propostes ja són carregades', async () => {
      carregarEstat.mockReturnValue(new Promise(() => {}));
      renderPaginaPreIdentificat();
      await waitFor(() => expect(getDocs).toHaveBeenCalled());
      // Espera que les lectures de Firestore s'hagin resolt i l'estat estigui encara pendent.
      await act(async () => { await Promise.all(getDocs.mock.results.map((r) => r.value)); });
      expect(document.querySelector('.carregant')).not.toBeNull();
      expect(hiHaCapcalera()).toEqual(IMMERSIU);
    });

    it('la barra de progrés es col·loca sota la capçalera del web amb l\'alçada real d\'aquesta (que pot variar)', async () => {
      const capcalera = document.createElement('header');
      capcalera.className = 'site-header';
      document.body.append(capcalera);
      Object.defineProperty(capcalera, 'offsetHeight', { value: 100 });
      try {
        carregarEstat.mockResolvedValue(estatObert());
        renderPaginaPreIdentificat();
        await screen.findByText('Has votat 0 de 3');
        expect(document.querySelector('.votacio').style.getPropertyValue('--alcada-capcalera')).toBe('100px');
      } finally {
        capcalera.remove();
      }
    });

    it('el nom públic té el nom complet com a `title` (es trunca amb ellipsis a la franja)', async () => {
      carregarEstat.mockResolvedValue(estatObert());
      renderPaginaPreIdentificat();
      await screen.findByText('Has votat 0 de 3');
      expect(document.querySelector('.votacio__nom')).toHaveAttribute('title', 'Isabel M.');
    });

    it('«Identificat com: …· Sortir» és a la capçalera de la barra de progrés', async () => {
      carregarEstat.mockResolvedValue(estatObert());
      renderPaginaPreIdentificat();
      const sortir = await screen.findByRole('button', { name: /^Sortir/ });
      expect(sortir.closest('.votacio__capcalera')).toContainElement(screen.getByRole('progressbar'));
      expect(sortir.closest('.votacio__identitat')).toHaveTextContent('Identificat com: Isabel M.');
    });

    it('la línia d\'identitat i la sortida hi són també a la pantalla final i al rànquing, i només hi ha una via de sortida', async () => {
      carregarEstat.mockResolvedValue(estatObert({ valors: TOTES, completa: true }));
      const user = userEvent.setup();
      renderPaginaPreIdentificat();
      const viesDeSortida = () => screen.getAllByRole('button', { name: /sortir|acabar$|no sóc jo/i });

      await screen.findByRole('heading', { name: 'El teu resum' });
      expect(document.querySelector('.votacio__identitat')).toHaveTextContent('Identificat com: Isabel M.');
      expect(viesDeSortida()).toHaveLength(1);

      await user.click(screen.getByRole('button', { name: 'Confirmar i veure el rànquing' }));
      await screen.findByText('80 %');
      expect(document.querySelector('.votacio__identitat')).toHaveTextContent('Identificat com: Isabel M.');
      expect(viesDeSortida()).toHaveLength(1);
    });

    it('amb una sola targeta per votar també hi ha una sola via de sortida', async () => {
      carregarEstat.mockResolvedValue(estatObert());
      renderPaginaPreIdentificat();
      await screen.findByText('Has votat 0 de 3');
      expect(screen.getAllByRole('button', { name: /sortir|acabar$|no sóc jo/i })).toHaveLength(1);
    });

    it('en acabar (identitat esborrada) tornen la intro, el botó i les targetes de la tanda', async () => {
      carregarEstat.mockResolvedValue(estatObert({ valors: TOTES, completa: true }));
      const user = userEvent.setup();
      renderPaginaPreIdentificat();
      await screen.findByRole('heading', { name: 'El teu resum' });
      expect(hiHaCapcalera()).toEqual(IMMERSIU);
      await user.click(screen.getByRole('button', { name: /^Sortir/ }));
      await cartellsTanda();
      const c = hiHaCapcalera();
      expect(c.introAmagada).toBe(false);
      expect(c.proposar).toBeInTheDocument();
    });

    it('en desmuntar l\'illa en mode immersiu, treu la classe del cos', async () => {
      carregarEstat.mockResolvedValue(estatObert());
      const { unmount } = renderPaginaPreIdentificat();
      await screen.findByText('Has votat 0 de 3');
      expect(document.body).toHaveClass('propostes-immersiu-body');
      unmount();
      expect(document.body).not.toHaveClass('propostes-immersiu-body');
    });

    it('visitant sense identificar i sense tanda: vista normal amb la intro i el botó', async () => {
      mockFirestore();
      renderPagina();
      await screen.findByText(SENSE_TANDA);
      const c = hiHaCapcalera();
      expect(c.introAmagada).toBe(false);
      expect(c.proposar).toBeInTheDocument();
    });

    it('identificat sense tanda oberta (cap o tancada): vista normal amb la intro i el botó', async () => {
      mockFirestore({ tanda: tandaFirestore(PASSAT) });
      carregarEstat.mockResolvedValue(estatTancat());
      renderPaginaPreIdentificat();
      await screen.findByText('90 %');
      const c = hiHaCapcalera();
      expect(c.introAmagada).toBe(false);
      expect(c.proposar).toBeInTheDocument();
    });

    it('una classe d\'intro amagada que ve d\'abans de muntar (script de la pàgina) es treu si no és mode immersiu', async () => {
      document.body.classList.add('propostes-immersiu-body');
      mockFirestore();
      carregarEstat.mockResolvedValue({ tanda: null });
      renderPaginaPreIdentificat();
      await screen.findByText(SENSE_TANDA);
      await waitFor(() => expect(document.body).not.toHaveClass('propostes-immersiu-body'));
    });
  });

  describe('la càrrega no atrapa el soci identificat', () => {
    beforeEach(() => {
      mockFirestore({ tanda: tandaFirestore() });
      carregarEstat.mockResolvedValue(estatObert());
    });

    it('si les propostes no es poden llegir, mostra un error amb «Tornar a provar» i «Sortir»', async () => {
      getDocs.mockImplementation((q) => (
        (q?.collectionName ?? q) === 'propostes' ? Promise.reject(new Error('xarxa')) : Promise.resolve({ docs: [] })
      ));
      const user = userEvent.setup();
      renderPaginaPreIdentificat();
      expect(await screen.findByText("No s'han pogut carregar les propostes. Torna-ho a provar.")).toBeInTheDocument();
      expect(document.querySelector('.carregant')).toBeNull();
      expect(screen.getByRole('button', { name: 'Tornar a provar' })).toBeInTheDocument();

      mockFirestore({ tanda: tandaFirestore() });
      await user.click(screen.getByRole('button', { name: 'Tornar a provar' }));
      expect(await screen.findByText('Has votat 0 de 3')).toBeInTheDocument();
      expect(screen.queryByText(/No s'han pogut carregar/)).not.toBeInTheDocument();
    });

    it('«Sortir» de l\'error esborra la identitat i torna a la vista normal', async () => {
      getDocs.mockImplementation((q) => (
        (q?.collectionName ?? q) === 'propostes' ? Promise.reject(new Error('xarxa')) : Promise.resolve({ docs: [] })
      ));
      const user = userEvent.setup();
      renderPaginaPreIdentificat();
      await user.click(await screen.findByRole('button', { name: /^Sortir/ }));
      expect(sessionStorage.getItem('cineclub.identitat')).toBeNull();
    });

    it('si la càrrega no es resol en 15 segons, mostra l\'error amb «Tornar a provar» i «Sortir»', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      carregarEstat.mockReturnValue(new Promise(() => {}));
      renderPaginaPreIdentificat();
      await waitFor(() => expect(getDocs).toHaveBeenCalled());
      expect(screen.queryByRole('button', { name: 'Tornar a provar' })).not.toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(15000); });
      expect(await screen.findByRole('button', { name: 'Tornar a provar' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Sortir/ })).toBeInTheDocument();
    });

    it('un visitant sense identificar tampoc es queda carregant si les propostes fallen', async () => {
      getDocs.mockImplementation((q) => (
        (q?.collectionName ?? q) === 'propostes' ? Promise.reject(new Error('xarxa')) : Promise.resolve({ docs: [] })
      ));
      renderPagina();
      expect(await screen.findByRole('button', { name: 'Tornar a provar' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Sortir/ })).not.toBeInTheDocument();
    });

    it('amb una tanda oberta però cap proposta carregable, diu que no n\'hi ha i ofereix «Sortir» (sense la barra sola)', async () => {
      mockFirestore({ propostes: [], tanda: tandaFirestore() });
      const user = userEvent.setup();
      renderPaginaPreIdentificat();
      expect(await screen.findByText('Ara mateix no hi ha propostes per votar.')).toBeInTheDocument();
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /^Sortir/ }));
      expect(sessionStorage.getItem('cineclub.identitat')).toBeNull();
    });
  });

  describe('errors dels callables', () => {
    beforeEach(() => {
      mockFirestore({ tanda: tandaFirestore() });
    });

    it('un carnet no vàlid en carregar l\'estat mostra un missatge, esborra la identitat i no trenca la pàgina', async () => {
      carregarEstat.mockRejectedValue(errorCallable('permission-denied'));
      renderPaginaPreIdentificat();
      expect(await screen.findByText('Aquest carnet no és vàlid. Torna a escanejar-lo.')).toBeInTheDocument();
      expect(sessionStorage.getItem('cineclub.identitat')).toBeNull();
      expect(await cartellsTanda()).toHaveLength(3);
    });

    it('un error de xarxa en carregar l\'estat mostra un missatge i la llista sense vot', async () => {
      carregarEstat.mockRejectedValue(new Error('xarxa'));
      renderPaginaPreIdentificat();
      expect(await screen.findByText(/Torna-ho a provar/)).toBeInTheDocument();
      expect((await screen.findAllByText('Amélie')).length).toBeGreaterThan(0);
      expect(screen.queryByRole('button', { name: /m'agrada/i })).not.toBeInTheDocument();
    });

    it('un error en votar mostra el missatge sense moure res i es pot tornar a provar', async () => {
      carregarEstat.mockResolvedValue(estatObert());
      votar.mockRejectedValueOnce(errorCallable('permission-denied'));
      const user = userEvent.setup();
      renderPaginaPreIdentificat();
      await screen.findByText('Has votat 0 de 3');
      await user.click(screen.getByRole('button', { name: "M'agrada" }));
      expect(await screen.findByText('Aquest carnet no és vàlid. Torna a escanejar-lo.')).toBeInTheDocument();
      expect(screen.getByText('Has votat 0 de 3')).toBeInTheDocument();
      expect(titolTargeta()).toBe('Amélie');

      await user.click(screen.getByRole('button', { name: "M'agrada" }));
      expect(await screen.findByText('Has votat 1 de 3')).toBeInTheDocument();
      expect(screen.queryByText('Aquest carnet no és vàlid. Torna a escanejar-lo.')).not.toBeInTheDocument();
    });

    it('si la tanda s\'ha tancat mentre es votava, mostra el missatge, torna a carregar l\'estat i la tanda i en mostra el rànquing', async () => {
      carregarEstat.mockResolvedValueOnce(estatObert()).mockResolvedValue(estatTancat());
      votar.mockRejectedValueOnce(errorCallable('failed-precondition'));
      const user = userEvent.setup();
      renderPaginaPreIdentificat();
      await screen.findByText('Has votat 0 de 3');
      mockFirestore({ tanda: tandaFirestore(PASSAT) });
      await user.click(screen.getByRole('button', { name: "M'agrada" }));
      expect(await screen.findByText(/tancada o els teus vots ja estan bloquejats/)).toBeInTheDocument();
      expect(await screen.findByRole('heading', { level: 2, name: /^Última tanda/ })).toBeInTheDocument();
      expect(await screen.findByText('90 %')).toBeInTheDocument();
      expect(carregarRankingPublic).toHaveBeenCalledWith('t1');
      expect(carregarEstat).toHaveBeenCalledTimes(2);
    });

    it('un permission-denied en confirmar mostra el missatge DINS la barra de baix (role="alert") i no bloqueja', async () => {
      carregarEstat.mockResolvedValue(estatObert({ valors: TOTES, completa: true }));
      carregarRanking.mockRejectedValueOnce(errorCallable('permission-denied'));
      const user = userEvent.setup();
      renderPaginaPreIdentificat();
      await user.click(await screen.findByRole('button', { name: 'Confirmar i veure el rànquing' }));
      const alerta = await screen.findByRole('alert');
      expect(alerta).toHaveTextContent(/Cal votar totes les propostes/);
      expect(alerta.closest('.pantalla-final-vot__barra')).not.toBeNull();
      expect(document.querySelector('.propostes-public > .form__error')).toBeNull();
      expect(screen.getByRole('heading', { name: 'El teu resum' })).toBeInTheDocument();
      expect(screen.queryByText(/Gràcies per participar/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Confirmar i veure el rànquing' })).toBeEnabled();
    });

    it('un error de xarxa en confirmar també es veu a la barra i es pot reintentar', async () => {
      carregarEstat.mockResolvedValue(estatObert({ valors: TOTES, completa: true }));
      carregarRanking.mockRejectedValueOnce(new Error('xarxa'));
      const user = userEvent.setup();
      renderPaginaPreIdentificat();
      await user.click(await screen.findByRole('button', { name: 'Confirmar i veure el rànquing' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/Torna-ho a provar/);
      await user.click(screen.getByRole('button', { name: 'Confirmar i veure el rànquing' }));
      expect(await screen.findByText('80 %')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('un failed-precondition en confirmar torna a carregar l\'estat i explica el motiu', async () => {
      carregarEstat.mockResolvedValueOnce(estatObert({ valors: TOTES, completa: true })).mockResolvedValue(estatTancat());
      carregarRanking.mockRejectedValueOnce(errorCallable('failed-precondition'));
      const user = userEvent.setup();
      renderPaginaPreIdentificat();
      const confirmar = await screen.findByRole('button', { name: 'Confirmar i veure el rànquing' });
      mockFirestore({ tanda: tandaFirestore(PASSAT) });
      await user.click(confirmar);
      expect(await screen.findByRole('heading', { level: 2, name: /^Última tanda/ })).toBeInTheDocument();
      expect(carregarEstat).toHaveBeenCalledTimes(2);
      expect(screen.getByText(/tancada o els teus vots ja estan bloquejats/)).toBeInTheDocument();
    });

    it('un error en el rànquing d\'una tanda tancada (soci identificat) mostra el missatge amb el reintent', async () => {
      mockFirestore({ tanda: tandaFirestore(PASSAT) });
      carregarEstat.mockResolvedValue(estatTancat());
      carregarRankingPublic.mockRejectedValueOnce(errorCallable('not-found'));
      renderPaginaPreIdentificat();
      expect(await screen.findByText("No s'ha pogut carregar el rànquing.")).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Tornar-ho a provar' })).toBeInTheDocument();
      expect(carregarRanking).not.toHaveBeenCalled();
    });
  });

  describe('soci identificat fora del mode votació', () => {
    it('sense tanda hi ha «Identificat com: … · Sortir», que esborra la identitat', async () => {
      mockFirestore();
      carregarEstat.mockResolvedValue({ tanda: null });
      const user = userEvent.setup();
      renderPaginaPreIdentificat();
      await screen.findByText(SENSE_TANDA);
      expect(document.querySelector('.votacio__identitat')).toHaveTextContent('Identificat com: Isabel M.');
      expect(document.querySelector('.votacio__nom')).toHaveAttribute('title', 'Isabel M.');
      await user.click(screen.getByRole('button', { name: 'Sortir: deixar de votar com a Isabel M.' }));
      expect(sessionStorage.getItem('cineclub.identitat')).toBeNull();
      expect(document.querySelector('.votacio__identitat')).toBeNull();
    });

    it('amb el rànquing d\'una tanda tancada també hi és, i només una via de sortida', async () => {
      mockFirestore({ tanda: tandaFirestore(PASSAT) });
      carregarEstat.mockResolvedValue(estatTancat());
      renderPaginaPreIdentificat();
      await screen.findByText('90 %');
      expect(document.querySelector('.votacio__identitat')).toHaveTextContent('Identificat com: Isabel M.');
      expect(screen.getAllByRole('button', { name: /^Sortir/ })).toHaveLength(1);
    });

    it('si la càrrega falla, la sortida és només la de l\'error (sense línia duplicada)', async () => {
      getDocs.mockImplementation((q) => (
        (q?.collectionName ?? q) === 'propostes' ? Promise.reject(new Error('xarxa')) : Promise.resolve({ docs: [] })
      ));
      renderPaginaPreIdentificat();
      await screen.findByRole('button', { name: 'Tornar a provar' });
      expect(screen.getAllByRole('button', { name: /^Sortir/ })).toHaveLength(1);
    });

    it('un visitant (sense identitat) no veu cap línia d\'identitat', async () => {
      mockFirestore();
      renderPagina();
      await screen.findByText(SENSE_TANDA);
      expect(document.querySelector('.votacio__identitat')).toBeNull();
    });
  });

  describe('detall obert i mode votació', () => {
    it('un soci ja identificat amb tanda oberta que arriba amb /propostes/#id va directe al mode votació, sense detall', async () => {
      window.location.hash = '#p1';
      mockFirestore({ tanda: tandaFirestore() });
      carregarEstat.mockResolvedValue(estatObert());
      renderPaginaPreIdentificat();
      expect(await screen.findByRole('progressbar')).toBeInTheDocument();
      expect(document.querySelector('.proposta-detall')).toBeNull();
      await waitFor(() => expect(window.location.hash).toBe('#recents'));
      expect(document.body).not.toHaveClass('proposta-detall-obert-body');
    });

    it('un soci identificat SENSE tanda oberta que arriba amb #id sí que veu la fitxa', async () => {
      window.location.hash = '#p1';
      mockFirestore();
      carregarEstat.mockResolvedValue({ tanda: null });
      renderPaginaPreIdentificat();
      expect(await screen.findByRole('button', { name: 'Tornar al llistat' })).toBeInTheDocument();
      expect(window.location.hash).toBe('#p1');
    });
  });

  describe('proposar, hash i detall', () => {
    it('l\'illa no pinta cap h1 (és a la pàgina, renderitzat al servidor) ni el «+» antic de la capçalera', async () => {
      mockFirestore({ propostes: [] });
      renderPagina();
      await screen.findByText(SENSE_TANDA);
      expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '+' })).not.toBeInTheDocument();
      expect(screen.queryByText('+')).not.toBeInTheDocument();
      expect(screen.queryByText('Propostes de programació')).not.toBeInTheDocument();
      expect(document.querySelector('.propostes-public__proposar-boto')).toBeNull();
    });

    it('amb el contenidor de la intro de la pàgina, el botó es pinta a dins (portal) i hi funciona', async () => {
      const intro = document.createElement('section');
      intro.className = 'propostes-intro';
      intro.innerHTML = '<div class="propostes-intro__accio" id="propostes-intro-accio"></div>';
      document.body.append(intro);
      try {
        mockFirestore({ propostes: [] });
        const user = userEvent.setup();
        renderPagina();
        await screen.findByText(SENSE_TANDA);
        const boto = screen.getByRole('button', { name: 'Proposar pel·lícula' });
        expect(intro).toContainElement(boto);
        expect(screen.getAllByRole('button', { name: 'Proposar pel·lícula' })).toHaveLength(1);
        await user.click(boto);
        expect(screen.getByText('Escaneja el teu carnet per proposar')).toBeInTheDocument();
      } finally {
        intro.remove();
      }
    });

    it('el botó gran «Proposar pel·lícula» té el text visible (no només aria-label) i és un .btn', async () => {
      mockFirestore({ propostes: [] });
      renderPagina();
      await screen.findByText(SENSE_TANDA);
      const boto = screen.getByRole('button', { name: 'Proposar pel·lícula' });
      expect(boto).toHaveTextContent('Proposar pel·lícula');
      expect(boto).not.toHaveAttribute('aria-label');
      expect(boto).toHaveClass('btn', 'propostes-intro__boto');
    });

    it('el modal d\'escaneig per proposar inclou un enllaç per fer-se soci/a', async () => {
      mockFirestore({ propostes: [] });
      const user = userEvent.setup();
      renderPagina();
      await screen.findByText(SENSE_TANDA);
      await user.click(screen.getByRole('button', { name: 'Proposar pel·lícula' }));
      expect(screen.getByRole('link', { name: 'Fes-te Soci/a' })).toHaveAttribute('href', '/fes-te-socia/');
    });

    it('en clicar «Proposar pel·lícula» sense identificar-se, demana escanejar per proposar', async () => {
      mockFirestore({ propostes: [] });
      const user = userEvent.setup();
      renderPagina();
      await screen.findByText(SENSE_TANDA);
      await user.click(screen.getByRole('button', { name: 'Proposar pel·lícula' }));
      expect(screen.getByText('Escaneja el teu carnet per proposar')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Simular escaneig' })).toBeInTheDocument();
    });

    it('un cop escanejat des de «Proposar pel·lícula», navega a la pàgina de proposar', async () => {
      mockFirestore({ propostes: [] });
      const assign = simulaNavegacio();
      const user = userEvent.setup();
      renderPagina();
      await screen.findByText(SENSE_TANDA);
      await user.click(screen.getByRole('button', { name: 'Proposar pel·lícula' }));
      await user.click(screen.getByRole('button', { name: 'Simular escaneig' }));
      await waitFor(() => expect(assign).toHaveBeenCalledWith('/propostes/proposar/'));
    });

    it('escanejar per proposar en una tanda oberta no aplica cap vot', async () => {
      mockFirestore({ tanda: tandaFirestore() });
      carregarEstat.mockResolvedValue(estatObert());
      const assign = simulaNavegacio();
      const user = userEvent.setup();
      renderPagina();
      await screen.findAllByText('Amélie');
      await user.click(screen.getByRole('button', { name: 'Proposar pel·lícula' }));
      await user.click(screen.getByRole('button', { name: 'Simular escaneig' }));
      await waitFor(() => expect(assign).toHaveBeenCalledWith('/propostes/proposar/'));
      expect(votar).not.toHaveBeenCalled();
    });

    it('amb la identitat ja coneguda, «Proposar pel·lícula» hi navega directament sense escanejar', async () => {
      mockFirestore();
      const assign = simulaNavegacio();
      const user = userEvent.setup();
      renderPaginaPreIdentificat();
      await screen.findByText(SENSE_TANDA);
      await user.click(screen.getByRole('button', { name: 'Proposar pel·lícula' }));
      expect(assign).toHaveBeenCalledWith('/propostes/proposar/');
      expect(screen.queryByRole('button', { name: 'Simular escaneig' })).not.toBeInTheDocument();
    });

    it('amb el teclat, un cartell rep el focus i amb Retorn obre el detall', async () => {
      mockFirestore({ tanda: tandaFirestore() });
      const user = userEvent.setup();
      renderPagina();
      const [primer] = await cartellsTanda();
      primer.focus();
      expect(primer).toHaveFocus();
      await user.keyboard('{Enter}');
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(window.location.hash).toBe('#p1');
    });

    it('en clicar un cartell de la tanda, obre el detall a pantalla completa i actualitza el hash de la URL', async () => {
      mockFirestore({
        propostes: [{ id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3, sinopsi: 'Una història parisenca.' } }],
        tanda: { id: 't1', tanca: FUTUR, propostes: ['p1'] },
      });
      const user = userEvent.setup();
      renderPagina();
      await user.click(await screen.findByRole('button', { name: /Amélie/ }));
      expect(screen.getAllByText('Una història parisenca.').length).toBeGreaterThan(0);
      expect(window.location.hash).toBe('#p1');
    });

    it('sense tanda, el detall (obert amb #id) no té cap botó de vot', async () => {
      window.location.hash = '#p1';
      mockFirestore();
      renderPagina();
      const dialeg = await screen.findByRole('dialog');
      expect(within(dialeg).queryByRole('button', { name: /m'agrada/i })).not.toBeInTheDocument();
    });

    it('al detall, mostra qui ha fet la proposta i la data', async () => {
      mockFirestore({
        propostes: [{ id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3, nomProposant: 'Anna M.', timestamp: { toDate: () => new Date(2026, 6, 22) } } }],
        tanda: { id: 't1', tanca: FUTUR, propostes: ['p1'] },
      });
      const user = userEvent.setup();
      renderPagina();
      await user.click(await screen.findByRole('button', { name: /Amélie/ }));
      expect(await screen.findByText(/Proposada per/)).toBeInTheDocument();
      expect(screen.getAllByText(/Proposada per/)).toHaveLength(1);
      expect(screen.getByText('Anna M.')).toBeInTheDocument();
      expect(screen.getAllByText('22/07/2026').length).toBeGreaterThan(0);
    });

    it('el botó de tornar tanca el detall i restaura el hash #recents', async () => {
      mockFirestore({ tanda: tandaFirestore() });
      const user = userEvent.setup();
      renderPagina();
      await user.click(await screen.findByRole('button', { name: /Amélie/ }));
      await user.click(screen.getByRole('button', { name: 'Tornar al llistat' }));
      expect(screen.queryByRole('button', { name: 'Tornar al llistat' })).not.toBeInTheDocument();
      expect(window.location.hash).toBe('#recents');
    });

    it('carregar la pàgina amb un hash existent obre directament aquell detall', async () => {
      window.location.hash = '#p1';
      mockFirestore();
      renderPagina();
      expect(await screen.findByRole('button', { name: 'Tornar al llistat' })).toBeInTheDocument();
    });

    it('amb #<id> la fitxa s\'obre quan arriben les dades, encara que la llista trigui', async () => {
      window.location.hash = '#p1';
      let resol;
      getDocs.mockImplementation((q) => {
        if ((q?.collectionName ?? q) === 'propostes') {
          return new Promise((r) => { resol = () => r({ docs: [{ id: 'p1', data: () => ({ titol: 'Amélie', estat: 'aprovada', numeroSoci: 3 }) }] }); });
        }
        return Promise.resolve({ docs: [] });
      });
      renderPagina();
      expect(screen.queryByRole('button', { name: 'Tornar al llistat' })).not.toBeInTheDocument();
      expect(document.body).toHaveClass('proposta-detall-obert-body');
      await waitFor(() => expect(resol).toBeDefined());
      resol();
      expect(await screen.findByRole('button', { name: 'Tornar al llistat' })).toBeInTheDocument();
      expect(screen.getAllByText('Amélie').length).toBeGreaterThan(0);
    });

    it('els hashes #recents i l\'antic #top mostren la tanda, sense obrir cap detall', async () => {
      for (const hash of ['#recents', '#top']) {
        window.location.hash = hash;
        mockFirestore({ tanda: tandaFirestore() });
        const { unmount } = renderPagina();
        await screen.findAllByText('Amélie');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(document.body).not.toHaveClass('proposta-detall-obert-body');
        unmount();
      }
    });

    it('el cos del document porta la classe del detall obert només mentre la fitxa és oberta', async () => {
      mockFirestore({ tanda: tandaFirestore() });
      const user = userEvent.setup();
      renderPagina();
      await user.click(await screen.findByRole('button', { name: /Amélie/ }));
      expect(document.body).toHaveClass('proposta-detall-obert-body');
      await user.click(screen.getByRole('button', { name: 'Tornar al llistat' }));
      expect(document.body).not.toHaveClass('proposta-detall-obert-body');
    });
  });
});
