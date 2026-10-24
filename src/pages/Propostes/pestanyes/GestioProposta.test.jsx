import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import GestioProposta from './GestioProposta';

const SOCIS = [
  { id: 's7', nom: 'Anna', cognoms: 'Vidal', numeroSoci: 7 },
  { id: 's9', nom: 'Toni', cognoms: 'Pinel', numeroSoci: 9 },
];
const DISTRIBUIDORES = [{ id: 'd1', nom: 'Atalante' }, { id: 'd2', nom: 'Surtsey Films', preu: 150, condicions: 'Només en dimecres' }];
const VALORS = {
  soci: 'Anna Vidal — núm. 7', estat: 'pendent', comentari: 'Molt bona!', preu: '', condicions: '', distribuidoraId: '',
};

function pinta(props = {}) {
  const canvia = vi.fn();
  const onEliminar = vi.fn();
  render(
    <MemoryRouter>
      <GestioProposta
        valors={VALORS}
        canvia={canvia}
        errors={{}}
        socis={SOCIS}
        distribuidores={DISTRIBUIDORES}
        internaDisponible
        onEliminar={onEliminar}
        {...props}
      />
    </MemoryRouter>,
  );
  return { canvia, onEliminar };
}

describe('GestioProposta', () => {
  it('ofereix els socis en una llista de suggeriments i els quatre estats', () => {
    pinta();
    const soci = screen.getByLabelText('Soci');
    const llista = document.getElementById(soci.getAttribute('list'));
    expect([...llista.querySelectorAll('option')].map((o) => o.value)).toEqual(['Anna Vidal — núm. 7', 'Toni Pinel — núm. 9']);
    expect(within(screen.getByLabelText('Estat')).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['Pendent', 'Aprovada', 'Rebutjada', 'Programada']);
  });

  it('cada camp avisa del canvi amb el seu nom de camp', async () => {
    const user = userEvent.setup();
    const { canvia } = pinta();
    await user.selectOptions(screen.getByLabelText('Estat'), 'aprovada');
    expect(canvia).toHaveBeenLastCalledWith('estat', 'aprovada');
    await user.type(screen.getByLabelText('Soci'), 'x');
    expect(canvia).toHaveBeenLastCalledWith('soci', 'Anna Vidal — núm. 7x');
    await user.type(screen.getByLabelText('Comentari del soci'), '!');
    expect(canvia).toHaveBeenLastCalledWith('comentari', 'Molt bona!!');
    await user.selectOptions(screen.getByLabelText('Distribuïdora'), 'd2');
    expect(canvia).toHaveBeenLastCalledWith('distribuidoraId', 'd2');
    await user.type(screen.getByLabelText('Preu (€)'), '5');
    expect(canvia).toHaveBeenLastCalledWith('preu', '5');
    await user.type(screen.getByLabelText('Condicions especials'), 'c');
    expect(canvia).toHaveBeenLastCalledWith('condicions', 'c');
  });

  it('mostra l\'error del soci al camp, enllaçat amb aria-describedby', () => {
    pinta({ errors: { soci: 'Selecciona un soci vàlid de la llista.' } });
    const soci = screen.getByLabelText('Soci');
    expect(soci).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById(soci.getAttribute('aria-describedby'))).toHaveTextContent('Selecciona un soci vàlid de la llista.');
  });

  it('la gestió interna és privada i té l\'enllaç per afegir una distribuïdora', () => {
    pinta();
    const grup = screen.getByRole('group', { name: /Gestió interna/ });
    expect(grup).toHaveTextContent('Privat');
    expect(within(grup).getByRole('link', { name: 'Afegir una distribuïdora' })).toHaveAttribute('href', '/distribuidores/nova');
  });

  it('sense dades internes llegibles, els seus camps són deshabilitats', () => {
    pinta({ internaDisponible: false });
    expect(screen.getByLabelText('Distribuïdora')).toBeDisabled();
    expect(screen.getByLabelText('Preu (€)')).toBeDisabled();
    expect(screen.getByLabelText('Condicions especials')).toBeDisabled();
    expect(screen.getByLabelText('Estat')).toBeEnabled();
  });

  it('«Eliminar proposta» és a la zona de perill i crida onEliminar; l\'error es mostra com a alerta', async () => {
    const user = userEvent.setup();
    const { onEliminar } = pinta({ errorEliminar: "No s'ha pogut eliminar. Torna-ho a provar." });
    const zona = screen.getByRole('region', { name: 'Zona de perill' });
    const boto = within(zona).getByRole('button', { name: 'Eliminar proposta' });
    expect(boto).toHaveAttribute('type', 'button');
    await user.click(boto);
    expect(onEliminar).toHaveBeenCalledTimes(1);
    expect(within(zona).getByRole('alert')).toHaveTextContent("No s'ha pogut eliminar. Torna-ho a provar.");
  });
});
