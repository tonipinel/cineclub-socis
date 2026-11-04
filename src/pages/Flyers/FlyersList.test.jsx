import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((db, nom) => nom),
  getDocs: vi.fn(),
}));

import { getDocs } from 'firebase/firestore';
import FlyersList from './FlyersList';

const resposta = (llista) => ({ docs: llista.map(({ id, ...d }) => ({ id, data: () => d })) });

const SESSIO = {
  id: 's1', data: '2026-11-10', hora: '20:00', titol: 'Film A', publicada: true, publica: { versioTipus: 'VOSC' },
};
const BASE_S1 = { data: '2026-11-10', hora: '20:00', titol: 'Film A', versioTipus: 'VOSC', publicada: true };

const FLYERS = [
  {
    id: 'f1', nom: 'Novembre', desde: '2026-11-01', fins: '2026-11-30', estat: 'publicat', sessionsIds: ['s1'], base: { s1: BASE_S1 },
  },
  {
    id: 'f2', nom: 'Desembre', desde: '2026-12-01', fins: '2026-12-31', estat: 'esborrany', sessionsIds: ['s1'], base: { s1: { ...BASE_S1, hora: '19:00' } },
  },
];

const carrega = (flyers, sessions = [SESSIO]) => {
  getDocs.mockImplementation(async (col) => resposta(col === 'flyers' ? flyers : sessions));
};

describe('FlyersList', () => {
  it('mostra nom, rang de dates i estat, amb enllaç a l\'edició', async () => {
    carrega(FLYERS);
    render(<MemoryRouter><FlyersList /></MemoryRouter>);
    const enllac = await screen.findByRole('link', { name: 'Novembre' });
    expect(enllac).toHaveAttribute('href', '/flyers/f1');
    expect(screen.getByText('Publicat')).toBeInTheDocument();
    expect(screen.getByText('Esborrany')).toBeInTheDocument();
    expect(screen.getByText('01/11/2026 – 30/11/2026')).toBeInTheDocument();
  });

  it('marca «Desactualitzat» només els flyers amb canvis respecte a la base', async () => {
    carrega(FLYERS);
    render(<MemoryRouter><FlyersList /></MemoryRouter>);
    await screen.findByRole('link', { name: 'Desembre' });
    expect(screen.getAllByText('Desactualitzat')).toHaveLength(1);
    const fila = screen.getByRole('link', { name: 'Desembre' }).closest('li');
    expect(fila).toHaveTextContent('Desactualitzat');
  });

  it('botó «Nou flyer» cap a la creació', async () => {
    carrega(FLYERS);
    render(<MemoryRouter><FlyersList /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: 'Nou flyer' })).toHaveAttribute('href', '/flyers/nou');
  });

  it('buit: avisa i ofereix crear-ne un', async () => {
    carrega([]);
    render(<MemoryRouter><FlyersList /></MemoryRouter>);
    expect(await screen.findByText('Encara no hi ha cap flyer.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nou flyer' })).toBeInTheDocument();
  });

  it('error de càrrega: avís i «Torna-ho a provar» torna a llegir', async () => {
    const errorConsola = vi.spyOn(console, 'error').mockImplementation(() => {});
    getDocs.mockRejectedValue(new Error('unavailable'));
    render(<MemoryRouter><FlyersList /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'han pogut carregar els flyers.");
    carrega([]);
    fireEvent.click(screen.getByRole('button', { name: 'Torna-ho a provar' }));
    expect(await screen.findByText('Encara no hi ha cap flyer.')).toBeInTheDocument();
    errorConsola.mockRestore();
  });
});
