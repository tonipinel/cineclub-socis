import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
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

import { getDocs, onSnapshot } from 'firebase/firestore';
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

describe('EstadistiquesSessio: errors de càrrega', () => {
  it('si falla un oient, no pinta xifres a zero: ho diu i «Torna-ho a provar» es torna a subscriure', async () => {
    const errorConsola = vi.spyOn(console, 'error').mockImplementation(() => {});
    onSnapshot.mockImplementationOnce((q, _cb, onError) => { onError(new Error('permission-denied')); return () => {}; });
    render(
      <MemoryRouter>
        <EstadistiquesSessio id="ses2" sessio={{ data: '2026-03-05', hora: '19:00' }} />
      </MemoryRouter>
    );
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'han pogut carregar les estadístiques de la sessió.");
    expect(screen.queryByText("Resum d'assistència")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Torna-ho a provar' }));
    expect(await screen.findByText("Resum d'assistència")).toBeInTheDocument();
    errorConsola.mockRestore();
  });

  it('si falla una lectura secundària (socis o sessió anterior), es registra i la pestanya es mostra igualment', async () => {
    const errorConsola = vi.spyOn(console, 'error').mockImplementation(() => {});
    getDocs.mockRejectedValueOnce(new Error('unavailable')).mockRejectedValueOnce(new Error('unavailable'));
    render(
      <MemoryRouter>
        <EstadistiquesSessio id="ses2" sessio={{ data: '2026-03-05', hora: '19:00' }} />
      </MemoryRouter>
    );
    expect(await screen.findByText("Resum d'assistència")).toBeInTheDocument();
    await vi.waitFor(() => expect(errorConsola).toHaveBeenCalledTimes(2));
    errorConsola.mockRestore();
  });
});
