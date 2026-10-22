// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PantallaFinalVot from '../../src/components/propostes/PantallaFinalVot.jsx';

const PROPOSTES = [
  { id: 'p1', titol: 'Amélie', any: '2001', imatgeUrl: 'https://image.tmdb.org/t/p/w500/amelie.jpg' },
  { id: 'p2', titol: 'El padrí', any: '1972' },
  { id: 'p3', titol: 'Stalker', any: '1979', imatgeUrl: 'https://image.tmdb.org/t/p/w500/stalker.jpg' },
];
const VALORS = { p1: 'like', p2: 'dislike', p3: 'like' };
const css = readFileSync(resolve(process.cwd(), 'src/styles/components/propostes.css'), 'utf8');
const regla = (selector) => css.match(new RegExp(`${selector.replace(/[.]/g, '\\.')} \\{[^}]*\\}`))?.[0] ?? '';

function renderPantalla(props = {}) {
  return render(
    <PantallaFinalVot
      propostes={PROPOSTES}
      valors={VALORS}
      onCanviar={() => {}}
      onRevisar={() => {}}
      onVeureRanking={() => {}}
      {...props}
    />
  );
}

const cartells = () => within(screen.getByRole('list')).getAllByRole('button');

describe('PantallaFinalVot', () => {
  it('té un sol títol, «El teu resum», i ja no el titular «Has votat totes les propostes!» ni cap «Has votat X de N»', () => {
    renderPantalla();
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: 'El teu resum' })).toBeInTheDocument();
    expect(screen.queryByText(/Has votat/)).not.toBeInTheDocument();
  });

  it('no té encapçalaments de grup ni llistat de títols en text: només la graella de cartells', () => {
    renderPantalla();
    expect(screen.queryByText(/T'han agradat/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No t'han agradat/)).not.toBeInTheDocument();
    expect(screen.queryByText('2001')).not.toBeInTheDocument();
  });

  it('la graella és una llista (role="list") amb un cartell-botó per proposta, en l\'ordre rebut', () => {
    renderPantalla();
    expect(screen.getByRole('list')).toHaveAttribute('role', 'list');
    expect(cartells().map((b) => b.getAttribute('aria-label'))).toEqual([
      "Canviar el vot de Amélie (ara: m'agrada)",
      "Canviar el vot de El padrí (ara: no m'agrada)",
      "Canviar el vot de Stalker (ara: m'agrada)",
    ]);
  });

  it('clicar un cartell crida onCanviar amb l\'id de la proposta', async () => {
    const onCanviar = vi.fn();
    renderPantalla({ onCanviar });
    await userEvent.click(screen.getByRole('button', { name: "Canviar el vot de El padrí (ara: no m'agrada)" }));
    expect(onCanviar).toHaveBeenCalledTimes(1);
    expect(onCanviar).toHaveBeenCalledWith('p2');
  });

  it('cada cartell marca el seu vot: modificador like o dislike i una icona de polze', () => {
    renderPantalla();
    const [amelie, padri, stalker] = cartells();
    expect(amelie).toHaveClass('resum-vots__cartell--like');
    expect(padri).toHaveClass('resum-vots__cartell--dislike');
    expect(stalker).toHaveClass('resum-vots__cartell--like');
    for (const cartell of [amelie, padri, stalker]) expect(cartell.querySelector('svg.resum-vots__icona')).not.toBeNull();
  });

  it('mostra la imatge del cartell; sense imatge, un marcador amb el títol (sense la classe del placeholder de la llista)', () => {
    renderPantalla();
    const [amelie, padri] = cartells();
    expect(amelie.querySelector('img')).toHaveAttribute('src', 'https://image.tmdb.org/t/p/w500/amelie.jpg');
    expect(padri.querySelector('img')).toBeNull();
    const marcador = padri.querySelector('.resum-vots__placeholder');
    expect(marcador).toHaveTextContent('El padrí');
    expect(marcador).not.toHaveClass('proposta-carta__cartell-placeholder');
  });

  it('el títol del marcador es centra i es talla (line-clamp)', () => {
    expect(regla('.resum-vots__placeholder')).toMatch(/\bitems-center\b/);
    expect(regla('.resum-vots__placeholder')).toMatch(/\bjustify-center\b/);
    expect(regla('.resum-vots__placeholder')).toMatch(/\btext-center\b/);
    expect(regla('.resum-vots__placeholder-titol')).toMatch(/\bline-clamp-\d\b/);
  });

  it('els cartells tenen cursor pointer i estat hover i focus visibles', () => {
    const regles = regla('.resum-vots__cartell');
    expect(regles).toMatch(/\bcursor-pointer\b/);
    expect(regles).toMatch(/hover:/);
    expect(regles).toMatch(/focus-visible:/);
  });

  it('el text només per a lectors de pantalla va amb una classe BEM, no amb la utilitat Tailwind inline', () => {
    const { container } = renderPantalla();
    expect(container.querySelector('.sr-only')).toBeNull();
    expect(container.querySelector('.resum-vots__recompte-text')).toHaveTextContent("2 m'agrada i 1 no m'agrada");
    expect(regla('.resum-vots__recompte-text')).toMatch(/\bsr-only\b/);
  });

  it('mostra el recompte numèric dels vots', () => {
    renderPantalla();
    expect(screen.getByText('2 👍 · 1 👎')).toBeInTheDocument();
    expect(screen.getByText("2 m'agrada i 1 no m'agrada")).toBeInTheDocument();
  });

  it('les propostes sense vot no hi surten', () => {
    renderPantalla({ valors: { p1: 'like' } });
    expect(cartells()).toHaveLength(1);
  });

  it('la barra fixa de baix conté l\'avís curt, l\'enllaç «Revisar els meus vots» i el botó «Confirmar i veure el rànquing»', () => {
    renderPantalla();
    const barra = document.querySelector('.pantalla-final-vot__barra');
    const avis = within(barra).getByText('Un cop confirmat, ja no podràs canviar els vots.');
    const enllac = within(barra).getByRole('button', { name: 'Revisar els meus vots' });
    const boto = within(barra).getByRole('button', { name: 'Confirmar i veure el rànquing' });
    expect(enllac).toHaveClass('votacio__enllac');
    expect(avis.compareDocumentPosition(enllac) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(enllac.compareDocumentPosition(boto) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText(/els teus vots queden tancats/)).not.toBeInTheDocument();
  });

  it('la barra és enganxada a baix (sticky bottom-0, fons opac, marge de seguretat de pantalla)', () => {
    const r = regla('.pantalla-final-vot__barra');
    expect(r).toMatch(/\bsticky\b/);
    expect(r).toMatch(/\bbottom-0\b/);
    expect(r).toMatch(/\bbg-white\b/);
    expect(r).toMatch(/env\(safe-area-inset-bottom\)/);
  });

  it('a escriptori (md) la barra és una sola fila: avís a l\'esquerra i accions a la dreta', () => {
    expect(regla('.pantalla-final-vot__fila')).toMatch(/\bmd:flex-row\b/);
    expect(regla('.pantalla-final-vot__fila')).toMatch(/\bmd:justify-between\b/);
    expect(regla('.pantalla-final-vot__accions')).toMatch(/\bmd:flex-row\b/);
  });

  it('«Revisar els meus vots» crida onRevisar', async () => {
    const onRevisar = vi.fn();
    renderPantalla({ onRevisar });
    await userEvent.click(screen.getByRole('button', { name: 'Revisar els meus vots' }));
    expect(onRevisar).toHaveBeenCalledTimes(1);
  });

  it('«Confirmar i veure el rànquing» crida onVeureRanking (el text és el normal; les majúscules són CSS)', async () => {
    const onVeureRanking = vi.fn();
    renderPantalla({ onVeureRanking });
    const boto = screen.getByRole('button', { name: 'Confirmar i veure el rànquing' });
    expect(boto).toHaveTextContent('Confirmar i veure el rànquing');
    expect(boto).toBeEnabled();
    await userEvent.click(boto);
    expect(onVeureRanking).toHaveBeenCalledTimes(1);
  });

  it('mentre confirma, el botó es deshabilita i diu «Confirmant…»', async () => {
    const onVeureRanking = vi.fn();
    renderPantalla({ onVeureRanking, confirmant: true });
    const boto = screen.getByRole('button', { name: 'Confirmant…' });
    expect(boto).toBeDisabled();
    await userEvent.click(boto);
    expect(onVeureRanking).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Confirmar i veure el rànquing' })).not.toBeInTheDocument();
  });

  it('l\'error de confirmar es mostra dins la barra, a sobre dels botons, com a role="alert"', () => {
    renderPantalla({ error: 'No s\'ha pogut completar l\'operació. Torna-ho a provar.' });
    const barra = document.querySelector('.pantalla-final-vot__barra');
    const alerta = within(barra).getByRole('alert');
    expect(alerta).toHaveTextContent("No s'ha pogut completar l'operació. Torna-ho a provar.");
    expect(alerta.compareDocumentPosition(screen.getByRole('button', { name: 'Confirmar i veure el rànquing' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sense error no hi ha cap alerta', () => {
    renderPantalla();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ja no ofereix «Veure el rànquing» ni «Acabar»', () => {
    renderPantalla();
    expect(screen.queryByRole('button', { name: 'Veure el rànquing' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Acabar' })).not.toBeInTheDocument();
  });

  it('amb `enfocar`, el focus passa al títol del resum; sense, no es mou', () => {
    const { unmount } = renderPantalla();
    expect(screen.getByRole('heading', { level: 2 })).not.toHaveFocus();
    unmount();
    renderPantalla({ enfocar: true });
    expect(screen.getByRole('heading', { level: 2 })).toHaveFocus();
  });
});
