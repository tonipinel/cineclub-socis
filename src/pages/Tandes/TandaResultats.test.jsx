import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  act, screen, waitFor, within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...segments) => segments.join('/')),
  deleteDoc: vi.fn(),
  doc: vi.fn((_db, ...segments) => segments.join('/')),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
}));

import { deleteDoc, getDocs, onSnapshot } from 'firebase/firestore';
import TandaResultats from './TandaResultats';
import {
  acceptaDialeg, cancellaDialeg, dialegConfirmacio, hiHaDialegConfirmacio, renderAmbConfirmacio, tancaDialegAmbEsc,
} from '../../test/confirmacio';

const stamp = (d) => ({ toDate: () => d });
const docs = (llista) => ({ docs: llista.map((d) => ({ id: d.id, data: () => d })) });

const TANDA = { nom: 'Novembre', propostes: ['p1', 'p2', 'p3'], tanca: stamp(new Date('2026-11-30T20:00:00')) };
const PROPOSTES = [
  { id: 'p1', titol: 'Stalker', estat: 'aprovada' },
  { id: 'p2', titol: 'Solaris', estat: 'programada' },
  { id: 'p3', titol: 'El mirall', estat: 'aprovada' },
];
const SESSIONS = [{ id: 'ses7', titol: 'Solaris', propostaId: 'p2' }];
const SOCIS = [
  { id: 's1', numeroSoci: 12, nom: 'Anna', cognoms: 'Puig', tokenCarnet: 't12' },
  { id: 's2', numeroSoci: 40, nom: 'Joan', cognoms: 'Serra', tokenCarnet: 't40' },
  { id: 's3', numeroSoci: 55, nom: 'Pere', cognoms: 'Vila', tokenCarnet: 't55' },
  { id: 's4', numeroSoci: 60, nom: 'Marta', cognoms: 'Coll', tokenCarnet: 't60', actiu: false },
  { id: 's5', numeroSoci: 70, nom: 'Lluc', cognoms: 'Roig' },
  { id: 's6', numeroSoci: 80, nom: 'Rosa', cognoms: 'Mas', tokenCarnet: 't80', actiu: false },
];
const VOTS = [
  { id: '12', valors: { p1: 'dislike', p2: 'like' } },
  { id: '40', valors: { p1: 'like', p2: 'like', p3: 'like' } },
  { id: '77', valors: { p1: 'dislike', p2: 'dislike' } },
  { id: '80', valors: { p1: 'like' } },
];

let subscripcions;
let desubscriure;
const emet = (ruta, valor) => act(() => subscripcions[ruta].forEach((cb) => cb(valor)));
const snapVots = (vots) => docs(vots);
const snapTanda = (tanda) => ({ data: () => tanda });

const renderitza = () => renderAmbConfirmacio(
  <MemoryRouter initialEntries={['/tandes/t1/resultats']}>
    <Routes>
      <Route path="/tandes/:id/resultats" element={<TandaResultats />} />
      <Route path="/tandes" element={<p>Llista de tandes</p>} />
    </Routes>
  </MemoryRouter>,
);

const renderitzaIEmet = async ({ tanda = TANDA, vots = VOTS } = {}) => {
  renderitza();
  await vi.waitFor(() => expect(subscripcions['tandes/t1/vots']).toBeDefined());
  emet('tandes/t1', snapTanda(tanda));
  emet('tandes/t1/vots', snapVots(vots));
};

const renderitzaIEmetAmbContenidor = async () => {
  const r = renderitza();
  await vi.waitFor(() => expect(subscripcions['tandes/t1/vots']).toBeDefined());
  emet('tandes/t1', snapTanda(TANDA));
  emet('tandes/t1/vots', snapVots(VOTS));
  return r;
};

const textsDeFila = (fila) => Array.from(fila.children).map((c) => c.textContent);
const files = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

describe('TandaResultats', () => {
  beforeEach(() => {
    subscripcions = {};
    desubscriure = vi.fn();
    onSnapshot.mockReset();
    onSnapshot.mockImplementation((ruta, cb, errorCb) => {
      (subscripcions[ruta] ??= []).push(cb);
      (subscripcions[`${ruta}-error`] ??= []).push(errorCb);
      return desubscriure;
    });
    deleteDoc.mockReset();
    deleteDoc.mockResolvedValue();
    getDocs.mockReset();
    getDocs.mockImplementation((ruta) => Promise.resolve(docs({ socis: SOCIS, propostes: PROPOSTES, sessions: SESSIONS }[ruta])));
  });

  it('mostra el nom de la tanda', async () => {
    await renderitzaIEmet();
    expect(await screen.findByRole('heading', { name: /Novembre/ })).toBeInTheDocument();
  });

  it('enllaça a les propostes de la tanda (llista filtrada per aquesta tanda)', async () => {
    await renderitzaIEmet();
    const enllac = await screen.findByRole('link', { name: 'Veure les propostes de la tanda' });
    expect(enllac).toHaveAttribute('href', '/propostes/pendents?tanda=t1');
  });

  it('resumeix quants elegibles han votat, completat i són pendents, amb la barra de participació', async () => {
    await renderitzaIEmet();
    expect(await screen.findByText('2 de 3 han votat · 1 han completat · 1 pendents')).toBeInTheDocument();
    const barra = screen.getByRole('progressbar', { name: 'Completats' });
    expect(barra).toHaveAttribute('aria-valuenow', '33');
    expect(screen.getByText('Completats: 1 de 3')).toBeInTheDocument();
    expect(screen.getByText('33%')).toBeInTheDocument();
  });

  it('mostra «👍 N · 👎 M» i el percentatge per proposta, ordenades per % de 👍 i les sense vots al final', async () => {
    await renderitzaIEmet({ vots: VOTS.filter((v) => v.id !== '40') });
    const resultats = await screen.findAllByTestId('resultat-proposta');
    expect(resultats.map((r) => within(r).getByRole('heading').textContent)).toEqual(['Solaris', 'Stalker', 'El mirall']);
    expect(resultats[0]).toHaveTextContent('👍 1 · 👎 1');
    expect(resultats[0]).toHaveTextContent('50%');
    expect(resultats[1]).toHaveTextContent('👍 1 · 👎 2');
    expect(resultats[1]).toHaveTextContent('33%');
    expect(resultats[2]).toHaveTextContent('👍 0 · 👎 0');
    expect(resultats[2]).not.toHaveTextContent('%');
  });

  it('cada pel·lícula del top enllaça a la sessió si és programada amb sessió i, si no, a la proposta', async () => {
    await renderitzaIEmet();
    const top = (await screen.findAllByTestId('resultat-proposta'));
    const href = (titol) => within(top.find((li) => within(li).queryByRole('heading', { name: titol }))).getByRole('link', { name: titol });
    expect(href('Solaris')).toHaveAttribute('href', '/sessions/ses7');
    expect(href('Stalker')).toHaveAttribute('href', '/propostes/pendents/p1');
    expect(href('El mirall')).toHaveAttribute('href', '/propostes/pendents/p3');
  });

  it('si no es poden llegir les sessions, totes les pel·lícules enllacen a la proposta', async () => {
    getDocs.mockImplementation((ruta) => (ruta === 'sessions'
      ? Promise.reject(new Error('boom'))
      : Promise.resolve(docs({ socis: SOCIS, propostes: PROPOSTES }[ruta]))));
    await renderitzaIEmet();
    const link = await screen.findByRole('link', { name: 'Solaris' });
    expect(link).toHaveAttribute('href', '/propostes/pendents/p2');
  });

  it('fa servir l\'amplada de llista i la capçalera de la taula mostra la caràtula de cada pel·lícula', async () => {
    getDocs.mockImplementation((ruta) => Promise.resolve(docs({
      socis: SOCIS, sessions: SESSIONS, propostes: PROPOSTES.map((p) => (p.id === 'p1' ? { ...p, imatgeUrl: '/stalker.jpg' } : p)),
    }[ruta])));
    await renderitzaIEmetAmbContenidor();
    await screen.findByRole('table');
    expect(document.querySelector('.pagina-admin')).toHaveClass('pagina-admin--llista');
    const capcalera = within(await screen.findByRole('table')).getAllByRole('row')[0];
    const stalker = within(capcalera).getByRole('columnheader', { name: 'Stalker' });
    expect(stalker.querySelector('img')).toHaveAttribute('src', '/stalker.jpg');
    expect(stalker.querySelector('img')).toHaveAttribute('alt', '');
    expect(within(capcalera).getByRole('columnheader', { name: 'Solaris' }).querySelector('.tanda-resultats__cartell--buit')).toBeInTheDocument();
  });

  it('mostra la matriu amb una fila per soci, ordenada Completats, En curs i Sense començar', async () => {
    await renderitzaIEmet();
    const taula = await screen.findByRole('table');
    const capcalera = within(taula).getAllByRole('row')[0];
    expect(within(capcalera).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Soci', 'Estat', 'El mirall', 'Solaris', 'Stalker']);
    expect(within(capcalera).getByRole('columnheader', { name: 'Stalker' })).toHaveAttribute('title', 'Stalker');
    expect(files().map(textsDeFila)).toEqual([
      ['Joan Serranúm. 40Esborrar els vots', 'Completat', '👍', '👍', '👍'],
      ['Anna Puignúm. 12Esborrar els vots', 'En curs (2/3)', '—', '👍', '👎'],
      ['Núm. 77no elegibleEsborrar els vots', 'En curs (2/3)', '—', '👎', '👎'],
      ['Rosa Masnúm. 80no elegibleEsborrar els vots', 'En curs (1/3)', '—', '—', '👍'],
      ['Pere Vilanúm. 55', 'Sense començar (0/3)', '—', '—', '—'],
    ]);
  });

  it('les columnes segueixen l\'ordre de millor a pitjor i es reordenen en temps real', async () => {
    await renderitzaIEmet();
    const taula = await screen.findByRole('table');
    const columnes = () => within(within(taula).getAllByRole('row')[0]).getAllByRole('columnheader').slice(2).map((c) => c.textContent);
    expect(columnes()).toEqual(['El mirall', 'Solaris', 'Stalker']);
    // Dos 👎 nous a «El mirall» (100% → 33%) i 👍 a les altres: Solaris 75%, Stalker 67%.
    emet('tandes/t1/vots', snapVots([
      ...VOTS,
      { id: '90', valors: { p1: 'like', p2: 'like', p3: 'dislike' } },
      { id: '91', valors: { p1: 'like', p3: 'dislike' } },
    ]));
    expect(columnes()).toEqual(['Solaris', 'Stalker', 'El mirall']);
    const resultats = screen.getAllByTestId('resultat-proposta');
    expect(resultats.map((r) => within(r).getByRole('heading').textContent)).toEqual(columnes());
  });

  it('marca capçaleres de columna i de fila, i dona text alternatiu als vots', async () => {
    await renderitzaIEmet();
    const taula = await screen.findByRole('table');
    within(taula).getAllByRole('columnheader').forEach((c) => expect(c).toHaveAttribute('scope', 'col'));
    const rowheaders = within(taula).getAllByRole('rowheader');
    expect(rowheaders).toHaveLength(5);
    rowheaders.forEach((c) => expect(c).toHaveAttribute('scope', 'row'));
    const filaAnna = files()[1];
    expect(within(filaAnna).getByRole('img', { name: 'No m\'agrada' })).toHaveTextContent('👎');
    expect(within(filaAnna).getByRole('img', { name: 'M\'agrada' })).toHaveTextContent('👍');
    expect(within(filaAnna).getByRole('img', { name: 'Sense vot' })).toHaveTextContent('—');
  });

  it('la marca «no elegible» explica el motiu només si el soci existeix', async () => {
    await renderitzaIEmet();
    await screen.findByRole('table');
    const marques = screen.getAllByText('no elegible');
    expect(marques[0]).toHaveAttribute('title', 'Soci no trobat');
    expect(marques[1]).toHaveAttribute('title', 'Ja no pot votar (inactiu o sense carnet)');
  });

  it('no mostra els socis inactius o sense carnet que no han votat', async () => {
    await renderitzaIEmet();
    await screen.findByRole('table');
    expect(screen.queryByText(/Marta/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Lluc/)).not.toBeInTheDocument();
  });

  it('els filtres mostren el comptador, marquen l\'actiu amb aria-pressed i filtren la matriu', async () => {
    const usuari = userEvent.setup();
    await renderitzaIEmet();
    await screen.findByRole('table');
    expect(screen.getByRole('button', { name: 'Tots (5)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Completats (1)' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'En curs (3)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sense començar (1)' })).toBeInTheDocument();

    await usuari.click(screen.getByRole('button', { name: 'Sense començar (1)' }));
    expect(screen.getByRole('button', { name: 'Sense començar (1)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Tots (5)' })).toHaveAttribute('aria-pressed', 'false');
    expect(files().map(textsDeFila).map((f) => f[0])).toEqual(['Pere Vilanúm. 55']);

    await usuari.click(screen.getByRole('button', { name: 'En curs (3)' }));
    expect(files()).toHaveLength(3);
    await usuari.click(screen.getByRole('button', { name: 'Completats (1)' }));
    expect(files().map(textsDeFila).map((f) => f[0])).toEqual(['Joan Serranúm. 40Esborrar els vots']);
  });

  it('avisa quan el filtre no té cap soci', async () => {
    const usuari = userEvent.setup();
    await renderitzaIEmet({ vots: [] });
    await usuari.click(await screen.findByRole('button', { name: 'Completats (0)' }));
    expect(screen.getByText('Cap soci en aquest estat.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('sense vots tots els elegibles són pendents', async () => {
    await renderitzaIEmet({ vots: [] });
    expect(await screen.findByText('0 de 3 han votat · 0 han completat · 3 pendents')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Completats' })).toHaveAttribute('aria-valuenow', '0');
  });

  it('s\'actualitza en temps real quan arriba un vot nou', async () => {
    await renderitzaIEmet();
    expect(await screen.findByText('2 de 3 han votat · 1 han completat · 1 pendents')).toBeInTheDocument();
    emet('tandes/t1/vots', snapVots([...VOTS, { id: '55', valors: { p1: 'like', p2: 'like', p3: 'dislike' } }]));
    expect(screen.getByText('3 de 3 han votat · 2 han completat · 0 pendents')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Completats' })).toHaveAttribute('aria-valuenow', '67');
  });

  describe('esborrar tots els vots d\'un soci', () => {
    const TANDA_OBERTA = { ...TANDA, tanca: stamp(new Date('2099-01-01T20:00:00')) };
    const TANDA_TANCADA = { ...TANDA, tanca: stamp(new Date('2020-01-01T20:00:00')) };
    const botoDe = (nom) => screen.getByRole('button', { name: `Esborrar tots els vots de ${nom}` });

    it('només ofereix el botó a les files amb document de vot', async () => {
      await renderitzaIEmet({ tanda: TANDA_OBERTA });
      await screen.findByRole('table');
      expect(screen.getAllByRole('button', { name: /^Esborrar tots els vots de/ })).toHaveLength(4);
      expect(botoDe('Anna Puig')).toBeInTheDocument();
      expect(botoDe('Núm. 77')).toBeInTheDocument();
      expect(botoDe('Rosa Mas')).toBeInTheDocument();
      expect(botoDe('Joan Serra')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Pere Vila/ })).not.toBeInTheDocument();
    });

    it.each([
      ['Cancel·lar', (usuari) => cancellaDialeg(usuari)],
      ['ESC', (usuari) => tancaDialegAmbEsc(usuari)],
    ])('si tanca la confirmació amb %s no esborra res', async (_nom, tanca) => {
      const usuari = userEvent.setup();
      await renderitzaIEmet({ tanda: TANDA_OBERTA });
      await usuari.click(await screen.findByRole('button', { name: 'Esborrar tots els vots de Anna Puig' }));
      await tanca(usuari);
      await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
      expect(deleteDoc).not.toHaveBeenCalled();
      expect(botoDe('Anna Puig')).toBeEnabled();
    });

    it('en confirmar esborra el document tandes/{id}/vots/{numeroSoci}', async () => {
      const usuari = userEvent.setup();
      await renderitzaIEmet({ tanda: TANDA_OBERTA });
      await usuari.click(await screen.findByRole('button', { name: 'Esborrar tots els vots de Anna Puig' }));
      expect(await dialegConfirmacio()).toHaveAttribute('role', 'alertdialog');
      expect(deleteDoc).not.toHaveBeenCalled();
      await acceptaDialeg('Esborra');
      await vi.waitFor(() => expect(deleteDoc).toHaveBeenCalledTimes(1));
      expect(deleteDoc).toHaveBeenCalledWith('tandes/t1/vots/12');
    });

    it('la confirmació inclou el nom, el recompte i que el soci podrà tornar a votar si la tanda és oberta', async () => {
      const usuari = userEvent.setup();
      await renderitzaIEmet({ tanda: TANDA_OBERTA });
      await usuari.click(await screen.findByRole('button', { name: 'Esborrar tots els vots de Anna Puig' }));
      expect(await dialegConfirmacio()).toHaveTextContent(
        /^Segur que vols esborrar tots els vots de Anna Puig \(2 de 3\)\? Aquesta acció no es pot desfer\. El soci podrà tornar a votar\.Cancel·larEsborra$/
      );
    });

    it('si la tanda és tancada avisa que el resultat final canviarà', async () => {
      const usuari = userEvent.setup();
      await renderitzaIEmet({ tanda: TANDA_TANCADA });
      await usuari.click(await screen.findByRole('button', { name: 'Esborrar tots els vots de Joan Serra' }));
      expect(await dialegConfirmacio()).toHaveTextContent(
        /^Segur que vols esborrar tots els vots de Joan Serra \(3 de 3\)\? Aquesta acció no es pot desfer\. El resultat final de la tanda canviarà\.Cancel·larEsborra$/
      );
    });

    it('si falla l\'esborrat mostra l\'error dins la pàgina i el botó torna a estar actiu', async () => {
      const usuari = userEvent.setup();
      deleteDoc.mockRejectedValue(new Error('permission-denied'));
      await renderitzaIEmet({ tanda: TANDA_OBERTA });
      await usuari.click(await screen.findByRole('button', { name: 'Esborrar tots els vots de Anna Puig' }));
      await acceptaDialeg('Esborra');
      expect(await screen.findByRole('alert')).toHaveTextContent('No s\'han pogut esborrar els vots de Anna Puig. Torna-ho a provar.');
      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(botoDe('Anna Puig')).toBeEnabled();
    });

    it('el botó queda deshabilitat mentre s\'esborra', async () => {
      const usuari = userEvent.setup();
      let resol;
      deleteDoc.mockReturnValue(new Promise((r) => { resol = r; }));
      await renderitzaIEmet({ tanda: TANDA_OBERTA });
      await usuari.click(await screen.findByRole('button', { name: 'Esborrar tots els vots de Anna Puig' }));
      await acceptaDialeg('Esborra');
      await waitFor(() => expect(botoDe('Anna Puig')).toBeDisabled());
      await act(async () => { resol(); });
      expect(botoDe('Anna Puig')).toBeEnabled();
    });

    it('en arribar el snapshot sense el vot, el soci passa a «Sense començar»', async () => {
      await renderitzaIEmet({ tanda: TANDA_OBERTA });
      await screen.findByRole('table');
      emet('tandes/t1/vots', snapVots(VOTS.filter((v) => v.id !== '12')));
      const fila = files().find((f) => f.textContent.includes('Anna Puig'));
      expect(fila).toHaveTextContent('Sense començar (0/3)');
      expect(within(fila).queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('propostes retirades de la tanda', () => {
    const ambPropostes = (propostes) => getDocs.mockImplementation(
      (ruta) => Promise.resolve(docs({ socis: SOCIS, propostes, sessions: [] }[ruta]))
    );

    it('si una proposta ja no és aprovada/programada, la classificació, el resum i les columnes l\'ignoren', async () => {
      ambPropostes([
        { id: 'p1', titol: 'Stalker', estat: 'aprovada' },
        { id: 'p2', titol: 'Solaris', estat: 'programada' },
        { id: 'p3', titol: 'El mirall', estat: 'rebutjada' },
      ]);
      await renderitzaIEmet();
      await screen.findByRole('table');
      const capcalera = within(screen.getByRole('table')).getAllByRole('row')[0];
      expect(within(capcalera).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Soci', 'Estat', 'Solaris', 'Stalker']);
      // Anna (p1 + p2) i Joan queden completats; Pere, pendent; Rosa (inactiva), en curs 1/2.
      expect(screen.getByText('2 de 3 han votat · 2 han completat · 1 pendents')).toBeInTheDocument();
      expect(files().map(textsDeFila).map((f) => f[1])).toEqual(
        ['Completat', 'Completat', 'Completat', 'En curs (1/2)', 'Sense començar (0/2)']
      );
      expect(screen.queryByText('El mirall')).not.toBeInTheDocument();
    });

    it('una proposta de la tanda que ja no existeix tampoc compta', async () => {
      ambPropostes([
        { id: 'p1', titol: 'Stalker', estat: 'aprovada' },
        { id: 'p2', titol: 'Solaris', estat: 'aprovada' },
      ]);
      await renderitzaIEmet();
      await screen.findByRole('table');
      expect(within(screen.getAllByRole('row')[0]).getAllByRole('columnheader')).toHaveLength(4);
      expect(screen.getAllByTestId('resultat-proposta')).toHaveLength(2);
    });
  });

  it('neteja les subscripcions en desmuntar', async () => {
    const { unmount } = renderitza();
    await vi.waitFor(() => expect(subscripcions['tandes/t1/vots']).toBeDefined());
    expect(onSnapshot).toHaveBeenCalledTimes(2);
    unmount();
    expect(desubscriure).toHaveBeenCalledTimes(2);
  });

  describe('errors de càrrega', () => {
    const MISSATGE = 'No s\'han pogut carregar els resultats.';
    beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
    afterEach(() => vi.mocked(console.error).mockRestore());

    it('mostra l\'error i deixa de carregar si falla onSnapshot', async () => {
      renderitza();
      await vi.waitFor(() => expect(subscripcions['tandes/t1/vots']).toBeDefined());
      emet('tandes/t1/vots-error', new Error('permission-denied'));
      expect(await screen.findByRole('alert')).toHaveTextContent(MISSATGE);
      expect(screen.queryByAltText('Carregant…')).not.toBeInTheDocument();
      expect(console.error).toHaveBeenCalled();
    });

    it('mostra l\'error si falla getDocs', async () => {
      getDocs.mockRejectedValue(new Error('offline'));
      renderitza();
      expect(await screen.findByText(MISSATGE)).toBeInTheDocument();
      expect(screen.queryByAltText('Carregant…')).not.toBeInTheDocument();
    });

    it('«Torna-ho a provar» reintenta la càrrega', async () => {
      const usuari = userEvent.setup();
      getDocs.mockRejectedValueOnce(new Error('offline'));
      renderitza();
      await usuari.click(await screen.findByRole('button', { name: 'Torna-ho a provar' }));
      await vi.waitFor(() => expect(subscripcions['tandes/t1'].length).toBeGreaterThan(1));
      const actual = (ruta) => subscripcions[ruta].at(-1);
      act(() => actual('tandes/t1')(snapTanda(TANDA)));
      act(() => actual('tandes/t1/vots')(snapVots(VOTS)));
      expect(await screen.findByRole('heading', { name: /Novembre/ })).toBeInTheDocument();
      expect(screen.queryByText(MISSATGE)).not.toBeInTheDocument();
    });
  });

  describe('layout estàndard', () => {
    it('fa servir l\'amplada de llista, un sol h1 i l\'enllaç «← Tandes»', async () => {
      await renderitzaIEmet();
      const titol = await screen.findByRole('heading', { level: 1, name: 'Resultats: Novembre' });
      expect(titol.closest('.pagina-admin')).toHaveClass('pagina-admin--llista');
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByRole('link', { name: '← Tandes' })).toHaveAttribute('href', '/tandes');
    });

    it('amb error de càrrega també manté el contenidor de llista i l\'enllaç «← Tandes»', async () => {
      getDocs.mockRejectedValue(new Error('offline'));
      renderitza();
      const avis = await screen.findByRole('alert');
      expect(avis.closest('.pagina-admin')).toHaveClass('pagina-admin--llista');
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByRole('link', { name: '← Tandes' })).toHaveAttribute('href', '/tandes');
    });
  });

  it('torna a la llista si la tanda no existeix', async () => {
    renderitza();
    await vi.waitFor(() => expect(subscripcions['tandes/t1']).toBeDefined());
    emet('tandes/t1', snapTanda(undefined));
    expect(await screen.findByText('Llista de tandes')).toBeInTheDocument();
  });
});
