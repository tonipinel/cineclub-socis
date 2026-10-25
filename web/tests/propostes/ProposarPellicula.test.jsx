// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IdentitatPublicaProvider } from '../../src/auth/IdentitatPublica.jsx';

vi.mock('../../src/lib/propostes/pellicules.js', async (importOriginal) => ({
  ...(await importOriginal()),
  cercarPellicules: vi.fn(),
  crearProposta: vi.fn(),
}));
vi.mock('../../src/components/propostes/LectorCarnet.jsx', () => ({
  default: ({ onIdentificat }) => (
    <button type="button" onClick={() => onIdentificat({ numeroSoci: 7, nomPublic: 'Isabel M.', token: 'tok-7' })}>
      Simular escaneig
    </button>
  ),
}));
vi.mock('../../src/firebase/client.js', () => ({ functions: {} }));

import { cercarPellicules, crearProposta } from '../../src/lib/propostes/pellicules.js';
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
    crearProposta.mockReset().mockResolvedValue({ id: 'nova' });
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
    // El número de soci i el nom els posa la Cloud Function a partir del token: el client no els envia.
    expect(crearProposta).toHaveBeenCalledWith('tok-7', {
      titol: "L'endemà", any: '1990', tmdbId: 11, comentari: 'Una joia',
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

  async function enviarProposta(user) {
    await user.type(await screen.findByLabelText('Pel·lícula'), 'endem');
    await user.click(await screen.findByRole('button', { name: /L'endemà \(1990\)/ }));
    await user.click(screen.getByRole('button', { name: 'Enviar proposta' }));
  }

  it('el comentari té un màxim de 1000 caràcters i ho diu', async () => {
    cercarPellicules.mockResolvedValue([{ tmdbId: 11, titol: "L'endemà", any: '1990', posterUrl: null }]);
    sessionStorage.setItem('cineclub.identitat', JSON.stringify(IDENTITAT));
    const user = userEvent.setup();
    renderPagina();
    await user.type(await screen.findByLabelText('Pel·lícula'), 'endem');
    await user.click(await screen.findByRole('button', { name: /L'endemà \(1990\)/ }));
    const comentari = screen.getByLabelText("Explica'ns breument per què la recomanes (opcional)");
    expect(comentari).toHaveAttribute('maxLength', '1000');
    expect(comentari).toHaveAccessibleDescription('Màxim 1000 caràcters.');
  });

  it.each([
    ['functions/already-exists', 'Aquesta pel·lícula ja està proposada'],
    ['functions/resource-exhausted', 'massa propostes'],
    ['functions/internal', "No s'ha pogut enviar la proposta"],
  ])('si la Cloud Function respon %s, ho explica i manté el formulari', async (code, text) => {
    cercarPellicules.mockResolvedValue([{ tmdbId: 11, titol: "L'endemà", any: '1990', posterUrl: null }]);
    crearProposta.mockRejectedValue(Object.assign(new Error('x'), { code }));
    sessionStorage.setItem('cineclub.identitat', JSON.stringify(IDENTITAT));
    const user = userEvent.setup();
    renderPagina();
    await enviarProposta(user);
    expect(await screen.findByText(new RegExp(text))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar proposta' })).toBeEnabled();
    expect(sessionStorage.getItem('cineclub.identitat')).not.toBeNull();
  });

  it('si el carnet no és vàlid, oblida la identitat i demana tornar-lo a escanejar', async () => {
    cercarPellicules.mockResolvedValue([{ tmdbId: 11, titol: "L'endemà", any: '1990', posterUrl: null }]);
    crearProposta.mockRejectedValue(Object.assign(new Error('x'), { code: 'functions/permission-denied' }));
    sessionStorage.setItem('cineclub.identitat', JSON.stringify(IDENTITAT));
    const user = userEvent.setup();
    renderPagina();
    await enviarProposta(user);
    expect(await screen.findByText('Aquest carnet no és vàlid. Torna a escanejar-lo.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Simular escaneig' })).toBeInTheDocument();
    expect(sessionStorage.getItem('cineclub.identitat')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Simular escaneig' }));
    expect(screen.queryByText(/carnet no és vàlid/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar proposta' })).toBeDisabled();
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
