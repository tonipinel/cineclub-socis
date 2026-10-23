import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render, screen, within, fireEvent, act,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Link, MemoryRouter, useLocation, useNavigate,
} from 'react-router-dom';
import { formatDataHora } from '../../lib/data';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_, nom) => nom),
  getDocs: vi.fn(),
}));

import { getDocs } from 'firebase/firestore';
import PropostesPendents from './PropostesPendents';

const ts = (iso) => ({ toDate: () => new Date(iso) });
const doc = (id, dades) => ({ id, data: () => dades });

const PROPOSTES = [
  doc('p1', { titol: 'Amélie', estat: 'pendent', numeroSoci: 3, nomProposant: 'Marta Puig', timestamp: ts('2026-09-10T10:00:00') }),
  doc('p2', { titol: 'El padrí', estat: 'aprovada', numeroSoci: 5, timestamp: ts('2026-09-20T10:00:00') }),
  doc('p3', { titol: 'El àngel exterminador', estat: 'aprovada', nomProposant: 'Laia', timestamp: ts('2026-08-01T10:00:00') }),
  doc('p4', { titol: 'Dune', estat: 'programada', nomProposant: 'Pau', timestamp: ts('2026-07-01T10:00:00') }),
  doc('p5', { titol: 'Drive', estat: 'rebutjada', nomProposant: 'Joan' }),
];

// t1 oberta (tanca el 2099), t2 i t3 tancades. p2 és a dues tandes; p5 no és a cap.
const TANDES = [
  doc('t3', { nom: 'Tanda de primavera', propostes: ['p4'], tanca: ts('2020-04-01T20:00:00') }),
  doc('t1', { nom: 'Tanda de tardor', propostes: ['p1', 'p2'], tanca: ts('2099-01-01T20:00:00') }),
  doc('t2', { nom: 'Tanda d\'estiu', propostes: ['p2', 'p3'], tanca: ts('2021-07-01T20:00:00') }),
];
const SESSIONS = [doc('s1', { titol: 'Sessió Dune', propostaId: 'p4' })];
const DISTRIBUIDORES = [
  doc('d1', { nom: 'Surtsey Films', preu: 150 }),
  doc('d2', { nom: 'Atalante' }),
];

// Respon segons la col·lecció demanada.
function mockColleccions({
  propostes = PROPOSTES, internes = [], distribuidores = DISTRIBUIDORES, tandes = TANDES, sessions = SESSIONS,
} = {}) {
  getDocs.mockImplementation(async (nom) => ({
    docs: {
      propostes, propostesInternes: internes, distribuidores, tandes, sessions,
    }[nom],
  }));
}

function Ubicacio() {
  const { search } = useLocation();
  return <span data-testid="ubicacio">{search}</span>;
}

const pintar = (url = '/propostes/pendents') => render(
  <MemoryRouter initialEntries={[url]}>
    <PropostesPendents />
    <Ubicacio />
  </MemoryRouter>,
);

const ubicacio = () => decodeURIComponent(screen.getByTestId('ubicacio').textContent);
const COLUMNES = ['Proposta', 'Proposant', 'Distribuïdora', 'Preu', 'Estat', 'Tanda', 'Sessió'];
const cella = (fila, columna) => within(fila).getAllByRole('cell')[COLUMNES.indexOf(columna)];
const filaDe = (titol) => screen.getByRole('link', { name: titol }).closest('tr');
// Títols de les files d'una taula, en l'ordre en què es mostren.
const titols = (taula = screen.getByRole('table')) => within(taula).getAllByRole('row').slice(1)
  .map((fila) => within(fila).getAllByRole('link')[0].textContent);
const xip = (nom) => within(screen.getByRole('group', { name: 'Filtra per estat' })).getByRole('button', { name: nom });
const carregat = () => screen.findByRole('link', { name: 'Amélie' });

beforeEach(() => mockColleccions());

describe('PropostesPendents', () => {
  it('llista totes les propostes amb el seu estat i un enllaç per editar-les', async () => {
    pintar();
    expect(await screen.findByText('Amélie')).toBeInTheDocument();
    expect(screen.getByText('El padrí')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Amélie' })).toHaveAttribute('href', '/propostes/pendents/p1');
    expect(within(cella(filaDe('Amélie'), 'Estat')).getByText('Pendent')).toHaveClass('badge', 'badge--pendent');
    expect(within(cella(filaDe('El padrí'), 'Estat')).getByText('Aprovada')).toHaveClass('badge', 'badge--al-dia');
    expect(within(cella(filaDe('Drive'), 'Estat')).getByText('Rebutjada')).toHaveClass('badge', 'badge--vencut');
    expect(within(cella(filaDe('Dune'), 'Estat')).getByText('Programada')).toHaveClass('badge', 'badge--nou-registre');
    expect(cella(filaDe('Amélie'), 'Proposant')).toHaveTextContent('Marta Puig');
  });

  it('per defecte ordena per data de la proposta, de la més nova a la més antiga, i les que no en tenen al final', async () => {
    pintar();
    await carregat();
    expect(titols()).toEqual(['El padrí', 'Amélie', 'El àngel exterminador', 'Dune', 'Drive']);
  });

  it('mostra un enllaç per crear una proposta nova en nom d\'un soci', async () => {
    pintar();
    await carregat();
    expect(screen.getByRole('link', { name: /nova proposta/i })).toHaveAttribute('href', '/propostes/pendents/nova');
  });

  it('no duplica l\'enllaç a distribuïdores (ja és al submenú de la capçalera)', async () => {
    pintar();
    await carregat();
    expect(screen.queryByRole('link', { name: 'Distribuïdores' })).not.toBeInTheDocument();
  });

  it('posa la taula dins d\'un contenidor amb scroll horitzontal propi perquè la pàgina no desbordi en mòbil', async () => {
    pintar();
    const taula = (await screen.findByText('Amélie')).closest('table');
    expect(taula.parentElement).toHaveClass('scroll-horitzontal');
  });

  it('el contenidor de la taula es pot desplaçar amb el teclat', async () => {
    pintar();
    await carregat();
    const regio = screen.getByRole('region', { name: 'Taula de propostes' });
    expect(regio).toHaveAttribute('tabindex', '0');
    expect(regio).toContainElement(screen.getByRole('table'));
  });

  it('mostra un missatge si no hi ha cap proposta', async () => {
    mockColleccions({ propostes: [] });
    pintar();
    expect(await screen.findByText('Encara no hi ha cap proposta.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('Cap proposta coincideix amb els filtres.')).not.toBeInTheDocument();
  });

  it('si no es poden llegir les propostes, ho diu amb un avís', async () => {
    getDocs.mockImplementation(async (nom) => {
      if (nom === 'propostes') throw new Error('permission-denied');
      return { docs: [] };
    });
    pintar();
    expect(await screen.findByRole('alert')).toHaveTextContent('No s\'han pogut carregar les propostes. Torna-ho a provar.');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  describe('distribuïdora i preu', () => {
    it('mostra la distribuïdora i el preu propi de cada proposta', async () => {
      mockColleccions({ internes: [doc('p1', { preu: 350, distribuidoraId: 'd1' })] });
      pintar();
      await carregat();
      const fila = filaDe('Amélie');
      expect(cella(fila, 'Distribuïdora')).toHaveTextContent('Surtsey Films');
      expect(cella(fila, 'Preu')).toHaveTextContent('350.00€');
      expect(screen.queryByText(/Preu per defecte de la distribuïdora/)).not.toBeInTheDocument();
    });

    it('si la proposta no té preu propi, mostra el per defecte de la distribuïdora i ho marca amb un asterisc', async () => {
      mockColleccions({ internes: [doc('p1', { preu: null, distribuidoraId: 'd1' })] });
      pintar();
      await carregat();
      const fila = filaDe('Amélie');
      expect(cella(fila, 'Preu')).toHaveTextContent('150.00€');
      expect(within(fila).getByTitle('Preu per defecte de la distribuïdora')).toBeInTheDocument();
      expect(screen.getByText('* Preu per defecte de la distribuïdora.')).toBeInTheDocument();
    });

    it('una proposta sense dades internes mostra guions', async () => {
      pintar();
      await carregat();
      const fila = filaDe('El padrí');
      expect(cella(fila, 'Distribuïdora')).toHaveTextContent(/^—$/);
      expect(cella(fila, 'Preu')).toHaveTextContent(/^—$/);
      expect(cella(fila, 'Proposant')).toHaveTextContent(/^—$/);
    });

    it('un preu de 0 € és un preu propi i no cau al per defecte', async () => {
      mockColleccions({ internes: [doc('p1', { preu: 0, distribuidoraId: 'd1' })] });
      pintar();
      await carregat();
      expect(cella(filaDe('Amélie'), 'Preu')).toHaveTextContent('0.00€');
      expect(screen.queryByTitle('Preu per defecte de la distribuïdora')).not.toBeInTheDocument();
    });

    it('unes condicions null a les dades internes no fan petar el llistat', async () => {
      mockColleccions({ internes: [doc('p1', { preu: 20, condicions: null, distribuidoraId: 'd1' })] });
      pintar();
      await carregat();
      expect(cella(filaDe('Amélie'), 'Preu')).toHaveTextContent('20.00€');
    });
  });

  describe('lectures opcionals que fallen', () => {
    it('si no es poden llegir tandes, sessions, dades internes ni distribuïdores, el llistat es mostra igualment amb guions', async () => {
      getDocs.mockImplementation(async (nom) => {
        if (nom === 'propostes') return { docs: PROPOSTES };
        throw new Error('permission-denied');
      });
      pintar();
      await carregat();
      expect(titols()).toHaveLength(5);
      const fila = filaDe('Dune');
      ['Distribuïdora', 'Preu', 'Tanda', 'Sessió'].forEach((columna) => {
        expect(cella(fila, columna)).toHaveTextContent(/^—$/);
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('xips d\'estat', () => {
    it('mostren el recompte de propostes per estat; per defecte «Totes» està premut', async () => {
      pintar();
      await carregat();
      expect(xip('Totes 5')).toHaveAttribute('aria-pressed', 'true');
      expect(xip('Pendent 1')).toHaveAttribute('aria-pressed', 'false');
      expect(xip('Aprovada 2')).toHaveAttribute('aria-pressed', 'false');
      expect(xip('Rebutjada 1')).toHaveAttribute('aria-pressed', 'false');
      expect(xip('Programada 1')).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByText('5 propostes')).toHaveAttribute('aria-live', 'polite');
    });

    it('clicar «Aprovada» deixa només les aprovades, ho escriu a la URL i actualitza el recompte', async () => {
      const usuari = userEvent.setup();
      pintar();
      await carregat();
      await usuari.click(xip('Aprovada 2'));
      expect(titols()).toEqual(['El padrí', 'El àngel exterminador']);
      expect(ubicacio()).toBe('?estat=aprovada');
      expect(screen.getByText('2 propostes')).toBeInTheDocument();
      expect(xip('Aprovada 2')).toHaveAttribute('aria-pressed', 'true');
      expect(xip('Totes 5')).toHaveAttribute('aria-pressed', 'false');
      // Els recomptes no depenen del filtre d'estat.
      expect(xip('Pendent 1')).toHaveAttribute('aria-pressed', 'false');
    });

    it('es poden combinar estats i, en treure l\'últim, es torna a «Totes» (mai una selecció buida)', async () => {
      const usuari = userEvent.setup();
      pintar();
      await carregat();
      await usuari.click(xip('Aprovada 2'));
      await usuari.click(xip('Pendent 1'));
      expect(ubicacio()).toBe('?estat=pendent,aprovada');
      expect(screen.getByText('3 propostes')).toBeInTheDocument();
      await usuari.click(xip('Aprovada 2'));
      expect(ubicacio()).toBe('?estat=pendent');
      expect(titols()).toEqual(['Amélie']);
      expect(screen.getByText('1 proposta')).toBeInTheDocument();
      await usuari.click(xip('Pendent 1'));
      expect(ubicacio()).toBe('');
      expect(xip('Totes 5')).toHaveAttribute('aria-pressed', 'true');
      expect(titols()).toHaveLength(5);
    });

    it('«Totes» restableix la selecció d\'estats', async () => {
      const usuari = userEvent.setup();
      pintar('/propostes/pendents?estat=rebutjada');
      await screen.findByRole('link', { name: 'Drive' });
      expect(titols()).toEqual(['Drive']);
      await usuari.click(xip('Totes 5'));
      expect(ubicacio()).toBe('');
      expect(titols()).toHaveLength(5);
    });

    it('els recomptes tenen en compte la resta de filtres', async () => {
      pintar('/propostes/pendents?tanda=t1');
      await carregat();
      expect(xip('Totes 2')).toBeInTheDocument();
      expect(xip('Pendent 1')).toBeInTheDocument();
      expect(xip('Aprovada 1')).toBeInTheDocument();
      expect(xip('Rebutjada 0')).toBeInTheDocument();
      expect(xip('Programada 0')).toBeInTheDocument();
    });
  });

  describe('cerca', () => {
    afterEach(() => vi.useRealTimers());

    it('filtra sense distingir accents ni majúscules i escriu la cerca a la URL al cap de 250 ms', async () => {
      pintar();
      await carregat();
      vi.useFakeTimers();
      fireEvent.change(screen.getByLabelText('Cerca una proposta'), { target: { value: 'ANGEL' } });
      expect(titols()).toEqual(['El àngel exterminador']);
      expect(screen.getByText('1 proposta')).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(249));
      expect(ubicacio()).toBe('');
      act(() => vi.advanceTimersByTime(1));
      expect(ubicacio()).toBe('?cerca=ANGEL');
    });

    describe('navegació cap a la mateixa ruta', () => {
      function Navegacio() {
        const navigate = useNavigate();
        return (
          <nav>
            <Link to="/propostes/pendents">Menú propostes</Link>
            <Link to="/propostes/pendents?cerca=amelie">Cerca amelie</Link>
            <button type="button" onClick={() => navigate(-1)}>Enrere</button>
          </nav>
        );
      }
      const pintarAmbNavegacio = () => render(
        <MemoryRouter initialEntries={['/propostes/pendents']}>
          <PropostesPendents />
          <Ubicacio />
          <Navegacio />
        </MemoryRouter>,
      );
      const camp = () => screen.getByLabelText('Cerca una proposta');
      const espera = (ms) => act(() => vi.advanceTimersByTime(ms));

      it('un enllaç a la ruta sense cerca buida el camp i cap temporitzador antic no torna a escriure la cerca', async () => {
        pintarAmbNavegacio();
        await carregat();
        vi.useFakeTimers();
        fireEvent.change(camp(), { target: { value: 'padri' } });
        espera(250);
        expect(ubicacio()).toBe('?cerca=padri');
        fireEvent.click(screen.getByRole('link', { name: 'Menú propostes' }));
        expect(ubicacio()).toBe('');
        expect(camp()).toHaveValue('');
        espera(500);
        expect(ubicacio()).toBe('');
        expect(camp()).toHaveValue('');
        expect(titols()).toHaveLength(5);
      });

      it('una cerca encara no escrita a la URL es descarta si es navega abans del retard', async () => {
        pintarAmbNavegacio();
        await carregat();
        vi.useFakeTimers();
        fireEvent.change(camp(), { target: { value: 'dune' } });
        espera(100);
        fireEvent.click(screen.getByRole('link', { name: 'Menú propostes' }));
        espera(500);
        expect(ubicacio()).toBe('');
        expect(camp()).toHaveValue('');
      });

      it('un enllaç amb cerca l\'aplica al camp i a la llista, i tornar enrere recupera el valor anterior', async () => {
        pintarAmbNavegacio();
        await carregat();
        vi.useFakeTimers();
        fireEvent.change(camp(), { target: { value: 'padri' } });
        espera(250);
        fireEvent.click(screen.getByRole('link', { name: 'Cerca amelie' }));
        expect(camp()).toHaveValue('amelie');
        expect(titols()).toEqual(['Amélie']);
        espera(500);
        expect(ubicacio()).toBe('?cerca=amelie');
        fireEvent.click(screen.getByRole('button', { name: 'Enrere' }));
        expect(ubicacio()).toBe('?cerca=padri');
        expect(camp()).toHaveValue('padri');
        expect(titols()).toEqual(['El padrí']);
        espera(500);
        expect(ubicacio()).toBe('?cerca=padri');
      });
    });

    it('la cerca de la URL inicial omple el camp i filtra', async () => {
      pintar('/propostes/pendents?cerca=marta');
      await carregat();
      expect(screen.getByLabelText('Cerca una proposta')).toHaveValue('marta');
      expect(titols()).toEqual(['Amélie']);
    });
  });

  describe('filtres de tanda i distribuïdora', () => {
    const INTERNES = [
      doc('p1', { preu: 350, distribuidoraId: 'd1' }),
      doc('p2', { preu: null, distribuidoraId: 'd1' }),
      doc('p3', { preu: 9, distribuidoraId: 'd2' }),
    ];
    beforeEach(() => mockColleccions({ internes: INTERNES }));

    it('el selector de tandes ofereix totes, sense tanda i cada tanda (oberta primer, marcada)', async () => {
      pintar();
      await carregat();
      const opcions = within(screen.getByLabelText('Filtra per tanda')).getAllByRole('option').map((o) => o.textContent);
      expect(opcions).toEqual(['Totes les tandes', 'Sense tanda', 'Tanda de tardor (oberta)', 'Tanda d\'estiu', 'Tanda de primavera']);
      const distribuidores = within(screen.getByLabelText('Filtra per distribuïdora')).getAllByRole('option').map((o) => o.textContent);
      expect(distribuidores).toEqual(['Totes les distribuïdores', 'Sense distribuïdora', 'Atalante', 'Surtsey Films']);
    });

    it('filtra per tanda i per «Sense tanda»', async () => {
      const usuari = userEvent.setup();
      pintar();
      await carregat();
      await usuari.selectOptions(screen.getByLabelText('Filtra per tanda'), 't2');
      expect(titols()).toEqual(['El padrí', 'El àngel exterminador']);
      expect(ubicacio()).toBe('?tanda=t2');
      await usuari.selectOptions(screen.getByLabelText('Filtra per tanda'), 'cap');
      expect(titols()).toEqual(['Drive']);
      expect(ubicacio()).toBe('?tanda=cap');
    });

    it('filtra per distribuïdora i per «Sense distribuïdora»', async () => {
      const usuari = userEvent.setup();
      pintar();
      await carregat();
      await usuari.selectOptions(screen.getByLabelText('Filtra per distribuïdora'), 'd1');
      expect(titols()).toEqual(['El padrí', 'Amélie']);
      expect(ubicacio()).toBe('?distribuidora=d1');
      await usuari.selectOptions(screen.getByLabelText('Filtra per distribuïdora'), 'cap');
      expect(titols()).toEqual(['Dune', 'Drive']);
    });

    it('combina filtres i «Neteja els filtres» ho restableix tot i buida la URL', async () => {
      const usuari = userEvent.setup();
      pintar();
      await carregat();
      expect(screen.queryByRole('button', { name: 'Neteja els filtres' })).not.toBeInTheDocument();
      await usuari.selectOptions(screen.getByLabelText('Filtra per tanda'), 't2');
      await usuari.selectOptions(screen.getByLabelText('Filtra per distribuïdora'), 'd2');
      expect(titols()).toEqual(['El àngel exterminador']);
      await usuari.click(xip('Aprovada 1'));
      await usuari.type(screen.getByLabelText('Cerca una proposta'), 'angel');
      expect(titols()).toEqual(['El àngel exterminador']);
      await usuari.click(screen.getByRole('button', { name: 'Neteja els filtres' }));
      expect(titols()).toHaveLength(5);
      expect(ubicacio()).toBe('');
      expect(screen.getByLabelText('Cerca una proposta')).toHaveValue('');
      expect(screen.getByLabelText('Filtra per tanda')).toHaveValue('totes');
      expect(screen.getByLabelText('Filtra per distribuïdora')).toHaveValue('totes');
      expect(xip('Totes 5')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.queryByRole('button', { name: 'Neteja els filtres' })).not.toBeInTheDocument();
    });

    it('si els filtres no deixen cap resultat, ho diu i ofereix netejar-los', async () => {
      const usuari = userEvent.setup();
      pintar('/propostes/pendents?estat=rebutjada&tanda=t1');
      expect(await screen.findByText('Cap proposta coincideix amb els filtres.')).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.getByText('0 propostes')).toBeInTheDocument();
      await usuari.click(screen.getByRole('button', { name: 'Neteja els filtres' }));
      expect(titols()).toHaveLength(5);
      expect(ubicacio()).toBe('');
    });
  });

  describe('ordre', () => {
    it('clicar «Preu» ordena numèricament ascendent i després descendent, amb els absents al final', async () => {
      mockColleccions({
        internes: [
          doc('p1', { preu: 350, distribuidoraId: 'd1' }),
          doc('p2', { preu: null, distribuidoraId: 'd1' }),
          doc('p3', { preu: 9, distribuidoraId: 'd2' }),
        ],
      });
      const usuari = userEvent.setup();
      pintar();
      await carregat();
      const capcalera = screen.getByRole('columnheader', { name: 'Preu' });
      expect(capcalera).not.toHaveAttribute('aria-sort');
      await usuari.click(within(capcalera).getByRole('button', { name: 'Preu' }));
      expect(titols()).toEqual(['El àngel exterminador', 'El padrí', 'Amélie', 'Drive', 'Dune']);
      expect(screen.getByRole('columnheader', { name: 'Preu' })).toHaveAttribute('aria-sort', 'ascending');
      expect(ubicacio()).toBe('?ordre=preu:asc');
      await usuari.click(screen.getByRole('button', { name: 'Preu' }));
      expect(titols()).toEqual(['Amélie', 'El padrí', 'El àngel exterminador', 'Drive', 'Dune']);
      expect(screen.getByRole('columnheader', { name: 'Preu' })).toHaveAttribute('aria-sort', 'descending');
      expect(ubicacio()).toBe('?ordre=preu:desc');
    });

    it('canviar de columna comença en ascendent i només la columna activa té aria-sort', async () => {
      const usuari = userEvent.setup();
      pintar('/propostes/pendents?ordre=preu:desc');
      await carregat();
      await usuari.click(screen.getByRole('button', { name: 'Proposta' }));
      expect(titols()).toEqual(['Amélie', 'Drive', 'Dune', 'El àngel exterminador', 'El padrí']);
      expect(screen.getByRole('columnheader', { name: 'Proposta' })).toHaveAttribute('aria-sort', 'ascending');
      expect(screen.getByRole('columnheader', { name: 'Preu' })).not.toHaveAttribute('aria-sort');
    });

    it('totes les columnes de la taula es poden ordenar', async () => {
      pintar();
      await carregat();
      COLUMNES.forEach((columna) => {
        expect(within(screen.getByRole('columnheader', { name: columna })).getByRole('button', { name: columna })).toBeInTheDocument();
      });
    });
  });

  describe('enllaços de tanda i sessió', () => {
    it('la columna Tanda enllaça a cada tanda i la Sessió a la sessió de la proposta', async () => {
      pintar();
      await carregat();
      const tandes = within(cella(filaDe('El padrí'), 'Tanda')).getAllByRole('link');
      expect(tandes.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
        ['Tanda de tardor', '/tandes/t1'],
        ['Tanda d\'estiu', '/tandes/t2'],
      ]);
      expect(within(cella(filaDe('Dune'), 'Sessió')).getByRole('link', { name: 'Sessió Dune' })).toHaveAttribute('href', '/sessions/s1');
      expect(cella(filaDe('Drive'), 'Tanda')).toHaveTextContent(/^—$/);
      expect(cella(filaDe('Drive'), 'Sessió')).toHaveTextContent(/^—$/);
    });
  });

  describe('vista per tanda', () => {
    const seccions = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    const seccio = (nom) => screen.getByRole('region', { name: nom });

    it('agrupa en seccions: oberta, tancades de la més recent a la més antiga i «Sense tanda»', async () => {
      const usuari = userEvent.setup();
      pintar();
      await carregat();
      const vista = screen.getByRole('group', { name: 'Vista' });
      expect(within(vista).getByRole('button', { name: 'Llista' })).toHaveAttribute('aria-pressed', 'true');
      await usuari.click(within(vista).getByRole('button', { name: 'Per tanda' }));
      expect(ubicacio()).toBe('?vista=tandes');
      expect(within(vista).getByRole('button', { name: 'Per tanda' })).toHaveAttribute('aria-pressed', 'true');
      expect(within(vista).getByRole('button', { name: 'Llista' })).toHaveAttribute('aria-pressed', 'false');
      expect(seccions()).toEqual(['Tanda de tardor', 'Tanda d\'estiu', 'Tanda de primavera', 'Sense tanda']);
    });

    it('una proposta a dues tandes surt a les dues seccions però compta una sola vegada', async () => {
      pintar('/propostes/pendents?vista=tandes');
      await screen.findAllByRole('link', { name: 'El padrí' });
      expect(screen.getAllByRole('link', { name: 'El padrí' })).toHaveLength(2);
      expect(titols(within(seccio('Tanda de tardor')).getByRole('table'))).toEqual(['El padrí', 'Amélie']);
      expect(titols(within(seccio('Tanda d\'estiu')).getByRole('table'))).toEqual(['El padrí', 'El àngel exterminador']);
      expect(screen.getByText('5 propostes')).toBeInTheDocument();
      expect(xip('Aprovada 2')).toBeInTheDocument();
    });

    it('cada secció de tanda té l\'estat, la data de tancament, el recompte i l\'enllaç a resultats; sense columna Tanda', async () => {
      pintar('/propostes/pendents?vista=tandes');
      await screen.findAllByRole('link', { name: 'El padrí' });
      const tardor = seccio('Tanda de tardor');
      expect(within(tardor).getByText('Oberta')).toHaveClass('badge');
      expect(within(tardor).getByText(`Tanca: ${formatDataHora(new Date('2099-01-01T20:00:00'))}`)).toBeInTheDocument();
      expect(within(tardor).getByText('2 propostes')).toBeInTheDocument();
      expect(within(tardor).getByRole('link', { name: /^Resultats/ })).toHaveAttribute('href', '/tandes/t1/resultats');
      const primavera = seccio('Tanda de primavera');
      expect(within(primavera).getByText('Tancada')).toBeInTheDocument();
      expect(within(primavera).getByText('1 proposta')).toBeInTheDocument();
      expect(within(primavera).getByRole('link', { name: /^Resultats/ })).toHaveAttribute('href', '/tandes/t3/resultats');
      expect(within(tardor).queryByRole('columnheader', { name: 'Tanda' })).not.toBeInTheDocument();
      expect(within(tardor).getByRole('columnheader', { name: 'Sessió' })).toBeInTheDocument();
      const sense = seccio('Sense tanda');
      expect(titols(within(sense).getByRole('table'))).toEqual(['Drive']);
      expect(within(sense).queryByRole('link', { name: /^Resultats/ })).not.toBeInTheDocument();
    });

    it('les seccions sense files filtrades desapareixen i dins la secció s\'aplica l\'ordre actiu', async () => {
      const usuari = userEvent.setup();
      pintar('/propostes/pendents?vista=tandes&estat=aprovada');
      await screen.findAllByRole('link', { name: 'El padrí' });
      expect(seccions()).toEqual(['Tanda de tardor', 'Tanda d\'estiu']);
      await usuari.click(within(seccio('Tanda d\'estiu')).getByRole('button', { name: 'Proposta' }));
      expect(titols(within(seccio('Tanda d\'estiu')).getByRole('table'))).toEqual(['El àngel exterminador', 'El padrí']);
      expect(ubicacio()).toBe('?vista=tandes&estat=aprovada&ordre=titol:asc');
    });
  });

  describe('ordre per tanda a la vista per tanda', () => {
    it('com que no hi ha columna Tanda, s\'ordena per data dins les seccions i cap capçalera no queda marcada', async () => {
      pintar('/propostes/pendents?vista=tandes&ordre=tanda:asc');
      await screen.findAllByRole('link', { name: 'El padrí' });
      expect(titols(within(screen.getByRole('region', { name: 'Tanda d\'estiu' })).getByRole('table'))).toEqual(['El padrí', 'El àngel exterminador']);
      expect(document.querySelectorAll('th[aria-sort]')).toHaveLength(0);
      expect(ubicacio()).toBe('?vista=tandes&ordre=tanda:asc');
    });
  });

  describe('estat a la URL', () => {
    it('la URL inicial es reflecteix en la vista, els estats i la tanda', async () => {
      pintar('/propostes/pendents?vista=tandes&estat=aprovada&tanda=t2');
      await screen.findByRole('link', { name: 'El padrí' });
      expect(within(screen.getByRole('group', { name: 'Vista' })).getByRole('button', { name: 'Per tanda' })).toHaveAttribute('aria-pressed', 'true');
      expect(xip('Aprovada 2')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByLabelText('Filtra per tanda')).toHaveValue('t2');
      // Amb una tanda concreta filtrada, només se'n mostra la secció.
      expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Tanda d\'estiu']);
    });

    it('valors desconeguts a la URL donen els valors per defecte sense error', async () => {
      pintar('/propostes/pendents?vista=mosaic&estat=esborrada&tanda=zzz&distribuidora=qq&ordre=res:amunt');
      await carregat();
      expect(within(screen.getByRole('group', { name: 'Vista' })).getByRole('button', { name: 'Llista' })).toHaveAttribute('aria-pressed', 'true');
      expect(xip('Totes 5')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByLabelText('Filtra per tanda')).toHaveValue('totes');
      expect(screen.getByLabelText('Filtra per distribuïdora')).toHaveValue('totes');
      expect(titols()).toEqual(['El padrí', 'Amélie', 'El àngel exterminador', 'Dune', 'Drive']);
    });
  });
});

describe('sense vista pública', () => {
  it('no té pestanyes i mostra directament la gestió sota la capçalera', async () => {
    pintar();
    expect(await carregat()).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByText(/vista pública/i)).not.toBeInTheDocument();
  });
});

describe('layout estàndard', () => {
  it('fa servir l\'amplada de llista, un sol h1 i el botó «Nova proposta» amb text', async () => {
    const { container } = pintar();
    await carregat();
    expect(container.firstChild).toHaveClass('pagina-admin', 'pagina-admin--llista');
    const titols1 = screen.getAllByRole('heading', { level: 1 });
    expect(titols1).toHaveLength(1);
    expect(titols1[0]).toHaveTextContent('Propostes de programació');
    const boto = screen.getByRole('link', { name: 'Nova proposta' });
    expect(within(boto).getByText('Nova proposta')).toHaveClass('btn-icona__text');
  });

  it('també té un sol h1 a la vista per tanda', async () => {
    pintar('/propostes/pendents?vista=tandes');
    await screen.findAllByRole('link', { name: 'Amélie' });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('els controls tenen nom accessible i el botó de filtres plega i desplega el panell', async () => {
    const usuari = userEvent.setup();
    pintar();
    await carregat();
    expect(screen.getByLabelText('Cerca una proposta')).toHaveAttribute('type', 'search');
    expect(screen.getByLabelText('Filtra per tanda').tagName).toBe('SELECT');
    expect(screen.getByLabelText('Filtra per distribuïdora').tagName).toBe('SELECT');
    expect(screen.getByRole('group', { name: 'Filtra per estat' })).toBeInTheDocument();
    const boto = screen.getByRole('button', { name: 'Mostrar filtres' });
    expect(boto).toHaveAttribute('aria-expanded', 'false');
    await usuari.click(boto);
    expect(screen.getByRole('button', { name: 'Amagar filtres' })).toHaveAttribute('aria-expanded', 'true');
  });
});
