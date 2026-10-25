import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
}));

import { onSnapshot } from 'firebase/firestore';
import EscaneigLogPage from './EscaneigLogPage';

function renderPagina() {
  return render(<MemoryRouter><EscaneigLogPage /></MemoryRouter>);
}

// L'ordre dels efectes al component subscriu primer `sessions` i després
// `escaneigErrors`: aquest helper encadena les dues respostes en aquest ordre.
function mockSessionsIErrors(sessionsDocs, errorsDocs) {
  onSnapshot
    .mockImplementationOnce((q, callback) => {
      callback({ docs: sessionsDocs });
      return () => {};
    })
    .mockImplementationOnce((q, callback) => {
      callback({ docs: errorsDocs });
      return () => {};
    });
}

const SESSIO_DOC = { id: 'sessio-1', data: () => ({ titol: 'The Artist' }) };

describe('EscaneigLogPage', () => {
  beforeEach(() => {
    onSnapshot.mockReset();
  });

  it('mostra un missatge quan encara no hi ha cap incidència', async () => {
    mockSessionsIErrors([SESSIO_DOC], []);
    renderPagina();
    expect(await screen.findByText('Encara no s\'ha registrat cap incidència.')).toBeInTheDocument();
  });

  it('mostra cada incidència amb el motiu, el codi, el mètode i la sessió', async () => {
    mockSessionsIErrors([SESSIO_DOC], [{
      id: 'err-1',
      data: () => ({
        sessionId: 'sessio-1',
        motiu: 'codi-desconegut',
        codi: 'XYZ',
        metode: 'qr',
        timestamp: { toDate: () => new Date(2026, 8, 2, 20, 15) },
      }),
    }]);
    renderPagina();
    expect(await screen.findByText('Codi no reconegut')).toBeInTheDocument();
    expect(screen.getByText('XYZ')).toBeInTheDocument();
    expect(screen.getByText('QR')).toBeInTheDocument();
    expect(screen.getByText('The Artist')).toBeInTheDocument();
  });

  it('mostra el detall quan la incidència en té', async () => {
    mockSessionsIErrors([SESSIO_DOC], [{
      id: 'err-1',
      data: () => ({
        sessionId: 'sessio-1',
        motiu: 'excepcio',
        codi: 'SOCI-7',
        metode: 'manual',
        detall: 'offline',
        timestamp: { toDate: () => new Date(2026, 8, 2, 20, 15) },
      }),
    }]);
    renderPagina();
    expect(await screen.findByText('offline')).toBeInTheDocument();
  });

  it('mostra les etiquetes dels motius de diagnòstic nous', async () => {
    const motius = ['debounce', 'lots-no-carregats', 'error-escriptura', 'timeout-escriptura', 'sense-connexio', 'pendent-enviar', 'lectura-lenta', 'sessio-canviada', 'sessio-canviada-escrit', 'abandonat', 'qr-soci-rebutjat'];
    mockSessionsIErrors([SESSIO_DOC], motius.map((motiu, i) => ({
      id: `err-${i}`,
      data: () => ({ sessionId: 'sessio-1', motiu, codi: `SOCI-${i}`, metode: 'qr', timestamp: null }),
    })));
    renderPagina();
    expect(await screen.findByText('Reescaneig dins 3 s')).toBeInTheDocument();
    expect(screen.getByText('Lots encara no carregats')).toBeInTheDocument();
    expect(screen.getByText("Error d'escriptura")).toBeInTheDocument();
    expect(screen.getByText('Escriptura sense confirmar (8 s)')).toBeInTheDocument();
    expect(screen.getByText('Sense connexió')).toBeInTheDocument();
    expect(screen.getByText("Codi pendent d'enviar")).toBeInTheDocument();
    expect(screen.getByText('Lectura lenta (reintent correcte)')).toBeInTheDocument();
    expect(screen.getByText('Sessió canviada a mig escaneig')).toBeInTheDocument();
    expect(screen.getByText('Sessió canviada (entrada ja desada)')).toBeInTheDocument();
    expect(screen.getByText('Escaneig abandonat (pantalla tancada)')).toBeInTheDocument();
    expect(screen.getByText('QR amb número de soci (no és un carnet)')).toBeInTheDocument();
  });

  it('mostra el nombre d\'intents de lectura quan n\'hi ha', async () => {
    mockSessionsIErrors([SESSIO_DOC], [{
      id: 'err-1',
      data: () => ({
        sessionId: 'sessio-1', motiu: 'lectura-lenta', codi: 'SOCI-7', metode: 'qr', online: true, ms: 6200, intents: 2, timestamp: null,
      }),
    }]);
    renderPagina();
    expect(await screen.findByText('En línia · 6200 ms · 2 intents')).toBeInTheDocument();
  });

  it('mostra els camps de diagnòstic (connexió, durada, caché, intent anterior) quan hi són', async () => {
    mockSessionsIErrors([SESSIO_DOC], [{
      id: 'err-1',
      data: () => ({
        sessionId: 'sessio-1',
        motiu: 'debounce',
        codi: 'SOCI-7',
        metode: 'qr',
        online: false,
        ms: 1250,
        desdeCache: true,
        resultatAnterior: 'registrat',
        timestamp: { toDate: () => new Date(2026, 8, 2, 20, 15) },
      }),
    }]);
    renderPagina();
    expect(await screen.findByText('Fora de línia · 1250 ms · des de la caché · anterior: registrat')).toBeInTheDocument();
  });

  it('un registre antic sense camps de diagnòstic no mostra la línia de diagnòstic', async () => {
    mockSessionsIErrors([SESSIO_DOC], [{
      id: 'err-1',
      data: () => ({
        sessionId: 'sessio-1', motiu: 'codi-desconegut', codi: 'XYZ', metode: 'qr', timestamp: null,
      }),
    }]);
    const { container } = renderPagina();
    expect(await screen.findByText('Codi no reconegut')).toBeInTheDocument();
    expect(container.querySelector('.escaneig-log__diagnostic')).toBeNull();
  });

  it('té un enllaç per tornar a la pàgina d\'escaneig', async () => {
    mockSessionsIErrors([], []);
    renderPagina();
    await screen.findByText('Encara no s\'ha registrat cap incidència.');
    const tornar = screen.getByRole('link', { name: '← Escaneig' });
    expect(tornar).toHaveAttribute('href', '/escaneig');
    expect(tornar).toHaveClass('pagina-admin__tornar');
  });

  it('usa el layout de llista amb un únic h1', async () => {
    mockSessionsIErrors([], []);
    const { container } = renderPagina();
    await screen.findByText('Encara no s\'ha registrat cap incidència.');
    expect(container.firstChild).toHaveClass('pagina-admin', 'pagina-admin--llista', 'escaneig-log');
    const titols = screen.getAllByRole('heading', { level: 1 });
    expect(titols).toHaveLength(1);
    expect(titols[0]).toHaveTextContent("Incidències d'escaneig");
  });
});
