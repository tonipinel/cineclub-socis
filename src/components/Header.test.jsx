import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const mockUseAuth = vi.fn();
vi.mock('../auth/useAuth', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('../firebase/firebase', () => ({ db: {} }));
const mockOnSnapshot = vi.fn();
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: (...args) => mockOnSnapshot(...args),
}));

import Header from './Header';
import { NOM_ORGANITZACIO } from '../lib/propostes';

function emetComptador(cridada, mida) {
  act(() => { mockOnSnapshot.mock.calls[cridada][1]({ size: mida }); });
}

// Les propostes arriben com a documents: el comptador n'exclou les de l'organització.
function emetPropostes(proposants) {
  const docs = proposants.map((nomProposant) => ({ data: () => ({ nomProposant }) }));
  act(() => { mockOnSnapshot.mock.calls[1][1]({ size: docs.length, docs }); });
}

// Entrades de primer nivell de la barra (les dels grups i les soltes), sense Sortir.
function entradesPrincipals(container) {
  return [...container.querySelectorAll('.site-header__nav a.site-header__link')];
}

function entrada(container, nom) {
  return entradesPrincipals(container).find((a) => a.getAttribute('aria-label') === nom);
}

function renderAdmin(ruta = '/') {
  mockUseAuth.mockReturnValue({ user: { uid: '1' }, role: 'admin', signOut: vi.fn() });
  return render(<MemoryRouter initialEntries={[ruta]}><Header /></MemoryRouter>);
}

describe('Header', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockOnSnapshot.mockReset();
    mockOnSnapshot.mockReturnValue(vi.fn());
  });

  it('mostra el logo del cineclub', () => {
    mockUseAuth.mockReturnValue({ user: { uid: '1' }, role: 'admin', signOut: vi.fn() });
    render(<MemoryRouter><Header /></MemoryRouter>);
    expect(screen.getByRole('img', { name: 'Cineclub Roda de Berà' })).toBeInTheDocument();
  });

  it('no mostra cap enllaç d\'administració quan no hi ha usuari', () => {
    mockUseAuth.mockReturnValue({ user: null, role: null, signOut: vi.fn() });
    render(<MemoryRouter><Header /></MemoryRouter>);
    expect(screen.queryByText('Socis')).not.toBeInTheDocument();
    expect(screen.queryByText('Sol·licituds')).not.toBeInTheDocument();
    expect(screen.queryByText('Sortir')).not.toBeInTheDocument();
  });

  describe('capçalera pública (sense usuari), mínima', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({ user: null, role: null, signOut: vi.fn() });
    });

    it('mostra la marca (logo + nom) enllaçant a la web pública', () => {
      render(<MemoryRouter><Header /></MemoryRouter>);
      const marca = screen.getByText('Cineclub Roda de Berà').closest('a');
      expect(marca).toHaveAttribute('href', 'https://cineclubrodadebera.cat/');
    });

    it('només té un enllaç «Accedir» a /accedir, sense menú ni hamburguesa', () => {
      const { container } = render(<MemoryRouter><Header /></MemoryRouter>);
      const enllacos = within(container.querySelector('.capcalera-publica')).getAllByRole('link');
      expect(enllacos.map((a) => a.textContent)).toEqual(['Cineclub Roda de Berà', 'Accedir']);
      expect(screen.getByRole('link', { name: 'Accedir' })).toHaveAttribute('href', '/accedir');
      expect(screen.queryByText('Propostes')).not.toBeInTheDocument();
      expect(screen.queryByText('Fes-te soci/a')).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(container.querySelector('.capcalera-publica__nav')).toBeNull();
    });
  });

  it('mostra els enllaços de navegació i el botó de sortir quan l\'usuari és admin', async () => {
    const signOut = vi.fn();
    mockUseAuth.mockReturnValue({ user: { uid: '1' }, role: 'admin', signOut });
    const user = userEvent.setup();
    const { container } = render(<MemoryRouter><Header /></MemoryRouter>);
    expect(entrada(container, 'Socis')).toBeInTheDocument();
    const botoSortir = screen.getByRole('button', { name: 'Sortir' });
    await user.click(botoSortir);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('la barra principal de l\'admin té 6 entrades, sense Sol·licituds, Tandes ni Tiquets', () => {
    const { container } = renderAdmin();
    expect(entradesPrincipals(container).map((a) => a.getAttribute('aria-label'))).toEqual([
      'Socis', 'Programació', 'Sala', 'Comptabilitat', 'Configuració', 'Ajuda',
    ]);
    expect(screen.getByRole('button', { name: 'Sortir' })).toBeInTheDocument();
  });

  it('«Sortir» porta el modificador que l\'empeny a la dreta, i les altres entrades no', () => {
    const { container } = renderAdmin();
    expect(screen.getByRole('button', { name: 'Sortir' })).toHaveClass('site-header__link--sortir');
    entradesPrincipals(container).forEach((a) => expect(a).not.toHaveClass('site-header__link--sortir'));
  });

  it('l\'enllaç «Ajuda» porta a /ajuda, per a admin i per a taquilla', () => {
    const { container, unmount } = renderAdmin();
    expect(entrada(container, 'Ajuda')).toHaveAttribute('href', '/ajuda');
    unmount();
    mockUseAuth.mockReturnValue({ user: { uid: '2' }, role: 'taquilla', signOut: vi.fn() });
    render(<MemoryRouter initialEntries={['/escaneig']}><Header /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Ajuda' })).toHaveAttribute('href', '/ajuda');
  });

  it('les entrades de grup enllacen al seu primer element', () => {
    const { container } = renderAdmin();
    expect(entrada(container, 'Socis')).toHaveAttribute('href', '/socis');
    expect(entrada(container, 'Programació')).toHaveAttribute('href', '/propostes/pendents');
    expect(entrada(container, 'Sala')).toHaveAttribute('href', '/escaneig');
  });

  describe('submenú dels grups', () => {
    const submenu = () => screen.queryByRole('navigation', { name: 'Submenú' });
    const etiquetes = () => within(submenu()).getAllByRole('link').map((a) => a.textContent);

    it('a /tandes mostra el submenú de Programació amb Tandes marcat', () => {
      const { container } = renderAdmin('/tandes');
      expect(etiquetes()).toEqual(['Propostes', 'Tandes', 'Sessions', 'Distribuïdores', 'Entitats']);
      expect(within(submenu()).getByRole('link', { name: 'Tandes' })).toHaveClass('site-header__sublink--actiu');
      expect(within(submenu()).getByRole('link', { name: 'Propostes' })).not.toHaveClass('site-header__sublink--actiu');
      expect(entrada(container, 'Programació')).toHaveClass('site-header__link--actiu');
      expect(entrada(container, 'Socis')).not.toHaveClass('site-header__link--actiu');
    });

    it('a /socis/12 mostra el submenú de Socis amb Socis marcat', () => {
      const { container } = renderAdmin('/socis/12');
      expect(etiquetes()).toEqual(['Socis', 'Sol·licituds']);
      expect(within(submenu()).getByRole('link', { name: 'Socis' })).toHaveClass('site-header__sublink--actiu');
      expect(entrada(container, 'Socis')).toHaveClass('site-header__link--actiu');
    });

    it('a /tandes/3/resultats segueix al grup Programació i Tandes marcat', () => {
      renderAdmin('/tandes/3/resultats');
      expect(within(submenu()).getByRole('link', { name: 'Tandes' })).toHaveClass('site-header__sublink--actiu');
    });

    it('marca amb aria-current l\'element exacte del submenú', () => {
      renderAdmin('/solicituds');
      expect(within(submenu()).getByRole('link', { name: 'Sol·licituds' })).toHaveAttribute('aria-current', 'page');
    });

    it('el filet i el fons decoratius precedeixen el submenú, només quan n\'hi ha', () => {
      const { container } = renderAdmin('/tandes');
      const separador = container.querySelector('.site-header__separador');
      const fons = container.querySelector('.site-header__fons-submenu');
      expect(separador).toHaveAttribute('aria-hidden', 'true');
      expect(fons).toHaveAttribute('aria-hidden', 'true');
      expect(separador.nextElementSibling).toBe(fons);
      expect(fons.nextElementSibling).toBe(submenu());
    });

    it('a /sessions mostra el submenú de Programació amb Sessions marcat', () => {
      const { container } = renderAdmin('/sessions');
      expect(etiquetes()).toEqual(['Propostes', 'Tandes', 'Sessions', 'Distribuïdores', 'Entitats']);
      expect(within(submenu()).getByRole('link', { name: 'Sessions' })).toHaveClass('site-header__sublink--actiu');
      expect(entrada(container, 'Programació')).toHaveClass('site-header__link--actiu');
      expect(entrada(container, 'Socis')).not.toHaveClass('site-header__link--actiu');
      expect(entrada(container, 'Sala')).not.toHaveClass('site-header__link--actiu');
    });

    it('a /entitats mostra el submenú de Programació amb Entitats marcat', () => {
      const { container } = renderAdmin('/entitats');
      expect(within(submenu()).getByRole('link', { name: 'Entitats' })).toHaveClass('site-header__sublink--actiu');
      expect(within(submenu()).getByRole('link', { name: 'Sessions' })).not.toHaveClass('site-header__sublink--actiu');
      expect(entrada(container, 'Programació')).toHaveClass('site-header__link--actiu');
    });

    it('a /escaneig mostra el submenú de Sala amb Escaneig marcat', () => {
      const { container } = renderAdmin('/escaneig');
      expect(etiquetes()).toEqual(['Escaneig', 'Tiquets']);
      expect(within(submenu()).getByRole('link', { name: 'Escaneig' })).toHaveClass('site-header__sublink--actiu');
      expect(entrada(container, 'Sala')).toHaveClass('site-header__link--actiu');
      expect(entrada(container, 'Socis')).not.toHaveClass('site-header__link--actiu');
    });

    it('a /dashboard no hi ha submenú ni cap grup actiu', () => {
      const { container } = renderAdmin('/dashboard');
      expect(submenu()).not.toBeInTheDocument();
      expect(container.querySelector('.site-header__separador')).toBeNull();
      expect(container.querySelector('.site-header__fons-submenu')).toBeNull();
      ['Socis', 'Programació', 'Sala'].forEach((nom) => {
        expect(entrada(container, nom)).not.toHaveClass('site-header__link--actiu');
      });
    });

    it('al menú mòbil els grups mostren els seus elements a sota, sempre visibles', () => {
      const { container } = renderAdmin('/sessions');
      const grups = container.querySelectorAll('.site-header__nav .site-header__subgrup');
      expect([...grups].map((g) => [...g.querySelectorAll('a')].map((a) => a.textContent))).toEqual([
        ['Socis', 'Sol·licituds'],
        ['Propostes', 'Tandes', 'Sessions', 'Distribuïdores', 'Entitats'],
        ['Escaneig', 'Tiquets'],
        ['Associació', 'Usuaris de taquilla'],
      ]);
    });

    it('Configuració és un grup: a /usuaris-taquilla es marca actiu i mostra el submenú', () => {
      const { container } = renderAdmin('/usuaris-taquilla');
      expect(entrada(container, 'Configuració')).toHaveClass('site-header__link--actiu');
      expect([...submenu().querySelectorAll('a')].map((a) => a.textContent)).toEqual(['Associació', 'Usuaris de taquilla']);
    });

    it('en clicar un element del submenú mòbil es tanca el menú', async () => {
      const user = userEvent.setup();
      const { container } = renderAdmin('/sessions');
      const botoMenu = screen.getByRole('button', { name: 'Obrir el menú' });
      await user.click(botoMenu);
      await user.click(container.querySelector('.site-header__subgrup a[href="/tandes"]'));
      expect(botoMenu).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('quan l\'usuari és taquilla, només mostra els enllaços d\'Escaneig i d\'Ajuda i el botó de sortir', async () => {
    const signOut = vi.fn();
    mockUseAuth.mockReturnValue({ user: { uid: '2' }, role: 'taquilla', signOut });
    const user = userEvent.setup();
    const { container } = render(<MemoryRouter initialEntries={['/escaneig']}><Header /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Escaneig' })).toBeInTheDocument();
    expect(screen.queryByText('Socis')).not.toBeInTheDocument();
    expect(screen.queryByText('Sessions')).not.toBeInTheDocument();
    expect(screen.queryByText('Comptabilitat')).not.toBeInTheDocument();
    expect(screen.queryByText('Propostes')).not.toBeInTheDocument();
    expect(screen.queryByText('Programació')).not.toBeInTheDocument();
    expect(screen.queryByText('Sala')).not.toBeInTheDocument();
    expect(screen.queryByText('Tiquets')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Submenú' })).not.toBeInTheDocument();
    expect(container.querySelector('.site-header__subgrup')).toBeNull();
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Escaneig', 'Ajuda']);
    const botoSortir = screen.getByRole('button', { name: 'Sortir' });
    await user.click(botoSortir);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('marca com a actiu l\'enllaç de la pàgina en què ets', () => {
    mockUseAuth.mockReturnValue({ user: { uid: '1' }, role: 'admin', signOut: vi.fn() });
    const { container } = render(
      <MemoryRouter initialEntries={['/comptabilitat']}>
        <Header />
        <Routes><Route path="/comptabilitat" element={<p>Pàgina</p>} /></Routes>
      </MemoryRouter>
    );
    expect(entrada(container, 'Comptabilitat')).toHaveClass('site-header__link--actiu');
    expect(entrada(container, 'Socis')).not.toHaveClass('site-header__link--actiu');
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
    await user.click(screen.getAllByRole('link', { name: 'Socis' })[0]);
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

  it('la capçalera pública no mostra cap salutació encara que hi hagi un soci identificat', () => {
    mockUseAuth.mockReturnValue({ user: null, role: null, signOut: vi.fn() });
    const { container } = render(<MemoryRouter><Header /></MemoryRouter>);
    expect(screen.queryByText(/Hola/)).not.toBeInTheDocument();
    expect(container.querySelector('.capcalera-publica__salutacio')).toBeNull();
  });

  it('el badge del grup suma els comptadors dels seus elements i cada element del submenú mostra el seu', () => {
    const { container } = renderAdmin('/socis');
    emetComptador(0, 3);
    emetPropostes(['Anna P.', 'Joan M.']);
    expect(entrada(container, 'Socis')).toHaveTextContent('3');
    expect(entrada(container, 'Programació')).toHaveTextContent('2');
    expect(entrada(container, 'Sala')).toHaveTextContent(/^Sala$/);
    const submenu = within(screen.getByRole('navigation', { name: 'Submenú' }));
    expect(submenu.getByRole('link', { name: 'Sol·licituds' })).toHaveTextContent('3');
    expect(submenu.getByRole('link', { name: 'Socis' })).not.toHaveTextContent(/\d/);
  });

  it('el badge de Propostes apareix al submenú de Programació', () => {
    renderAdmin('/tandes');
    emetPropostes(['A', 'B', 'C', 'D']);
    const submenu = within(screen.getByRole('navigation', { name: 'Submenú' }));
    expect(submenu.getByRole('link', { name: 'Propostes' })).toHaveTextContent('4');
    expect(submenu.getByRole('link', { name: 'Tandes' })).not.toHaveTextContent(/\d/);
  });

  it('el badge de propostes no compta les pendents de l\'organització', () => {
    renderAdmin('/tandes');
    emetPropostes([NOM_ORGANITZACIO, 'Anna P.', NOM_ORGANITZACIO, 'Joan M.', NOM_ORGANITZACIO]);
    const submenu = within(screen.getByRole('navigation', { name: 'Submenú' }));
    expect(submenu.getByRole('link', { name: 'Propostes' })).toHaveTextContent('2');
  });

  it('no mostra cap badge de propostes si totes les pendents són de l\'organització', () => {
    const { container } = renderAdmin('/tandes');
    emetPropostes([NOM_ORGANITZACIO, NOM_ORGANITZACIO]);
    expect(container.querySelector('.site-header__badge')).toBeNull();
  });

  it('no mostra el badge quan no hi ha elements pendents', () => {
    const { container } = renderAdmin('/socis');
    emetComptador(0, 0);
    emetPropostes([]);
    expect(entrada(container, 'Socis')).toHaveTextContent(/^Socis$/);
    expect(entrada(container, 'Programació')).toHaveTextContent(/^Programació$/);
    expect(container.querySelector('.site-header__badge')).toBeNull();
  });

  it('si un oient dels badges falla, el badge s\'amaga i l\'error només es registra', () => {
    const errorConsola = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = renderAdmin('/socis');
    emetComptador(0, 3);
    emetPropostes(['Anna P.']);
    act(() => {
      mockOnSnapshot.mock.calls[0][2](new Error('permission-denied'));
      mockOnSnapshot.mock.calls[1][2](new Error('permission-denied'));
    });
    expect(container.querySelector('.site-header__badge')).toBeNull();
    expect(entrada(container, 'Socis')).toHaveTextContent(/^Socis$/);
    expect(errorConsola).toHaveBeenCalledTimes(2);
    errorConsola.mockRestore();
  });
});
