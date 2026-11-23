import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TriaSessions from './TriaSessions';

const sessio = (id, data, titol, cartell = `https://x/${id}.jpg`) => ({ id, data, titol, hora: '19:00', publica: { titol, cartell } });
const SESSIONS = [
  sessio('v1', '2020-05-01', 'Vella'),
  sessio('v2', '2021-06-01', 'Més vella'),
  sessio('p1', '2099-01-10', 'Próxima Uno'),
  sessio('p2', '2099-02-10', 'Segona propera', null),
];

const noms = () => [...document.querySelectorAll('.social-sessio__titol')].map((n) => n.textContent);
const base = { sessions: SESSIONS, triades: [], onAlterna: () => {} };

describe('TriaSessions', () => {
  it('posa les properes primer (de la més pròxima) i després les anteriors (de la més recent)', () => {
    render(<TriaSessions {...base} mode="una" />);
    expect(noms()).toEqual(['Próxima Uno', 'Segona propera', 'Més vella', 'Vella']);
    expect(screen.getByRole('heading', { name: 'Properes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Anteriors' })).toBeInTheDocument();
  });

  it('mode una: radios, marca la sessió escollida i avisa en triar-ne una', async () => {
    const user = userEvent.setup();
    const onAlterna = vi.fn();
    render(<TriaSessions {...base} mode="una" triades={['p2']} onAlterna={onAlterna} />);
    expect(screen.getByRole('radio', { name: /Segona propera$/ })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: /Vella$/ }));
    expect(onAlterna).toHaveBeenCalledWith('v1');
  });

  it('mode múltiple: caselles, només les properes i no deixa passar del màxim', () => {
    render(<TriaSessions {...base} mode="multiple" nomesProperes max={1} triades={['p1']} />);
    expect(noms()).toEqual(['Próxima Uno', 'Segona propera']);
    expect(screen.queryByRole('heading', { name: 'Anteriors' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Próxima Uno$/ })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: /Segona propera$/ })).toBeDisabled();
  });

  it('filtra pel títol o la data sense distingir majúscules ni accents', async () => {
    const user = userEvent.setup();
    render(<TriaSessions {...base} mode="una" />);
    await user.type(screen.getByRole('searchbox', { name: 'Cerca una sessió' }), 'proxima');
    expect(noms()).toEqual(['Próxima Uno']);
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), '01/06/2021');
    expect(noms()).toEqual(['Més vella']);
  });

  it('diu que no hi ha resultats', async () => {
    const user = userEvent.setup();
    render(<TriaSessions {...base} mode="una" />);
    await user.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText('Cap sessió coincideix amb la cerca.')).toBeInTheDocument();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('mostra el cartell en miniatura quan n\'hi ha, i la data amb l\'hora', () => {
    const { container } = render(<TriaSessions {...base} mode="una" />);
    expect(container.querySelector('img[src="https://x/p1.jpg"]')).not.toBeNull();
    expect(container.querySelectorAll('img')).toHaveLength(3);
    expect(screen.getAllByText('10/01/2099 · 19:00')).toHaveLength(1);
  });

  it('es pot desactivar mentre s\'exporta, però la cerca continua activa', () => {
    render(<TriaSessions {...base} mode="una" desactivat />);
    expect(screen.getAllByRole('radio').every((r) => r.disabled)).toBe(true);
    expect(screen.getByRole('searchbox')).toBeEnabled();
  });
});
