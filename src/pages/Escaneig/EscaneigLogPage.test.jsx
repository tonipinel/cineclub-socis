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

  it('té un enllaç per tornar a la pàgina d\'escaneig', async () => {
    mockSessionsIErrors([], []);
    renderPagina();
    await screen.findByText('Encara no s\'ha registrat cap incidència.');
    expect(screen.getByRole('link', { name: /Tornar a l'escaneig/ })).toHaveAttribute('href', '/escaneig');
  });
});
