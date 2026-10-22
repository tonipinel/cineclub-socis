// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import RankingTanda from '../../src/components/propostes/RankingTanda.jsx';

const propostes = [
  { id: 'a', titol: 'Alien' },
  { id: 'b', titol: 'Blade Runner' },
  { id: 'c', titol: 'Casablanca' },
];
const files = [
  { propostaId: 'b', percentatge: 80 },
  { propostaId: 'a', percentatge: 45 },
  { propostaId: 'c', percentatge: null },
];

describe('RankingTanda', () => {
  it('mostra les files en l\'ordre rebut amb posició, títol i %', () => {
    render(<RankingTanda files={files} propostes={propostes} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText('1')).toBeInTheDocument();
    expect(within(items[0]).getByText('Blade Runner')).toHaveClass('ranking-tanda__titol');
    expect(within(items[0]).getByText('80 %')).toBeInTheDocument();
    expect(within(items[1]).getByText('Alien')).toBeInTheDocument();
    expect(within(items[1]).getByText('45 %')).toBeInTheDocument();
  });

  it('percentatge null mostra «pocs vots» sense número', () => {
    render(<RankingTanda files={files} propostes={propostes} />);
    const fila = screen.getAllByRole('listitem')[2];
    expect(within(fila).getByText('pocs vots')).toBeInTheDocument();
    expect(fila.textContent).not.toMatch(/%/);
  });

  it('accepta les propostes com a mapa per id', () => {
    render(<RankingTanda files={files} propostes={Object.fromEntries(propostes.map((p) => [p.id, p]))} />);
    expect(screen.getByText('Casablanca')).toBeInTheDocument();
  });

  it('no mostra recomptes absoluts (ni «vots»)', () => {
    const { container } = render(
      <RankingTanda files={[{ propostaId: 'a', percentatge: 45, likes: 9, dislikes: 11 }]} propostes={propostes} />
    );
    expect(container.textContent).not.toMatch(/\b(9|11|20)\b/);
    expect(container.textContent).not.toMatch(/\d+\s*vots/i);
  });

  it('sense `agraiment` no mostra cap missatge d\'agraïment', () => {
    render(<RankingTanda files={files} propostes={propostes} />);
    expect(screen.queryByText(/Gràcies per participar/)).toBeNull();
  });

  it('amb agraiment="definitiu" mostra el títol «Gràcies per participar!» (h2, enfocable) i el text, i ja no «Ja no pots canviar»', () => {
    const titolRef = { current: null };
    render(<RankingTanda files={files} propostes={propostes} agraiment="definitiu" titolRef={titolRef} />);
    const titol = screen.getByRole('heading', { level: 2, name: 'Gràcies per participar!' });
    expect(titol).toHaveAttribute('tabindex', '-1');
    expect(titolRef.current).toBe(titol);
    expect(screen.getByText('Els teus vots ja són definitius i ens ajudaran a triar les properes pel·lícules del Cineclub.')).toBeInTheDocument();
    expect(screen.queryByText(/ja no pots canviar/i)).toBeNull();
  });

  it('amb agraiment="final" (tanda tancada) mostra només el text d\'agraïment del resultat final', () => {
    render(<RankingTanda files={files} propostes={propostes} agraiment="final" />);
    expect(screen.getByText('Gràcies per participar! Aquest és el resultat final de la tanda.')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('amb propostes indefinides no peta i no mostra l\'id cru', () => {
    const { container } = render(<RankingTanda files={files} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getAllByText('Proposta retirada')).toHaveLength(3);
    expect(container.textContent).not.toMatch(/\b[abc]\b/);
  });

  it('una proposta sense títol mostra «Proposta retirada», no l\'id', () => {
    render(<RankingTanda files={files} propostes={[{ id: 'a', titol: 'Alien' }, { id: 'b' }]} />);
    const items = screen.getAllByRole('listitem');
    expect(within(items[0]).getByText('Proposta retirada')).toBeInTheDocument();
    expect(within(items[1]).getByText('Alien')).toBeInTheDocument();
    expect(items[0].textContent).not.toMatch(/\bb\b/);
  });

  describe('fila amb cartell, posició, % amb barra i vot del soci', () => {
    const amb = [
      { id: 'a', titol: 'Alien', titolLocal: 'Alien, el octavo pasajero', imatgeUrl: 'https://img/a.jpg' },
      { id: 'b', titol: 'Blade Runner' },
      { id: 'c', titol: 'Casablanca', imatgeUrl: 'https://img/c.jpg' },
      { id: 'd', titol: 'Dune' },
    ];
    const filesAmb = [
      { propostaId: 'a', percentatge: 80 },
      { propostaId: 'b', percentatge: 60 },
      { propostaId: 'c', percentatge: 40 },
      { propostaId: 'd', percentatge: null },
    ];

    it('cada fila té el cartell (img decorativa, alt buit: el títol és just al costat) o un marcador sense imatge', () => {
      const { container } = render(<RankingTanda files={filesAmb} propostes={amb} />);
      const items = screen.getAllByRole('listitem');
      const img = items[0].querySelector('img');
      expect(img).toHaveAttribute('src', 'https://img/a.jpg');
      expect(img).toHaveAttribute('alt', '');
      expect(items[1].querySelector('img')).toBeNull();
      expect(items[1].querySelector('.ranking-tanda__cartell-placeholder')).not.toBeNull();
      expect(items[2].querySelector('img')).toHaveAttribute('src', 'https://img/c.jpg');
      expect(screen.queryByRole('img')).toBeNull();
      expect(container.querySelectorAll('.ranking-tanda__titol')).toHaveLength(4);
    });

    it('el text només per a lectors de pantalla va amb una classe BEM, no amb la utilitat Tailwind inline', () => {
      const { container } = render(<RankingTanda files={filesAmb} propostes={amb} valors={{ a: 'like' }} />);
      expect(container.querySelector('.sr-only')).toBeNull();
      expect(container.querySelector('.ranking-tanda__vot-text')).toHaveTextContent("El teu vot: m'agrada");
    });

    it('la posició és text real i els tres primers tenen el modificador de podi', () => {
      render(<RankingTanda files={filesAmb} propostes={amb} />);
      const items = screen.getAllByRole('listitem');
      expect(items[0].querySelector('.ranking-tanda__posicio')).toHaveTextContent('1');
      expect(items[2].querySelector('.ranking-tanda__posicio')).toHaveClass('ranking-tanda__posicio--podi');
      expect(items[3].querySelector('.ranking-tanda__posicio')).not.toHaveClass('ranking-tanda__posicio--podi');
    });

    it('mostra el títol local entre parèntesis quan n\'hi ha', () => {
      render(<RankingTanda files={filesAmb} propostes={amb} />);
      expect(screen.getByText('(Alien, el octavo pasajero)')).toBeInTheDocument();
    });

    it('el % és text i va acompanyat d\'una barra decorativa de la mateixa proporció; «pocs vots» no en té', () => {
      render(<RankingTanda files={filesAmb} propostes={amb} />);
      const items = screen.getAllByRole('listitem');
      expect(within(items[0]).getByText('80 %')).toBeInTheDocument();
      const barra = items[0].querySelector('.ranking-tanda__barra');
      expect(barra).toHaveAttribute('aria-hidden', 'true');
      expect(barra.firstChild.style.width).toBe('80%');
      expect(items[1].querySelector('.ranking-tanda__barra-ple').style.width).toBe('60%');
      expect(within(items[3]).getByText('pocs vots')).toBeInTheDocument();
      expect(items[3].querySelector('.ranking-tanda__barra')).toBeNull();
      expect(items[3].querySelector('.ranking-tanda__cartell-placeholder')).not.toBeNull();
    });

    it('amb `valors` mostra el polze del vot del soci amb nom accessible, i res si no hi ha vot', () => {
      render(<RankingTanda files={filesAmb} propostes={amb} valors={{ a: 'like', b: 'dislike', c: 'like' }} />);
      const items = screen.getAllByRole('listitem');
      const vot = (i) => items[i].querySelector('.ranking-tanda__vot');
      expect(vot(0)).toHaveClass('ranking-tanda__vot--like');
      expect(vot(0)).toHaveTextContent("El teu vot: m'agrada");
      expect(vot(0).querySelector('svg')).not.toBeNull();
      expect(vot(1)).toHaveClass('ranking-tanda__vot--dislike');
      expect(vot(1)).toHaveTextContent("El teu vot: no m'agrada");
      expect(vot(3)).toBeNull();
    });

    it('sense `valors` no mostra cap polze', () => {
      const { container } = render(<RankingTanda files={filesAmb} propostes={amb} />);
      expect(container.querySelector('.ranking-tanda__vot')).toBeNull();
      expect(container.textContent).not.toMatch(/El teu vot/);
    });
  });
});
