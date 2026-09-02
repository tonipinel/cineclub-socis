import { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { IdentitatPublicaProvider } from '../../auth/IdentitatPublicaProvider';
import { useIdentitatPublica } from '../../auth/useIdentitatPublica';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('../../components/LectorCarnet', () => ({
  default: ({ onIdentificat }) => (
    <button type="button" onClick={() => onIdentificat({ numeroSoci: 7, nomPublic: 'Isabel M.' })}>
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
import PropostesPublic from './PropostesPublic';

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
      <MemoryRouter initialEntries={['/propostes']}>
        <Routes>
          <Route path="/propostes" element={<PropostesPublic />} />
          <Route path="/propostes/proposar" element={<p>Pàgina de proposar</p>} />
        </Routes>
      </MemoryRouter>
    </IdentitatPublicaProvider>
  );
}

// Simula que la pàgina es munta (o es torna a muntar en navegar-hi) quan la
// identitat compartida JA era coneguda d'abans (p. ex. venint de la pàgina
// de proposar) — sense passar per cap escaneig nou.
function PreIdentificat({ children }) {
  const { setIdentitat } = useIdentitatPublica();
  useEffect(() => {
    setIdentitat({ numeroSoci: 7, nomPublic: 'Isabel M.' });
  }, [setIdentitat]);
  return children;
}

function renderPaginaPreIdentificat() {
  return render(
    <IdentitatPublicaProvider>
      <MemoryRouter initialEntries={['/propostes']}>
        <PreIdentificat>
          <PropostesPublic />
        </PreIdentificat>
      </MemoryRouter>
    </IdentitatPublicaProvider>
  );
}

describe('PropostesPublic', () => {
  beforeEach(() => {
    setDoc.mockClear();
    deleteDoc.mockClear();
    getDocs.mockReset();
    getDoc.mockReset();
    getDoc.mockResolvedValue({ exists: () => false });
    window.location.hash = '';
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

  it('en clicar "+ Proposar" sense identificar-se, demana escanejar per proposar', async () => {
    mockPropostesAmbVots([]);
    const user = userEvent.setup();
    renderPagina();
    await screen.findByText(/Encara no hi ha cap proposta/);
    await user.click(screen.getByRole('button', { name: '+ Proposar' }));
    expect(screen.getByText('Escaneja el teu carnet per proposar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Simular escaneig' })).toBeInTheDocument();
  });

  it('un cop escanejat des de "+ Proposar", navega a la pàgina de proposar', async () => {
    mockPropostesAmbVots([]);
    const user = userEvent.setup();
    renderPagina();
    await screen.findByText(/Encara no hi ha cap proposta/);
    await user.click(screen.getByRole('button', { name: '+ Proposar' }));
    await user.click(screen.getByRole('button', { name: 'Simular escaneig' }));
    expect(await screen.findByText('Pàgina de proposar')).toBeInTheDocument();
  });

  it('un cop identificat (p. ex. per haver votat), "+ Proposar" hi navega directament sense tornar a escanejar', async () => {
    mockPropostesAmbVots([{ id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3 } }]);
    const user = userEvent.setup();
    renderPagina();
    await user.click(await screen.findByRole('button', { name: 'Votar' }));
    await user.click(screen.getByRole('button', { name: 'Simular escaneig' }));
    await screen.findByRole('button', { name: 'Has votat, treure el vot' });

    await user.click(screen.getByRole('button', { name: '+ Proposar' }));
    expect(await screen.findByText('Pàgina de proposar')).toBeInTheDocument();
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
    expect(setDoc).toHaveBeenCalledWith('7', { timestamp: 'TIMESTAMP' });
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
    expect(screen.getByText('22/07/2026')).toBeInTheDocument();
  });

  it('el botó de tornar tanca el detall i buida el hash', async () => {
    mockPropostesAmbVots([{ id: 'p1', dades: { titol: 'Amélie', estat: 'aprovada', numeroSoci: 3 } }]);
    const user = userEvent.setup();
    renderPagina();
    await user.click(await screen.findByRole('button', { name: /Amélie/ }));
    await user.click(screen.getByRole('button', { name: 'Tornar al llistat' }));
    expect(screen.queryByRole('button', { name: 'Tornar al llistat' })).not.toBeInTheDocument();
    expect(window.location.hash).toBe('');
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
});
