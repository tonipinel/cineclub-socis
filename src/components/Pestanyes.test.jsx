import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Pestanyes from './Pestanyes';

const pestanyes = [
  { id: 'dades', etiqueta: 'Dades' },
  { id: 'mitjans', etiqueta: 'Mitjans', avis: true },
  { id: 'entrades', etiqueta: 'Entrades' },
];

// Pare real: guarda la pestanya actual, com ho fa la fitxa.
function Pare({ inicial, onCanvi }) {
  const [actual, setActual] = useState(inicial);
  return (
    <Pestanyes
      pestanyes={pestanyes}
      actual={actual}
      etiqueta="Seccions de la sessió"
      onCanvi={(id) => {
        onCanvi(id);
        setActual(id);
      }}
    />
  );
}

function renderitzar(inicial = 'dades') {
  const onCanvi = vi.fn();
  render(<Pare inicial={inicial} onCanvi={onCanvi} />);
  return onCanvi;
}

describe('Pestanyes', () => {
  it('renderitza un tablist amb una pestanya per element i només l\'actual seleccionada', () => {
    renderitzar('mitjans');
    expect(screen.getByRole('tablist', { name: 'Seccions de la sessió' })).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(tabs[1]).toHaveAttribute('id', 'pestanya-mitjans');
    expect(tabs[1]).toHaveAttribute('aria-controls', 'panell-mitjans');
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
  });

  it('crida onCanvi en fer clic en una pestanya', async () => {
    const onCanvi = renderitzar();
    await userEvent.click(screen.getByRole('tab', { name: /Mitjans/ }));
    expect(onCanvi).toHaveBeenCalledWith('mitjans');
  });

  describe('teclat', () => {
    async function prem(inicial, tecla) {
      const onCanvi = renderitzar(inicial);
      screen.getByRole('tab', { selected: true }).focus();
      await userEvent.keyboard(tecla);
      return onCanvi;
    }

    it.each([
      ['ArrowRight', 'dades', 'mitjans'],
      ['ArrowRight', 'entrades', 'dades'],
      ['ArrowLeft', 'mitjans', 'dades'],
      ['ArrowLeft', 'dades', 'entrades'],
      ['End', 'dades', 'entrades'],
      ['Home', 'entrades', 'dades'],
    ])('%s des de %s va a %s i hi mou el focus', async (tecla, inicial, destí) => {
      const onCanvi = await prem(inicial, `{${tecla}}`);
      expect(onCanvi).toHaveBeenCalledTimes(1);
      expect(onCanvi).toHaveBeenCalledWith(destí);
      expect(document.getElementById(`pestanya-${destí}`)).toHaveFocus();
    });
  });

  it('indica amb text per a lectors de pantalla només la pestanya amb canvis', () => {
    renderitzar();
    expect(screen.getAllByText('amb canvis')).toHaveLength(1);
    expect(screen.getByRole('tab', { name: /Mitjans.*amb canvis/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Dades' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Entrades' })).toBeInTheDocument();
  });
});
