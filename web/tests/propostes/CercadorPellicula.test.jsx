// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../src/lib/propostes/pellicules.js', () => ({ cercarPellicules: vi.fn() }));

import { cercarPellicules } from '../../src/lib/propostes/pellicules.js';
import CercadorPellicula from '../../src/components/propostes/CercadorPellicula.jsx';

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

  it('«No s\'ha trobat…» només surt un cop la consulta s\'ha cercat (no mentre s\'espera)', async () => {
    let resol;
    cercarPellicules.mockImplementation(() => new Promise((r) => { resol = r; }));
    const user = userEvent.setup();
    render(<CercadorPellicula token="tok" onTriar={vi.fn()} />);
    await user.type(screen.getByRole('combobox'), 'xx');
    expect(screen.queryByText("No s'ha trobat cap pel·lícula amb aquest títol.")).not.toBeInTheDocument();
    await waitFor(() => expect(resol).toBeDefined());
    await act(async () => { resol([]); });
    expect(screen.getByText("No s'ha trobat cap pel·lícula amb aquest títol.")).toBeInTheDocument();
  });

  it('si la cerca falla, ho diu i «Tornar-ho a provar» la torna a fer', async () => {
    cercarPellicules.mockRejectedValueOnce(new Error('xarxa'));
    const user = userEvent.setup();
    render(<CercadorPellicula token="tok" onTriar={vi.fn()} />);
    await user.type(screen.getByRole('combobox'), 'odio');
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'ha pogut cercar. Torna-ho a provar.");
    expect(screen.queryByText('Cercant…')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tornar-ho a provar' }));
    expect(await screen.findAllByRole('option')).toHaveLength(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(cercarPellicules).toHaveBeenCalledTimes(2);
  });

  it('no es queda «Cercant…» si s\'esborra la consulta mentre la cerca encara no ha respost', async () => {
    cercarPellicules.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<CercadorPellicula token="tok" onTriar={vi.fn()} />);
    await user.type(screen.getByRole('combobox'), 'ab');
    expect(await screen.findByText('Cercant…')).toBeInTheDocument();
    await user.type(screen.getByRole('combobox'), '{Backspace}');
    await waitFor(() => expect(screen.queryByText('Cercant…')).not.toBeInTheDocument());
  });

  it('una resposta antiga que arriba tard no substitueix la de la consulta nova', async () => {
    let resolAntiga;
    cercarPellicules.mockImplementation((consulta) => (consulta === 'odi'
      ? new Promise((r) => { resolAntiga = r; })
      : Promise.resolve([RESULTATS[1]])));
    const user = userEvent.setup();
    render(<CercadorPellicula token="tok" onTriar={vi.fn()} />);
    await user.type(screen.getByRole('combobox'), 'odi');
    await waitFor(() => expect(resolAntiga).toBeDefined());
    await user.type(screen.getByRole('combobox'), 'o');
    expect(await screen.findByRole('option')).toHaveTextContent('El odio (remake) (2010)');
    await act(async () => { resolAntiga([RESULTATS[0]]); });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option')).toHaveTextContent('El odio (remake) (2010)');
    expect(screen.queryByText('Cercant…')).not.toBeInTheDocument();
  });

  it('l\'error d\'una cerca no es queda quan es canvia la consulta', async () => {
    cercarPellicules.mockRejectedValueOnce(new Error('xarxa'));
    const user = userEvent.setup();
    render(<CercadorPellicula token="tok" onTriar={vi.fn()} />);
    await user.type(screen.getByRole('combobox'), 'odio');
    await screen.findByRole('alert');
    await user.type(screen.getByRole('combobox'), '{Backspace}{Backspace}{Backspace}');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('després d\'un error, tornar a una consulta ja cercada no fa sortir «No s\'ha trobat…» abans de cercar-la', async () => {
    const user = userEvent.setup();
    render(<CercadorPellicula token="tok" onTriar={vi.fn()} />);
    await user.type(screen.getByRole('combobox'), 'odio');
    await screen.findAllByRole('option');
    cercarPellicules.mockRejectedValueOnce(new Error('xarxa'));
    await user.type(screen.getByRole('combobox'), 'x');
    await screen.findByRole('alert');
    let resol;
    cercarPellicules.mockImplementation(() => new Promise((r) => { resol = r; }));
    await user.type(screen.getByRole('combobox'), '{Backspace}');
    expect(screen.queryByText("No s'ha trobat cap pel·lícula amb aquest títol.")).not.toBeInTheDocument();
    await waitFor(() => expect(resol).toBeDefined());
    expect(screen.queryByText("No s'ha trobat cap pel·lícula amb aquest títol.")).not.toBeInTheDocument();
    await act(async () => { resol(RESULTATS); });
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('«Cercant…» i «No s\'ha trobat…» s\'anuncien (role="status")', async () => {
    let resol;
    cercarPellicules.mockImplementation(() => new Promise((r) => { resol = r; }));
    const user = userEvent.setup();
    render(<CercadorPellicula token="tok" onTriar={vi.fn()} />);
    await user.type(screen.getByRole('combobox'), 'xx');
    expect(await screen.findByRole('status')).toHaveTextContent('Cercant…');
    await act(async () => { resol([]); });
    expect(screen.getByRole('status')).toHaveTextContent("No s'ha trobat cap pel·lícula amb aquest títol.");
  });
});
