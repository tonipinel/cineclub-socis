import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../firebase/firebase', () => ({ functions: {} }));
const crida = vi.fn();
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => crida) }));

import SincronitzarCalendari from './SincronitzarCalendari';
import {
  acceptaDialeg, cancellaDialeg, dialegConfirmacio, hiHaDialegConfirmacio, renderAmbConfirmacio, tancaDialegAmbEsc,
} from '../../test/confirmacio';

const INFORME = {
  aplicat: false,
  crear: ['Amélie (dj. 5 nov. 2026, 20:30)'],
  actualitzar: ['The Artist (dj. 12 nov. 2026, 20:30)', 'Delicatessen (dj. 19 nov. 2026, 20:30)'],
  esborrar: ['Duplicat vell (dj. 26 nov. 2026, 20:30)'],
  placeholdersConservats: ['Per decidir (dj. 3 des. 2026, 20:30)'],
  noGestionats: 4,
  sessionsOmeses: ['ses9'],
  totals: { crear: 1, actualitzar: 2, esborrar: 1, iguals: 0, placeholdersConservats: 1 },
};
const BUIT = { aplicat: false, crear: [], actualitzar: [], esborrar: [], placeholdersConservats: [], noGestionats: 0, sessionsOmeses: [], totals: { crear: 0, actualitzar: 0, esborrar: 0 } };

function obrir(onTancar = vi.fn()) {
  renderAmbConfirmacio(<SincronitzarCalendari onTancar={onTancar} />);
  return onTancar;
}

describe('SincronitzarCalendari', () => {
  beforeEach(() => {
    crida.mockReset();
  });

  it('en obrir demana l\'informe sense aplicar i és un diàleg accessible', async () => {
    crida.mockResolvedValue({ data: INFORME });
    obrir();
    expect(screen.getByRole('dialog', { name: 'Sincronitzar el calendari' })).toHaveAttribute('aria-modal', 'true');
    await screen.findByText(/1 per crear/);
    expect(crida).toHaveBeenCalledTimes(1);
    expect(crida).toHaveBeenCalledWith({ aplicar: false });
  });

  it('mostra els comptadors i les llistes amb l\'avís d\'esborrar', async () => {
    crida.mockResolvedValue({ data: INFORME });
    obrir();
    expect(await screen.findByText('1 per crear · 2 per actualitzar · 1 per esborrar · 1 placeholders de Hugo conservats · 4 no gestionats · 1 sessions omeses')).toBeInTheDocument();
    expect(screen.getByText('Amélie (dj. 5 nov. 2026, 20:30)')).toBeInTheDocument();
    expect(screen.getByText('Delicatessen (dj. 19 nov. 2026, 20:30)')).toBeInTheDocument();
    expect(screen.getByText('Duplicat vell (dj. 26 nov. 2026, 20:30)')).toBeInTheDocument();
    expect(screen.getByText('Per decidir (dj. 3 des. 2026, 20:30)')).toBeInTheDocument();
    expect(screen.getByText('Revisa-ho: s\'esborraran d\'aquest calendari')).toBeInTheDocument();
  });

  it('«Aplicar els canvis» està desactivat si no hi ha res per fer', async () => {
    crida.mockResolvedValue({ data: BUIT });
    obrir();
    expect(await screen.findByText('Tot sincronitzat')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aplicar els canvis' })).toBeDisabled();
  });

  it('confirmar aplica una sola vegada encara que es faci doble clic, i després torna a demanar l\'informe', async () => {
    const user = userEvent.setup();
    let resoldre;
    crida
      .mockResolvedValueOnce({ data: INFORME })
      .mockImplementationOnce(() => new Promise((r) => { resoldre = r; }))
      .mockResolvedValueOnce({ data: BUIT });
    obrir();
    const boto = await screen.findByRole('button', { name: 'Aplicar els canvis' });
    await user.dblClick(boto);
    const confirmacio = await dialegConfirmacio();
    expect(document.querySelectorAll('dialog.dialeg-confirmacio')).toHaveLength(1);
    expect(confirmacio).toHaveAttribute('role', 'alertdialog');
    expect(confirmacio).toHaveTextContent('Segur que vols aplicar-ho al calendari de Google? Es crearan 1, s\'actualitzaran 2 i s\'esborraran 1 esdeveniments.');
    expect(crida).toHaveBeenCalledTimes(1);
    await acceptaDialeg('Aplica');
    expect(await screen.findByRole('button', { name: 'Aplicant…' })).toBeDisabled();
    // El segon clic no ha deixat cap altra confirmació a la cua.
    expect(hiHaDialegConfirmacio()).toBe(false);
    expect(crida.mock.calls.filter(([a]) => a.aplicar === true)).toHaveLength(1);
    resoldre({ data: { ...INFORME, aplicat: true } });
    expect(await screen.findByText('Tot sincronitzat')).toBeInTheDocument();
    expect(crida).toHaveBeenCalledTimes(3);
    expect(crida).toHaveBeenNthCalledWith(2, { aplicar: true });
    expect(crida).toHaveBeenNthCalledWith(3, { aplicar: false });
    expect(screen.getByText(/s'han creat 1, actualitzat 2 i esborrat 1/)).toBeInTheDocument();
  });

  it.each([
    ['Cancel·lar', (user) => cancellaDialeg(user)],
    ['ESC', (user) => tancaDialegAmbEsc(user)],
  ])('tancar la confirmació amb %s no crida res ni tanca el panell', async (_nom, tanca) => {
    const user = userEvent.setup();
    crida.mockResolvedValue({ data: INFORME });
    const onTancar = obrir();
    const boto = await screen.findByRole('button', { name: 'Aplicar els canvis' });
    await user.click(boto);
    await tanca(user);
    await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
    expect(crida).toHaveBeenCalledTimes(1);
    expect(crida).not.toHaveBeenCalledWith({ aplicar: true });
    expect(onTancar).not.toHaveBeenCalled();
    expect(boto).toHaveFocus();
    expect(boto).toBeEnabled();
  });

  it('amb la confirmació oberta, Tab es queda dins de la confirmació', async () => {
    const user = userEvent.setup();
    crida.mockResolvedValue({ data: INFORME });
    obrir();
    await user.click(await screen.findByRole('button', { name: 'Aplicar els canvis' }));
    const confirmacio = await dialegConfirmacio();
    await user.tab();
    expect(confirmacio).toContainElement(document.activeElement);
    await user.tab();
    expect(confirmacio).toContainElement(document.activeElement);
    expect(crida).toHaveBeenCalledTimes(1);
  });

  it('un error en carregar mostra l\'avís en català i «Tornar a provar» ho reintenta', async () => {
    crida.mockRejectedValueOnce({ code: 'functions/permission-denied' }).mockResolvedValueOnce({ data: INFORME });
    obrir();
    expect(await screen.findByRole('alert')).toHaveTextContent('No tens permís per sincronitzar el calendari.');
    await userEvent.click(screen.getByRole('button', { name: 'Tornar a provar' }));
    expect(await screen.findByText(/1 per crear/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un error en aplicar mostra l\'error i «Tornar a provar» torna a demanar l\'informe', async () => {
    crida
      .mockResolvedValueOnce({ data: INFORME })
      .mockRejectedValueOnce({ code: 'functions/internal' })
      .mockResolvedValueOnce({ data: INFORME });
    obrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Aplicar els canvis' }));
    await acceptaDialeg('Aplica');
    expect(await screen.findByRole('alert')).toHaveTextContent('No s\'ha pogut sincronitzar el calendari. Torna-ho a provar.');
    await userEvent.click(screen.getByRole('button', { name: 'Tornar a provar' }));
    await waitFor(() => expect(crida).toHaveBeenCalledTimes(3));
    expect(crida).toHaveBeenLastCalledWith({ aplicar: false });
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('Escape i el botó Tancar tanquen el panell', async () => {
    crida.mockResolvedValue({ data: INFORME });
    const onTancar = obrir();
    await screen.findByText(/1 per crear/);
    await userEvent.keyboard('{Escape}');
    expect(onTancar).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Tancar el diàleg' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tancar' }));
    expect(onTancar).toHaveBeenCalledTimes(3);
  });

  it('el missatge final surt de la resposta d\'aplicar, no de l\'informe previ', async () => {
    crida
      .mockResolvedValueOnce({ data: INFORME })
      .mockResolvedValueOnce({ data: { aplicat: true, totals: { crear: 7, actualitzar: 5, esborrar: 3 } } })
      .mockResolvedValueOnce({ data: BUIT });
    obrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Aplicar els canvis' }));
    await acceptaDialeg('Aplica');
    expect(await screen.findByText('Fet: s\'han creat 7, actualitzat 5 i esborrat 3 esdeveniments.')).toBeInTheDocument();
  });

  it('si la resposta d\'aplicar no té totals, usa un text genèric sense xifres', async () => {
    crida
      .mockResolvedValueOnce({ data: INFORME })
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({ data: BUIT });
    obrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Aplicar els canvis' }));
    await acceptaDialeg('Aplica');
    expect(await screen.findByText('Els canvis s\'han aplicat al calendari.')).toBeInTheDocument();
  });

  it('avisa quan una llista està retallada', async () => {
    crida.mockResolvedValue({ data: { ...INFORME, totals: { ...INFORME.totals, crear: 450 } } });
    obrir();
    expect(await screen.findByText('Es mostren només els primers 1.')).toBeInTheDocument();
  });

  it('mentre s\'aplica no es pot tancar (Escape, botons) i es pot tancar en acabar', async () => {
    let resoldre;
    crida
      .mockResolvedValueOnce({ data: INFORME })
      .mockImplementationOnce(() => new Promise((r) => { resoldre = r; }))
      .mockResolvedValueOnce({ data: BUIT });
    const onTancar = obrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Aplicar els canvis' }));
    await acceptaDialeg('Aplica');
    expect(await screen.findByText(/S'està aplicant, no tanquis/)).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(onTancar).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Tancar el diàleg' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Tancar' })).toBeDisabled();
    await act(async () => { resoldre({ data: { aplicat: true, totals: { crear: 1, actualitzar: 2, esborrar: 1 } } }); });
    await screen.findByText('Tot sincronitzat');
    await userEvent.keyboard('{Escape}');
    expect(onTancar).toHaveBeenCalledTimes(1);
  });

  it('si es reobre amb una aplicació en curs, «Aplicar» continua bloquejat fins que acaba', async () => {
    let resoldre;
    crida
      .mockResolvedValueOnce({ data: INFORME })
      .mockImplementationOnce(() => new Promise((r) => { resoldre = r; }))
      .mockResolvedValue({ data: INFORME });
    const { unmount } = renderAmbConfirmacio(<SincronitzarCalendari onTancar={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Aplicar els canvis' }));
    await acceptaDialeg('Aplica');
    unmount();
    renderAmbConfirmacio(<SincronitzarCalendari onTancar={vi.fn()} />);
    await screen.findByText(/1 per crear/);
    expect(screen.getByRole('button', { name: 'Aplicant…' })).toBeDisabled();
    crida.mockResolvedValue({ data: BUIT });
    await act(async () => { resoldre({ data: {} }); });
    expect(await screen.findByText('Tot sincronitzat')).toBeInTheDocument();
  });

  it('si falla el recàrrec després d\'aplicar bé, ho diu i conserva el resultat', async () => {
    crida
      .mockResolvedValueOnce({ data: INFORME })
      .mockResolvedValueOnce({ data: { aplicat: true, totals: { crear: 1, actualitzar: 2, esborrar: 1 } } })
      .mockRejectedValueOnce({ code: 'functions/internal' });
    obrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Aplicar els canvis' }));
    await acceptaDialeg('Aplica');
    expect(await screen.findByRole('alert')).toHaveTextContent('Els canvis s\'han aplicat, però no s\'ha pogut recarregar l\'informe.');
    expect(screen.getByText(/Fet: s'han creat 1/)).toBeInTheDocument();
  });

  it('ignora la resposta antiga si es tanca i es reobre amb la primera crida pendent', async () => {
    let resoldreVella;
    crida
      .mockImplementationOnce(() => new Promise((r) => { resoldreVella = r; }))
      .mockResolvedValueOnce({ data: BUIT });
    const { unmount } = renderAmbConfirmacio(<SincronitzarCalendari onTancar={vi.fn()} />);
    unmount();
    renderAmbConfirmacio(<SincronitzarCalendari onTancar={vi.fn()} />);
    await screen.findByText('Tot sincronitzat');
    await act(async () => { resoldreVella({ data: INFORME }); });
    expect(screen.getByText('Tot sincronitzat')).toBeInTheDocument();
    expect(screen.queryByText(/1 per crear/)).not.toBeInTheDocument();
  });

  it('retorna el focus al botó que l\'ha obert i el Tab no surt del diàleg', async () => {
    crida.mockResolvedValue({ data: INFORME });
    const boto = document.createElement('button');
    document.body.appendChild(boto);
    boto.focus();
    const { unmount } = renderAmbConfirmacio(<SincronitzarCalendari onTancar={vi.fn()} />);
    await screen.findByText(/1 per crear/);
    const dialeg = screen.getByRole('dialog');
    screen.getByRole('button', { name: 'Aplicar els canvis' }).focus();
    await userEvent.tab();
    expect(dialeg).toContainElement(document.activeElement);
    unmount();
    expect(boto).toHaveFocus();
    boto.remove();
  });
});
