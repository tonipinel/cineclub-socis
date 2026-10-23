import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CartaPropostaTanda from './CartaPropostaTanda';

const PROPOSTA = {
  id: 'p1', titol: 'Stalker', nomProposant: 'Marta Puig', imatgeUrl: '/stalker.jpg',
};

const pintar = (props = {}) => render(
  <CartaPropostaTanda
    proposta={PROPOSTA}
    distribuidora={{ id: 'd1', nom: 'Surtsey Films' }}
    preu={150}
    preuPerDefecte={false}
    seleccionada={false}
    desactivada={false}
    onAlterna={() => {}}
    {...props}
  />,
);

describe('CartaPropostaTanda', () => {
  it('mostra el títol, el proposant, la distribuïdora i el preu', () => {
    const { container } = pintar();
    const carta = container.querySelector('.carta-proposta-tanda');
    expect(carta).toHaveTextContent('Stalker');
    expect(carta).toHaveTextContent('Proposat per Marta Puig');
    expect(carta).toHaveTextContent('Surtsey Films');
    expect(carta).toHaveTextContent('150.00€');
    expect(carta).not.toHaveTextContent('*');
  });

  it('marca amb * el preu per defecte de la distribuïdora', () => {
    pintar({ preuPerDefecte: true });
    expect(screen.getByText('150.00€', { exact: false }).closest('.carta-proposta-tanda__preu')).toHaveTextContent('150.00€ *');
    expect(screen.getByTitle('Preu per defecte de la distribuïdora')).toHaveTextContent('*');
  });

  it('sense distribuïdora ni preu no en mostra res', () => {
    const { container } = pintar({ distribuidora: null, preu: null });
    expect(container.querySelector('.carta-proposta-tanda__distribuidora')).toBeNull();
    expect(container.querySelector('.carta-proposta-tanda__preu')).toBeNull();
    expect(container).not.toHaveTextContent('€');
  });

  it('sense proposant no mostra «Proposat per»', () => {
    pintar({ proposta: { ...PROPOSTA, nomProposant: undefined } });
    expect(screen.queryByText(/Proposat per/)).not.toBeInTheDocument();
  });

  it('la casella té com a nom accessible el títol i reflecteix la selecció', () => {
    pintar({ seleccionada: true });
    expect(screen.getByRole('checkbox', { name: 'Stalker' })).toBeChecked();
  });

  it('mostra el cartell com a imatge decorativa (el títol ja és al text)', () => {
    const { container } = pintar();
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', '/stalker.jpg');
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('sense cartell mostra un marcador buit', () => {
    const { container } = pintar({ proposta: { ...PROPOSTA, imatgeUrl: '' } });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.carta-proposta-tanda__cartell--buit')).toBeInTheDocument();
  });

  it('crida onAlterna en clicar qualsevol punt de la targeta', async () => {
    const onAlterna = vi.fn();
    const user = userEvent.setup();
    pintar({ onAlterna });
    await user.click(screen.getByText('Proposat per Marta Puig'));
    expect(onAlterna).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('checkbox', { name: 'Stalker' }));
    expect(onAlterna).toHaveBeenCalledTimes(2);
  });

  it('desactivada: la casella queda deshabilitada i no crida onAlterna', async () => {
    const onAlterna = vi.fn();
    const user = userEvent.setup();
    const { container } = pintar({ desactivada: true, seleccionada: true, onAlterna });
    const casella = screen.getByRole('checkbox', { name: 'Stalker' });
    expect(casella).toBeDisabled();
    expect(casella).toBeChecked();
    expect(container.querySelector('.carta-proposta-tanda')).toHaveClass('carta-proposta-tanda--desactivada', 'carta-proposta-tanda--seleccionada');
    await user.click(screen.getByText('Proposat per Marta Puig'));
    expect(onAlterna).not.toHaveBeenCalled();
  });
});
