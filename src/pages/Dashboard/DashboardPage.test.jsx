import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(),
}));

import { getDocs } from 'firebase/firestore';
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
const SOLICITUDS = [{ nom: 'Joan', cognoms: 'Puig', timestamp: { toDate: () => new Date('2026-08-20') } }];

function mockCarrega(overrides = {}) {
  const dades = {
    socis: SOCIS, sessions: SESSIONS, accessLog: ACCESS_LOG, moviments: MOVIMENTS, lots: LOTS, solicituds: SOLICITUDS,
    ...overrides,
  };
  getDocs
    .mockResolvedValueOnce({ docs: dades.socis.map((d) => ({ data: () => d })) })
    .mockResolvedValueOnce({ docs: dades.sessions.map((d) => ({ id: d.id, data: () => d })) })
    .mockResolvedValueOnce({ docs: dades.accessLog.map((d) => ({ data: () => d })) })
    .mockResolvedValueOnce({ docs: dades.moviments.map((d) => ({ data: () => d })) })
    .mockResolvedValueOnce({ docs: dades.lots.map((d) => ({ data: () => d })) })
    .mockResolvedValueOnce({ docs: dades.solicituds.map((d, i) => ({ id: `sol${i}`, data: () => d })) });
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

  it('mòdul Socis: mostra el total i no mostra renovacions quan tots els socis estan vençuts', async () => {
    mockCarrega();
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Socis' });
    expect(elementModul('Socis').querySelector('.dashboard__xifra')).toHaveTextContent('2');
    expect(modul('Socis').queryByText('Renoven aviat')).not.toBeInTheDocument();
  });

  it('mòdul Socis: mostra la llista de renovacions properes quan n\'hi ha', async () => {
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
    await screen.findByRole('heading', { name: 'Socis' });
    const m = modul('Socis');
    expect(m.getByText('Renoven aviat')).toBeInTheDocument();
    expect(m.getByText(/Laia Puig/)).toBeInTheDocument();
  });

  it('mòdul Sol·licituds: mostra el comptador, les últimes 3 i l\'enllaç', async () => {
    mockCarrega();
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Sol·licituds' });
    expect(modul('Sol·licituds').getByText('Joan Puig')).toBeInTheDocument();
    expect(modul('Sol·licituds').getByRole('link', { name: 'Veure totes' })).toHaveAttribute('href', '/solicituds');
  });

  it('mòdul Sol·licituds: només mostra les últimes 3 quan n\'hi ha més', async () => {
    const moltes = Array.from({ length: 4 }, (_, i) => ({
      nom: `Soci${i}`, cognoms: 'Test', timestamp: { toDate: () => new Date(2026, 7, i + 1) },
    }));
    mockCarrega({ solicituds: moltes });
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Sol·licituds' });
    const m = modul('Sol·licituds');
    expect(m.getByText('Soci3 Test')).toBeInTheDocument();
    expect(m.queryByText('Soci0 Test')).not.toBeInTheDocument();
  });

  it('mòdul Sessions: mostra les sessions recents amb el seu balanç', async () => {
    mockCarrega();
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Sessions' });
    const m = modul('Sessions');
    expect(m.getByText('The Artist')).toBeInTheDocument();
    expect(m.getByText('100.00€')).toBeInTheDocument();
  });

  it('mòdul Tiquets: mostra els disponibles i els gastats a l\'última sessió', async () => {
    mockCarrega();
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Tiquets' });
    const m = modul('Tiquets');
    expect(m.getByText('3')).toBeInTheDocument();
    expect(m.getByText('0 gastats a l\'última sessió')).toBeInTheDocument();
  });

  it('mòdul Comptabilitat: mostra l\'excedent i el desglossament', async () => {
    mockCarrega();
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Comptabilitat' });
    const m = modul('Comptabilitat');
    expect(m.getByText('Fons total de tresoreria')).toBeInTheDocument();
    expect(m.getByText('Fons total de tresoreria').nextSibling).toHaveTextContent('60.00€');
    expect(m.getByText('Quotes socis')).toBeInTheDocument();
    expect(m.getByText('Gestió pel·lícules')).toBeInTheDocument();
    expect(m.queryByText('Aportacions')).not.toBeInTheDocument();
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
});
