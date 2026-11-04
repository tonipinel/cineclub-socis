import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(),
}));

// Recharts no dibuixa res en jsdom: els substituïm per elements que deixen veure les dades i les sèries.
vi.mock('recharts', async () => {
  const { createElement } = await import('react');
  const envolta = (props, nom) => createElement('div', { 'data-chart': nom }, props.children);
  const buit = () => null;
  return {
    ResponsiveContainer: (props) => createElement('div', { className: 'recharts-responsive-container' }, props.children),
    AreaChart: (props) => createElement('div', { 'data-testid': 'grafic-evolucio', 'data-dades': JSON.stringify(props.data) }, props.children),
    Area: (props) => createElement('span', {
      'data-testid': `linia-${props.dataKey}`, 'data-nom': props.name, 'data-guions': props.strokeDasharray, 'data-color': props.stroke, 'data-legend': props.legendType,
    }),
    BarChart: (props) => envolta(props, 'barres'),
    PieChart: (props) => envolta(props, 'sectors'),
    Bar: buit, Pie: buit, Cell: buit, XAxis: buit, YAxis: buit, CartesianGrid: buit, Tooltip: buit, Legend: buit, ReferenceLine: buit,
  };
});

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

const llista = (docs) => ({ docs: docs.map(({ id, ...d }) => ({ id, data: () => d })) });

function mockCarrega(overrides = {}) {
  const dades = {
    socis: SOCIS, sessions: SESSIONS, accessLog: ACCESS_LOG, moviments: MOVIMENTS, lots: LOTS,
    interns: [], distribuidores: [],
    ...overrides,
  };
  getDocs
    .mockResolvedValueOnce({ docs: dades.socis.map((d) => ({ data: () => d })) })
    .mockResolvedValueOnce({ docs: dades.sessions.map((d) => ({ id: d.id, data: () => d })) })
    .mockResolvedValueOnce({ docs: dades.accessLog.map((d) => ({ data: () => d })) })
    .mockResolvedValueOnce({ docs: dades.moviments.map((d, i) => ({ id: d.id ?? `m${i}`, data: () => d })) })
    .mockResolvedValueOnce({ docs: dades.lots.map((d) => ({ data: () => d })) });
  // Lectures opcionals del cost de les pel·lícules programades (propostesInternes i distribuidores).
  if (dades.lecturaCostosFalla) {
    getDocs.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(llista(dades.distribuidores));
  } else {
    getDocs.mockResolvedValueOnce(llista(dades.interns)).mockResolvedValueOnce(llista(dades.distribuidores));
  }
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

  it('l\'error de càrrega s\'anuncia i «Torna-ho a provar» torna a llegir', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getDocs.mockRejectedValue(new Error('boom'));
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'han pogut carregar les dades del dashboard.");
    getDocs.mockReset();
    getDocs.mockResolvedValue({ docs: [] });
    mockCarrega();
    fireEvent.click(screen.getByRole('button', { name: 'Torna-ho a provar' }));
    expect(await screen.findByRole('heading', { name: 'Noves altes de socis' })).toBeInTheDocument();
    vi.mocked(console.error).mockRestore();
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
    // Aportacions: 20€ dels últims 3 mesos ÷ 1 sessió amb control ja feta (s1) × 1 pel·lícula al mes.
    expect(taulaPrevisio.getAllByText('20.00€')).toHaveLength(12);
    // Cost: mitjana de les despeses de pel·lícula amb cost > 0 ((80 + 150) / 2), cada fila.
    expect(taulaPrevisio.getAllByText('-115.00€')).toHaveLength(12);
    // Sense programació futura no hi ha fila «Resta de…» ni marques de cost.
    expect(taulaPrevisio.queryByText(/^Resta de/)).not.toBeInTheDocument();
    expect(taulaPrevisio.queryByText('cost real')).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  describe('previsió amb la programació coneguda', () => {
    // Avui 2026-08-10; les pel·lícules costen de mitjana 115€ i l'aportació per sessió és 20€.
    const MOVIMENTS_PREVISIO = [
      { data: '2026-07-05', tipus: 'ingres', categoria: 'Quotes socis', total: 30 },
      { data: '2026-08-05', tipus: 'ingres', categoria: 'Aportacions', total: 20 },
      { data: '2026-06-15', tipus: 'despesa', categoria: 'Gestió pel·lícules', total: 80 },
      { data: '2026-07-15', tipus: 'despesa', categoria: 'Gestió pel·lícules', total: 150 },
    ];
    const PASSADA = { id: 's1', titol: 'The Artist', data: '2026-08-01' };
    const INTERNS = [{ id: 'p1', preu: 90 }];

    const dadesGrafic = () => JSON.parse(screen.getByTestId('grafic-evolucio').dataset.dades);
    const fila = (etiqueta) => dadesGrafic().find((f) => f.etiqueta === etiqueta);
    const valor = (etiqueta, clau) => fila(etiqueta)[clau] ?? null;
    // Sèries de previsió amb valor en un mes (la pròpia, més el punt de canvi repetit si és el cas).
    const series = (etiqueta) => Object.keys(fila(etiqueta))
      .filter((k) => k.startsWith('tresoreriaPrevista') && fila(etiqueta)[k] !== null).sort();
    const futura = (id, data) => ({ id, titol: id, data, propostaId: 'p1' });

    async function renderPrevisio(overrides) {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 7, 10));
      mockCarrega({ moviments: MOVIMENTS_PREVISIO, ...overrides });
      render(<MemoryRouter><DashboardPage /></MemoryRouter>);
      await screen.findByRole('heading', { name: 'Evolució econòmica' });
      const m = modul('Evolució econòmica');
      fireEvent.click(m.getByRole('button', { name: 'Previsió pròxims 12 mesos' }));
      return m;
    }

    afterEach(() => vi.useRealTimers());

    it('amb una sessió futura de cost conegut: marca «cost real», aplica el cost i dibuixa la sèrie verda', async () => {
      const m = await renderPrevisio({
        sessions: [PASSADA, { id: 'f1', titol: 'Futura', data: '2026-10-15', propostaId: 'p1' }],
        interns: INTERNS,
      });
      const taula = within(m.getAllByRole('table')[0]);
      const filaOctubre = taula.getByText('Octubre 2026').closest('tr');
      expect(within(filaOctubre).getByText('-90.00€')).toBeInTheDocument();
      expect(within(filaOctubre).getByText('cost real')).toBeInTheDocument();
      // Els altres mesos s'estimen amb la mitjana: sense marca.
      expect(within(taula.getByText('Novembre 2026').closest('tr')).getByText('-115.00€')).toBeInTheDocument();
      expect(taula.getAllByText('cost real')).toHaveLength(1);

      expect(screen.getByTestId('linia-tresoreriaPrevistaPrecisa')).toHaveAttribute('data-guions', '5 4');
      expect(screen.getByTestId('linia-tresoreriaPrevistaPrecisa')).toHaveAttribute('data-color', '#f97316');
      expect(screen.getByTestId('linia-tresoreriaPrevistaPrecisa')).toHaveAttribute('data-nom', 'Previst');
      expect(screen.getByTestId('linia-tresoreriaPrevista')).toHaveAttribute('data-nom', 'Estimat');
      expect(fila('Octubre 2026').tresoreriaPrevistaPrecisa).not.toBeNull();
      expect(valor('Novembre 2026', 'tresoreriaPrevista2')).not.toBeNull();
      expect(valor('Novembre 2026', 'tresoreriaPrevistaPrecisa')).toBeNull();
      // Les sèries duplicades no surten a la llegenda: una sola entrada per color.
      expect(screen.getByTestId('linia-tresoreriaPrevista2')).toHaveAttribute('data-legend', 'none');
      expect(screen.getByTestId('linia-tresoreriaPrevistaPrecisa2')).toHaveAttribute('data-legend', 'none');
      expect(screen.getByTestId('linia-tresoreriaPrevista2')).toHaveAttribute('data-guions', '5 4');
      expect(screen.getByTestId('linia-tresoreriaPrevistaPrecisa')).not.toHaveAttribute('data-legend');
    });

    it('un mes precís entre dos d\'estimats: cada valor és només a la sèrie del seu color, més el punt de canvi', async () => {
      await renderPrevisio({ sessions: [PASSADA, futura('f1', '2026-10-15')], interns: INTERNS });
      // Agost (enllaç) i Setembre: tram estimat 1. Octubre: tram precís. Novembre i següents: tram estimat 2.
      expect(series('Agost 2026')).toEqual(['tresoreriaPrevista']);
      expect(series('Setembre 2026')).toEqual(['tresoreriaPrevista', 'tresoreriaPrevistaPrecisa']);
      expect(valor('Setembre 2026', 'tresoreriaPrevistaPrecisa')).toBe(valor('Setembre 2026', 'tresoreriaPrevista'));
      expect(series('Octubre 2026')).toEqual(['tresoreriaPrevista2', 'tresoreriaPrevistaPrecisa']);
      expect(valor('Octubre 2026', 'tresoreriaPrevista2')).toBe(valor('Octubre 2026', 'tresoreriaPrevistaPrecisa'));
      expect(series('Novembre 2026')).toEqual(['tresoreriaPrevista2']);
      expect(series('Agost 2027')).toEqual(['tresoreriaPrevista2']);
    });

    it('un mes estimat entre dos de precisos: cap sèrie es reutilitza entre trams contigus', async () => {
      await renderPrevisio({
        sessions: [PASSADA, futura('f1', '2026-09-15'), futura('f2', '2026-11-15')],
        interns: INTERNS,
      });
      // Agost (estimat) -> Setembre (precís) -> Octubre (estimat) -> Novembre (precís) -> Desembre... (estimat).
      expect(series('Agost 2026')).toEqual(['tresoreriaPrevista', 'tresoreriaPrevistaPrecisa']);
      expect(series('Setembre 2026')).toEqual(['tresoreriaPrevista2', 'tresoreriaPrevistaPrecisa']);
      expect(series('Octubre 2026')).toEqual(['tresoreriaPrevista2', 'tresoreriaPrevistaPrecisa2']);
      expect(series('Novembre 2026')).toEqual(['tresoreriaPrevista', 'tresoreriaPrevistaPrecisa2']);
      expect(series('Desembre 2026')).toEqual(['tresoreriaPrevista']);
      expect(series('Agost 2027')).toEqual(['tresoreriaPrevista']);
    });

    it('un sol mes precís al final: el tram arrenca des de l\'últim mes estimat', async () => {
      await renderPrevisio({ sessions: [PASSADA, futura('f1', '2027-08-15')], interns: INTERNS });
      expect(series('Juliol 2027')).toEqual(['tresoreriaPrevista', 'tresoreriaPrevistaPrecisa']);
      expect(series('Agost 2027')).toEqual(['tresoreriaPrevistaPrecisa']);
      expect(series('Juny 2027')).toEqual(['tresoreriaPrevista']);
    });

    it('el tooltip mostra un sol valor previst per mes, el de la seva sèrie', async () => {
      await renderPrevisio({ sessions: [PASSADA, futura('f1', '2026-10-15')], interns: INTERNS });
      expect(fila('Setembre 2026').seriePropia).toBe('tresoreriaPrevista');
      expect(fila('Octubre 2026').seriePropia).toBe('tresoreriaPrevistaPrecisa');
      expect(fila('Novembre 2026').seriePropia).toBe('tresoreriaPrevista2');
    });

    it('amb la programació de la resta del mes: punt d\'enllaç, fila «Resta de…» i sèrie verda des de l\'últim punt real', async () => {
      const m = await renderPrevisio({
        sessions: [PASSADA, { id: 'f1', titol: 'Futura', data: '2026-08-20', propostaId: 'p1' }],
        interns: INTERNS,
      });
      const taula = within(m.getAllByRole('table')[0]);
      const filaResta = taula.getByText('Resta de Agost 2026').closest('tr');
      expect(within(filaResta).getByText('-90.00€')).toBeInTheDocument();
      expect(within(filaResta).getByText('cost real')).toBeInTheDocument();
      expect(within(filaResta).getByText('20.00€')).toBeInTheDocument();
      expect(within(filaResta).getByText('-70.00€')).toBeInTheDocument();

      // Tresoreria real -180€ (30 + 20 - 80 - 150) + impacte de la resta (-70) = -250€.
      expect(within(filaResta).getAllByText('-250.00€')).toHaveLength(1);
      const agost = fila('Agost 2026');
      expect(agost.tresoreriaReal).toBe(-180);
      // La línia prevista s'empalma amb la real: el punt d'agost és la tresoreria real (-180).
      expect(agost.tresoreriaPrevistaPrecisa).toBe(-180);
      // El mes següent (estimat) parteix de -250: 10 + 20 - 115 = -85 → -335, i enllaça des del punt d'agost.
      expect(agost.tresoreriaPrevista).toBe(-180);
      expect(fila('Setembre 2026').tresoreriaPrevista).toBe(-335);
      expect(within(taula.getByText('Setembre 2026').closest('tr')).getByText('-335.00€')).toBeInTheDocument();
    });

    it('un moviment datat després del mes actual no fa divergir el gràfic i la taula (mateixa base)', async () => {
      const m = await renderPrevisio({
        moviments: [...MOVIMENTS_PREVISIO, { data: '2026-09-20', tipus: 'ingres', categoria: 'Altres ingressos', total: 500 }],
        sessions: [PASSADA, futura('f1', '2026-08-20')],
        interns: INTERNS,
      });
      const taula = within(m.getAllByRole('table')[0]);
      // La base és la tresoreria real d'agost (-180), no el fons total (320).
      expect(fila('Agost 2026').tresoreriaReal).toBe(-180);
      expect(fila('Agost 2026').tresoreriaPrevistaPrecisa).toBe(-180);
      expect(within(taula.getByText('Resta de Agost 2026').closest('tr')).getByText('-250.00€')).toBeInTheDocument();
      expect(fila('Setembre 2026').tresoreriaPrevista).toBe(-335);
      expect(within(taula.getByText('Setembre 2026').closest('tr')).getByText('-335.00€')).toBeInTheDocument();
    });

    it('si fallen les lectures opcionals no hi ha error i tots els mesos s\'estimen', async () => {
      const m = await renderPrevisio({
        sessions: [PASSADA, { id: 'f1', titol: 'Futura', data: '2026-10-15', propostaId: 'p1' }],
        interns: INTERNS,
        lecturaCostosFalla: true,
      });
      const taula = within(m.getAllByRole('table')[0]);
      expect(screen.queryByText("No s'han pogut carregar les dades del dashboard.")).not.toBeInTheDocument();
      expect(taula.queryByText('cost real')).not.toBeInTheDocument();
      expect(taula.queryByText(/^Resta de/)).not.toBeInTheDocument();
      expect(within(taula.getByText('Octubre 2026').closest('tr')).getByText('-115.00€')).toBeInTheDocument();
      expect(dadesGrafic().every((f) => (f.tresoreriaPrevistaPrecisa ?? null) === null && (f.tresoreriaPrevistaPrecisa2 ?? null) === null)).toBe(true);
      expect(valor('Octubre 2026', 'tresoreriaPrevista')).not.toBeNull();
    });

    it('amb una sessió de cost desconegut el mes és «cost parcial» i es dibuixa amb l\'estimació', async () => {
      const m = await renderPrevisio({
        sessions: [PASSADA, { id: 'f1', titol: 'Futura', data: '2026-10-15' }],
      });
      const taula = within(m.getAllByRole('table')[0]);
      const filaOctubre = taula.getByText('Octubre 2026').closest('tr');
      expect(within(filaOctubre).getByText('cost parcial')).toBeInTheDocument();
      expect(within(filaOctubre).getByText('-115.00€')).toBeInTheDocument();
      expect(valor('Octubre 2026', 'tresoreriaPrevistaPrecisa')).toBeNull();
    });

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
      await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(8));
      expect(screen.queryByText(/^Votació:/)).not.toBeInTheDocument();
      expect(collection.mock.calls.some((args) => args.includes('vots'))).toBe(false);
    });

    it('si fallen les lectures de la votació s\'omet el bloc i la resta del dashboard funciona', async () => {
      mockCarrega();
      getDocs.mockRejectedValueOnce(new Error('boom'));
      render(<MemoryRouter><DashboardPage /></MemoryRouter>);
      await screen.findByRole('heading', { name: 'Noves altes de socis' });
      await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(8));
      expect(screen.queryByText(/^Votació:/)).not.toBeInTheDocument();
      expect(screen.queryByText("No s'han pogut carregar les dades del dashboard.")).not.toBeInTheDocument();
    });

    it('si fallen els vots de la tanda oberta també s\'omet el bloc', async () => {
      mockCarrega();
      getDocs.mockResolvedValueOnce(llista([TANDA_OBERTA])).mockRejectedValueOnce(new Error('boom'));
      render(<MemoryRouter><DashboardPage /></MemoryRouter>);
      await screen.findByRole('heading', { name: 'Noves altes de socis' });
      await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(10));
      expect(screen.queryByText(/^Votació:/)).not.toBeInTheDocument();
    });
  });
});
