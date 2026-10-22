import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  act, render, screen, within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...segments) => segments.join('/')),
  doc: vi.fn((_db, ...segments) => segments.join('/')),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
}));

import { getDocs, onSnapshot } from 'firebase/firestore';
import TandaResultats from './TandaResultats';

const stamp = (d) => ({ toDate: () => d });
const docs = (llista) => ({ docs: llista.map((d) => ({ id: d.id, data: () => d })) });

const TANDA = { nom: 'Novembre', propostes: ['p1', 'p2', 'p3'], tanca: stamp(new Date('2026-11-30T20:00:00')) };
const PROPOSTES = [
  { id: 'p1', titol: 'Stalker', estat: 'aprovada' },
  { id: 'p2', titol: 'Solaris', estat: 'programada' },
  { id: 'p3', titol: 'El mirall', estat: 'aprovada' },
];
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

const renderitza = () => render(
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
    getDocs.mockReset();
    getDocs.mockImplementation((ruta) => Promise.resolve(docs({ socis: SOCIS, propostes: PROPOSTES }[ruta])));
  });

  it('mostra el nom de la tanda', async () => {
    await renderitzaIEmet();
    expect(await screen.findByRole('heading', { name: /Novembre/ })).toBeInTheDocument();
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

  it('mostra la matriu amb una fila per soci, ordenada En curs, Sense començar i Completats', async () => {
    await renderitzaIEmet();
    const taula = await screen.findByRole('table');
    const capcalera = within(taula).getAllByRole('row')[0];
    expect(within(capcalera).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Soci', 'Estat', 'Stalker', 'Solaris', 'El mirall']);
    expect(within(capcalera).getByRole('columnheader', { name: 'Stalker' })).toHaveAttribute('title', 'Stalker');
    expect(files().map(textsDeFila)).toEqual([
      ['Anna Puignúm. 12', 'En curs (2/3)', '👎', '👍', '—'],
      ['Núm. 77no elegible', 'En curs (2/3)', '👎', '👎', '—'],
      ['Rosa Masnúm. 80no elegible', 'En curs (1/3)', '👍', '—', '—'],
      ['Pere Vilanúm. 55', 'Sense començar (0/3)', '—', '—', '—'],
      ['Joan Serranúm. 40', 'Completat', '👍', '👍', '👍'],
    ]);
  });

  it('marca capçaleres de columna i de fila, i dona text alternatiu als vots', async () => {
    await renderitzaIEmet();
    const taula = await screen.findByRole('table');
    within(taula).getAllByRole('columnheader').forEach((c) => expect(c).toHaveAttribute('scope', 'col'));
    const rowheaders = within(taula).getAllByRole('rowheader');
    expect(rowheaders).toHaveLength(5);
    rowheaders.forEach((c) => expect(c).toHaveAttribute('scope', 'row'));
    const filaAnna = files()[0];
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
    expect(files().map(textsDeFila).map((f) => f[0])).toEqual(['Joan Serranúm. 40']);
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

  describe('propostes retirades de la tanda', () => {
    const ambPropostes = (propostes) => getDocs.mockImplementation(
      (ruta) => Promise.resolve(docs({ socis: SOCIS, propostes }[ruta]))
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
      expect(within(capcalera).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Soci', 'Estat', 'Stalker', 'Solaris']);
      // Anna (p1 + p2) i Joan queden completats; Pere, pendent; Rosa (inactiva), en curs 1/2.
      expect(screen.getByText('2 de 3 han votat · 2 han completat · 1 pendents')).toBeInTheDocument();
      expect(files().map(textsDeFila).map((f) => f[1])).toEqual(
        ['En curs (1/2)', 'Sense començar (0/2)', 'Completat', 'Completat', 'Completat']
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
    const MISSATGE = 'No s\'han pogut carregar els resultats. Torna-ho a provar.';

    it('mostra l\'error i deixa de carregar si falla onSnapshot', async () => {
      renderitza();
      await vi.waitFor(() => expect(subscripcions['tandes/t1/vots']).toBeDefined());
      emet('tandes/t1/vots-error', new Error('permission-denied'));
      expect(await screen.findByText(MISSATGE)).toBeInTheDocument();
      expect(screen.queryByAltText('Carregant…')).not.toBeInTheDocument();
    });

    it('mostra l\'error si falla getDocs', async () => {
      getDocs.mockRejectedValue(new Error('offline'));
      renderitza();
      expect(await screen.findByText(MISSATGE)).toBeInTheDocument();
      expect(screen.queryByAltText('Carregant…')).not.toBeInTheDocument();
    });

    it('«Tornar a provar» reintenta la càrrega', async () => {
      const usuari = userEvent.setup();
      getDocs.mockRejectedValueOnce(new Error('offline'));
      renderitza();
      await usuari.click(await screen.findByRole('button', { name: 'Tornar a provar' }));
      await vi.waitFor(() => expect(subscripcions['tandes/t1'].length).toBeGreaterThan(1));
      const actual = (ruta) => subscripcions[ruta].at(-1);
      act(() => actual('tandes/t1')(snapTanda(TANDA)));
      act(() => actual('tandes/t1/vots')(snapVots(VOTS)));
      expect(await screen.findByRole('heading', { name: /Novembre/ })).toBeInTheDocument();
      expect(screen.queryByText(MISSATGE)).not.toBeInTheDocument();
    });
  });

  it('torna a la llista si la tanda no existeix', async () => {
    renderitza();
    await vi.waitFor(() => expect(subscripcions['tandes/t1']).toBeDefined());
    emet('tandes/t1', snapTanda(undefined));
    expect(await screen.findByText('Llista de tandes')).toBeInTheDocument();
  });
});
