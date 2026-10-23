import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  collection: vi.fn((_db, nom) => nom),
  query: vi.fn((collectionName, ...constraints) => ({ collectionName, constraints })),
  where: vi.fn((field, op, value) => ({ field, op, value })),
  orderBy: vi.fn(() => ({})),
  onSnapshot: vi.fn((q, callback) => {
    callback({
      docs: q.collectionName === 'accessLog'
        ? [
          { data: () => ({ tipus: 'soci', numeroSoci: 1 }) },
          { data: () => ({ tipus: 'generic', codiTiquet: 'T-1', preuAplicat: 0 }) },
        ]
        : [],
    });
    return () => {};
  }),
}));

import { onSnapshot } from 'firebase/firestore';
import EstadistiquesSessio from './EstadistiquesSessio';

describe('EstadistiquesSessio', () => {
  it('se subscriu a l\'accessLog i als moviments de la sessió i en pinta el resum', async () => {
    render(
      <MemoryRouter>
        <EstadistiquesSessio id="ses2" sessio={{ data: '2026-03-05', hora: '19:00' }} />
      </MemoryRouter>
    );
    const resum = within((await screen.findByText("Resum d'assistència")).closest('.session-form__bloc'));
    expect(within(resum.getByText('Socis').closest('.session-form__estadistica-fila')).getByText('1')).toBeInTheDocument();
    expect(within(resum.getByText('Total persones').closest('.session-form__estadistica-fila')).getByText('2')).toBeInTheDocument();
    const colleccions = onSnapshot.mock.calls.map(([q]) => [q.collectionName, q.constraints[0].value]);
    expect(colleccions).toEqual([['accessLog', 'ses2'], ['moviments', 'ses2']]);
    for (const titol of ['Entrades per franja horària', 'Desglossament econòmic', 'Moviments', 'Socis que han vingut', 'Aportacions']) {
      expect(screen.getByRole('heading', { level: 2, name: titol })).toBeInTheDocument();
    }
  });
});
