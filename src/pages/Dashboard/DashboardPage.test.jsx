import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(),
}));

import { collection, getDocs } from 'firebase/firestore';
import DashboardPage from './DashboardPage';

const SOCIS = [
  { numeroSoci: 1, nom: 'Anna', cognoms: 'Vidal', dataAlta: '2026-08-01', ultimPagament: '2020-01-01' },
  { numeroSoci: 2, nom: 'Marc', cognoms: 'Roig', dataAlta: '2025-01-01', ultimPagament: '2020-01-01' },
];
const SESSIONS = [{ id: 's1', titol: 'The Artist', data: '2026-08-01' }];
const ACCESS_LOG = [];
const MOVIMENTS = [
  { tipus: 'ingres', categoria: 'Quotes socis', metodePagament: 'efectiu', total: 100, sessionId: 's1' },
  { tipus: 'despesa', categoria: 'Gestió pel·lícules', metodePagament: 'efectiu', total: 40 },
];
const LOTS = [{ numeroInicial: 1, quantitat: 3, anulat: false, codisAnulats: [] }];

function mockCarrega(overrides = {}) {
  const dades = {
    socis: SOCIS, sessions: SESSIONS, accessLog: ACCESS_LOG, moviments: MOVIMENTS, lots: LOTS,
    ...overrides,
  };
  getDocs
    .mockResolvedValueOnce({ docs: dades.socis.map((d) => ({ data: () => d })) })
    .mockResolvedValueOnce({ docs: dades.sessions.map((d) => ({ id: d.id, data: () => d })) })
    .mockResolvedValueOnce({ docs: dades.accessLog.map((d) => ({ data: () => d })) })
    .mockResolvedValueOnce({ docs: dades.moviments.map((d, i) => ({ id: d.id ?? `m${i}`, data: () => d })) })
    .mockResolvedValueOnce({ docs: dades.lots.map((d) => ({ data: () => d })) });
}

const DIA = 24 * 60 * 60 * 1000;
const SOCIS_VOTACIO = Array.from({ length: 64 }, (_, i) => ({
  numeroSoci: i + 1, nom: `Soci${i + 1}`, cognoms: 'X', tokenCarnet: 't', dataAlta: '2026-08-01', ultimPagament: '2026-08-01',
}));
const VOTS_VOTACIO = [
  ...Array.from({ length: 12 }, (_, i) => ({
    id: String(i + 1), valors: { p1: 'like', p2: i === 0 ? 'dislike' : 'like', p3: 'like' },
  })),
  { id: '13', valors: { p1: 'like' } },
];
const PROPOSTES_VOTACIO = [
  { id: 'p1', titol: 'Un ours dans le Jura', estat: 'aprovada', imatgeUrl: '/ours.jpg' },
  { id: 'p2', titol: 'My Favourite Cake', estat: 'programada' },
  { id: 'p3', titol: 'Cinema Paradiso', estat: 'aprovada' },
  { id: 'p4', titol: 'Rebutjada', estat: 'rebutjada' },
];
const TANDA_OBERTA = {
  id: 't1', nom: 'Q4 2026', propostes: ['p1', 'p2', 'p3', 'p4'], tanca: new Date(Date.now() + DIA), creada: new Date(Date.now() - DIA),
};
const TANDA_TANCADA = { ...TANDA_OBERTA, id: 't0', tanca: new Date(Date.now() - DIA) };

const llista = (docs) => ({ docs: docs.map(({ id, ...d }) => ({ id, data: () => d })) });

// Lectures de la votació, després de les cinc del dashboard: tandes, i si n'hi ha d'oberta, vots i propostes.
function mockVotacio(tandes = [TANDA_OBERTA]) {
  getDocs.mockResolvedValueOnce(llista(tandes));
  if (tandes.some((t) => t.tanca > new Date())) {
    getDocs.mockResolvedValueOnce(llista(VOTS_VOTACIO)).mockResolvedValueOnce(llista(PROPOSTES_VOTACIO));
  }
}

function elementModul(nom) {
  return screen.getByRole('heading', { name: nom }).closest('.dashboard__modul');
}

function modul(nom) {
  return within(elementModul(nom));
}

describe('DashboardPage', () => {
  beforeEach(() => {
    getDocs.mockReset();
    collection.mockClear();
  });

  it('mostra el gif de càrrega mentre es resolen les dades', () => {
    getDocs.mockReturnValue(new Promise(() => {}));
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(screen.getByRole('img', { name: 'Carregant…' })).toBeInTheDocument();
  });

  it('mostra un error si falla la càrrega', async () => {
    getDocs.mockRejectedValue(new Error('boom'));
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(await screen.findByText("No s'han pogut carregar les dades del dashboard.")).toBeInTheDocument();
  });

  it('usa el layout de fitxa amb un únic h1', async () => {
    mockCarrega();
    const { container } = render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Noves altes de socis' });
    expect(container.firstChild).toHaveClass('pagina-admin', 'pagina-admin--fitxa');
    const titols = screen.getAllByRole('heading', { level: 1 });
    expect(titols).toHaveLength(1);
    expect(titols[0]).toHaveTextContent('Dashboard');
  });

  it("l'error de càrrega també és dins del layout, amb el seu h1", async () => {
    getDocs.mockRejectedValue(new Error('boom'));
    const { container } = render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByText("No s'han pogut carregar les dades del dashboard.");
    expect(container.firstChild).toHaveClass('pagina-admin', 'pagina-admin--fitxa');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Dashboard');
  });

  it('mòdul Noves altes de socis: no mostra renovacions quan tots els socis estan vençuts', async () => {
    mockCarrega();
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Noves altes de socis' });
    expect(modul('Noves altes de socis').queryByText('Renoven aviat')).not.toBeInTheDocument();
  });

  it('mòdul Noves altes de socis: mostra el gràfic i la mitjana d\'altes per sessió', async () => {
    mockCarrega({
      moviments: [
        {
          tipus: 'ingres', categoria: 'Quotes socis', tipusQuota: 'alta', metodePagament: 'efectiu',
          total: 30, sessionId: 's1',
        },
      ],
    });
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Noves altes de socis' });
    const m = modul('Noves altes de socis');
    expect(elementModul('Noves altes de socis').querySelector('.recharts-responsive-container')).toBeInTheDocument();
    expect(m.getByText(/Mitjana d'altes de socis \(últimes 5 sessions\)/)).toBeInTheDocument();
    expect(m.getByText('1.0')).toBeInTheDocument();
  });

  it('mòdul Noves altes de socis: mostra la llista de renovacions properes quan n\'hi ha', async () => {
    // ultimPagament = avui - 1 any + 10 dies, de manera que el venciment (ultimPagament + 1
    // any, regla de calcularVenciment) cau sempre 10 dies després d'avui, real, sense
    // dependre de la data en què s'executi el test.
    const ara = new Date();
    const ultimPagament = new Date(ara.getFullYear() - 1, ara.getMonth(), ara.getDate() + 10)
      .toLocaleDateString('sv-SE');
    mockCarrega({
      socis: [{ numeroSoci: 3, nom: 'Laia', cognoms: 'Puig', dataAlta: '2026-01-01', ultimPagament }],
    });
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Noves altes de socis' });
    const m = modul('Noves altes de socis');
    expect(m.getByText('Renoven aviat')).toBeInTheDocument();
    expect(m.getByText(/Laia Puig/)).toBeInTheDocument();
  });

  it('mòdul Assistència: mostra el gràfic i la mitjana quan hi ha sessions passades', async () => {
    mockCarrega();
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Assistència' });
    const m = modul('Assistència');
    expect(elementModul('Assistència').querySelector('.recharts-responsive-container')).toBeInTheDocument();
    expect(m.queryByText('Encara no hi ha cap sessió.')).not.toBeInTheDocument();
    expect(m.getByText(/Assistència mitjana \(últimes 5 sessions\)/)).toBeInTheDocument();
  });

  it('ignora les sessions senseControl a les últimes 5 sessions (mitjana d\'altes i missatge buit)', async () => {
    mockCarrega({
      sessions: [
        { id: 's1', titol: 'The Artist', data: '2026-08-01' },
        { id: 'e1', titol: 'Carretera a Gusen', data: '2026-08-10', senseControl: true },
      ],
      moviments: [
        {
          tipus: 'ingres', categoria: 'Quotes socis', tipusQuota: 'alta', metodePagament: 'efectiu',
          total: 30, sessionId: 's1',
        },
      ],
    });
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Noves altes de socis' });
    expect(modul('Noves altes de socis').getByText('1.0')).toBeInTheDocument();
  });

  it('si totes les sessions passades són senseControl, els mòduls diuen que no hi ha cap sessió', async () => {
    mockCarrega({ sessions: [{ id: 'e1', titol: 'Carretera a Gusen', data: '2026-08-10', senseControl: true }] });
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Assistència' });
    expect(modul('Assistència').getByText('Encara no hi ha cap sessió.')).toBeInTheDocument();
    expect(modul('Rentabilitat de les sessions').getByText('Encara no hi ha cap sessió.')).toBeInTheDocument();
  });

  it('mòdul Assistència: mostra el missatge buit si no hi ha sessions passades', async () => {
    mockCarrega({ sessions: [{ id: 's2', titol: 'Sessió futura', data: '2099-01-01' }] });
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Assistència' });
    const m = modul('Assistència');
    expect(m.getByText('Encara no hi ha cap sessió.')).toBeInTheDocument();
    expect(elementModul('Assistència').querySelector('.recharts-responsive-container')).not.toBeInTheDocument();
  });

  it('mòdul Rentabilitat de les sessions: mostra el gràfic de balanç quan hi ha sessions passades', async () => {
    mockCarrega();
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Rentabilitat de les sessions' });
    const m = modul('Rentabilitat de les sessions');
    expect(elementModul('Rentabilitat de les sessions').querySelector('.recharts-responsive-container')).toBeInTheDocument();
    expect(m.queryByText('Encara no hi ha cap sessió.')).not.toBeInTheDocument();
    expect(m.getByRole('link', { name: 'Veure totes' })).toHaveAttribute('href', '/sessions');
  });

  it('mòdul Rentabilitat de les sessions: no compta les sessions futures (sempre tindrien balanç 0)', async () => {
    mockCarrega({ sessions: [{ id: 's2', titol: 'Sessió futura', data: '2099-01-01' }] });
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Rentabilitat de les sessions' });
    const m = modul('Rentabilitat de les sessions');
    expect(m.getByText('Encara no hi ha cap sessió.')).toBeInTheDocument();
    expect(elementModul('Rentabilitat de les sessions').querySelector('.recharts-responsive-container')).not.toBeInTheDocument();
  });

  it('capçalera de números: mostra la tresoreria, el total de socis i els tiquets amb la barra d\'ús', async () => {
    mockCarrega();
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByText('Fons total de tresoreria');
    const numeros = within(document.querySelector('.dashboard__numeros'));
    expect(numeros.getByText('Fons total de tresoreria').nextSibling).toHaveTextContent('60.00€');
    expect(numeros.getByText('Total de socis').nextSibling).toHaveTextContent('2');
    expect(numeros.getByText('Tiquets').nextSibling).toHaveTextContent('3');
    expect(numeros.getByText('0 usats · 3 disponibles')).toBeInTheDocument();
  });

  it('mòdul Comptabilitat: mostra el desglossament d\'ingressos i despeses', async () => {
    mockCarrega();
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Comptabilitat' });
    const m = modul('Comptabilitat');
    expect(m.getByText('Quotes socis')).toBeInTheDocument();
    expect(m.getByText('Gestió pel·lícules')).toBeInTheDocument();
    expect(m.queryByText('Aportacions')).not.toBeInTheDocument();
    expect(elementModul('Comptabilitat').querySelectorAll('.recharts-responsive-container')).toHaveLength(2);
  });

  it('mòdul Comptabilitat: "Gestió associació" amaga el detall per defecte i el desplega pel concepte en clicar', async () => {
    mockCarrega({
      moviments: [
        {
          id: 'm1', tipus: 'despesa', categoria: 'Gestió associació', metodePagament: 'banc',
          concepte: 'Assegurança', total: 60,
        },
        {
          id: 'm2', tipus: 'despesa', categoria: 'Gestió pel·lícules', metodePagament: 'efectiu',
          preuUnitari: 180, quantitat: 5, total: 900,
        },
      ],
    });
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Comptabilitat' });
    const m = modul('Comptabilitat');
    // Gestió pel·lícules es mostra desplegat per defecte.
    expect(m.getByText(/180\.00€ × 5/)).toBeInTheDocument();
    // Gestió associació comença amagat.
    expect(m.queryByText('Assegurança')).not.toBeInTheDocument();
    fireEvent.click(m.getByRole('button', { name: 'Veure detall' }));
    expect(m.getByText('Assegurança')).toBeInTheDocument();
  });

  it('mòdul Evolució econòmica: mostra el resum real, la previsió a 1 any i el gràfic combinat', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 31));
    mockCarrega({
      // Cap d'aquests moviments té numeroSoci, així que no hi ha cap soci
      // avaluable pel llindar de renovació i el tant per cent es queda al
      // 100% (sense ajust) — aquest test només verifica el desglossament
      // mensual, no l'ajust de renovació (cobert a moviments.test.js).
      moviments: [
        { data: '2026-07-05', tipus: 'ingres', categoria: 'Quotes socis', total: 30 },
        { data: '2026-08-05', tipus: 'ingres', categoria: 'Aportacions', total: 20 },
        { data: '2026-06-15', tipus: 'despesa', categoria: 'Gestió pel·lícules', total: 80 },
        { data: '2026-07-15', tipus: 'despesa', categoria: 'Gestió pel·lícules', total: 150 },
      ],
    });
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Evolució econòmica' });
    const m = modul('Evolució econòmica');

    // Gràfic combinat (recharts no renderitza el contingut intern en jsdom
    // sense mides reals; només comprovem que el contenidor es munta).
    expect(elementModul('Evolució econòmica').querySelector('.recharts-responsive-container')).toBeInTheDocument();

    // Pestanya "Últims 12 mesos (real)" activa per defecte.
    expect(m.getByText('Setembre 2025')).toBeInTheDocument();
    expect(m.getAllByText('Agost 2026')).not.toHaveLength(0);
    expect(m.queryByText('Febrer 2027')).not.toBeInTheDocument();

    // Canviem a la pestanya "Previsió pròxims 12 mesos".
    fireEvent.click(m.getByRole('button', { name: 'Previsió pròxims 12 mesos' }));
    expect(m.queryByText('Setembre 2025')).not.toBeInTheDocument();
    expect(m.getByText('Febrer 2027')).toBeInTheDocument();
    expect(m.getByText('Agost 2027')).toBeInTheDocument();
    const taulaPrevisio = within(m.getAllByRole('table')[0]);
    expect(taulaPrevisio.getAllByText('10.00€')).toHaveLength(12); // 30€/3 mesos, cada fila
    expect(taulaPrevisio.getAllByText('6.67€')).toHaveLength(12); // 20€/3 mesos, cada fila
    expect(taulaPrevisio.getAllByText('-150.00€')).toHaveLength(12); // el cost de pel·lícula més car, cada fila

    vi.useRealTimers();
  });

  describe('mòdul de votació', () => {
    const titolVotacio = 'Votació: Q4 2026';

    it('amb una tanda oberta mostra el resum, el progrés i les pel·lícules de millor a pitjor', async () => {
      mockCarrega({ socis: SOCIS_VOTACIO });
      mockVotacio();
      render(<MemoryRouter><DashboardPage /></MemoryRouter>);
      await screen.findByRole('heading', { name: titolVotacio });
      const m = modul(titolVotacio);
      expect(m.getByText('13 de 64 han votat · 12 han completat · 51 pendents')).toBeInTheDocument();
      expect(m.getByText('Completats: 12 de 64')).toBeInTheDocument();
      expect(m.getByText('19%', { selector: '.dashboard__votacio-percentatge' })).toBeInTheDocument();
      const barra = m.getByRole('progressbar', { name: 'Completats' });
      expect(barra).toHaveAttribute('aria-valuenow', '19');
      expect(barra).toHaveAttribute('aria-valuemin', '0');
      expect(barra).toHaveAttribute('aria-valuemax', '100');
      const files = m.getAllByRole('listitem');
      expect(files.map((li) => within(li).getByRole('heading').textContent)).toEqual([
        'Un ours dans le Jura', 'Cinema Paradiso', 'My Favourite Cake',
      ]);
      expect(files[0]).toHaveTextContent('👍 13 · 👎 0');
      expect(files[0]).toHaveTextContent('100%');
      expect(files[1]).toHaveTextContent('👍 12 · 👎 0');
      expect(files[2]).toHaveTextContent('👍 11 · 👎 1');
      expect(files[2]).toHaveTextContent('92%');
      expect(files[0].querySelector('img')).toHaveAttribute('src', '/ours.jpg');
      expect(within(files[1]).getByTestId('cartell-buit')).toBeInTheDocument();
    });

    it('enllaça als resultats complets de la tanda', async () => {
      mockCarrega({ socis: SOCIS_VOTACIO });
      mockVotacio();
      render(<MemoryRouter><DashboardPage /></MemoryRouter>);
      await screen.findByRole('heading', { name: titolVotacio });
      const m = modul(titolVotacio);
      expect(m.getByRole('link', { name: 'Veure resultats complets' })).toHaveAttribute('href', '/tandes/t1/resultats');
    });

    it('sense percentatge quan una pel·lícula encara no té vots', async () => {
      mockCarrega({ socis: SOCIS_VOTACIO });
      getDocs
        .mockResolvedValueOnce(llista([TANDA_OBERTA]))
        .mockResolvedValueOnce(llista([]))
        .mockResolvedValueOnce(llista(PROPOSTES_VOTACIO));
      render(<MemoryRouter><DashboardPage /></MemoryRouter>);
      await screen.findByRole('heading', { name: titolVotacio });
      const m = modul(titolVotacio);
      expect(m.getByText('0 de 64 han votat · 0 han completat · 64 pendents')).toBeInTheDocument();
      expect(m.getAllByRole('listitem')[0]).toHaveTextContent('Un ours dans le Jura👍 0 · 👎 0Sense vots');
    });

    it.each([[6, 6], [8, 8], [9, 8]])('amb %i pel·lícules ensenya les %i millors i sempre enllaça als resultats complets', async (quantes, visibles) => {
      const ids = Array.from({ length: quantes }, (_, i) => `q${i + 1}`);
      const propostes = ids.map((id) => ({ id, titol: `Film ${id}`, estat: 'aprovada' }));
      mockCarrega({ socis: SOCIS_VOTACIO });
      getDocs
        .mockResolvedValueOnce(llista([{ ...TANDA_OBERTA, propostes: ids }]))
        .mockResolvedValueOnce(llista([]))
        .mockResolvedValueOnce(llista(propostes));
      render(<MemoryRouter><DashboardPage /></MemoryRouter>);
      await screen.findByRole('heading', { name: titolVotacio });
      const m = modul(titolVotacio);
      expect(m.getAllByRole('listitem')).toHaveLength(visibles);
      expect(m.getByRole('link', { name: 'Veure resultats complets' })).toHaveAttribute('href', '/tandes/t1/resultats');
    });

    it('la barra de progrés té un text de valor llegible', async () => {
      mockCarrega({ socis: SOCIS_VOTACIO });
      mockVotacio();
      render(<MemoryRouter><DashboardPage /></MemoryRouter>);
      await screen.findByRole('heading', { name: titolVotacio });
      expect(modul(titolVotacio).getByRole('progressbar', { name: 'Completats' }))
        .toHaveAttribute('aria-valuetext', '12 de 64 han completat la votació');
    });

    it('sense cap tanda oberta no mostra el bloc ni llegeix els vots', async () => {
      mockCarrega();
      mockVotacio([TANDA_TANCADA]);
      render(<MemoryRouter><DashboardPage /></MemoryRouter>);
      await screen.findByRole('heading', { name: 'Noves altes de socis' });
      await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(6));
      expect(screen.queryByText(/^Votació:/)).not.toBeInTheDocument();
      expect(collection.mock.calls.some((args) => args.includes('vots'))).toBe(false);
    });

    it('si fallen les lectures de la votació s\'omet el bloc i la resta del dashboard funciona', async () => {
      mockCarrega();
      getDocs.mockRejectedValueOnce(new Error('boom'));
      render(<MemoryRouter><DashboardPage /></MemoryRouter>);
      await screen.findByRole('heading', { name: 'Noves altes de socis' });
      await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(6));
      expect(screen.queryByText(/^Votació:/)).not.toBeInTheDocument();
      expect(screen.queryByText("No s'han pogut carregar les dades del dashboard.")).not.toBeInTheDocument();
    });

    it('si fallen els vots de la tanda oberta també s\'omet el bloc', async () => {
      mockCarrega();
      getDocs.mockResolvedValueOnce(llista([TANDA_OBERTA])).mockRejectedValueOnce(new Error('boom'));
      render(<MemoryRouter><DashboardPage /></MemoryRouter>);
      await screen.findByRole('heading', { name: 'Noves altes de socis' });
      await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(8));
      expect(screen.queryByText(/^Votació:/)).not.toBeInTheDocument();
    });
  });
});
