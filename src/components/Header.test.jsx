import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const mockUseAuth = vi.fn();
vi.mock('../auth/useAuth', () => ({ useAuth: () => mockUseAuth() }));
const mockUseIdentitatPublica = vi.fn();
vi.mock('../auth/useIdentitatPublica', () => ({ useIdentitatPublica: () => mockUseIdentitatPublica() }));
vi.mock('../firebase/firebase', () => ({ db: {} }));
const mockOnSnapshot = vi.fn();
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: (...args) => mockOnSnapshot(...args),
}));

import Header from './Header';

function emetComptador(cridada, mida) {
  act(() => { mockOnSnapshot.mock.calls[cridada][1]({ size: mida }); });
}

describe('Header', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockUseIdentitatPublica.mockReset();
    mockUseIdentitatPublica.mockReturnValue({ identitat: null, setIdentitat: vi.fn() });
    mockOnSnapshot.mockReset();
    mockOnSnapshot.mockReturnValue(vi.fn());
  });

  it('mostra el logo del cineclub', () => {
    mockUseAuth.mockReturnValue({ user: { uid: '1' }, role: 'admin', signOut: vi.fn() });
    render(<MemoryRouter><Header /></MemoryRouter>);
    expect(screen.getByRole('img', { name: 'Cineclub Roda de Berà' })).toBeInTheDocument();
  });

  it('no mostra cap enllaç de navegació interna quan no hi ha usuari', () => {
    mockUseAuth.mockReturnValue({ user: null, role: null, signOut: vi.fn() });
    render(<MemoryRouter><Header /></MemoryRouter>);
    expect(screen.queryByText('Socis')).not.toBeInTheDocument();
    expect(screen.queryByText('Sol·licituds')).not.toBeInTheDocument();
    expect(screen.queryByText('Sortir')).not.toBeInTheDocument();
  });

  describe('capçalera pública (sense usuari), idèntica a la del lloc principal', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({ user: null, role: null, signOut: vi.fn() });
    });

    it('mostra la marca (logo + nom) enllaçant a l\'inici de l\'app', () => {
      render(<MemoryRouter><Header /></MemoryRouter>);
      expect(screen.getByText('Cineclub Roda de Berà')).toBeInTheDocument();
      const marca = screen.getByText('Cineclub Roda de Berà').closest('a');
      expect(marca).toHaveAttribute('href', '/');
    });

    it('mostra Inici, Programació, Propostes i Fes-te soci/a en aquest ordre, amb Propostes com a única interna i activa', () => {
      const { container } = render(<MemoryRouter><Header /></MemoryRouter>);
      const nav = within(container.querySelector('.capcalera-publica__nav'));
      const enllacos = nav.getAllByRole('link');
      expect(enllacos.map((a) => a.textContent)).toEqual(['Inici', 'Programació', 'Propostes', 'Fes-te soci/a']);
      expect(nav.getByRole('link', { name: 'Inici' })).toHaveAttribute('href', 'https://cineclubrodadebera.cat/');
      expect(nav.getByRole('link', { name: 'Programació' })).toHaveAttribute('href', 'https://cineclubrodadebera.cat/programacio/');
      expect(nav.getByRole('link', { name: 'Fes-te soci/a' })).toHaveAttribute('href', 'https://cineclubrodadebera.cat/fes-te-socia/');
      const propostes = nav.getByRole('link', { name: 'Propostes' });
      expect(propostes).toHaveAttribute('href', '/');
      expect(propostes).toHaveClass('capcalera-publica__link--activa');
    });

    it('el menú mòbil s\'obre i es tanca, i inclou els mateixos 4 enllaços', async () => {
      const user = userEvent.setup();
      render(<MemoryRouter><Header /></MemoryRouter>);
      const botoMenu = screen.getByRole('button', { name: 'Obrir menú' });
      expect(botoMenu).toHaveAttribute('aria-expanded', 'false');
      await user.click(botoMenu);
      expect(botoMenu).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('button', { name: 'Tancar menú' })).toBeInTheDocument();
      expect(screen.getAllByRole('link', { name: 'Fes-te soci/a' }).length).toBe(2);
      await user.click(screen.getByRole('button', { name: 'Tancar menú' }));
      expect(botoMenu).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('mostra els enllaços de navegació i el botó de sortir quan l\'usuari és admin', async () => {
    const signOut = vi.fn();
    mockUseAuth.mockReturnValue({ user: { uid: '1' }, role: 'admin', signOut });
    const user = userEvent.setup();
    render(<MemoryRouter><Header /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Socis' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sol·licituds' })).toBeInTheDocument();
    const botoSortir = screen.getByRole('button', { name: 'Sortir' });
    await user.click(botoSortir);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('mostra els enllaços de Sessions, Tiquets i Escaneig quan l\'usuari és admin', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: '1' }, role: 'admin', signOut: vi.fn() });
    render(<MemoryRouter><Header /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Sessions' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tiquets' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Escaneig' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Comptabilitat' })).toBeInTheDocument();
  });

  it('mostra l\'enllaç de Propostes quan l\'usuari és admin', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: '1' }, role: 'admin', signOut: vi.fn() });
    render(<MemoryRouter><Header /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Propostes' })).toBeInTheDocument();
  });

  it('quan l\'usuari és taquilla, només mostra l\'enllaç d\'Escaneig i el botó de sortir', async () => {
    const signOut = vi.fn();
    mockUseAuth.mockReturnValue({ user: { uid: '2' }, role: 'taquilla', signOut });
    const user = userEvent.setup();
    render(<MemoryRouter><Header /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Escaneig' })).toBeInTheDocument();
    expect(screen.queryByText('Socis')).not.toBeInTheDocument();
    expect(screen.queryByText('Sessions')).not.toBeInTheDocument();
    expect(screen.queryByText('Comptabilitat')).not.toBeInTheDocument();
    expect(screen.queryByText('Propostes')).not.toBeInTheDocument();
    const botoSortir = screen.getByRole('button', { name: 'Sortir' });
    await user.click(botoSortir);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('marca com a actiu l\'enllaç de la pàgina en què ets', () => {
    mockUseAuth.mockReturnValue({ user: { uid: '1' }, role: 'admin', signOut: vi.fn() });
    render(
      <MemoryRouter initialEntries={['/sessions']}>
        <Header />
        <Routes><Route path="/sessions" element={<p>Sessions</p>} /></Routes>
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Sessions' })).toHaveClass('site-header__link--actiu');
    expect(screen.getByRole('link', { name: 'Socis' })).not.toHaveClass('site-header__link--actiu');
  });

  it('el botó d\'hamburguesa obre i tanca el menú mòbil', async () => {
    mockUseAuth.mockReturnValue({ user: { uid: '1' }, role: 'admin', signOut: vi.fn() });
    const user = userEvent.setup();
    render(<MemoryRouter><Header /></MemoryRouter>);
    const botoMenu = screen.getByRole('button', { name: 'Obrir el menú' });
    expect(botoMenu).toHaveAttribute('aria-expanded', 'false');
    await user.click(botoMenu);
    expect(botoMenu).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Tancar el menú' })).toBe(botoMenu);
    await user.click(screen.getByRole('link', { name: 'Socis' }));
    expect(botoMenu).toHaveAttribute('aria-expanded', 'false');
  });

  it('el botó "Sortir" tanca el menú mòbil i fa signOut', async () => {
    const signOut = vi.fn();
    mockUseAuth.mockReturnValue({ user: { uid: '1' }, role: 'admin', signOut });
    const user = userEvent.setup();
    render(<MemoryRouter><Header /></MemoryRouter>);
    const botoMenu = screen.getByRole('button', { name: 'Obrir el menú' });
    await user.click(botoMenu);
    expect(botoMenu).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('button', { name: 'Sortir' }));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(botoMenu).toHaveAttribute('aria-expanded', 'false');
  });

  it('el logo enllaça al dashboard quan l\'usuari és admin', () => {
    mockUseAuth.mockReturnValue({ user: { uid: '1' }, role: 'admin', signOut: vi.fn() });
    render(<MemoryRouter><Header /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Cineclub Roda de Berà' })).toHaveAttribute('href', '/dashboard');
  });

  it('el logo no enllaça enlloc quan l\'usuari és taquilla', () => {
    mockUseAuth.mockReturnValue({ user: { uid: '2' }, role: 'taquilla', signOut: vi.fn() });
    render(<MemoryRouter><Header /></MemoryRouter>);
    expect(screen.queryByRole('link', { name: 'Cineclub Roda de Berà' })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Cineclub Roda de Berà' })).toBeInTheDocument();
  });

  it('mostra la salutació del soci identificat públicament al costat del logo', () => {
    mockUseAuth.mockReturnValue({ user: null, role: null, signOut: vi.fn() });
    mockUseIdentitatPublica.mockReturnValue({ identitat: { numeroSoci: 7, nomPublic: 'Isabel M.' }, setIdentitat: vi.fn() });
    render(<MemoryRouter><Header /></MemoryRouter>);
    expect(screen.getByText('Hola, Isabel M.!')).toBeInTheDocument();
  });

  it('no mostra la salutació pública si hi ha un usuari d\'staff logat', () => {
    mockUseAuth.mockReturnValue({ user: { uid: '1' }, role: 'admin', signOut: vi.fn() });
    mockUseIdentitatPublica.mockReturnValue({ identitat: { numeroSoci: 7, nomPublic: 'Isabel M.' }, setIdentitat: vi.fn() });
    render(<MemoryRouter><Header /></MemoryRouter>);
    expect(screen.queryByText(/Hola, Isabel M\./)).not.toBeInTheDocument();
  });

  it('mostra un badge amb el nombre de sol·licituds i propostes pendents', () => {
    mockUseAuth.mockReturnValue({ user: { uid: '1' }, role: 'admin', signOut: vi.fn() });
    render(<MemoryRouter><Header /></MemoryRouter>);
    emetComptador(0, 3);
    emetComptador(1, 2);
    expect(screen.getByRole('link', { name: 'Sol·licituds' })).toHaveTextContent('3');
    expect(screen.getByRole('link', { name: 'Propostes' })).toHaveTextContent('2');
  });

  it('no mostra el badge quan no hi ha elements pendents', () => {
    mockUseAuth.mockReturnValue({ user: { uid: '1' }, role: 'admin', signOut: vi.fn() });
    render(<MemoryRouter><Header /></MemoryRouter>);
    emetComptador(0, 0);
    emetComptador(1, 0);
    expect(screen.getByRole('link', { name: 'Sol·licituds' })).toHaveTextContent('Sol·licituds');
    expect(screen.getByRole('link', { name: 'Propostes' })).toHaveTextContent('Propostes');
  });
});
