import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TopVotacio from './TopVotacio';

const FILES = [
  { id: 'a', href: '/sessions/sa', titol: 'Un ours dans le Jura', imatgeUrl: '/a.jpg', likes: 12, dislikes: 0, percent: 100 },
  { id: 'b', href: '/propostes/pendents/b', titol: 'My Favourite Cake', imatgeUrl: null, likes: 12, dislikes: 1, percent: 92 },
  { id: 'c', href: '/propostes/pendents/c', titol: 'Tercera', imatgeUrl: '/c.jpg', likes: 1, dislikes: 1, percent: 50 },
  { id: 'd', href: '/propostes/pendents/d', titol: 'Quarta sense vots', imatgeUrl: '/d.jpg', likes: 0, dislikes: 0, percent: null },
];

describe('TopVotacio', () => {
  it('mostra les files en l\'ordre rebut, amb títol, recomptes i percentatge com a text', () => {
    render(<MemoryRouter><TopVotacio files={FILES} /></MemoryRouter>);
    const files = screen.getAllByRole('listitem');
    expect(files.map((f) => within(f).getByRole('heading').textContent)).toEqual([
      'Un ours dans le Jura', 'My Favourite Cake', 'Tercera', 'Quarta sense vots',
    ]);
    expect(files[0]).toHaveTextContent('👍 12 · 👎 0');
    expect(files[0]).toHaveTextContent('100%');
    expect(files[1]).toHaveTextContent('👍 12 · 👎 1');
    expect(files[1]).toHaveTextContent('92%');
  });

  it('numera les files i destaca les tres primeres', () => {
    const { container } = render(<MemoryRouter><TopVotacio files={FILES} /></MemoryRouter>);
    expect([...container.querySelectorAll('.top-votacio__posicio')].map((n) => n.textContent)).toEqual(['1', '2', '3', '4']);
    FILES.forEach((_, i) => {
      const posicio = screen.getByRole('img', { name: `Posició ${i + 1}` });
      expect(posicio).toHaveTextContent(String(i + 1));
      expect(posicio.tagName).toBe('SPAN');
      expect(posicio.querySelector('img')).toBeNull();
      expect(posicio.closest('li').querySelector('img.top-votacio__cartell, .top-votacio__cartell--buit')).not.toContainElement(posicio);
    });
    const files = screen.getAllByRole('listitem');
    expect(files[0]).toHaveClass('top-votacio__fila--podi', 'top-votacio__fila--1');
    expect(files[2]).toHaveClass('top-votacio__fila--podi', 'top-votacio__fila--3');
    expect(files[3]).not.toHaveClass('top-votacio__fila--podi');
  });

  it('mostra la caràtula amb l\'URL i càrrega mandrosa, o un buit neutre si no n\'hi ha', () => {
    const { container } = render(<MemoryRouter><TopVotacio files={FILES} /></MemoryRouter>);
    const imatges = [...container.querySelectorAll('img')];
    expect(imatges.map((i) => i.getAttribute('src'))).toEqual(['/a.jpg', '/c.jpg', '/d.jpg']);
    imatges.forEach((i) => {
      expect(i).toHaveAttribute('loading', 'lazy');
      expect(i).toHaveAttribute('alt', '');
    });
    expect(within(screen.getAllByRole('listitem')[1]).getByTestId('cartell-buit')).toBeInTheDocument();
  });

  it('les files sense vots diuen «Sense vots» i la barra queda buida', () => {
    const { container } = render(<MemoryRouter><TopVotacio files={FILES} /></MemoryRouter>);
    const fila = screen.getAllByRole('listitem')[3];
    expect(fila).toHaveTextContent('Sense vots');
    expect(fila).not.toHaveTextContent('%');
    expect(fila.querySelector('.top-votacio__barra-like')).toBeNull();
    expect(container.querySelectorAll('.top-votacio__sense-vots')).toHaveLength(1);
  });

  it('la barra té amples proporcionals als vots i un equivalent de text accessible', () => {
    render(<MemoryRouter><TopVotacio files={FILES} /></MemoryRouter>);
    const fila = screen.getAllByRole('listitem')[1];
    expect(fila.querySelector('.top-votacio__barra-like').style.width).toBe(`${(12 / 13) * 100}%`);
    expect(fila.querySelector('.top-votacio__barra-dislike').style.width).toBe(`${(1 / 13) * 100}%`);
    expect(within(fila).getByText("92 % de vots a favor, 12 a favor i 1 en contra")).toHaveClass('top-votacio__text-accessible');
  });

  it('el nivell dels títols és configurable', () => {
    render(<MemoryRouter><TopVotacio files={FILES.slice(0, 1)} nivellTitol="h2" /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Un ours dans le Jura');
  });

  it('el títol és l\'enllaç de la pel·lícula i la caràtula, un segon enllaç fora del tabulador i ocult per a lectors', () => {
    const { container } = render(<MemoryRouter><TopVotacio files={FILES} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Un ours dans le Jura' })).toHaveAttribute('href', '/sessions/sa');
    expect(screen.getByRole('link', { name: 'My Favourite Cake' })).toHaveAttribute('href', '/propostes/pendents/b');
    expect(screen.getAllByRole('link')).toHaveLength(4);
    const enllacosCartell = container.querySelectorAll('.top-votacio__enllac-cartell');
    expect(enllacosCartell).toHaveLength(4);
    expect([...enllacosCartell].map((a) => a.getAttribute('href'))).toEqual(
      ['/sessions/sa', '/propostes/pendents/b', '/propostes/pendents/c', '/propostes/pendents/d'],
    );
    enllacosCartell.forEach((a) => {
      expect(a).toHaveAttribute('tabindex', '-1');
      expect(a).toHaveAttribute('aria-hidden', 'true');
    });
  });
});
