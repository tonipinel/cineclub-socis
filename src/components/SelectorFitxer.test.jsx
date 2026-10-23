import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SelectorFitxer from './SelectorFitxer';

const fitxer = (nom) => new File(['x'], nom, { type: 'image/png' });

describe('SelectorFitxer', () => {
  it("l'input té com a nom accessible l'etiqueta", () => {
    render(<SelectorFitxer id="logo" etiqueta="Pujar logo" onChange={() => {}} />);
    const input = screen.getByLabelText('Pujar logo');
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('id', 'logo');
  });

  it('mostra «Cap fitxer seleccionat» inicialment', () => {
    render(<SelectorFitxer id="logo" etiqueta="Pujar logo" onChange={() => {}} />);
    expect(screen.getByText('Cap fitxer seleccionat')).toHaveAttribute('aria-live', 'polite');
  });

  it('crida onChange un cop i mostra el nom del fitxer', async () => {
    const onChange = vi.fn();
    render(<SelectorFitxer id="logo" etiqueta="Pujar logo" onChange={onChange} />);
    await userEvent.upload(screen.getByLabelText('Pujar logo'), fitxer('logo.png'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].type).toBe('change');
    expect(screen.getByText('logo.png')).toBeInTheDocument();
  });

  it('el mateix fitxer dues vegades torna a cridar onChange', async () => {
    const onChange = vi.fn();
    render(<SelectorFitxer id="logo" etiqueta="Pujar logo" onChange={onChange} />);
    const input = screen.getByLabelText('Pujar logo');
    const f = fitxer('logo.png');
    await userEvent.upload(input, f);
    await userEvent.upload(input, f);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(input.value).toBe('');
  });

  it('amb multiple mostra el recompte de fitxers', async () => {
    render(<SelectorFitxer id="imatges" etiqueta="Pujar imatges" multiple onChange={() => {}} />);
    await userEvent.upload(screen.getByLabelText('Pujar imatges'), [fitxer('a.png'), fitxer('b.png'), fitxer('c.png')]);
    expect(screen.getByText('3 fitxers')).toBeInTheDocument();
  });

  it('deshabilitat: input deshabilitat i no crida onChange', async () => {
    const onChange = vi.fn();
    render(<SelectorFitxer id="logo" etiqueta="Pujar logo" disabled onChange={onChange} />);
    const input = screen.getByLabelText('Pujar logo');
    expect(input).toBeDisabled();
    await userEvent.upload(input, fitxer('logo.png'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Cap fitxer seleccionat')).toBeInTheDocument();
  });

  it('nomFitxer extern substitueix el text', () => {
    render(<SelectorFitxer id="logo" etiqueta="Pujar logo" nomFitxer="actual.png" onChange={() => {}} />);
    expect(screen.getByText('actual.png')).toBeInTheDocument();
  });
});
