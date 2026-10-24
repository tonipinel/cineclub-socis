import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ResumProposta from './ResumProposta';

const DISTRIBUIDORES = [
  {
    id: 'd2', nom: 'Surtsey Films', web: 'surtseyfilms.com', contacte: 'Marta', correu: 'marta@surtsey.test', preu: 150, condicions: 'Només en dimecres',
  },
];
const PROPOSTA = { titol: 'Amélie', estat: 'aprovada', tmdbId: 5 };

function pinta(props = {}) {
  return render(
    <MemoryRouter>
      <ResumProposta
        proposta={PROPOSTA}
        proposant="Anna Vidal — núm. 7"
        tandes={[]}
        sessio={null}
        interna={{ preu: '', condicions: '', distribuidoraId: '' }}
        distribuidores={DISTRIBUIDORES}
        {...props}
      />
    </MemoryRouter>,
  );
}

const valor = (etiqueta) => screen.getByText(etiqueta, { selector: 'dt' }).nextElementSibling;

describe('ResumProposta', () => {
  it('mostra la distribuïdora (amb web i contacte), el preu i les condicions especials propis', () => {
    pinta({ interna: { preu: '350', condicions: 'Només 35mm\nProjectar abans del 30/11', distribuidoraId: 'd2' } });
    expect(screen.getByRole('link', { name: 'Surtsey Films' })).toHaveAttribute('href', '/distribuidores/d2');
    expect(screen.getByRole('link', { name: 'surtseyfilms.com' })).toHaveAttribute('href', 'https://surtseyfilms.com');
    expect(screen.getByRole('link', { name: 'marta@surtsey.test' })).toHaveAttribute('href', 'mailto:marta@surtsey.test');
    expect(valor('Preu')).toHaveTextContent('350.00€');
    expect(valor('Condicions especials')).toHaveTextContent(/Només 35mm/);
    expect(screen.getByText('Privat')).toBeInTheDocument();
  });

  it('sense preu ni condicions propis, hereta els de la distribuïdora i ho indica', () => {
    pinta({ interna: { preu: '', condicions: '', distribuidoraId: 'd2' } });
    expect(valor('Preu')).toHaveTextContent('150.00€ (per defecte de la distribuïdora)');
    expect(valor('Condicions especials')).toHaveTextContent('Només en dimecres (per defecte de la distribuïdora)');
  });

  it('amb preu o condicions propis no s\'apliquen els per defecte (inclòs un preu de 0)', () => {
    pinta({ interna: { preu: '0', condicions: 'Gratis per ser cicle escolar', distribuidoraId: 'd2' } });
    expect(valor('Preu')).toHaveTextContent(/^0\.00€$/);
    expect(valor('Condicions especials')).toHaveTextContent(/^Gratis per ser cicle escolar$/);
    expect(screen.queryByText(/per defecte de la distribuïdora/)).not.toBeInTheDocument();
  });

  it('si les dades internes no s\'han pogut llegir, ho diu en lloc de mostrar valors buits', () => {
    pinta({ interna: null });
    expect(screen.getByText("No s'han pogut carregar les dades internes.")).toBeInTheDocument();
    expect(screen.queryByText('Distribuïdora', { selector: 'dt' })).not.toBeInTheDocument();
  });

  it('mostra la tanda oberta, l\'enllaç als resultats i la sessió', () => {
    pinta({
      tandes: [{ id: 't2', nom: 'Novembre', oberta: true }],
      sessio: { id: 's5', titol: '' },
    });
    const tandes = valor('Tandes');
    expect(within(tandes).getByRole('link', { name: 'Novembre' })).toHaveAttribute('href', '/tandes/t2');
    expect(within(tandes).getByRole('link', { name: 'Resultats de Novembre' })).toHaveAttribute('href', '/tandes/t2/resultats');
    expect(tandes).toHaveTextContent('Novembre (oberta)');
    // Sense títol, l'enllaç de la sessió es diu «Sessió».
    expect(within(valor('Sessió')).getByRole('link', { name: 'Sessió' })).toHaveAttribute('href', '/sessions/s5');
  });

  it('sense comentari ni sinopsi mostra «—» i cap targeta de sinopsi', () => {
    pinta();
    expect(valor('Comentari del soci')).toHaveTextContent('—');
    expect(screen.queryByRole('heading', { name: 'Sinopsi' })).not.toBeInTheDocument();
  });

  it('mostra l\'enllaç que va deixar el soci', () => {
    pinta({ proposta: { ...PROPOSTA, enllac: 'https://exemple.test/film' } });
    expect(within(valor('Enllaç del soci')).getByRole('link')).toHaveAttribute('href', 'https://exemple.test/film');
  });

  it('sense tmdbId avisa que cal triar la pel·lícula', () => {
    pinta({ proposta: { ...PROPOSTA, tmdbId: undefined } });
    expect(screen.getByText("Encara no té pel·lícula de TMDB associada: tria'n una a la pestanya Pel·lícula.")).toBeInTheDocument();
  });
});
