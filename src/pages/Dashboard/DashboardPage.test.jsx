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
});
