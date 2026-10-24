import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import PaginaAdmin, { AMPLADES } from './PaginaAdmin';
import BotoAfegir from './BotoAfegir';

function pinta(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('PaginaAdmin', () => {
  it("l'arrel té la classe de l'amplada triada", () => {
    const { container } = pinta(<PaginaAdmin amplada="fitxa" titol="Sessió">x</PaginaAdmin>);
    expect(container.firstChild.className).toBe('pagina-admin pagina-admin--fitxa');
  });

  it("per defecte fa servir l'amplada de llista", () => {
    const { container } = pinta(<PaginaAdmin titol="Sessions">x</PaginaAdmin>);
    expect(container.firstChild.className).toBe('pagina-admin pagina-admin--llista');
  });

  it('renderitza un únic h1 amb el títol', () => {
    pinta(<PaginaAdmin titol="Entitats">x</PaginaAdmin>);
    const h1 = screen.getAllByRole('heading', { level: 1 });
    expect(h1).toHaveLength(1);
    expect(h1[0].textContent).toBe('Entitats');
    expect(h1[0].className).toBe('pagina-admin__titol');
  });

  it("renderitza l'enllaç de tornada amb la fletxa i l'href", () => {
    pinta(<PaginaAdmin titol="Tanda" tornar={{ to: '/x', etiqueta: 'Tandes' }}>x</PaginaAdmin>);
    const enllac = screen.getByRole('link', { name: '← Tandes' });
    expect(enllac.getAttribute('href')).toBe('/x');
    expect(enllac.className).toBe('pagina-admin__tornar');
  });

  it('sense tornar no hi ha cap enllaç', () => {
    pinta(<PaginaAdmin titol="Tandes">x</PaginaAdmin>);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renderitza les accions dins la capçalera', () => {
    pinta(<PaginaAdmin titol="Tandes" accions={<button type="button">Acció</button>}>x</PaginaAdmin>);
    const capcalera = document.querySelector('header');
    expect(capcalera.querySelector('.pagina-admin__accions').textContent).toBe('Acció');
  });

  it('renderitza els fills fora de la capçalera', () => {
    pinta(<PaginaAdmin titol="T"><p>Contingut</p></PaginaAdmin>);
    expect(screen.getByText('Contingut').closest('header')).toBeNull();
  });

  it('as="form" renderitza un form i crida onSubmit en enviar', async () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    const { container } = pinta(
      <PaginaAdmin as="form" titol="Nova" onSubmit={onSubmit}>
        <button type="submit">Desa</button>
      </PaginaAdmin>,
    );
    expect(container.firstChild.tagName).toBe('FORM');
    await userEvent.click(screen.getByRole('button', { name: 'Desa' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('sense títol no hi ha h1 ni capçalera', () => {
    const { container } = pinta(<PaginaAdmin>x</PaginaAdmin>);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(container.querySelector('header')).toBeNull();
  });

  it('ambBarra reserva l\'espai de la barra de desar amb la classe compartida', () => {
    const { container } = pinta(<PaginaAdmin amplada="fitxa" ambBarra titol="Sessió">x</PaginaAdmin>);
    expect(container.firstChild.className).toBe('pagina-admin pagina-admin--fitxa pagina-admin--amb-barra');
  });

  it('sense ambBarra no reserva espai per a la barra', () => {
    const { container } = pinta(<PaginaAdmin amplada="fitxa" ambBarra={false} titol="Sessió">x</PaginaAdmin>);
    expect(container.firstChild).not.toHaveClass('pagina-admin--amb-barra');
    expect(container.firstChild).not.toHaveAttribute('ambBarra');
  });

  it('AMPLADES té les 3 claus amb la seva classe', () => {
    expect(AMPLADES).toEqual({
      llista: 'pagina-admin--llista',
      fitxa: 'pagina-admin--fitxa',
      formulari: 'pagina-admin--formulari',
    });
  });

  it("afegeix el className del cridador sense perdre les classes BEM", () => {
    const { container } = pinta(<PaginaAdmin amplada="formulari" className="meva" titol="T">x</PaginaAdmin>);
    expect(container.firstChild.className).toBe('pagina-admin pagina-admin--formulari meva');
  });

  it("una amplada desconeguda cau a llista", () => {
    const { container } = pinta(<PaginaAdmin amplada="enorme" titol="T">x</PaginaAdmin>);
    expect(container.firstChild.className).toBe('pagina-admin pagina-admin--llista');
  });

  it('accepta un node com a títol dins el mateix h1', () => {
    pinta(<PaginaAdmin titol={<span>Nom <em>llarg</em></span>}>x</PaginaAdmin>);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toBe('Nom llarg');
    expect(h1.querySelector('em').textContent).toBe('llarg');
  });
});

describe('BotoAfegir', () => {
  it("per defecte mostra el text i la classe modificadora, amb nom accessible", () => {
    pinta(<BotoAfegir to="/entitats/nova" etiqueta="Nova entitat" />);
    const enllac = screen.getByRole('link', { name: 'Nova entitat' });
    expect(enllac.getAttribute('href')).toBe('/entitats/nova');
    expect(enllac.className).toBe('btn-icona btn-icona--text');
    expect(enllac.querySelector('.btn-icona__text').textContent).toBe('Nova entitat');
  });

  it('compacte no té ni text ni modificadora, i conserva el nom accessible', () => {
    pinta(<BotoAfegir to="/x" etiqueta="Registrar pagament" compacte />);
    const enllac = screen.getByRole('link', { name: 'Registrar pagament' });
    expect(enllac.className).toBe('btn-icona');
    expect(enllac.querySelector('.btn-icona__text')).toBeNull();
    expect(enllac.textContent).toBe('');
  });

  it('desactivat renderitza un button disabled amb el mateix nom accessible', () => {
    pinta(<BotoAfegir to="/x" etiqueta="Nova tanda" desactivat />);
    const boto = screen.getByRole('button', { name: 'Nova tanda' });
    expect(boto.disabled).toBe(true);
    expect(boto.className).toBe('btn-icona btn-icona--text');
    expect(boto.querySelector('.btn-icona__text').textContent).toBe('Nova tanda');
  });

  it('desactivat i compacte mantenen el nom sense text', () => {
    pinta(<BotoAfegir to="/x" etiqueta="Nova tanda" desactivat compacte />);
    const boto = screen.getByRole('button', { name: 'Nova tanda' });
    expect(boto.className).toBe('btn-icona');
    expect(boto.querySelector('.btn-icona__text')).toBeNull();
  });
});
