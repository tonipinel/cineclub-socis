// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IdentitatPublicaProvider } from '../../src/auth/IdentitatPublica.jsx';

vi.mock('../../src/firebase/client.js', () => ({ db: {} }));
vi.mock('../../src/lib/propostes/pellicules.js', () => ({ cercarPellicules: vi.fn() }));
vi.mock('../../src/components/propostes/LectorCarnet.jsx', () => ({
  default: ({ onIdentificat }) => (
    <button type="button" onClick={() => onIdentificat({ numeroSoci: 7, nomPublic: 'Isabel M.', token: 'tok-7' })}>
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
import { cercarPellicules } from '../../src/lib/propostes/pellicules.js';
import ProposarPellicula from '../../src/components/propostes/ProposarPellicula.jsx';

const IDENTITAT = { numeroSoci: 7, nomPublic: 'Isabel M.', token: 'tok-7' };

function renderPagina() {
  return render(
    <IdentitatPublicaProvider>
      <ProposarPellicula />
    </IdentitatPublicaProvider>
  );
}

describe('ProposarPellicula', () => {
  beforeEach(() => {
    sessionStorage.clear();
    addDoc.mockClear();
    cercarPellicules.mockReset();
  });

  it('demana escanejar el carnet abans de mostrar el formulari', () => {
    renderPagina();
    expect(screen.getByRole('button', { name: 'Simular escaneig' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Pel·lícula')).not.toBeInTheDocument();
  });

  it('un cop identificat, només es pot proposar una pel·lícula triada del cercador', async () => {
    cercarPellicules.mockResolvedValue([
      { tmdbId: 11, titol: "L'endemà", any: '1990', posterUrl: null },
      { tmdbId: 12, titol: "L'endemà (altra)", any: '2001', posterUrl: null },
    ]);
    const user = userEvent.setup();
    renderPagina();
    await user.click(screen.getByRole('button', { name: 'Simular escaneig' }));

    expect(screen.getByRole('button', { name: 'Enviar proposta' })).toBeDisabled();
    await user.type(await screen.findByLabelText('Pel·lícula'), 'endem');
    expect(screen.queryByLabelText(/Explica'ns breument/)).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /L'endemà \(1990\)/ }));
    expect(cercarPellicules).toHaveBeenCalledWith('endem', 'tok-7');
    await user.type(screen.getByLabelText("Explica'ns breument per què la recomanes (opcional)"), 'Una joia');
    await user.click(screen.getByRole('button', { name: 'Enviar proposta' }));

    expect(await screen.findByText(/s'ha enviat/i)).toBeInTheDocument();
    const [, dadesDesades] = addDoc.mock.calls[0];
    expect(dadesDesades).toEqual({
      titol: "L'endemà", any: '1990', tmdbId: 11, comentari: 'Una joia', numeroSoci: 7, nomProposant: 'Isabel M.', estat: 'pendent', timestamp: 'TIMESTAMP',
    });
  });

  it('si la identitat ja és a sessionStorage (venint de /propostes/ o en recarregar), mostra el formulari directament', async () => {
    sessionStorage.setItem('cineclub.identitat', JSON.stringify(IDENTITAT));
    renderPagina();
    expect(await screen.findByLabelText('Pel·lícula')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Simular escaneig' })).not.toBeInTheDocument();
  });

  it('en identificar-se amb el carnet, la identitat queda a sessionStorage', async () => {
    const user = userEvent.setup();
    renderPagina();
    await user.click(screen.getByRole('button', { name: 'Simular escaneig' }));
    expect(JSON.parse(sessionStorage.getItem('cineclub.identitat'))).toEqual(IDENTITAT);
  });

  it('registra l\'activitat de la proposta creada', async () => {
    cercarPellicules.mockResolvedValue([{ tmdbId: 11, titol: "L'endemà", any: '1990', posterUrl: null }]);
    const user = userEvent.setup();
    renderPagina();
    await user.click(screen.getByRole('button', { name: 'Simular escaneig' }));
    await user.type(await screen.findByLabelText('Pel·lícula'), 'endem');
    await user.click(await screen.findByRole('button', { name: /L'endemà \(1990\)/ }));
    await user.click(screen.getByRole('button', { name: 'Enviar proposta' }));
    await screen.findByText(/s'ha enviat/i);
    expect(addDoc).toHaveBeenCalledTimes(2);
    expect(addDoc.mock.calls[1]).toEqual(['propostesActivitat', {
      tipus: 'proposta_creada', propostaId: 'nova', numeroSoci: 7, timestamp: 'TIMESTAMP',
    }]);
  });

  it('un cop enviada, ofereix tornar a /propostes/', async () => {
    cercarPellicules.mockResolvedValue([{ tmdbId: 11, titol: "L'endemà", any: '1990', posterUrl: null }]);
    const user = userEvent.setup();
    renderPagina();
    await user.click(screen.getByRole('button', { name: 'Simular escaneig' }));
    await user.type(await screen.findByLabelText('Pel·lícula'), 'endem');
    await user.click(await screen.findByRole('button', { name: /L'endemà \(1990\)/ }));
    await user.click(screen.getByRole('button', { name: 'Enviar proposta' }));
    expect(await screen.findByRole('link', { name: 'Tornar a les propostes' })).toHaveAttribute('href', '/propostes/');
  });

  it('té un enllaç per tornar a /propostes/ (amb i sense identitat)', () => {
    const { unmount } = renderPagina();
    expect(screen.getByRole('link', { name: /Tornar/ })).toHaveAttribute('href', '/propostes/');
    unmount();
    sessionStorage.setItem('cineclub.identitat', JSON.stringify(IDENTITAT));
    renderPagina();
    expect(screen.getByRole('link', { name: /Tornar/ })).toHaveAttribute('href', '/propostes/');
  });
});
