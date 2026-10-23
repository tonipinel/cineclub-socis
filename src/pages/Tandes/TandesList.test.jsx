import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
}));

import { getDocs } from 'firebase/firestore';
import TandesList from './TandesList';

const stamp = (d) => ({ toDate: () => d });
const DIA = 24 * 60 * 60 * 1000;

const TANCADA = {
  id: 't1', nom: 'Setembre', tanca: stamp(new Date('2026-09-30T20:00:00')), creada: stamp(new Date('2026-09-15')),
};
const oberta = () => ({
  id: 't2', nom: 'Novembre', tanca: stamp(new Date(Date.now() + 7 * DIA)), creada: stamp(new Date()),
});

const respon = (tandes) => getDocs.mockResolvedValueOnce({ docs: tandes.map((t) => ({ id: t.id, data: () => t })) });

describe('TandesList', () => {
  it('mostra el nom, l\'estat Oberta/Tancada i la data de tancament', async () => {
    respon([TANCADA, oberta()]);
    render(<MemoryRouter><TandesList /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: 'Setembre' })).toHaveAttribute('href', '/tandes/t1');
    expect(screen.getByRole('link', { name: 'Novembre' })).toHaveAttribute('href', '/tandes/t2');
    expect(screen.getByText('Tancada')).toBeInTheDocument();
    expect(screen.getByText('Oberta')).toBeInTheDocument();
    expect(screen.getByText(/30\/09\/2026 20:00/)).toBeInTheDocument();
  });

  it('enllaça als resultats de cada tanda', async () => {
    respon([TANCADA]);
    render(<MemoryRouter><TandesList /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: 'Resultats' })).toHaveAttribute('href', '/tandes/t1/resultats');
  });

  it('permet crear una tanda nova quan no n\'hi ha cap d\'oberta', async () => {
    respon([TANCADA]);
    render(<MemoryRouter><TandesList /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: 'Nova tanda' })).toHaveAttribute('href', '/tandes/nova');
    expect(screen.queryByText(/Ja hi ha una tanda oberta/)).not.toBeInTheDocument();
  });

  it('desactiva «Nova tanda» i avisa quan ja n\'hi ha una d\'oberta', async () => {
    respon([TANCADA, oberta()]);
    render(<MemoryRouter><TandesList /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'Nova tanda' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Nova tanda' })).not.toBeInTheDocument();
    expect(screen.getByText(/Ja hi ha una tanda oberta/)).toBeInTheDocument();
  });

  it('avisa quan encara no hi ha cap tanda', async () => {
    respon([]);
    render(<MemoryRouter><TandesList /></MemoryRouter>);
    expect(await screen.findByText('Encara no hi ha cap tanda.')).toBeInTheDocument();
  });
});

describe('TandesList: layout estàndard', () => {
  it('fa servir l\'amplada de llista, un sol h1 i el botó «Nova tanda» amb text', async () => {
    respon([TANCADA]);
    const { container } = render(<MemoryRouter><TandesList /></MemoryRouter>);
    const boto = await screen.findByRole('link', { name: 'Nova tanda' });
    expect(container.firstChild).toHaveClass('pagina-admin', 'pagina-admin--llista');
    const titols = screen.getAllByRole('heading', { level: 1 });
    expect(titols).toHaveLength(1);
    expect(titols[0]).toHaveTextContent('Tandes de votació');
    expect(boto).toHaveTextContent('Nova tanda');
  });
});
