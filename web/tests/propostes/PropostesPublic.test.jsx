// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IdentitatPublicaProvider } from '../../src/auth/IdentitatPublica.jsx';

vi.mock('../../src/firebase/client.js', () => ({ db: {} }));
vi.mock('../../src/components/propostes/LectorCarnet.jsx', () => ({
  default: ({ onIdentificat }) => (
    <button type="button" onClick={() => onIdentificat({ numeroSoci: 7, nomPublic: 'Isabel M.', token: 'tok-7' })}>
      Simular escaneig
    </button>
  ),
}));
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn().mockResolvedValue({ id: 'nova' }),
  setDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  collection: vi.fn((_, nom) => nom),
  doc: vi.fn((...args) => args[args.length - 1]),
  query: vi.fn((collectionName, ...constraints) => ({ collectionName, constraints })),
  where: vi.fn((field, op, value) => ({ field, op, value })),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'TIMESTAMP'),
}));

import { getDocs, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import PropostesPublic from '../../src/components/propostes/PropostesPublic.jsx';

function mockPropostesAmbVots(propostes) {
  getDocs.mockImplementation((q) => {
    if (q?.collectionName === 'propostes') {
      return Promise.resolve({ docs: propostes.map((p) => ({ id: p.id, data: () => p.dades })) });
    }
    return Promise.resolve({ docs: [] });
  });
}

function renderPagina() {
  return render(
    <IdentitatPublicaProvider>
      <PropostesPublic />
    </IdentitatPublicaProvider>
  );
}

// Simula una pàgina que es munta (o es recarrega) quan la identitat ja és
// a sessionStorage (p. ex. venint de la pàgina de proposar), sense cap
// escaneig nou.
const IDENTITAT = { numeroSoci: 7, nomPublic: 'Isabel M.', token: 'tok-7' };

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

describe('PropostesPublic', () => {
  beforeEach(() => {
    setDoc.mockClear();
    deleteDoc.mockClear();
    getDocs.mockReset();
    getDoc.mockReset();
    getDoc.mockResolvedValue({ exists: () => false });
    window.location.hash = '';
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mostra la llista de propostes aprovades i els vots sense identificar-se', async () => {
    mockPropostesAmbVots([
      { id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3 } },
      { id: 'p2', dades: { titol: 'El padrí', estat: 'aprovada', numeroSoci: 5 } },
    ]);
    renderPagina();
    expect((await screen.findAllByText('Amélie')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('El padrí').length).toBeGreaterThan(0);
  });

  it('si el títol no és en castellà ni català, mostra a sota el títol a Espanya entre parèntesis', async () => {
    mockPropostesAmbVots([
      { id: 'p1', dades: { titol: 'La Haine', titolLocal: 'El odio', estat: 'aprovada', numeroSoci: 3 } },
      { id: 'p2', dades: { titol: 'El padrí', estat: 'aprovada', numeroSoci: 5 } },
    ]);
    renderPagina();
    expect((await screen.findAllByText('(El odio)')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^\(El padrí/)).not.toBeInTheDocument();
  });

  it('mostra la data de cada proposta i, per defecte, les ordena de més nova a més antiga', async () => {
    getDocs.mockImplementation((q) => {
      if (q?.collectionName === 'propostes') {
        return Promise.resolve({
          docs: [
            {
              id: 'antiga',
              data: () => ({
                titol: 'Antiga', estat: 'aprovada', numeroSoci: 3, imatgeUrl: 'https://exemple.com/antiga.jpg', timestamp: { toDate: () => new Date(2026, 0, 1) },
              }),
            },
            {
              id: 'nova',
              data: () => ({
                titol: 'Nova', estat: 'aprovada', numeroSoci: 3, imatgeUrl: 'https://exemple.com/nova.jpg', timestamp: { toDate: () => new Date(2026, 5, 1) },
              }),
            },
          ],
        });
      }
      return Promise.resolve({ docs: [] });
    });
    renderPagina();
    await screen.findByText('Nova');
    const titols = screen.getAllByText(/^(Antiga|Nova)$/).map((el) => el.textContent);
    expect(titols).toEqual(['Nova', 'Antiga']);
    expect(screen.getAllByText('01/06/2026').length).toBeGreaterThan(0);
    expect(screen.getAllByText('01/01/2026').length).toBeGreaterThan(0);
  });

  it('el botó "Top" reordena les propostes de més a menys vots', async () => {
    getDocs
      .mockResolvedValueOnce({
        docs: [
          {
            id: 'poc-votada',
            data: () => ({
              titol: 'Poc votada', estat: 'aprovada', numeroSoci: 3, imatgeUrl: 'https://exemple.com/poc.jpg', timestamp: { toDate: () => new Date(2026, 5, 1) },
            }),
          },
          {
            id: 'molt-votada',
            data: () => ({
              titol: 'Molt votada', estat: 'aprovada', numeroSoci: 5, imatgeUrl: 'https://exemple.com/molt.jpg', timestamp: { toDate: () => new Date(2026, 0, 1) },
            }),
          },
        ],
      })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [{}, {}, {}] });
    const user = userEvent.setup();
    renderPagina();
    await screen.findByText('Poc votada');
    expect(screen.getAllByText(/Poc votada|Molt votada/).map((el) => el.textContent)).toEqual(['Poc votada', 'Molt votada']);

    await user.click(screen.getByRole('tab', { name: 'Més votades' }));
    expect(screen.getAllByText(/Poc votada|Molt votada/).map((el) => el.textContent)).toEqual(['Molt votada', 'Poc votada']);

    await user.click(screen.getByRole('tab', { name: 'Més recents' }));
    expect(screen.getAllByText(/Poc votada|Molt votada/).map((el) => el.textContent)).toEqual(['Poc votada', 'Molt votada']);
  });

  it('a la vista Top mostra la posició, el número de vots i obre el detall en clicar la fila (però no en votar)', async () => {
    mockPropostesAmbVots([
      { id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3, imatgeUrl: 'https://exemple.com/a.jpg' } },
      { id: 'p2', dades: { titol: 'El padrí', estat: 'aprovada', numeroSoci: 5, imatgeUrl: 'https://exemple.com/b.jpg' } },
    ]);
    const user = userEvent.setup();
    renderPagina();
    await screen.findByText('Amélie');
    await user.click(screen.getByRole('tab', { name: 'Més votades' }));

    const files = screen.getAllByRole('listitem');
    expect(files[0]).toHaveTextContent('1');
    expect(files[1]).toHaveTextContent('2');

    await user.click(within(files[0]).getByRole('button', { name: 'Votar' }));
    expect(screen.queryByRole('button', { name: 'Tornar al llistat' })).not.toBeInTheDocument();

    await user.click(screen.getByText('Amélie'));
    expect(await screen.findByRole('button', { name: 'Tornar al llistat' })).toBeInTheDocument();
  });

  it('canviar de pestanya actualitza el hash de la URL, i es pot obrir directament amb #top', async () => {
    mockPropostesAmbVots([
      { id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3, imatgeUrl: 'https://exemple.com/a.jpg' } },
    ]);
    const user = userEvent.setup();
    renderPagina();
    await screen.findByText('Amélie');
    expect(window.location.hash).toBe('');

    await user.click(screen.getByRole('tab', { name: 'Més votades' }));
    expect(window.location.hash).toBe('#top');

    await user.click(screen.getByRole('tab', { name: 'Més recents' }));
    expect(window.location.hash).toBe('#recents');
  });

  it('carregar la pàgina amb #top obre directament la vista de més votades', async () => {
    window.location.hash = '#top';
    mockPropostesAmbVots([
      { id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3, imatgeUrl: 'https://exemple.com/a.jpg' } },
    ]);
    renderPagina();
    await screen.findByText('Amélie');
    expect(screen.getByRole('tab', { name: 'Més votades' })).toHaveAttribute('aria-selected', 'true');
  });

  it('el modal d\'escaneig inclou un enllaç per fer-se soci/a', async () => {
    mockPropostesAmbVots([]);
    const user = userEvent.setup();
    renderPagina();
    await screen.findByText(/Encara no hi ha cap proposta/);
    await user.click(screen.getByRole('button', { name: 'Proposar pel·lícula' }));
    const enllac = screen.getByRole('link', { name: 'Fes-te Soci/a' });
    expect(enllac).toHaveAttribute('href', '/fes-te-socia/');
  });

  it('en clicar "+ Proposar" sense identificar-se, demana escanejar per proposar', async () => {
    mockPropostesAmbVots([]);
    const user = userEvent.setup();
    renderPagina();
    await screen.findByText(/Encara no hi ha cap proposta/);
    await user.click(screen.getByRole('button', { name: 'Proposar pel·lícula' }));
    expect(screen.getByText('Escaneja el teu carnet per proposar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Simular escaneig' })).toBeInTheDocument();
  });

  it('un cop escanejat des de "+ Proposar", navega a la pàgina de proposar', async () => {
    mockPropostesAmbVots([]);
    const assign = simulaNavegacio();
    const user = userEvent.setup();
    renderPagina();
    await screen.findByText(/Encara no hi ha cap proposta/);
    await user.click(screen.getByRole('button', { name: 'Proposar pel·lícula' }));
    await user.click(screen.getByRole('button', { name: 'Simular escaneig' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/propostes/proposar/'));
  });

  it('un cop identificat (p. ex. per haver votat), "+ Proposar" hi navega directament sense tornar a escanejar', async () => {
    mockPropostesAmbVots([{ id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3 } }]);
    const assign = simulaNavegacio();
    const user = userEvent.setup();
    renderPagina();
    await user.click(await screen.findByRole('button', { name: 'Votar' }));
    await user.click(screen.getByRole('button', { name: 'Simular escaneig' }));
    await screen.findByRole('button', { name: 'Has votat, treure el vot' });

    await user.click(screen.getByRole('button', { name: 'Proposar pel·lícula' }));
    expect(assign).toHaveBeenCalledWith('/propostes/proposar/');
    expect(screen.queryByRole('button', { name: 'Simular escaneig' })).not.toBeInTheDocument();
  });

  it('en clicar Votar sense identificar-se, obre l\'escanejador i no vota encara', async () => {
    mockPropostesAmbVots([{ id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3 } }]);
    const user = userEvent.setup();
    renderPagina();
    await user.click(await screen.findByRole('button', { name: 'Votar' }));
    expect(screen.getByRole('button', { name: 'Simular escaneig' })).toBeInTheDocument();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('es pot cancel·lar l\'escaneig sense votar', async () => {
    mockPropostesAmbVots([{ id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3 } }]);
    const user = userEvent.setup();
    renderPagina();
    await user.click(await screen.findByRole('button', { name: 'Votar' }));
    await user.click(screen.getByRole('button', { name: 'Cancel·lar' }));
    expect(screen.queryByRole('button', { name: 'Simular escaneig' })).not.toBeInTheDocument();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('en escanejar dins l\'escanejador de votar, completa el vot pendent automàticament', async () => {
    mockPropostesAmbVots([{ id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3 } }]);
    const user = userEvent.setup();
    renderPagina();
    await user.click(await screen.findByRole('button', { name: 'Votar' }));
    await user.click(screen.getByRole('button', { name: 'Simular escaneig' }));

    expect(await screen.findByRole('button', { name: 'Has votat, treure el vot' })).toBeInTheDocument();
    expect(setDoc).toHaveBeenCalledWith('7', { timestamp: 'TIMESTAMP', token: 'tok-7' });
    expect(screen.queryByRole('button', { name: 'Simular escaneig' })).not.toBeInTheDocument();
  });

  it('per treure un vot ja identificat, demana confirmació', async () => {
    mockPropostesAmbVots([{ id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3 } }]);
    const user = userEvent.setup();
    renderPagina();
    await user.click(await screen.findByRole('button', { name: 'Votar' }));
    await user.click(screen.getByRole('button', { name: 'Simular escaneig' }));
    await screen.findByRole('button', { name: 'Has votat, treure el vot' });

    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await user.click(screen.getByRole('button', { name: 'Has votat, treure el vot' }));
    expect(window.confirm).toHaveBeenCalledWith('Ja havies votat aquesta pel·lícula. Vols retirar el teu vot?');
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Has votat, treure el vot' })).toBeInTheDocument();
    window.confirm.mockRestore();
  });

  it('confirmant, treu el vot', async () => {
    mockPropostesAmbVots([{ id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3 } }]);
    const user = userEvent.setup();
    renderPagina();
    await user.click(await screen.findByRole('button', { name: 'Votar' }));
    await user.click(screen.getByRole('button', { name: 'Simular escaneig' }));
    await screen.findByRole('button', { name: 'Has votat, treure el vot' });

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Has votat, treure el vot' }));
    expect(deleteDoc).toHaveBeenCalledWith('7');
    expect(await screen.findByRole('button', { name: 'Votar' })).toBeInTheDocument();
    window.confirm.mockRestore();
  });

  it('si ja havies votat una proposta sense estar identificat, en escanejar mostra un avís (no un error) i no torna a votar', async () => {
    mockPropostesAmbVots([{ id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3 } }]);
    getDoc.mockResolvedValue({ exists: () => true });
    const user = userEvent.setup();
    renderPagina();
    await user.click(await screen.findByRole('button', { name: 'Votar' }));
    await user.click(screen.getByRole('button', { name: 'Simular escaneig' }));

    expect(await screen.findByText(/Ja havies votat "Amélie"/)).toBeInTheDocument();
    expect(setDoc).not.toHaveBeenCalled();
    expect(screen.queryByText("No s'ha pogut registrar el vot. Torna-ho a provar.")).not.toBeInTheDocument();
  });

  it('un cop identificat, votar una altra proposta no torna a demanar escaneig', async () => {
    mockPropostesAmbVots([
      { id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3 } },
      { id: 'p2', dades: { titol: 'El padrí', estat: 'aprovada', numeroSoci: 5 } },
    ]);
    const user = userEvent.setup();
    renderPagina();
    const [primerBoto] = await screen.findAllByRole('button', { name: 'Votar' });
    await user.click(primerBoto);
    await user.click(screen.getByRole('button', { name: 'Simular escaneig' }));
    await screen.findByRole('button', { name: 'Has votat, treure el vot' });

    const botonsRestants = screen.getAllByRole('button', { name: 'Votar' });
    await user.click(botonsRestants[0]);
    expect(screen.queryByRole('button', { name: 'Simular escaneig' })).not.toBeInTheDocument();
    expect(setDoc).toHaveBeenCalledTimes(2);
  });

  it('un soci que torna i ja havia votat veu "Has votat" en identificar-se', async () => {
    mockPropostesAmbVots([{ id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3 } }]);
    getDoc.mockResolvedValue({ exists: () => true });
    const user = userEvent.setup();
    renderPagina();
    await user.click(await screen.findByRole('button', { name: 'Votar' }));
    await user.click(screen.getByRole('button', { name: 'Simular escaneig' }));
    expect(await screen.findByRole('button', { name: 'Has votat, treure el vot' })).toBeInTheDocument();
  });

  it('en clicar la targeta, obre el detall a pantalla completa i actualitza el hash de la URL', async () => {
    mockPropostesAmbVots([{
      id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3, sinopsi: 'Una història parisenca.' },
    }]);
    const user = userEvent.setup();
    renderPagina();
    await user.click(await screen.findByRole('button', { name: /Amélie/ }));
    expect(screen.getAllByText('Una història parisenca.').length).toBeGreaterThan(0);
    expect(window.location.hash).toBe('#p1');
  });

  it('al detall, mostra qui ha fet la proposta i la data', async () => {
    getDocs.mockImplementation((q) => {
      if (q?.collectionName === 'propostes') {
        return Promise.resolve({
          docs: [{
            id: 'p1',
            data: () => ({
              titol: 'Amélie', estat: 'aprovada', numeroSoci: 3, nomProposant: 'Anna M.', timestamp: { toDate: () => new Date(2026, 6, 22) },
            }),
          }],
        });
      }
      return Promise.resolve({ docs: [] });
    });
    const user = userEvent.setup();
    renderPagina();
    await user.click(await screen.findByRole('button', { name: /Amélie/ }));
    expect(await screen.findByText(/Proposada per/)).toBeInTheDocument();
    expect(screen.getByText('Anna M.')).toBeInTheDocument();
    expect(screen.getAllByText('22/07/2026').length).toBeGreaterThan(0);
  });

  it('el botó de tornar tanca el detall i restaura el hash de la pestanya activa', async () => {
    mockPropostesAmbVots([{ id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3 } }]);
    const user = userEvent.setup();
    renderPagina();
    await user.click(await screen.findByRole('button', { name: /Amélie/ }));
    await user.click(screen.getByRole('button', { name: 'Tornar al llistat' }));
    expect(screen.queryByRole('button', { name: 'Tornar al llistat' })).not.toBeInTheDocument();
    expect(window.location.hash).toBe('#recents');
  });

  it('tancar un detall obert des de la vista "Més votades" torna a "#top", no a "#recents"', async () => {
    mockPropostesAmbVots([{ id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3 } }]);
    const user = userEvent.setup();
    renderPagina();
    await screen.findAllByText('Amélie');
    await user.click(screen.getByRole('tab', { name: 'Més votades' }));
    await user.click(screen.getAllByRole('button', { name: /Amélie/ })[0]);
    await user.click(screen.getByRole('button', { name: 'Tornar al llistat' }));
    expect(window.location.hash).toBe('#top');
    expect(screen.getByRole('tab', { name: 'Més votades' })).toHaveAttribute('aria-selected', 'true');
  });

  it('carregar la pàgina amb un hash existent obre directament aquell detall', async () => {
    window.location.hash = '#p1';
    mockPropostesAmbVots([{ id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3 } }]);
    renderPagina();
    expect(await screen.findByRole('button', { name: 'Tornar al llistat' })).toBeInTheDocument();
  });

  it('si la identitat ja era coneguda en muntar-se (p. ex. tornant de proposar), mostra l\'estat real del vot sense tornar a escanejar', async () => {
    mockPropostesAmbVots([{ id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3 } }]);
    getDoc.mockResolvedValue({ exists: () => true });
    renderPaginaPreIdentificat();
    expect(await screen.findByRole('button', { name: 'Has votat, treure el vot' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Simular escaneig' })).not.toBeInTheDocument();
  });

  it('amb la identitat ja coneguda, clicar una proposta ja votada la retira (no dona error)', async () => {
    mockPropostesAmbVots([{ id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3 } }]);
    getDoc.mockResolvedValue({ exists: () => true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderPaginaPreIdentificat();
    await user.click(await screen.findByRole('button', { name: 'Has votat, treure el vot' }));
    expect(deleteDoc).toHaveBeenCalledWith('7');
    expect(await screen.findByRole('button', { name: 'Votar' })).toBeInTheDocument();
    expect(screen.queryByText("No s'ha pogut registrar el vot. Torna-ho a provar.")).not.toBeInTheDocument();
    window.confirm.mockRestore();
  });

  // (b) La llista encara no ha arribat quan s'obre un enllaç compartit amb #<id>.
  it('amb #<id> la fitxa s\'obre quan arriben les dades, encara que la llista trigui', async () => {
    window.location.hash = '#p1';
    let resol;
    getDocs.mockImplementation((q) => {
      if (q?.collectionName === 'propostes') {
        return new Promise((r) => { resol = () => r({ docs: [{ id: 'p1', data: () => ({ titol: 'Amélie', estat: 'aprovada', numeroSoci: 3 }) }] }); });
      }
      return Promise.resolve({ docs: [] });
    });
    renderPagina();
    expect(screen.queryByRole('button', { name: 'Tornar al llistat' })).not.toBeInTheDocument();
    expect(document.body).toHaveClass('proposta-detall-obert-body');
    resol();
    expect(await screen.findByRole('button', { name: 'Tornar al llistat' })).toBeInTheDocument();
    expect(screen.getAllByText('Amélie').length).toBeGreaterThan(0);
  });

  it('el hash #recents és la vista per data', async () => {
    window.location.hash = '#recents';
    mockPropostesAmbVots([{ id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3 } }]);
    renderPagina();
    await screen.findAllByText('Amélie');
    expect(screen.getByRole('tab', { name: 'Més recents' })).toHaveAttribute('aria-selected', 'true');
  });

  it('el cos del document porta la classe del detall obert només mentre la fitxa és oberta', async () => {
    mockPropostesAmbVots([{ id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3 } }]);
    const user = userEvent.setup();
    renderPagina();
    await user.click(await screen.findByRole('button', { name: /Amélie/ }));
    expect(document.body).toHaveClass('proposta-detall-obert-body');
    await user.click(screen.getByRole('button', { name: 'Tornar al llistat' }));
    expect(document.body).not.toHaveClass('proposta-detall-obert-body');
  });

  // (c) Identitat guardada a sessionStorage (recàrrega o navegació entre pàgines).
  it('amb la identitat a sessionStorage no demana escanejar en votar i escriu el vot amb la clau del número de soci', async () => {
    mockPropostesAmbVots([{ id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3 } }]);
    const user = userEvent.setup();
    renderPaginaPreIdentificat();
    await user.click(await screen.findByRole('button', { name: 'Votar' }));
    expect(screen.queryByRole('button', { name: 'Simular escaneig' })).not.toBeInTheDocument();
    expect(setDoc).toHaveBeenCalledWith('7', { timestamp: 'TIMESTAMP', token: 'tok-7' });
    expect(await screen.findByRole('button', { name: 'Has votat, treure el vot' })).toBeInTheDocument();
  });

  it('amb la identitat a sessionStorage i un vot previ, desvota (esborra el document del soci) i actualitza el comptador', async () => {
    getDocs.mockImplementation((q) => {
      if (q?.collectionName === 'propostes') {
        return Promise.resolve({ docs: [{ id: 'p1', data: () => ({ titol: 'Amélie', estat: 'aprovada', numeroSoci: 3 }) }] });
      }
      return Promise.resolve({ docs: [{}, {}] });
    });
    getDoc.mockResolvedValue({ exists: () => true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderPaginaPreIdentificat();
    const boto = await screen.findByRole('button', { name: 'Has votat, treure el vot' });
    expect(boto.parentElement).toHaveTextContent('2');
    await user.click(boto);
    expect(deleteDoc).toHaveBeenCalledWith('7');
    const votar = await screen.findByRole('button', { name: 'Votar' });
    expect(votar.parentElement).toHaveTextContent('1');
    window.confirm.mockRestore();
  });

  it('sense identitat, pulsar Votar obre el lector del carnet i no escriu cap vot', async () => {
    mockPropostesAmbVots([{ id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3 } }]);
    const user = userEvent.setup();
    renderPagina();
    await user.click(await screen.findByRole('button', { name: 'Votar' }));
    expect(screen.getByText('Escaneja el teu carnet per votar')).toBeInTheDocument();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('escanejar el carnet desa la identitat a sessionStorage (i mai a localStorage)', async () => {
    mockPropostesAmbVots([{ id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3 } }]);
    const user = userEvent.setup();
    renderPagina();
    await user.click(await screen.findByRole('button', { name: 'Votar' }));
    await user.click(screen.getByRole('button', { name: 'Simular escaneig' }));
    await screen.findByRole('button', { name: 'Has votat, treure el vot' });
    expect(JSON.parse(sessionStorage.getItem('cineclub.identitat'))).toEqual(IDENTITAT);
    expect(localStorage.length).toBe(0);
  });

  it('desvotar sense confirmar no esborra res', async () => {
    getDoc.mockResolvedValue({ exists: () => true });
    mockPropostesAmbVots([{ id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3 } }]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderPaginaPreIdentificat();
    await user.click(await screen.findByRole('button', { name: 'Has votat, treure el vot' }));
    expect(deleteDoc).not.toHaveBeenCalled();
    window.confirm.mockRestore();
  });
});
