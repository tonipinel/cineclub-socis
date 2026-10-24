import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, col, id) => ({ col, id })),
  getDoc: vi.fn(),
  setDoc: vi.fn().mockResolvedValue(undefined),
}));

import { getDoc, setDoc } from 'firebase/firestore';
import ConfiguracioPage from './ConfiguracioPage';

const REF = { col: 'configuracio', id: 'associacio' };
const ERROR_QUOTA = 'La quota ha de ser un número igual o superior a 0.';
const barra = () => document.querySelector('.barra-desar');
const carrega = (dades) => getDoc.mockResolvedValueOnce({ exists: () => dades !== undefined, data: () => dades });
const renderPagina = () => render(
  <MemoryRouter initialEntries={['/configuracio']}>
    <Routes>
      <Route path="/configuracio" element={<><ConfiguracioPage /><Link to="/altra">Altra pàgina</Link></>} />
      <Route path="/altra" element={<p>Una altra pàgina</p>} />
    </Routes>
  </MemoryRouter>,
);
const desar = (user) => user.click(screen.getByRole('button', { name: 'Desar' }));
const esperaDesat = async () => expect(await within(barra()).findByText('Desat ✓')).toBeInTheDocument();
// jsdom no modela `validity.badInput`: el navegador hi posa true i el valor buit quan el text no és un número («12e», «-»).
const simulaTextNoNumeric = (input, illegible) => Object.defineProperty(input, 'validity', {
  configurable: true, get: () => ({ valid: !illegible, badInput: illegible }),
});
function esperaErrorQuota(missatge = ERROR_QUOTA) {
  const camp = screen.getByLabelText('Quota anual (€)');
  expect(camp).toHaveAttribute('aria-invalid', 'true');
  expect(document.getElementById(camp.getAttribute('aria-describedby'))).toHaveTextContent(missatge);
  expect(within(barra()).getByRole('button', { name: `Quota anual: ${missatge}` })).toBeInTheDocument();
}

describe('ConfiguracioPage', () => {
  beforeEach(() => {
    getDoc.mockReset();
    setDoc.mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('mostra els valors per defecte si encara no hi ha cap configuració desada', async () => {
    carrega(undefined);
    renderPagina();
    expect(await screen.findByDisplayValue('30')).toBeInTheDocument();
  });

  it('és un formulari amb el layout de formulari, un únic h1, la barra de desar i sense botó Editar ni enllaç Tornar', async () => {
    carrega(undefined);
    const { container } = renderPagina();
    await screen.findByLabelText('Quota anual (€)');
    const form = container.querySelector('form');
    expect(form).toHaveClass('pagina-admin', 'pagina-admin--formulari', 'pagina-admin--amb-barra');
    const titols = screen.getAllByRole('heading', { level: 1 });
    expect(titols).toHaveLength(1);
    expect(titols[0]).toHaveTextContent("Configuració de l'associació");
    expect(screen.queryByRole('button', { name: 'Editar dades' })).not.toBeInTheDocument();
    expect(document.querySelector('.pagina-admin__tornar')).not.toBeInTheDocument();
    expect(barra()).toBeInTheDocument();
    expect(within(barra()).getByText('Sense canvis')).toBeInTheDocument();
  });

  it('carrega la configuració existent en camps editables directament', async () => {
    carrega({ quotaAnual: 35, numeroCompte: 'ES06 0182 8668 5602 0028 8844' });
    renderPagina();
    const camp = await screen.findByLabelText('Quota anual (€)');
    expect(camp).toHaveValue(35);
    expect(camp).not.toHaveAttribute('readonly');
    expect(screen.getByLabelText('Número de compte (IBAN)')).toHaveValue('ES06 0182 8668 5602 0028 8844');
    expect(screen.getByLabelText('Número de compte (IBAN)')).not.toHaveAttribute('readonly');
  });

  it('permet editar i desar la configuració i es queda a la pàgina', async () => {
    carrega({ quotaAnual: 30, numeroCompte: 'ES00 0000 0000 0000 0000 0000' });
    const user = userEvent.setup();
    renderPagina();
    const campQuota = await screen.findByLabelText('Quota anual (€)');
    await user.clear(campQuota);
    await user.type(campQuota, '40');
    expect(within(barra()).getByText('Hi ha canvis sense desar')).toBeInTheDocument();
    await desar(user);
    await esperaDesat();
    expect(screen.queryByText('Desat correctament.')).not.toBeInTheDocument();
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(setDoc).toHaveBeenCalledWith(REF, { quotaAnual: 40, numeroCompte: 'ES00 0000 0000 0000 0000 0000' });
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(campQuota).toHaveValue(40);
  });

  it('escriu exactament quotaAnual (número) i numeroCompte (retallat) i conserva els camps desconeguts del document', async () => {
    carrega({ quotaAnual: 35, numeroCompte: 'ES00', remitent: 'info@cineclub.test', extra: { a: 1 } });
    const user = userEvent.setup();
    renderPagina();
    await user.type(await screen.findByLabelText('Número de compte (IBAN)'), ' 1111  ');
    await desar(user);
    await esperaDesat();
    expect(setDoc).toHaveBeenCalledWith(REF, {
      quotaAnual: 35, numeroCompte: 'ES00 1111', remitent: 'info@cineclub.test', extra: { a: 1 },
    });
  });

  it('en crear-la per primera vegada, un canvi desa la quota per defecte com a número i el compte buit', async () => {
    carrega(undefined);
    const user = userEvent.setup();
    renderPagina();
    await user.type(await screen.findByLabelText('Número de compte (IBAN)'), 'ES11');
    await desar(user);
    await esperaDesat();
    expect(setDoc).toHaveBeenCalledWith(REF, { quotaAnual: 30, numeroCompte: 'ES11' });
  });

  it('accepta una quota 0 i amb decimals', async () => {
    carrega({ quotaAnual: 30, numeroCompte: '' });
    const user = userEvent.setup();
    renderPagina();
    const quota = await screen.findByLabelText('Quota anual (€)');
    await user.clear(quota);
    await user.type(quota, '0');
    await desar(user);
    await esperaDesat();
    expect(setDoc).toHaveBeenLastCalledWith(REF, { quotaAnual: 0, numeroCompte: '' });
    await user.clear(quota);
    await user.type(quota, '12.5');
    await desar(user);
    await within(barra()).findByText('Desat ✓');
    expect(setDoc).toHaveBeenLastCalledWith(REF, { quotaAnual: 12.5, numeroCompte: '' });
  });

  describe('validació de la quota', () => {
    it('una quota en blanc és un error al camp i a la barra i no escriu res (no es desa com a 0)', async () => {
      carrega({ quotaAnual: 35, numeroCompte: 'ES00' });
      const user = userEvent.setup();
      renderPagina();
      await user.clear(await screen.findByLabelText('Quota anual (€)'));
      await desar(user);
      expect(await within(barra()).findByRole('alert')).toHaveTextContent("No s'ha pogut desar");
      esperaErrorQuota();
      expect(setDoc).not.toHaveBeenCalled();
      await user.click(within(barra()).getByRole('button', { name: `Quota anual: ${ERROR_QUOTA}` }));
      expect(screen.getByLabelText('Quota anual (€)')).toHaveFocus();
    });

    it('una quota negativa és un error i no escriu res', async () => {
      carrega({ quotaAnual: 35, numeroCompte: '' });
      const user = userEvent.setup();
      renderPagina();
      const quota = await screen.findByLabelText('Quota anual (€)');
      await user.clear(quota);
      await user.type(quota, '-5');
      await desar(user);
      expect(await within(barra()).findByRole('alert')).toBeInTheDocument();
      esperaErrorQuota();
      expect(setDoc).not.toHaveBeenCalled();
    });

    it('un text que el navegador no pot llegir com a número és un error i no esborra la quota desada', async () => {
      carrega({ quotaAnual: 35, numeroCompte: '' });
      const user = userEvent.setup();
      renderPagina();
      const quota = await screen.findByLabelText('Quota anual (€)');
      simulaTextNoNumeric(quota, true);
      await user.clear(quota);
      await user.type(screen.getByLabelText('Número de compte (IBAN)'), 'ES1');
      await desar(user);
      expect(await within(barra()).findByRole('alert')).toBeInTheDocument();
      esperaErrorQuota();
      expect(setDoc).not.toHaveBeenCalled();
      // En tornar-la a editar l'error desapareix; amb un valor llegible, desa.
      simulaTextNoNumeric(quota, false);
      await user.type(quota, '45');
      expect(quota).not.toHaveAttribute('aria-invalid');
      await desar(user);
      await esperaDesat();
      expect(setDoc).toHaveBeenCalledWith(REF, { quotaAnual: 45, numeroCompte: 'ES1' });
    });

    it('descartar després d\'un error torna a la quota desada i l\'error desapareix', async () => {
      carrega({ quotaAnual: 35, numeroCompte: '' });
      const user = userEvent.setup();
      renderPagina();
      const quota = await screen.findByLabelText('Quota anual (€)');
      await user.clear(quota);
      await user.type(screen.getByLabelText('Número de compte (IBAN)'), 'ES1');
      await desar(user);
      await within(barra()).findByRole('alert');
      await user.click(screen.getByRole('button', { name: 'Descartar canvis' }));
      expect(quota).toHaveValue(35);
      expect(screen.getByLabelText('Número de compte (IBAN)')).toHaveValue('');
      expect(quota).not.toHaveAttribute('aria-invalid');
      expect(within(barra()).getByText('Sense canvis')).toBeInTheDocument();
      expect(setDoc).not.toHaveBeenCalled();
    });
  });

  it('descartar canvis restaura els valors desats sense escriure res', async () => {
    carrega({ quotaAnual: 30, numeroCompte: 'ES00' });
    const user = userEvent.setup();
    renderPagina();
    const compte = await screen.findByLabelText('Número de compte (IBAN)');
    await user.type(compte, '99');
    expect(compte).toHaveValue('ES0099');
    await user.click(screen.getByRole('button', { name: 'Descartar canvis' }));
    expect(compte).toHaveValue('ES00');
    expect(within(barra()).getByText('Sense canvis')).toBeInTheDocument();
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('desa dues vegades seguides: el segon desat parteix de la nova línia base i no repeteix el primer', async () => {
    carrega({ quotaAnual: 30, numeroCompte: 'ES00', remitent: 'info@cineclub.test' });
    const user = userEvent.setup();
    renderPagina();
    const quota = await screen.findByLabelText('Quota anual (€)');
    await user.clear(quota);
    await user.type(quota, '40');
    await desar(user);
    await esperaDesat();
    await user.type(screen.getByLabelText('Número de compte (IBAN)'), '1');
    await desar(user);
    await within(barra()).findByText('Desat ✓');
    expect(setDoc).toHaveBeenCalledTimes(2);
    expect(setDoc).toHaveBeenNthCalledWith(1, REF, { quotaAnual: 40, numeroCompte: 'ES00', remitent: 'info@cineclub.test' });
    expect(setDoc).toHaveBeenNthCalledWith(2, REF, { quotaAnual: 40, numeroCompte: 'ES001', remitent: 'info@cineclub.test' });
    // Descartar després de desar torna al darrer desat, no a l'original.
    await user.type(quota, '5');
    await user.click(screen.getByRole('button', { name: 'Descartar canvis' }));
    expect(quota).toHaveValue(40);
  });

  it('un error en escriure es mostra a la barra, no perd el que s\'ha escrit i es pot tornar a provar', async () => {
    carrega({ quotaAnual: 30, numeroCompte: '' });
    setDoc.mockRejectedValueOnce(new Error('xarxa'));
    const user = userEvent.setup();
    renderPagina();
    await user.type(await screen.findByLabelText('Número de compte (IBAN)'), 'ES1');
    await desar(user);
    expect(await within(barra()).findByRole('alert')).toHaveTextContent("No s'ha pogut desar. Torna-ho a provar.");
    expect(screen.getByLabelText('Número de compte (IBAN)')).toHaveValue('ES1');
    await desar(user);
    await esperaDesat();
    expect(setDoc).toHaveBeenCalledTimes(2);
  });

  it('amb canvis sense desar, sortir per un enllaç demana confirmació', async () => {
    carrega({ quotaAnual: 30, numeroCompte: '' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderPagina();
    await user.type(await screen.findByLabelText('Número de compte (IBAN)'), 'ES1');
    await user.click(screen.getByRole('link', { name: 'Altra pàgina' }));
    expect(confirm).toHaveBeenCalledWith('Hi ha canvis sense desar. Vols sortir igualment?');
    expect(screen.queryByText('Una altra pàgina')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Número de compte (IBAN)')).toHaveValue('ES1');
  });

  it('sense canvis, sortir per l\'enllaç no demana confirmació', async () => {
    carrega({ quotaAnual: 30, numeroCompte: '' });
    const confirm = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();
    renderPagina();
    await user.click(await screen.findByRole('link', { name: 'Altra pàgina' }));
    expect(await screen.findByText('Una altra pàgina')).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('si la càrrega inicial falla, mostra un avís i no el carregador ni la barra', async () => {
    getDoc.mockRejectedValueOnce(new Error('permission-denied'));
    renderPagina();
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'ha pogut carregar la configuració. Torna-ho a provar.");
    expect(screen.queryByText(/Carregant/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Configuració de l'associació");
    expect(barra()).not.toBeInTheDocument();
  });
});
