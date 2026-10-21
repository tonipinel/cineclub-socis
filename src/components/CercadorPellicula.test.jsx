import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/pellicules', () => ({ cercarPellicules: vi.fn() }));

import { cercarPellicules } from '../lib/pellicules';
import CercadorPellicula from './CercadorPellicula';

const RESULTATS = [
  { tmdbId: 1, titol: 'El odio', any: '1995', posterUrl: null },
  { tmdbId: 2, titol: 'El odio (remake)', any: '2010', posterUrl: null },
];

describe('CercadorPellicula', () => {
  beforeEach(() => {
    cercarPellicules.mockReset().mockResolvedValue(RESULTATS);
  });

  it('és un sol camp de cerca que mostra les opcions a sota mentre s\'escriu', async () => {
    const user = userEvent.setup();
    render(<CercadorPellicula token="tok" onTriar={vi.fn()} />);
    await user.type(screen.getByRole('combobox'), 'odio');
    expect(await screen.findAllByRole('option')).toHaveLength(2);
  });

  it('amb el teclat, les fletxes canvien d\'opció i Enter la tria', async () => {
    const onTriar = vi.fn();
    const user = userEvent.setup();
    render(<CercadorPellicula token="tok" onTriar={onTriar} />);
    await user.type(screen.getByRole('combobox'), 'odio');
    await screen.findAllByRole('option');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onTriar).toHaveBeenCalledWith(RESULTATS[1]);
    expect(screen.getByText('El odio (remake) (2010)')).toBeInTheDocument();
  });

  it('Enter sense resultats no envia el formulari', async () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    cercarPellicules.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<form onSubmit={onSubmit}><CercadorPellicula token="tok" onTriar={vi.fn()} /></form>);
    await user.type(screen.getByRole('combobox'), 'xx{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('"Canviar" torna al cercador i avisa que no hi ha cap pel·lícula triada', async () => {
    const onTriar = vi.fn();
    const user = userEvent.setup();
    render(<CercadorPellicula token="tok" onTriar={onTriar} />);
    await user.type(screen.getByRole('combobox'), 'odio');
    await user.click((await screen.findAllByRole('option'))[0].querySelector('button'));
    await user.click(screen.getByRole('button', { name: 'Canviar' }));
    expect(onTriar).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });
});
