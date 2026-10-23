import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SelectorEntitats from './SelectorEntitats';

const ENTITATS = [
  { id: 'a', nom: "L'Ateneu Rodenc" },
  { id: 'b', nom: 'Foo' },
  { id: 'c', nom: 'Bar' },
];

function pintar(props = {}) {
  const onCanvi = vi.fn();
  const { unmount } = render(
    <SelectorEntitats etiqueta="Participen" id="publica-participa" valor={[]} entitats={ENTITATS} onCanvi={onCanvi} {...props} />,
  );
  return { onCanvi, unmount, user: userEvent.setup() };
}

const opcions = () => within(screen.getByLabelText('Participen')).getAllByRole('option').map((o) => o.textContent);

describe('SelectorEntitats', () => {
  it('afegir una entitat del desplegable crida onCanvi amb la llista i el nou nom al final', async () => {
    const { onCanvi, user } = pintar({ valor: ['Foo'] });
    expect(opcions()).toEqual(['— Tria una entitat —', "L'Ateneu Rodenc", 'Bar']);
    await user.selectOptions(screen.getByLabelText('Participen'), 'Bar');
    await user.click(screen.getByRole('button', { name: 'Afegir' }));
    expect(onCanvi).toHaveBeenCalledTimes(1);
    expect(onCanvi).toHaveBeenCalledWith(['Foo', 'Bar']);
  });

  it('les entitats seleccionades surten com a xips en l\'ordre de selecció i no són al desplegable', () => {
    pintar({ valor: ['Bar', "L'Ateneu Rodenc"] });
    const xips = within(screen.getByRole('list', { name: 'Participen seleccionades' })).getAllByRole('listitem');
    expect(xips.map((x) => x.textContent)).toEqual(['Bar', "L'Ateneu Rodenc"]);
    expect(opcions()).toEqual(['— Tria una entitat —', 'Foo']);
  });

  it('«Treure Foo» crida onCanvi sense Foo', async () => {
    const { onCanvi, user } = pintar({ valor: ['Bar', 'Foo', "L'Ateneu Rodenc"] });
    await user.click(screen.getByRole('button', { name: 'Treure Foo' }));
    expect(onCanvi).toHaveBeenCalledWith(['Bar', "L'Ateneu Rodenc"]);
  });

  it('un nom que no és al catàleg surt amb l\'avís i es conserva en afegir-ne un altre', async () => {
    const { onCanvi, user } = pintar({ valor: ['Entitat Vella'] });
    const xip = within(screen.getByRole('list', { name: 'Participen seleccionades' })).getByRole('listitem');
    expect(xip).toHaveTextContent('Entitat Vella — no és al catàleg');
    expect(screen.getByRole('button', { name: 'Treure Entitat Vella' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Participen'), 'Foo');
    await user.click(screen.getByRole('button', { name: 'Afegir' }));
    expect(onCanvi).toHaveBeenCalledWith(['Entitat Vella', 'Foo']);
  });

  it('sense cap entitat triada o sense opcions disponibles el botó «Afegir» és deshabilitat', () => {
    const { unmount } = pintar();
    expect(screen.getByRole('button', { name: 'Afegir' })).toBeDisabled();
    unmount();
    pintar({ valor: ["L'Ateneu Rodenc", 'Foo', 'Bar'] });
    expect(opcions()).toEqual(['— Tria una entitat —']);
    expect(screen.getByRole('button', { name: 'Afegir' })).toBeDisabled();
  });

  it('agrupa el control amb l\'etiqueta i lliga l\'ajuda al desplegable', () => {
    pintar({ ajuda: 'Tria-les del catàleg' });
    expect(screen.getByRole('group', { name: 'Participen' })).toBeInTheDocument();
    expect(screen.getByLabelText('Participen')).toHaveAccessibleDescription('Tria-les del catàleg');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('«cineclub» es mostra com «Cineclub Roda de Berà» del catàleg, sense avís i sense repetir-lo al desplegable', async () => {
    const { onCanvi, user } = pintar({ valor: ['cineclub'], entitats: [...ENTITATS, { id: 'd', nom: 'Cineclub Roda de Berà' }] });
    const xip = within(screen.getByRole('list', { name: 'Participen seleccionades' })).getByRole('listitem');
    expect(xip.textContent).toBe('Cineclub Roda de Berà');
    expect(opcions()).toEqual(['— Tria una entitat —', "L'Ateneu Rodenc", 'Foo', 'Bar']);
    await user.click(screen.getByRole('button', { name: 'Treure Cineclub Roda de Berà' }));
    expect(onCanvi).toHaveBeenCalledWith([]);
  });
});
