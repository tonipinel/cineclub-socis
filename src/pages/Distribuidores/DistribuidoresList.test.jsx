import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
}));

import { getDocs } from 'firebase/firestore';
import DistribuidoresList from './DistribuidoresList';

const DISTRIBUIDORES = [
  {
    id: 'd2', nom: 'Surtsey Films', web: 'surtseyfilms.com', contacte: 'Marta', correu: 'marta@surtsey.test', preu: 150,
    logo: 'https://logos.test/surtsey.png',
  },
  { id: 'd1', nom: 'Atalante', web: '', contacte: '', correu: '' },
];

describe('DistribuidoresList', () => {
  it('llista les distribuïdores per ordre alfabètic amb el web i el contacte', async () => {
    getDocs.mockResolvedValueOnce({ docs: DISTRIBUIDORES.map((d) => ({ id: d.id, data: () => d })) });
    render(<MemoryRouter><DistribuidoresList /></MemoryRouter>);
    const enllacos = await screen.findAllByRole('link', { name: /Atalante|Surtsey Films/ });
    expect(enllacos.map((a) => a.textContent)).toEqual(['Atalante', 'Surtsey Films']);
    expect(enllacos[1]).toHaveAttribute('href', '/distribuidores/d2');
    const web = screen.getByRole('link', { name: 'surtseyfilms.com' });
    expect(web).toHaveAttribute('href', 'https://surtseyfilms.com');
    expect(web).toHaveAttribute('target', '_blank');
    expect(web).toHaveAttribute('rel', 'noopener noreferrer');
    expect(web).toHaveClass('enllac', 'llista-cataleg__web');
    expect(screen.getByRole('link', { name: 'marta@surtsey.test' })).toHaveAttribute('href', 'mailto:marta@surtsey.test');
    expect(screen.getByText('Preu per defecte: 150.00€')).toBeInTheDocument();
  });

  it('cada fila té la miniatura del logo (decorativa) o un espai buit de la mateixa mida, i el nom com a enllaç', async () => {
    getDocs.mockResolvedValueOnce({ docs: DISTRIBUIDORES.map((d) => ({ id: d.id, data: () => d })) });
    const { container } = render(<MemoryRouter><DistribuidoresList /></MemoryRouter>);
    const nom = await screen.findByRole('link', { name: 'Surtsey Films' });
    const files = container.querySelectorAll('.llista-cataleg__item');
    expect(files).toHaveLength(2);
    const [atalante, surtsey] = files;
    const logo = surtsey.querySelector('img');
    expect(logo).toHaveAttribute('src', 'https://logos.test/surtsey.png');
    expect(logo).toHaveAttribute('alt', '');
    expect(logo).toHaveClass('llista-cataleg__logo');
    expect(surtsey).toContainElement(nom);
    expect(atalante.querySelector('img')).toBeNull();
    const buit = atalante.querySelector('.llista-cataleg__logo--buit');
    expect(buit).toHaveClass('llista-cataleg__logo');
    expect(buit).toHaveAttribute('data-testid', 'logo-buit');
    expect(buit).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(screen.getByRole('link', { name: 'Atalante' })).toHaveAttribute('href', '/distribuidores/d1');
  });

  it('té un botó per afegir-ne una de nova', async () => {
    getDocs.mockResolvedValueOnce({ docs: [] });
    render(<MemoryRouter><DistribuidoresList /></MemoryRouter>);
    expect(await screen.findByText('Encara no hi ha cap distribuïdora.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nova distribuïdora' })).toHaveAttribute('href', '/distribuidores/nova');
  });

  it('si la càrrega falla, mostra un avís i no el carregador', async () => {
    getDocs.mockRejectedValueOnce(new Error('permission-denied'));
    render(<MemoryRouter><DistribuidoresList /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'han pogut carregar les distribuïdores. Torna-ho a provar.");
    expect(screen.queryByText(/Carregant/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Distribuïdores');
  });

  it('un document sense nom no trenca el llistat', async () => {
    const docs = [{ id: 'x', web: 'x.test' }, ...DISTRIBUIDORES];
    getDocs.mockResolvedValueOnce({ docs: docs.map((d) => ({ id: d.id, data: () => d })) });
    render(<MemoryRouter><DistribuidoresList /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: 'Surtsey Films' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'x.test' })).toBeInTheDocument();
  });
});

describe('DistribuidoresList: layout estàndard', () => {
  it('fa servir l\'amplada de llista, un sol h1, sense enllaç de tornar i el botó amb text', async () => {
    getDocs.mockResolvedValueOnce({ docs: [] });
    const { container } = render(<MemoryRouter><DistribuidoresList /></MemoryRouter>);
    const boto = await screen.findByRole('link', { name: 'Nova distribuïdora' });
    expect(container.firstChild).toHaveClass('pagina-admin', 'pagina-admin--llista');
    const titols = screen.getAllByRole('heading', { level: 1 });
    expect(titols).toHaveLength(1);
    expect(titols[0]).toHaveTextContent('Distribuïdores');
    expect(container.querySelector('.pagina-admin__tornar')).toBeNull();
    expect(screen.queryByRole('link', { name: /←/ })).not.toBeInTheDocument();
    expect(boto).toHaveTextContent('Nova distribuïdora');
  });
});
