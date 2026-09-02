import { describe, it, expect, vi } from 'vitest';
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
  collection: vi.fn((_, nom) => nom),
  serverTimestamp: vi.fn(() => 'TIMESTAMP'),
}));

import { addDoc } from 'firebase/firestore';
import ProposarPellicula from './ProposarPellicula';

function renderPagina() {
  return render(
    <IdentitatPublicaProvider>
      <MemoryRouter initialEntries={['/propostes/proposar']}>
        <Routes>
          <Route path="/propostes/proposar" element={<ProposarPellicula />} />
          <Route path="/propostes" element={<p>Pàgina de propostes</p>} />
        </Routes>
      </MemoryRouter>
    </IdentitatPublicaProvider>
  );
}

// Simula la identificació feta a /propostes abans de navegar cap aquí:
// preomple la identitat compartida abans de renderitzar ProposarPellicula.
function IdentificarAbans({ children }) {
  const { setIdentitat } = useIdentitatPublica();
  return (
    <>
      <button type="button" onClick={() => setIdentitat({ numeroSoci: 7, nomPublic: 'Isabel M.' })}>
        Identificar abans
      </button>
      {children}
    </>
  );
}

describe('ProposarPellicula', () => {
  it('demana escanejar el carnet abans de mostrar el formulari', () => {
    renderPagina();
    expect(screen.getByRole('button', { name: 'Simular escaneig' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Títol')).not.toBeInTheDocument();
  });

  it('un cop identificat, mostra el formulari i permet enviar una proposta', async () => {
    const user = userEvent.setup();
    renderPagina();
    await user.click(screen.getByRole('button', { name: 'Simular escaneig' }));

    expect(await screen.findByLabelText('Títol')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Títol'), "L'endemà");
    await user.click(screen.getByRole('button', { name: 'Enviar proposta' }));

    expect(await screen.findByText(/s'ha enviat/i)).toBeInTheDocument();
    const [, dadesDesades] = addDoc.mock.calls[0];
    expect(dadesDesades).toEqual({
      titol: "L'endemà", enllac: '', comentari: '', numeroSoci: 7, nomProposant: 'Isabel M.', estat: 'pendent', timestamp: 'TIMESTAMP',
    });
  });

  it('si ja arriba identificat (identitat compartida amb /propostes), mostra el formulari directament', async () => {
    const user = userEvent.setup();
    render(
      <IdentitatPublicaProvider>
        <MemoryRouter>
          <IdentificarAbans>
            <ProposarPellicula />
          </IdentificarAbans>
        </MemoryRouter>
      </IdentitatPublicaProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Identificar abans' }));
    expect(await screen.findByLabelText('Títol')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Simular escaneig' })).not.toBeInTheDocument();
  });

  it('té un enllaç per tornar a la pàgina de propostes', async () => {
    renderPagina();
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: /Tornar/ }));
    expect(await screen.findByText('Pàgina de propostes')).toBeInTheDocument();
  });
});
