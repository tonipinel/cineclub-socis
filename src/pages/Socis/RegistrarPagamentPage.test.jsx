import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
// Registrar un pagament ara és una runTransaction (abans un writeBatch): rellegeix el soci i, si encara no té número,
// el reserva al comptador configuracio/socis. Les escriptures es registren a txSet/txUpdate i `txCommit` fa de
// confirmació; les comprovacions d'abans sobre el batch es fan sobre aquestes. Dins la transacció, `txGet` retorna el
// que hi hagi a `docsTransaccio` (clau = darrer argument de doc(): 'socis' és el comptador configuracio/socis, '1' el
// soci) i, si no hi és, el mateix soci que la pàgina ha carregat amb el primer getDoc.
vi.mock('firebase/firestore', () => {
  const getDoc = vi.fn();
  const docsTransaccio = new Map();
  const txGet = vi.fn(async (ref) => {
    if (docsTransaccio.has(ref)) {
      const dades = docsTransaccio.get(ref);
      return { exists: () => dades !== undefined, data: () => (dades === undefined ? undefined : { ...dades }) };
    }
    if (ref === '1') return getDoc.mock.results[0].value;
    return { exists: () => false, data: () => undefined };
  });
  const txSet = vi.fn();
  const txUpdate = vi.fn();
  const txCommit = vi.fn().mockResolvedValue(undefined);
  const runTransaction = vi.fn(async (_db, fn) => {
    const pendents = [];
    const tx = {
      get: txGet,
      set: (ref, dades) => { txSet(ref, dades); return tx; },
      update: (ref, dades) => { txUpdate(ref, dades); pendents.push([ref, dades]); return tx; },
    };
    const resultat = await fn(tx);
    await txCommit();
    pendents.forEach(([ref, dades]) => {
      if (docsTransaccio.has(ref)) docsTransaccio.set(ref, { ...docsTransaccio.get(ref), ...dades });
    });
    return resultat;
  });
  return {
    getDoc,
    getDocs: vi.fn().mockResolvedValue({ docs: [] }),
    collection: vi.fn((_, nom) => nom),
    doc: vi.fn((...args) => args[args.length - 1]),
    query: vi.fn((collectionName, ...constraints) => ({ collectionName, constraints })),
    where: vi.fn((field, op, value) => ({ field, op, value })),
    runTransaction,
    __docsTransaccio: docsTransaccio,
    __txGet: txGet,
    __txSet: txSet,
    __txUpdate: txUpdate,
    __txCommit: txCommit,
  };
});

// Espia sobre l'helper real: el comportament no canvia, però es pot comprovar què rep.
vi.mock('../../lib/propostes', async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, sincronitzarSociPublic: vi.fn(original.sincronitzarSociPublic) };
});

import {
  getDoc, getDocs, runTransaction, __docsTransaccio, __txGet, __txSet, __txUpdate, __txCommit,
} from 'firebase/firestore';
import { MISSATGE_COMPTADOR_ABSENT } from '../../lib/numeroSoci';
import { sincronitzarSociPublic } from '../../lib/propostes';
import RegistrarPagamentPage from './RegistrarPagamentPage';
import { formatData } from '../../lib/data';
import {
  acceptaDialeg, cancellaDialeg, dialegConfirmacio, hiHaDialegConfirmacio, renderAmbConfirmacio, tancaDialegAmbEsc,
} from '../../test/confirmacio';

const AVUI = new Date().toLocaleDateString('sv-SE');

function renderPagina() {
  return renderAmbConfirmacio(
    <MemoryRouter initialEntries={['/socis/1/pagament']}>
      <Routes>
        <Route path="/socis/:id/pagament" element={<RegistrarPagamentPage />} />
        <Route path="/socis/:id" element={<p>Fitxa del soci</p>} />
        <Route path="/socis" element={<p>Llistat de socis</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('RegistrarPagamentPage', () => {
  beforeEach(() => {
    runTransaction.mockClear();
    __txSet.mockClear();
    __txUpdate.mockClear();
    __txCommit.mockClear();
    __txCommit.mockResolvedValue(undefined);
    __txGet.mockClear();
    getDoc.mockClear();
    __docsTransaccio.clear();
    __docsTransaccio.set('socis', { ultimNumeroSoci: 41 });
    getDocs.mockClear();
  });

  it('usa el layout de formulari amb un únic h1', async () => {
    getDoc
      .mockResolvedValueOnce({ id: '1', data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7' }) })
      .mockResolvedValueOnce({ data: () => ({ quotaAnual: 35 }) });
    const { container } = renderPagina();
    await screen.findByLabelText('Import (€)');
    expect(container.firstChild.tagName).toBe('FORM');
    expect(container.firstChild).toHaveClass('pagina-admin', 'pagina-admin--formulari');
    const titols = screen.getAllByRole('heading', { level: 1 });
    expect(titols).toHaveLength(1);
    expect(titols[0]).toHaveTextContent('Registrar pagament');
    expect(screen.getByText('Anna Vidal')).toHaveClass('pagament-form__soci');
  });

  it("omple l'import per defecte amb la quota anual configurada", async () => {
    getDoc
      .mockResolvedValueOnce({ id: '1', data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7' }) })
      .mockResolvedValueOnce({ data: () => ({ quotaAnual: 35 }) });
    renderPagina();
    expect(await screen.findByLabelText('Import (€)')).toHaveValue(35);
  });

  it('redirigeix al llistat si el soci no existeix', async () => {
    getDoc
      .mockResolvedValueOnce({ data: () => undefined })
      .mockResolvedValueOnce({ data: () => ({}) });
    renderPagina();
    expect(await screen.findByText('Llistat de socis')).toBeInTheDocument();
  });

  it('en desar, actualitza el soci i crea un ingrés a Comptabilitat amb categoria "Quotes socis", en una sola transacció atòmica', async () => {
    getDoc
      .mockResolvedValueOnce({ id: '1', data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', tokenCarnet: 'tok-x' }) })
      .mockResolvedValueOnce({ data: () => ({ quotaAnual: 30 }) });
    getDocs.mockResolvedValueOnce({ docs: [{ id: 's1', data: () => ({ titol: 'Sessió Test', data: '2026-03-10' }) }] });
    const user = userEvent.setup();
    renderPagina();
    const campData = await screen.findByLabelText('Data del pagament');
    await user.clear(campData);
    await user.type(campData, '2026-03-10');
    await user.click(screen.getByRole('button', { name: 'Registrar pagament' }));
    await acceptaDialeg('Registra');
    expect(await screen.findByText('Fitxa del soci')).toBeInTheDocument();

    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(__txUpdate.mock.calls[0][1].ultimPagament).toBe('2026-03-10');
    expect(__txUpdate.mock.calls[0][1].vigenciaDes).toBe('2026-03-10');
    expect(__txUpdate.mock.calls[0][1].inicPeriode).toBeNull();

    const [, moviment] = __txSet.mock.calls[1];
    expect(moviment.categoria).toBe('Quotes socis');
    expect(moviment.tipus).toBe('ingres');
    expect(moviment.numeroSoci).toBe(7);
    expect(moviment.data).toBe('2026-03-10');
    expect(moviment.total).toBe(30);
    expect(moviment.metodePagament).toBe('efectiu');
    expect(__txCommit).toHaveBeenCalledTimes(1);
  });

  it('no toca el número de soci ni consulta el llistat de socis si ja en té un', async () => {
    getDoc
      .mockResolvedValueOnce({ id: '1', data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7' }) })
      .mockResolvedValueOnce({ data: () => ({ quotaAnual: 30 }) });
    getDocs.mockResolvedValueOnce({ docs: [{ id: 's1', data: () => ({ titol: 'Sessió Test', data: '2026-03-10' }) }] });
    const user = userEvent.setup();
    renderPagina();
    await screen.findByLabelText('Import (€)');
    await user.click(screen.getByRole('button', { name: 'Registrar pagament' }));
    await acceptaDialeg('Registra');
    await screen.findByText('Fitxa del soci');
    expect(getDocs).not.toHaveBeenCalledWith('socis');
    expect(__txUpdate.mock.calls[0][1].numeroSoci).toBeUndefined();
    // Ni llegeix ni toca el comptador: una renovació no ha de dependre que estigui inicialitzat.
    expect(__txGet.mock.calls).toEqual([['1']]);
    expect(__txUpdate).not.toHaveBeenCalledWith('socis', expect.anything());
  });

  it('assigna el següent número de soci disponible si encara no en té, i l\'usa al moviment', async () => {
    getDoc
      .mockResolvedValueOnce({ id: '1', data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '', tokenCarnet: 'tok-x' }) })
      .mockResolvedValueOnce({ data: () => ({ quotaAnual: 30 }) });
    getDocs.mockImplementation((collectionName) => {
      if (collectionName === 'socis') {
        return Promise.resolve({ docs: [{ data: () => ({ numeroSoci: 12 }) }, { data: () => ({ numeroSoci: 41 }) }] });
      }
      if (collectionName === 'sessions') {
        return Promise.resolve({ docs: [{ id: 's1', data: () => ({ titol: 'Sessió Test', data: '2026-03-10' }) }] });
      }
      return Promise.resolve({ docs: [] });
    });
    const user = userEvent.setup();
    renderPagina();
    await screen.findByLabelText('Import (€)');
    await user.click(screen.getByRole('button', { name: 'Registrar pagament' }));
    await acceptaDialeg('Registra');
    await screen.findByText('Fitxa del soci');

    // Primer es llegeix el soci i el comptador (les lectures han d'anar abans de les escriptures de la transacció).
    expect(__txGet.mock.calls).toEqual([['1'], ['socis']]);
    expect(__txUpdate.mock.calls).toEqual([
      ['socis', { ultimNumeroSoci: 42 }],
      ['1', {
        ultimPagament: AVUI, vigenciaDes: AVUI, estatManual: null, inicPeriode: null, numeroSoci: 42,
      }],
    ]);
    expect(__txSet.mock.calls[0]).toEqual(['tok-x', { numeroSoci: 42, nomPublic: 'Anna V.' }]);
    expect(__txSet.mock.calls[1][1].numeroSoci).toBe(42);
    expect(__txCommit).toHaveBeenCalledTimes(1);
  });

  // Alta sense número, amb el màxim de socis que digui `maxim` i el comptador ja preparat a __docsTransaccio.
  async function registraPrimerPagament({ maxim = 41 } = {}) {
    getDoc
      .mockResolvedValueOnce({ id: '1', data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '', tokenCarnet: 'tok-x' }) })
      .mockResolvedValueOnce({ data: () => ({ quotaAnual: 30 }) });
    getDocs.mockImplementation((collectionName) => {
      if (collectionName === 'socis') return Promise.resolve({ docs: [{ data: () => ({ numeroSoci: maxim }) }] });
      if (collectionName === 'sessions') {
        return Promise.resolve({ docs: [{ id: 's1', data: () => ({ titol: 'Sessió Test', data: '2026-03-10' }) }] });
      }
      return Promise.resolve({ docs: [] });
    });
    const user = userEvent.setup();
    const pagina = renderPagina();
    await screen.findByLabelText('Import (€)');
    await user.click(screen.getByRole('button', { name: 'Registrar pagament' }));
    await acceptaDialeg('Registra');
    return pagina;
  }

  it('si el comptador va per davant dels socis existents, el número surt del comptador (no es reutilitza cap número)', async () => {
    __docsTransaccio.set('socis', { ultimNumeroSoci: 50 });
    await registraPrimerPagament({ maxim: 41 });
    await screen.findByText('Fitxa del soci');
    expect(__txUpdate).toHaveBeenCalledWith('socis', { ultimNumeroSoci: 51 });
    expect(__txUpdate).toHaveBeenCalledWith('1', expect.objectContaining({ numeroSoci: 51 }));
  });

  it('si el comptador va endarrerit respecte dels socis existents, salta per sobre del número més alt', async () => {
    __docsTransaccio.set('socis', { ultimNumeroSoci: 3 });
    await registraPrimerPagament({ maxim: 41 });
    await screen.findByText('Fitxa del soci');
    expect(__txUpdate).toHaveBeenCalledWith('socis', { ultimNumeroSoci: 42 });
    expect(__txUpdate).toHaveBeenCalledWith('1', expect.objectContaining({ numeroSoci: 42 }));
  });

  it('sense comptador inicialitzat, mostra un error clar, no escriu res i no surt de la pàgina', async () => {
    __docsTransaccio.delete('socis');
    await registraPrimerPagament();
    expect(await screen.findByText(MISSATGE_COMPTADOR_ABSENT)).toBeInTheDocument();
    expect(__txSet).not.toHaveBeenCalled();
    expect(__txUpdate).not.toHaveBeenCalled();
    expect(__txCommit).not.toHaveBeenCalled();
    expect(screen.queryByText('Fitxa del soci')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar pagament' })).toBeEnabled();
  });

  it('si mentrestant un altre pagament ja li ha assignat número, el reutilitza i no en reserva cap de nou', async () => {
    __docsTransaccio.set('1', { nom: 'Anna', cognoms: 'Vidal', numeroSoci: 42, tokenCarnet: 'tok-x' });
    await registraPrimerPagament();
    await screen.findByText('Fitxa del soci');
    expect(__txGet.mock.calls).toEqual([['1']]);
    expect(__txUpdate.mock.calls).toEqual([
      ['1', { ultimPagament: AVUI, vigenciaDes: AVUI, estatManual: null, inicPeriode: null }],
    ]);
    expect(__txSet.mock.calls[0]).toEqual(['tok-x', { numeroSoci: 42, nomPublic: 'Anna V.' }]);
    expect(__txSet.mock.calls[1][1].numeroSoci).toBe(42);
    // L'alta ja l'ha registrada l'altre pagament: aquest compta com a renovació (sense sessió).
    expect(__txSet.mock.calls[1][1]).toEqual(expect.objectContaining({ tipusQuota: 'renovacio', sessionId: '' }));
    expect(__docsTransaccio.get('socis')).toEqual({ ultimNumeroSoci: 41 });
  });

  it('dos primers pagaments en paral·lel (totes dues pàgines carregades sense número) donen un sol número i una sola alta', async () => {
    __docsTransaccio.set('1', { nom: 'Anna', cognoms: 'Vidal', numeroSoci: '', tokenCarnet: 'tok-x' });
    const primera = await registraPrimerPagament();
    await screen.findByText('Fitxa del soci');
    primera.unmount();
    await registraPrimerPagament();
    await screen.findByText('Fitxa del soci');
    const moviments = __txSet.mock.calls.filter(([ref]) => ref === 'moviments').map(([, m]) => m);
    expect(moviments.map((m) => [m.numeroSoci, m.tipusQuota, m.sessionId])).toEqual([[42, 'alta', 's1'], [42, 'renovacio', '']]);
    expect(__txUpdate.mock.calls.filter(([ref]) => ref === 'socis')).toEqual([['socis', { ultimNumeroSoci: 42 }]]);
    expect(__docsTransaccio.get('1').numeroSoci).toBe(42);
  });

  it('si el soci ja no existeix en confirmar, no escriu res i mostra l\'error', async () => {
    __docsTransaccio.set('1', undefined);
    await registraPrimerPagament();
    expect(await screen.findByText("No s'ha pogut desar. Torna-ho a provar.")).toBeInTheDocument();
    expect(__txUpdate).not.toHaveBeenCalled();
    expect(__txSet).not.toHaveBeenCalled();
    expect(__txCommit).not.toHaveBeenCalled();
  });

  it('si la confirmació de la transacció falla, mostra l\'error i el comptador no avança', async () => {
    __txCommit.mockRejectedValueOnce(new Error('offline'));
    await registraPrimerPagament();
    expect(await screen.findByText("No s'ha pogut desar. Torna-ho a provar.")).toBeInTheDocument();
    expect(__docsTransaccio.get('socis')).toEqual({ ultimNumeroSoci: 41 });
  });

  it.each([
    ['Cancel·lar', (user) => cancellaDialeg(user)],
    ['ESC', (user) => tancaDialegAmbEsc(user)],
  ])('demana confirmació abans de desar i no desa res si es tanca amb %s', async (_nom, tanca) => {
    getDoc
      .mockResolvedValueOnce({ id: '1', data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7' }) })
      .mockResolvedValueOnce({ data: () => ({ quotaAnual: 30 }) });
    getDocs.mockResolvedValueOnce({ docs: [{ id: 's1', data: () => ({ titol: 'Sessió Test', data: '2026-03-10' }) }] });
    const user = userEvent.setup();
    renderPagina();
    await screen.findByLabelText('Import (€)');
    await user.click(screen.getByRole('button', { name: 'Registrar pagament' }));
    const dialeg = await dialegConfirmacio();
    expect(dialeg).toHaveTextContent(/^Confirmes que has rebut un pagament de 30€ amb data .+\? Aquesta acció no es pot desfer\.Cancel·larRegistra$/);
    await tanca(user);
    await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
    expect(runTransaction).not.toHaveBeenCalled();
    expect(__txCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Registrar pagament' })).toBeEnabled();
    expect(screen.queryByText('Fitxa del soci')).not.toBeInTheDocument();
  });

  // Abans, una renovació preomplia la data amb el venciment antic: el moviment quedava comptabilitzat en una data que
  // no era la del cobrament (fins i tot en un mes ja tancat o en el futur). Ara la data és sempre la real (avui per
  // defecte) i el període de soci es calcula a part (vigenciaDes), sense perdre cap dia.
  it('en una renovació, la data per defecte és avui (la del cobrament real), no el venciment', async () => {
    getDoc
      .mockResolvedValueOnce({ id: '1', data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', ultimPagament: '2025-03-10' }) })
      .mockResolvedValueOnce({ data: () => ({ quotaAnual: 30 }) });
    getDocs
      .mockResolvedValueOnce({ docs: [] }) // sessions
      .mockResolvedValueOnce({ docs: [{ data: () => ({ categoria: 'Quotes socis', data: '2025-03-10' }) }] }); // pagaments previs
    renderPagina();
    await screen.findByText(/pagament de renovació/);
    expect(screen.getByLabelText('Data del pagament')).toHaveValue(new Date().toLocaleDateString('sv-SE'));
  });

  it('sense pagament previ, la data per defecte és avui', async () => {
    getDoc
      .mockResolvedValueOnce({ id: '1', data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '' }) })
      .mockResolvedValueOnce({ data: () => ({ quotaAnual: 30 }) });
    renderPagina();
    await screen.findByLabelText('Import (€)');
    expect(screen.getByLabelText('Data del pagament')).toHaveValue(new Date().toLocaleDateString('sv-SE'));
  });

  it('preselecciona la sessió amb la data més propera a avui, i permet canviar-la', async () => {
    getDoc
      .mockResolvedValueOnce({ id: '1', data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', tokenCarnet: 'tok-x' }) })
      .mockResolvedValueOnce({ data: () => ({ quotaAnual: 30 }) });
    const avuiStr = new Date().toLocaleDateString('sv-SE');
    getDocs.mockResolvedValueOnce({
      docs: [
        { id: 'llunyana', data: () => ({ titol: 'Sessió llunyana', data: '2020-01-01' }) },
        { id: 'propera', data: () => ({ titol: 'Sessió propera', data: avuiStr }) },
      ],
    });
    const user = userEvent.setup();
    renderPagina();
    expect(await screen.findByLabelText('Sessió')).toHaveValue('propera');
    await user.selectOptions(screen.getByLabelText('Sessió'), 'llunyana');
    await user.click(screen.getByRole('button', { name: 'Registrar pagament' }));
    await acceptaDialeg('Registra');
    await screen.findByText('Fitxa del soci');
    expect(__txSet.mock.calls[1][1].sessionId).toBe('llunyana');
  });

  it('sincronitza socisPublic amb el numeroSoci i el nom públic en registrar el pagament', async () => {
    getDoc
      .mockResolvedValueOnce({ id: '1', data: () => ({ nom: 'Isabel', cognoms: 'Mondéjar', numeroSoci: '7', tokenCarnet: 'tok-1' }) })
      .mockResolvedValueOnce({ data: () => ({ quotaAnual: 30 }) });
    getDocs.mockResolvedValueOnce({
      docs: [{ id: 's1', data: () => ({ titol: 'Sessió de test', data: '2026-08-01' }) }],
    });
    const user = userEvent.setup();
    renderPagina();
    await screen.findByDisplayValue('30');
    await user.selectOptions(screen.getByLabelText('Sessió'), 'Sessió de test');
    await user.click(screen.getByRole('button', { name: 'Registrar pagament' }));
    await acceptaDialeg('Registra');
    await vi.waitFor(() => expect(__txCommit).toHaveBeenCalledTimes(1));
    expect(__txSet).toHaveBeenCalledWith('tok-1', { numeroSoci: 7, nomPublic: 'Isabel M.' });
  });

  it('en registrar el pagament d\'una persona de l\'organització, no perd el nom d\'organització', async () => {
    getDoc
      .mockResolvedValueOnce({
        id: '1', data: () => ({
          nom: 'Toni', cognoms: 'Pinel', numeroSoci: '9', tokenCarnet: 'tok-9', organitzacio: true,
        }),
      })
      .mockResolvedValueOnce({ data: () => ({ quotaAnual: 30 }) });
    getDocs.mockResolvedValueOnce({
      docs: [{ id: 's1', data: () => ({ titol: 'Sessió de test', data: '2026-08-01' }) }],
    });
    const user = userEvent.setup();
    renderPagina();
    await screen.findByDisplayValue('30');
    await user.selectOptions(screen.getByLabelText('Sessió'), 'Sessió de test');
    await user.click(screen.getByRole('button', { name: 'Registrar pagament' }));
    await acceptaDialeg('Registra');
    await vi.waitFor(() => expect(__txCommit).toHaveBeenCalledTimes(1));
    expect(__txSet).toHaveBeenCalledWith('tok-9', { numeroSoci: 9, nomPublic: 'Organització Cineclub Roda de Berà' });
  });

  it('no sincronitza socisPublic si el soci està desactivat en registrar el pagament', async () => {
    getDoc
      .mockResolvedValueOnce({
        id: '1', data: () => ({ nom: 'Isabel', cognoms: 'Mondéjar', numeroSoci: '7', tokenCarnet: 'tok-1', actiu: false }),
      })
      .mockResolvedValueOnce({ data: () => ({ quotaAnual: 30 }) });
    getDocs.mockResolvedValueOnce({
      docs: [{ id: 's1', data: () => ({ titol: 'Sessió de test', data: '2026-08-01' }) }],
    });
    const user = userEvent.setup();
    renderPagina();
    await screen.findByDisplayValue('30');
    await user.selectOptions(screen.getByLabelText('Sessió'), 'Sessió de test');
    await user.click(screen.getByRole('button', { name: 'Registrar pagament' }));
    await acceptaDialeg('Registra');
    await vi.waitFor(() => expect(__txCommit).toHaveBeenCalledTimes(1));
    expect(__txSet).not.toHaveBeenCalledWith('tok-1', expect.anything());
    expect(__txSet).toHaveBeenCalledTimes(1);
  });

  // Pagament d'una renovació, amb la sessió per defecte, per comprovar exactament el que s'escriu al lot.
  async function registraPagament(soci) {
    sincronitzarSociPublic.mockClear();
    getDoc
      .mockResolvedValueOnce({ id: '1', data: () => soci })
      .mockResolvedValueOnce({ data: () => ({ quotaAnual: 30 }) });
    getDocs.mockResolvedValueOnce({
      docs: [{ id: 's1', data: () => ({ titol: 'Sessió de test', data: '2026-08-01' }) }],
    });
    const user = userEvent.setup();
    renderPagina();
    await screen.findByDisplayValue('30');
    await user.click(screen.getByRole('button', { name: 'Registrar pagament' }));
    await acceptaDialeg('Registra');
    await vi.waitFor(() => expect(__txCommit).toHaveBeenCalledTimes(1));
  }

  // Aquests socis no tenen cap data de quota: tant si és alta com renovació, la quota comença el dia del pagament.
  const ACTUALITZACIO_SOCI = { ultimPagament: AVUI, vigenciaDes: AVUI, estatManual: null, inicPeriode: null };

  it('passa a l\'helper l\'estat d\'activació real del soci, i per a un soci actiu escriu exactament el soci, socisPublic i el moviment', async () => {
    await registraPagament({ nom: 'Isabel', cognoms: 'Mondéjar', numeroSoci: '7', tokenCarnet: 'tok-1', actiu: true });
    expect(sincronitzarSociPublic).toHaveBeenCalledTimes(1);
    expect(sincronitzarSociPublic.mock.calls[0][2]).toEqual(expect.objectContaining({ actiu: true, tokenCarnet: 'tok-1' }));
    expect(__txUpdate.mock.calls).toEqual([['1', ACTUALITZACIO_SOCI]]);
    expect(__txSet.mock.calls).toEqual([
      ['tok-1', { numeroSoci: 7, nomPublic: 'Isabel M.' }],
      ['moviments', expect.objectContaining({ numeroSoci: 7, total: 30 })],
    ]);
  });

  it('si el soci s\'ha desactivat entre la càrrega i el registre, no escriu socisPublic', async () => {
    __docsTransaccio.set('1', { nom: 'Isabel', cognoms: 'Mondéjar', numeroSoci: '7', tokenCarnet: 'tok-1', actiu: false });
    await registraPagament({ nom: 'Isabel', cognoms: 'Mondéjar', numeroSoci: '7', tokenCarnet: 'tok-1', actiu: true });
    expect(__txUpdate.mock.calls).toEqual([['1', ACTUALITZACIO_SOCI]]);
    expect(__txSet.mock.calls).toEqual([['moviments', expect.objectContaining({ numeroSoci: 7, total: 30 })]]);
  });

  it('si el carnet s\'ha regenerat o el nom ha canviat entre la càrrega i el registre, socisPublic segueix les dades actuals', async () => {
    __docsTransaccio.set('1', {
      nom: 'Isa', cognoms: 'Puig', organitzacio: '', numeroSoci: '7', tokenCarnet: 'tok-nou', actiu: true,
    });
    await registraPagament({ nom: 'Isabel', cognoms: 'Mondéjar', numeroSoci: '7', tokenCarnet: 'tok-1', actiu: true });
    expect(__txSet.mock.calls).toEqual([
      ['tok-nou', { numeroSoci: 7, nomPublic: 'Isa P.' }],
      ['moviments', expect.objectContaining({ numeroSoci: 7, total: 30 })],
    ]);
  });

  it('per a un soci desactivat, el lot només porta el soci i el moviment (cap escriptura a socisPublic)', async () => {
    await registraPagament({ nom: 'Isabel', cognoms: 'Mondéjar', numeroSoci: '7', tokenCarnet: 'tok-1', actiu: false });
    expect(__txUpdate.mock.calls).toEqual([['1', ACTUALITZACIO_SOCI]]);
    expect(__txSet.mock.calls).toEqual([['moviments', expect.objectContaining({ numeroSoci: 7, total: 30 })]]);
    // Si l'helper arribés a cridar-se, rebria `actiu: false` i el seu propi guard tampoc escriuria res.
    sincronitzarSociPublic.mock.calls.forEach(([, , soci]) => expect(soci.actiu).toBe(false));
  });

  it('avisa clarament si el soci està desactivat, sense bloquejar el pagament', async () => {
    getDoc
      .mockResolvedValueOnce({
        id: '1', data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', actiu: false, motiuDesactivacio: 'Mal comportament' }),
      })
      .mockResolvedValueOnce({ data: () => ({ quotaAnual: 30 }) });
    getDocs.mockResolvedValueOnce({ docs: [{ id: 's1', data: () => ({ titol: 'Sessió Test', data: '2026-03-10' }) }] });
    const user = userEvent.setup();
    renderPagina();
    expect(await screen.findByText(/Aquest soci està desactivat \(Mal comportament\)/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar pagament' }));
    expect(await dialegConfirmacio()).toHaveTextContent(/continuarà desactivat/);
    await acceptaDialeg('Registra');
    await screen.findByText('Fitxa del soci');
    expect(runTransaction).toHaveBeenCalledTimes(1);
  });
});

describe('RegistrarPagamentPage — alta vs renovació', () => {
  beforeEach(() => {
    runTransaction.mockClear();
    __txSet.mockClear();
    __txUpdate.mockClear();
    __txCommit.mockClear();
    __txCommit.mockResolvedValue(undefined);
    __txGet.mockClear();
    getDoc.mockClear();
    __docsTransaccio.clear();
    __docsTransaccio.set('socis', { ultimNumeroSoci: 41 });
    getDocs.mockReset();
    getDocs.mockResolvedValue({ docs: [] });
  });

  it('sense cap moviment de quota previ, és una alta: cal triar sessió i es desa amb tipusQuota "alta"', async () => {
    getDoc
      .mockResolvedValueOnce({ id: '1', data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', tokenCarnet: 'tok-x' }) })
      .mockResolvedValueOnce({ data: () => ({ quotaAnual: 30 }) });
    getDocs.mockResolvedValueOnce({ docs: [{ id: 's1', data: () => ({ titol: 'The Artist', data: '2026-01-01' }) }] });
    const user = userEvent.setup();
    renderPagina();
    expect(await screen.findByLabelText('Sessió')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar pagament' }));
    await acceptaDialeg('Registra');
    await screen.findByText('Fitxa del soci');
    const [, moviment] = __txSet.mock.calls[1];
    expect(moviment.categoria).toBe('Quotes socis');
    expect(moviment.tipusQuota).toBe('alta');
    expect(moviment.sessionId).toBe('s1');
  });

  it('no deixa desar una alta sense triar cap sessió', async () => {
    getDoc
      .mockResolvedValueOnce({ id: '1', data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7' }) })
      .mockResolvedValueOnce({ data: () => ({ quotaAnual: 30 }) });
    const user = userEvent.setup();
    renderPagina();
    await screen.findByLabelText('Sessió');
    await user.click(screen.getByRole('button', { name: 'Registrar pagament' }));
    expect(await screen.findByText(/Una alta nova ha d'estar vinculada a una sessió/)).toBeInTheDocument();
    expect(hiHaDialegConfirmacio()).toBe(false);
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('amb ultimPagament fixat però sense cap moviment real (p. ex. una sol·licitud aprovada), continua sent una alta', async () => {
    getDoc
      .mockResolvedValueOnce({
        id: '1', data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', ultimPagament: '2026-08-29', tokenCarnet: 'tok-x' }),
      })
      .mockResolvedValueOnce({ data: () => ({ quotaAnual: 30 }) });
    getDocs.mockResolvedValueOnce({ docs: [{ id: 's1', data: () => ({ titol: 'The Artist', data: '2026-01-01' }) }] });
    const user = userEvent.setup();
    renderPagina();
    expect(await screen.findByLabelText('Sessió')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar pagament' }));
    await acceptaDialeg('Registra');
    await screen.findByText('Fitxa del soci');
    const [, moviment] = __txSet.mock.calls[1];
    expect(moviment.categoria).toBe('Quotes socis');
    expect(moviment.tipusQuota).toBe('alta');
  });

  it('amb un moviment de quota previ, és una renovació: sense selector de sessió, sessionId buit i tipusQuota "renovacio"', async () => {
    getDoc
      .mockResolvedValueOnce({
        id: '1', data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', ultimPagament: '2025-08-29', tokenCarnet: 'tok-x' }),
      })
      .mockResolvedValueOnce({ data: () => ({ quotaAnual: 30 }) });
    getDocs
      .mockResolvedValueOnce({ docs: [{ id: 's1', data: () => ({ titol: 'The Artist', data: '2026-01-01' }) }] }) // sessions
      .mockResolvedValueOnce({ docs: [{ data: () => ({ categoria: 'Quotes socis', data: '2025-08-29' }) }] }); // pagaments previs
    const user = userEvent.setup();
    renderPagina();
    await screen.findByLabelText('Import (€)');
    expect(screen.getByText(/pagament de renovació/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Sessió')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar pagament' }));
    await acceptaDialeg('Registra');
    await screen.findByText('Fitxa del soci');
    const [, moviment] = __txSet.mock.calls[1];
    expect(moviment.categoria).toBe('Quotes socis');
    expect(moviment.tipusQuota).toBe('renovacio');
    expect(moviment.sessionId).toBe('');
  });

  it('no ofereix ni preselecciona les sessions senseControl, encara que siguin les més properes a avui', async () => {
    getDoc
      .mockResolvedValueOnce({ id: '1', data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', tokenCarnet: 'tok-x' }) })
      .mockResolvedValueOnce({ data: () => ({ quotaAnual: 30 }) });
    const avuiStr = new Date().toLocaleDateString('sv-SE');
    getDocs.mockResolvedValueOnce({
      docs: [
        { id: 'llunyana', data: () => ({ titol: 'Sessió llunyana', data: '2020-01-01' }) },
        { id: 'especial', data: () => ({ titol: 'Carretera a Gusen', data: avuiStr, senseControl: true }) },
      ],
    });
    renderPagina();
    expect(await screen.findByLabelText('Sessió')).toHaveValue('llunyana');
    expect(screen.queryByRole('option', { name: 'Carretera a Gusen' })).not.toBeInTheDocument();
  });
});

describe('RegistrarPagamentPage — inici de la quota (renovacions anticipades)', () => {
  beforeEach(() => {
    runTransaction.mockClear();
    __txSet.mockClear();
    __txUpdate.mockClear();
    __txCommit.mockClear();
    __txCommit.mockResolvedValue(undefined);
    __txGet.mockClear();
    getDoc.mockClear();
    __docsTransaccio.clear();
    getDocs.mockReset();
    getDocs.mockResolvedValue({ docs: [] });
  });

  const dia = (dies, anys = 0) => {
    const ara = new Date();
    return new Date(ara.getFullYear() + anys, ara.getMonth(), ara.getDate() + dies).toLocaleDateString('sv-SE');
  };

  // Renovació (hi ha un moviment de quota previ) amb la data per defecte (avui).
  async function renova(soci, { sociEnConfirmar } = {}) {
    if (sociEnConfirmar) __docsTransaccio.set('1', sociEnConfirmar);
    getDoc
      .mockResolvedValueOnce({ id: '1', data: () => soci })
      .mockResolvedValueOnce({ data: () => ({ quotaAnual: 30 }) });
    getDocs
      .mockResolvedValueOnce({ docs: [] }) // sessions
      .mockResolvedValueOnce({ docs: [{ data: () => ({ categoria: 'Quotes socis', data: soci.ultimPagament }) }] });
    const user = userEvent.setup();
    renderPagina();
    await screen.findByText(/pagament de renovació/);
    const avis = screen.getByText(/La quota nova comptarà a partir del/).textContent;
    await user.click(screen.getByRole('button', { name: 'Registrar pagament' }));
    await acceptaDialeg('Registra');
    await screen.findByText('Fitxa del soci');
    return avis;
  }

  const SOCI = { nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', tokenCarnet: 'tok-x', actiu: true };

  it('pagant abans que venci, la quota nova comença el dia que venç l\'actual i el moviment es data avui', async () => {
    const soci = { ...SOCI, ultimPagament: dia(20, -1), inicPeriode: dia(20, -1) }; // venç d'aquí a 20 dies
    const avis = await renova(soci);
    expect(avis).toBe(`La quota nova comptarà a partir del ${formatData(dia(20))}, quan venci l'actual.`);
    expect(__txUpdate.mock.calls).toEqual([
      ['1', { ultimPagament: AVUI, vigenciaDes: dia(20), estatManual: null, inicPeriode: null }],
    ]);
    expect(__txSet.mock.calls[1]).toEqual(['moviments', {
      data: AVUI,
      vencimentAnterior: dia(20),
      concepte: 'Quota Anna Vidal',
      tipus: 'ingres',
      categoria: 'Quotes socis',
      tipusQuota: 'renovacio',
      metodePagament: 'efectiu',
      numeroSoci: 7,
      preuUnitari: 30,
      quantitat: 1,
      total: 30,
      sessionId: '',
    }]);
  });

  it('pagant quan ja ha vençut, la quota comença el dia del pagament', async () => {
    const soci = { ...SOCI, ultimPagament: dia(-40, -1), inicPeriode: dia(-38, -1) }; // va vèncer fa 38 dies
    const avis = await renova(soci);
    expect(avis).toBe(`La quota nova comptarà a partir del ${formatData(AVUI)}.`);
    expect(__txUpdate.mock.calls).toEqual([
      ['1', { ultimPagament: AVUI, vigenciaDes: AVUI, estatManual: null, inicPeriode: null }],
    ]);
    expect(__txSet.mock.calls[1][1]).toEqual(expect.objectContaining({ data: AVUI, vencimentAnterior: dia(-38) }));
  });

  it('el venciment anterior es calcula amb el soci rellegit en confirmar (p. ex. un escaneig n\'ha fixat l\'activació)', async () => {
    const soci = { ...SOCI, ultimPagament: dia(10, -1) };
    await renova(soci, { sociEnConfirmar: { ...soci, inicPeriode: dia(15, -1) } });
    expect(__txUpdate.mock.calls[0][1].vigenciaDes).toBe(dia(15));
    expect(__txSet.mock.calls[1][1].vencimentAnterior).toBe(dia(15));
  });

  it('una alta no s\'encadena a la data provisional de la fitxa i no desa cap venciment anterior', async () => {
    getDoc
      .mockResolvedValueOnce({ id: '1', data: () => ({ ...SOCI, ultimPagament: dia(-3) }) })
      .mockResolvedValueOnce({ data: () => ({ quotaAnual: 30 }) });
    getDocs.mockResolvedValueOnce({ docs: [{ id: 's1', data: () => ({ titol: 'The Artist', data: AVUI }) }] });
    const user = userEvent.setup();
    renderPagina();
    expect(await screen.findByText(`La quota nova comptarà a partir del ${formatData(AVUI)}.`)).toHaveClass(
      'pagament-form__avis', 'pagament-form__avis--info',
    );
    await user.click(screen.getByRole('button', { name: 'Registrar pagament' }));
    await acceptaDialeg('Registra');
    await screen.findByText('Fitxa del soci');
    expect(__txUpdate.mock.calls).toEqual([
      ['1', { ultimPagament: AVUI, vigenciaDes: AVUI, estatManual: null, inicPeriode: null }],
    ]);
    expect(__txSet.mock.calls[1][1]).not.toHaveProperty('vencimentAnterior');
  });

  it('si es canvia la data del pagament, l\'avís i el que es desa la segueixen', async () => {
    const soci = { ...SOCI, ultimPagament: '2025-11-15' };
    getDoc
      .mockResolvedValueOnce({ id: '1', data: () => soci })
      .mockResolvedValueOnce({ data: () => ({ quotaAnual: 30 }) });
    getDocs
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [{ data: () => ({ categoria: 'Quotes socis', data: '2025-11-15' }) }] });
    const user = userEvent.setup();
    renderPagina();
    const campData = await screen.findByLabelText('Data del pagament');
    await user.clear(campData);
    await user.type(campData, '2026-11-14');
    expect(screen.getByText(/La quota nova comptarà a partir del/)).toHaveTextContent(
      "La quota nova comptarà a partir del 15/11/2026, quan venci l'actual.",
    );
    await user.clear(campData);
    await user.type(campData, '2026-11-16');
    expect(screen.getByText(/La quota nova comptarà a partir del/)).toHaveTextContent(
      'La quota nova comptarà a partir del 16/11/2026.',
    );
    await user.click(screen.getByRole('button', { name: 'Registrar pagament' }));
    await acceptaDialeg('Registra');
    await screen.findByText('Fitxa del soci');
    expect(__txUpdate.mock.calls[0][1]).toEqual(expect.objectContaining({ ultimPagament: '2026-11-16', vigenciaDes: '2026-11-16' }));
  });
});
