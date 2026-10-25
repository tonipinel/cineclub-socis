import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter, Routes, Route, useLocation, useNavigationType,
} from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn().mockResolvedValue({ id: 't9' }),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  doc: vi.fn(() => 'DOC_REF'),
  collection: vi.fn((_, ...camí) => camí.join('/')),
  query: vi.fn((ref) => ref),
  limit: vi.fn(),
  serverTimestamp: vi.fn(() => 'TIMESTAMP'),
}));

import {
  addDoc, updateDoc, getDoc, getDocs, collection, doc,
} from 'firebase/firestore';
import TandaForm from './TandaForm';

const DIA = 24 * 60 * 60 * 1000;
const PROPOSTES = [
  { id: 'p1', titol: 'Stalker', estat: 'aprovada', nomProposant: 'Marta Puig', imatgeUrl: '/stalker.jpg' },
  { id: 'p2', titol: 'Pendent film', estat: 'pendent' },
  { id: 'p3', titol: 'Solaris', estat: 'aprovada', nomProposant: 'Pau Serra' },
  { id: 'p4', titol: 'Rebutjada film', estat: 'rebutjada' },
  { id: 'p5', titol: "L'àngel exterminador", estat: 'aprovada', nomProposant: 'Laia' },
];
// p1 té preu propi; p3 agafa el per defecte de la distribuïdora; p5 no té dades internes.
const INTERNES = [
  { id: 'p1', preu: '90', condicions: null, distribuidoraId: 'd2' },
  { id: 'p3', preu: null, distribuidoraId: 'd1' },
];
const DISTRIBUIDORES = [
  { id: 'd1', nom: 'Surtsey Films', preu: 150 },
  { id: 'd2', nom: 'Atalante' },
];
const stamp = (d) => ({ toDate: () => d });

// Ruta actual i tipus de l'última navegació (per comprovar el `replace` en crear).
function Ubicacio() {
  const { pathname } = useLocation();
  return <p data-testid="ubicacio">{`${pathname} ${useNavigationType()}`}</p>;
}

function renderNova() {
  return render(
    <MemoryRouter initialEntries={['/tandes/nova']}>
      <Routes>
        <Route path="/tandes/nova" element={<TandaForm />} />
        <Route path="/tandes/:id" element={<p>Fitxa de la tanda creada</p>} />
        <Route path="/tandes" element={<p>Llistat de tandes</p>} />
      </Routes>
      <Ubicacio />
    </MemoryRouter>
  );
}

function renderExistent() {
  return render(
    <MemoryRouter initialEntries={['/tandes/t1']}>
      <Routes>
        <Route path="/tandes/:id" element={<TandaForm />} />
        <Route path="/tandes" element={<p>Llistat de tandes</p>} />
      </Routes>
    </MemoryRouter>
  );
}

const barra = () => document.querySelector('.barra-desar');
// Després de crear, es passa a la fitxa del nou id substituint «Nova tanda» a l'historial.
async function esperaFitxaCreada() {
  expect(await screen.findByText('Fitxa de la tanda creada')).toBeInTheDocument();
  expect(screen.getByTestId('ubicacio')).toHaveTextContent('/tandes/t9 REPLACE');
}
// Després de desar una tanda existent, es queda a la fitxa amb «Desat ✓».
async function esperaDesat() {
  expect(await within(barra()).findByText('Desat ✓')).toBeInTheDocument();
  expect(screen.queryByText('Llistat de tandes')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1, name: 'Tanda' })).toBeInTheDocument();
}

const docs = (llista) => ({ docs: llista.map(({ id, ...dades }) => ({ id, data: () => dades })) });

// Respon cada lectura segons la col·lecció: propostes, dades internes, distribuïdores, vots de la tanda t1 i
// llistat de tandes. Sense `context`, les dades internes i les distribuïdores fallen (no són imprescindibles).
function respondre({ vots = [], tandes = [], context = false } = {}) {
  getDocs.mockImplementation(async (ref) => {
    if (ref === 'propostes') return docs(PROPOSTES);
    if (context && ref === 'propostesInternes') return docs(INTERNES);
    if (context && ref === 'distribuidores') return docs(DISTRIBUIDORES);
    if (ref === 'tandes/t1/vots') return docs(vots);
    if (ref === 'tandes') return docs(tandes);
    throw new Error(`lectura inesperada: ${ref}`);
  });
}
const respondrePropostes = () => respondre();

const tandaFutura = (extra = {}) => ({
  nom: 'Novembre', propostes: ['p1'], tanca: stamp(new Date(Date.now() + 7 * DIA)), creada: stamp(new Date()), ...extra,
});
const tandaPassada = (extra = {}) => ({
  nom: 'Setembre', propostes: ['p1'], tanca: stamp(new Date('2026-09-30T20:00:00')), creada: stamp(new Date('2026-09-15')), ...extra,
});
const dataFutura = (dies) => {
  const d = new Date(Date.now() + dies * DIA);
  d.setSeconds(0, 0);
  return `${d.toLocaleDateString('sv-SE')}T${d.toLocaleTimeString('sv-SE').slice(0, 5)}`;
};
const AVIS_VOTS = "Ja hi ha vots: tanca la tanda i crea'n una de nova per canviar les propostes.";
const AVIS_OBERTA = "Ja hi ha una tanda oberta. Tanca-la abans d'obrir-ne una altra.";

describe('TandaForm', () => {
  describe('si la càrrega inicial falla', () => {
    const ERROR = "No s'ha pogut carregar la tanda.";

    it('de les propostes, mostra un avís amb el títol i l\'enllaç a Tandes, no el carregador', async () => {
      getDocs.mockRejectedValue(new Error('permission-denied'));
      renderNova();
      expect(await screen.findByRole('alert')).toHaveTextContent(ERROR);
      expect(screen.getByRole('heading', { level: 1, name: 'Nova tanda' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '← Tandes' })).toHaveAttribute('href', '/tandes');
      expect(screen.queryByAltText('Carregant…')).not.toBeInTheDocument();
    });

    it('de la tanda, mostra el mateix avís a la fitxa', async () => {
      respondrePropostes();
      getDoc.mockRejectedValue(new Error('offline'));
      renderExistent();
      expect(await screen.findByRole('alert')).toHaveTextContent(ERROR);
      expect(screen.getByRole('heading', { level: 1, name: 'Tanda' })).toBeInTheDocument();
      expect(screen.queryByAltText('Carregant…')).not.toBeInTheDocument();
      const lectures = getDoc.mock.calls.length;
      fireEvent.click(screen.getByRole('button', { name: 'Torna-ho a provar' }));
      await waitFor(() => expect(getDoc.mock.calls.length).toBeGreaterThan(lectures));
    });
  });

  beforeEach(() => {
    addDoc.mockClear();
    updateDoc.mockClear();
    getDoc.mockReset();
    getDocs.mockReset();
    collection.mockClear();
  });

  it('només ofereix les propostes aprovades, amb el títol', async () => {
    respondrePropostes();
    renderNova();
    expect(await screen.findByRole('checkbox', { name: 'Stalker' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Solaris' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Pendent film' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Rebutjada film' })).not.toBeInTheDocument();
  });

  it('crea la tanda amb nom, propostes marcades, tancament i data de creació', async () => {
    respondrePropostes();
    const user = userEvent.setup();
    renderNova();
    await user.click(await screen.findByRole('checkbox', { name: 'Solaris' }));
    await user.type(screen.getByLabelText('Nom'), '  Novembre ');
    const tanca = new Date(Date.now() + 7 * DIA);
    tanca.setSeconds(0, 0);
    const text = `${tanca.toLocaleDateString('sv-SE')}T${tanca.toLocaleTimeString('sv-SE').slice(0, 5)}`;
    await user.type(screen.getByLabelText('Tanca'), text);
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await esperaFitxaCreada();
    expect(collection.mock.calls.at(-1)[1]).toBe('tandes');
    const [, dades] = addDoc.mock.calls[0];
    expect(dades).toEqual({
      nom: 'Novembre',
      propostes: ['p3'],
      tanca: expect.any(Date),
      creada: 'TIMESTAMP',
    });
    expect(dades.tanca.getTime()).toBe(tanca.getTime());
  });

  it('no desa si falten el nom, les propostes o el tancament', async () => {
    respondrePropostes();
    const user = userEvent.setup();
    renderNova();
    // Un nom en blanc ja és un canvi (sense cap canvi, «Desar» està deshabilitat).
    await user.type(await screen.findByLabelText('Nom'), '  ');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByText('El nom no pot estar en blanc.')).toBeInTheDocument();
    expect(screen.getByText('Cal triar almenys una proposta.')).toBeInTheDocument();
    expect(screen.getByText('Cal indicar un tancament futur.')).toBeInTheDocument();
    expect(addDoc).not.toHaveBeenCalled();
    expect(within(barra()).getByText("No s'ha pogut desar")).toBeInTheDocument();
    expect(within(barra()).getByRole('button', { name: 'Nom: El nom no pot estar en blanc.' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nom')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('ubicacio')).toHaveTextContent('/tandes/nova');
  });

  it('en editar una tanda oberta, desa amb updateDoc sense tocar «creada» i es queda a la fitxa', async () => {
    respondrePropostes();
    const tancaDesada = new Date(Date.now() + 7 * DIA);
    getDoc.mockResolvedValueOnce({
      data: () => ({
        nom: 'Novembre', propostes: ['p1'], tanca: stamp(tancaDesada), creada: stamp(new Date()),
      }),
    });
    const user = userEvent.setup();
    renderExistent();
    expect(await screen.findByRole('checkbox', { name: 'Stalker' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Solaris' })).not.toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Solaris' }));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await esperaDesat();
    expect(addDoc).not.toHaveBeenCalled();
    const [ref, dades] = updateDoc.mock.calls[0];
    expect(ref).toBe('DOC_REF');
    expect(doc).toHaveBeenLastCalledWith(expect.anything(), 'tandes', 't1');
    expect(dades).toEqual({ nom: 'Novembre', propostes: ['p1', 'p3'], tanca: expect.any(Date) });
    // El camp és al minut: es desa el tancament al minut, com abans.
    const esperat = new Date(tancaDesada);
    esperat.setSeconds(0, 0);
    expect(dades.tanca.getTime()).toBe(esperat.getTime());
    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('checkbox', { name: 'Solaris' })).toBeChecked();
  });

  it('«Tancar ara» posa el tancament a l\'instant actual', async () => {
    respondrePropostes();
    getDoc.mockResolvedValueOnce({
      data: () => ({
        nom: 'Novembre', propostes: ['p1'], tanca: stamp(new Date(Date.now() + 7 * DIA)), creada: stamp(new Date()),
      }),
    });
    const user = userEvent.setup();
    renderExistent();
    const abans = Date.now();
    await user.click(await screen.findByRole('button', { name: 'Tancar ara' }));
    // La fitxa es queda i es refresca: ja és tancada (sense «Tancar ara» i amb les propostes bloquejades).
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Tancar ara' })).not.toBeInTheDocument());
    expect(updateDoc).toHaveBeenCalledTimes(1);
    const [ref, dades] = updateDoc.mock.calls[0];
    expect(ref).toBe('DOC_REF');
    expect(doc).toHaveBeenLastCalledWith(expect.anything(), 'tandes', 't1');
    expect(Object.keys(dades)).toEqual(['tanca']);
    expect(dades.tanca.getTime()).toBeGreaterThanOrEqual(abans);
    expect(dades.tanca.getTime()).toBeLessThanOrEqual(Date.now());
    expect(screen.queryByText('Llistat de tandes')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Tanda' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Solaris' })).toBeDisabled();
    expect(within(barra()).getByText('Sense canvis')).toBeInTheDocument();
    // Línia base nova: es pot reanomenar la tanda tancada sense que el tancament (ara passat) doni error.
    await user.type(screen.getByLabelText('Nom'), ' bis');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await esperaDesat();
    expect(updateDoc).toHaveBeenCalledTimes(2);
    expect(updateDoc.mock.calls[1][1]).toMatchObject({ nom: 'Novembre bis', propostes: ['p1'] });
  });

  it('«Tancar ara» no es pot fer amb canvis sense desar (els perdria)', async () => {
    respondrePropostes();
    getDoc.mockResolvedValueOnce({ data: () => tandaFutura() });
    const user = userEvent.setup();
    renderExistent();
    await user.type(await screen.findByLabelText('Nom'), ' bis');
    expect(screen.getByRole('button', { name: 'Tancar ara' })).toBeDisabled();
    expect(screen.getByText('Desa o descarta els canvis abans de tancar la tanda.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Descartar canvis' }));
    expect(screen.getByRole('button', { name: 'Tancar ara' })).toBeEnabled();
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('si «Tancar ara» falla, ho diu amb el seu text i la tanda continua oberta', async () => {
    respondrePropostes();
    getDoc.mockResolvedValueOnce({ data: () => tandaFutura() });
    updateDoc.mockRejectedValueOnce(new Error('xarxa'));
    const user = userEvent.setup();
    renderExistent();
    await user.click(await screen.findByRole('button', { name: 'Tancar ara' }));
    expect(await screen.findByText("No s'ha pogut tancar. Torna-ho a provar.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tancar ara' })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: 'Solaris' })).toBeEnabled();
  });

  it('no ofereix «Tancar ara» en una tanda ja tancada ni en crear', async () => {
    respondrePropostes();
    getDoc.mockResolvedValueOnce({
      data: () => ({
        nom: 'Setembre', propostes: ['p1'], tanca: stamp(new Date('2026-09-30T20:00:00')), creada: stamp(new Date('2026-09-15')),
      }),
    });
    const { unmount } = renderExistent();
    await screen.findByRole('checkbox', { name: 'Stalker' });
    expect(screen.queryByRole('button', { name: 'Tancar ara' })).not.toBeInTheDocument();
    unmount();
    renderNova();
    await screen.findByRole('checkbox', { name: 'Stalker' });
    expect(screen.queryByRole('button', { name: 'Tancar ara' })).not.toBeInTheDocument();
  });

  it('en editar una tanda tancada es pot canviar el nom sense tocar el tancament', async () => {
    respondrePropostes();
    getDoc.mockResolvedValueOnce({
      data: () => ({
        nom: 'Setembre', propostes: ['p1'], tanca: stamp(new Date('2026-09-30T20:00:00')), creada: stamp(new Date('2026-09-15')),
      }),
    });
    const user = userEvent.setup();
    renderExistent();
    await user.type(await screen.findByLabelText('Nom'), ' bis');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await esperaDesat();
    expect(updateDoc.mock.calls[0][1]).toEqual({
      nom: 'Setembre bis', propostes: ['p1'], tanca: new Date('2026-09-30T20:00:00'),
    });
  });

  describe('propostes d\'una tanda oberta amb vots', () => {
    it('sense cap vot, els checkboxes es poden canviar i no hi ha avís', async () => {
      respondre({ vots: [] });
      getDoc.mockResolvedValueOnce({ data: () => tandaFutura() });
      renderExistent();
      expect(await screen.findByRole('checkbox', { name: 'Solaris' })).toBeEnabled();
      expect(screen.queryByText(AVIS_VOTS)).not.toBeInTheDocument();
    });

    it('amb algun vot, els checkboxes queden deshabilitats amb l\'avís, i nom i tancament continuen editables', async () => {
      respondre({ vots: [{ id: '7', valors: { p1: 'like' } }] });
      getDoc.mockResolvedValueOnce({ data: () => tandaFutura() });
      const user = userEvent.setup();
      renderExistent();
      expect(await screen.findByText(AVIS_VOTS)).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Stalker' })).toBeDisabled();
      expect(screen.getByRole('checkbox', { name: 'Solaris' })).toBeDisabled();
      expect(getDocs).toHaveBeenCalledWith('tandes/t1/vots');
      await user.type(screen.getByLabelText('Nom'), ' bis');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      await esperaDesat();
      expect(updateDoc.mock.calls[0][1]).toMatchObject({ nom: 'Novembre bis', propostes: ['p1'] });
    });

    it('si no es poden llegir els vots, es tracta com si n\'hi hagués (per no trencar cap votació)', async () => {
      getDocs.mockImplementation(async (ref) => {
        if (ref === 'propostes') return docs(PROPOSTES);
        throw new Error('permission-denied');
      });
      getDoc.mockResolvedValueOnce({ data: () => tandaFutura() });
      renderExistent();
      expect(await screen.findByText(AVIS_VOTS)).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Solaris' })).toBeDisabled();
    });

    it('en una tanda tancada els checkboxes no es poden editar (és històric), sense l\'avís de vots', async () => {
      respondre();
      getDoc.mockResolvedValueOnce({ data: () => tandaPassada() });
      renderExistent();
      expect(await screen.findByRole('checkbox', { name: 'Stalker' })).toBeDisabled();
      expect(screen.getByRole('checkbox', { name: 'Solaris' })).toBeDisabled();
      expect(screen.getByRole('checkbox', { name: "L'àngel exterminador" })).toBeDisabled();
      expect(screen.queryByText(AVIS_VOTS)).not.toBeInTheDocument();
    });

    it('en crear una tanda nova els checkboxes són editables i no es llegeixen vots', async () => {
      respondre();
      renderNova();
      expect(await screen.findByRole('checkbox', { name: 'Solaris' })).toBeEnabled();
      expect(getDocs).not.toHaveBeenCalledWith('tandes/t1/vots');
    });
  });

  describe('graella de propostes amb context i cerca', () => {
    const cartes = (container) => [...container.querySelectorAll('.carta-proposta-tanda')];
    const titolsVisibles = (container) => cartes(container).map((c) => c.querySelector('.carta-proposta-tanda__titol').textContent);

    it('mostra una carta per proposta aprovada amb proposant, distribuïdora i preu (* si és per defecte)', async () => {
      respondre({ context: true });
      const { container } = renderNova();
      await screen.findByRole('checkbox', { name: 'Stalker' });
      expect(titolsVisibles(container)).toEqual(['Stalker', 'Solaris', "L'àngel exterminador"]);
      const [stalker, solaris, angel] = cartes(container);
      expect(stalker).toHaveTextContent('Proposat per Marta Puig');
      expect(stalker).toHaveTextContent('Atalante');
      expect(within(stalker).getByText(/€/)).toHaveTextContent('90.00€');
      expect(stalker).not.toHaveTextContent('*');
      expect(stalker.querySelector('img')).toHaveAttribute('src', '/stalker.jpg');
      expect(solaris).toHaveTextContent('Surtsey Films');
      expect(within(solaris).getByText(/€/).closest('.carta-proposta-tanda__preu')).toHaveTextContent('150.00€ *');
      expect(angel).toHaveTextContent('Proposat per Laia');
      expect(angel).not.toHaveTextContent('€');
      expect(angel.querySelector('.carta-proposta-tanda__distribuidora')).toBeNull();
    });

    it('si no es poden llegir les dades internes ni les distribuïdores, les cartes es mostren sense preu ni distribuïdora', async () => {
      respondre();
      const { container } = renderNova();
      await screen.findByRole('checkbox', { name: 'Stalker' });
      expect(cartes(container)).toHaveLength(3);
      expect(container).not.toHaveTextContent('€');
      expect(container.querySelector('.carta-proposta-tanda__distribuidora')).toBeNull();
      expect(cartes(container)[0]).toHaveTextContent('Proposat per Marta Puig');
    });

    it('la cerca filtra per títol sense accents ni majúscules', async () => {
      respondre({ context: true });
      const user = userEvent.setup();
      const { container } = renderNova();
      await user.type(await screen.findByRole('searchbox', { name: 'Cerca entre les propostes aprovades' }), 'ANGEL');
      expect(titolsVisibles(container)).toEqual(["L'àngel exterminador"]);
    });

    it('la cerca també troba pel proposant i per la distribuïdora', async () => {
      respondre({ context: true });
      const user = userEvent.setup();
      const { container } = renderNova();
      const cerca = await screen.findByRole('searchbox', { name: 'Cerca entre les propostes aprovades' });
      await user.type(cerca, 'serra');
      expect(titolsVisibles(container)).toEqual(['Solaris']);
      await user.clear(cerca);
      await user.type(cerca, 'atalante');
      expect(titolsVisibles(container)).toEqual(['Stalker']);
      await user.clear(cerca);
      await user.type(cerca, 'res de res');
      expect(cartes(container)).toHaveLength(0);
      expect(screen.getByText('Cap proposta aprovada coincideix amb la cerca.')).toBeInTheDocument();
    });

    it('compta les seleccionades i no perd la selecció amagada per la cerca: es desa en l\'ordre triat', async () => {
      respondre({ context: true });
      const user = userEvent.setup();
      renderNova();
      expect(await screen.findByText('0 seleccionades')).toHaveAttribute('aria-live', 'polite');
      await user.click(screen.getByRole('checkbox', { name: 'Solaris' }));
      expect(screen.getByText('1 seleccionada')).toBeInTheDocument();
      await user.type(screen.getByRole('searchbox', { name: 'Cerca entre les propostes aprovades' }), 'àngel');
      expect(screen.queryByRole('checkbox', { name: 'Solaris' })).not.toBeInTheDocument();
      expect(screen.getByText('1 seleccionada')).toBeInTheDocument();
      await user.click(screen.getByRole('checkbox', { name: "L'àngel exterminador" }));
      expect(screen.getByText('2 seleccionades')).toBeInTheDocument();
      await user.type(screen.getByLabelText('Nom'), 'Novembre');
      await user.type(screen.getByLabelText('Tanca'), dataFutura(7));
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      await esperaFitxaCreada();
      expect(addDoc.mock.calls[0][1]).toEqual({
        nom: 'Novembre', propostes: ['p3', 'p5'], tanca: expect.any(Date), creada: 'TIMESTAMP',
      });
    });

    it('prémer Enter a la cerca no desa la tanda ni en surt', async () => {
      respondre({ context: true });
      getDoc.mockResolvedValueOnce({ data: () => tandaFutura() });
      const user = userEvent.setup();
      renderExistent();
      const cerca = await screen.findByRole('searchbox', { name: 'Cerca entre les propostes aprovades' });
      await user.type(cerca, 'Sol{Enter}');
      expect(screen.getByRole('heading', { level: 1, name: 'Tanda' })).toBeInTheDocument();
      expect(screen.queryByText('Llistat de tandes')).not.toBeInTheDocument();
      expect(updateDoc).not.toHaveBeenCalled();
      expect(addDoc).not.toHaveBeenCalled();
      expect(cerca).toHaveValue('Sol');
    });

    it('prémer Enter al nom continua desant', async () => {
      respondre({ context: true });
      getDoc.mockResolvedValueOnce({ data: () => tandaFutura() });
      const user = userEvent.setup();
      renderExistent();
      await user.type(await screen.findByLabelText('Nom'), ' bis{Enter}');
      await esperaDesat();
      expect(updateDoc.mock.calls[0][1]).toMatchObject({ nom: 'Novembre bis', propostes: ['p1'] });
    });

    it('desa les propostes en l\'ordre en què s\'han clicat, no en el de la graella', async () => {
      respondre({ context: true });
      const user = userEvent.setup();
      renderNova();
      await user.click(await screen.findByRole('checkbox', { name: "L'àngel exterminador" }));
      await user.click(screen.getByRole('checkbox', { name: 'Stalker' }));
      await user.type(screen.getByLabelText('Nom'), 'Novembre');
      await user.type(screen.getByLabelText('Tanca'), dataFutura(7));
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      await esperaFitxaCreada();
      expect(addDoc.mock.calls[0][1].propostes).toEqual(['p5', 'p1']);
    });

    describe('propostes de la tanda que ja no són aprovades', () => {
      const recompte = () => document.querySelector('.tanda-form__recompte');

      it('amb 20 propostes a la tanda i 7 aprovades, avisa que 13 no es mostren', async () => {
        const mesAprovades = Array.from({ length: 4 }, (_, i) => ({ id: `q${i}`, titol: `Aprovada ${i}`, estat: 'aprovada' }));
        getDocs.mockImplementation(async (ref) => {
          if (ref === 'propostes') return docs([...PROPOSTES, ...mesAprovades]);
          throw new Error(`lectura inesperada: ${ref}`);
        });
        const ids = ['p1', 'p3', 'p5', 'q0', 'q1', 'q2', 'q3', 'p2', 'p4', ...Array.from({ length: 11 }, (_, i) => `x${i}`)];
        getDoc.mockResolvedValueOnce({ data: () => tandaPassada({ propostes: ids }) });
        const { container } = renderExistent();
        await screen.findByRole('checkbox', { name: 'Stalker' });
        expect(container.querySelectorAll('.carta-proposta-tanda input:checked')).toHaveLength(7);
        expect(recompte()).toHaveTextContent('20 seleccionades · 13 ja no són aprovades (no es mostren)');
        expect(recompte()).toHaveAttribute('aria-live', 'polite');
      });

      it('en singular si només n\'hi ha una', async () => {
        respondre({ context: true });
        getDoc.mockResolvedValueOnce({ data: () => tandaPassada({ propostes: ['p1', 'p2'] }) });
        renderExistent();
        await screen.findByRole('checkbox', { name: 'Stalker' });
        expect(recompte()).toHaveTextContent('2 seleccionades · 1 ja no és aprovada (no es mostra)');
      });

      it('sense avís si totes les de la tanda són aprovades', async () => {
        respondre({ context: true });
        getDoc.mockResolvedValueOnce({ data: () => tandaPassada({ propostes: ['p1', 'p3'] }) });
        renderExistent();
        await screen.findByRole('checkbox', { name: 'Stalker' });
        expect(recompte().textContent).toBe('2 seleccionades');
      });

      it('també avisa si no queda cap proposta aprovada', async () => {
        getDocs.mockImplementation(async (ref) => {
          if (ref === 'propostes') return docs(PROPOSTES.filter((p) => p.estat !== 'aprovada'));
          throw new Error(`lectura inesperada: ${ref}`);
        });
        getDoc.mockResolvedValueOnce({ data: () => tandaPassada({ propostes: ['p1', 'p3'] }) });
        renderExistent();
        expect(await screen.findByText('No hi ha cap proposta aprovada.')).toBeInTheDocument();
        expect(recompte()).toHaveTextContent('2 seleccionades · 2 ja no són aprovades (no es mostren)');
        expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
      });
    });

    it('en buidar la cerca, la carta seleccionada torna marcada', async () => {
      respondre({ context: true });
      const user = userEvent.setup();
      renderNova();
      await user.click(await screen.findByRole('checkbox', { name: 'Stalker' }));
      const cerca = screen.getByRole('searchbox', { name: 'Cerca entre les propostes aprovades' });
      await user.type(cerca, 'solaris');
      await user.clear(cerca);
      expect(screen.getByRole('checkbox', { name: 'Stalker' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Solaris' })).not.toBeChecked();
    });
  });

  describe('només una tanda oberta alhora', () => {
    const altraOberta = { id: 't2', nom: 'Altra', propostes: ['p3'], tanca: stamp(new Date(Date.now() + 3 * DIA)), creada: stamp(new Date()) };

    it('no desa una tanda nova si ja n\'hi ha una d\'oberta (entrada per URL directa)', async () => {
      respondre({ tandes: [altraOberta] });
      const user = userEvent.setup();
      renderNova();
      await user.click(await screen.findByRole('checkbox', { name: 'Solaris' }));
      await user.type(screen.getByLabelText('Nom'), 'Novembre');
      await user.type(screen.getByLabelText('Tanca'), dataFutura(7));
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      expect(await screen.findByText(AVIS_OBERTA)).toBeInTheDocument();
      expect(within(barra()).getByRole('button', { name: `Tanca: ${AVIS_OBERTA}` })).toBeInTheDocument();
      expect(within(barra()).getByRole('alert')).toHaveTextContent("No s'ha pogut desar");
      expect(addDoc).not.toHaveBeenCalled();
      expect(screen.getByTestId('ubicacio')).toHaveTextContent('/tandes/nova');
      // Canviar el tancament treu l'error (és el camp que fa que la tanda quedi oberta).
      const tanca = screen.getByLabelText('Tanca');
      await user.clear(tanca);
      expect(screen.queryByText(AVIS_OBERTA)).not.toBeInTheDocument();
    });

    it('desa una tanda nova si les altres són tancades', async () => {
      respondre({ tandes: [{ ...altraOberta, tanca: stamp(new Date('2026-09-30')) }] });
      const user = userEvent.setup();
      renderNova();
      await user.click(await screen.findByRole('checkbox', { name: 'Solaris' }));
      await user.type(screen.getByLabelText('Nom'), 'Novembre');
      await user.type(screen.getByLabelText('Tanca'), dataFutura(7));
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      await esperaFitxaCreada();
      expect(addDoc).toHaveBeenCalledTimes(1);
    });

    it('reanomenar una tanda tancada sense tocar el tancament es desa encara que n\'hi hagi una altra d\'oberta', async () => {
      respondre({ tandes: [altraOberta, { id: 't1', ...tandaPassada() }] });
      getDoc.mockResolvedValueOnce({ data: () => tandaPassada() });
      const user = userEvent.setup();
      renderExistent();
      await user.type(await screen.findByLabelText('Nom'), ' bis');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      await esperaDesat();
      expect(screen.queryByText(AVIS_OBERTA)).not.toBeInTheDocument();
      expect(updateDoc.mock.calls[0][1]).toMatchObject({ nom: 'Setembre bis' });
    });

    it('no reobre una tanda tancada (tancament futur) si n\'hi ha una altra d\'oberta', async () => {
      respondre({ tandes: [altraOberta, { id: 't1', ...tandaPassada() }] });
      getDoc.mockResolvedValueOnce({ data: () => tandaPassada() });
      const user = userEvent.setup();
      renderExistent();
      const tanca = await screen.findByLabelText('Tanca');
      await user.clear(tanca);
      await user.type(tanca, dataFutura(7));
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      expect(await screen.findByText(AVIS_OBERTA)).toBeInTheDocument();
      expect(within(barra()).getByRole('button', { name: `Tanca: ${AVIS_OBERTA}` })).toBeInTheDocument();
      expect(updateDoc).not.toHaveBeenCalled();
    });

    it('reobre una tanda tancada si no n\'hi ha cap altra d\'oberta', async () => {
      respondre({ tandes: [{ id: 't1', ...tandaPassada() }] });
      getDoc.mockResolvedValueOnce({ data: () => tandaPassada() });
      const user = userEvent.setup();
      renderExistent();
      const tanca = await screen.findByLabelText('Tanca');
      await user.clear(tanca);
      await user.type(tanca, dataFutura(7));
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      await esperaDesat();
      expect(updateDoc).toHaveBeenCalledTimes(1);
    });

    it('en reobrir una tanda tancada que ja té vots, la fitxa es queda amb les propostes bloquejades', async () => {
      respondre({ tandes: [{ id: 't1', ...tandaPassada() }], vots: [{ id: '7', valors: { p1: 'like' } }] });
      getDoc.mockResolvedValueOnce({ data: () => tandaPassada() });
      const user = userEvent.setup();
      renderExistent();
      const tanca = await screen.findByLabelText('Tanca');
      await user.clear(tanca);
      await user.type(tanca, dataFutura(7));
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      await esperaDesat();
      expect(screen.getByText(AVIS_VOTS)).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Solaris' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Tancar ara' })).toBeEnabled();
    });

    it('editar la mateixa tanda oberta no compta com una segona (s\'exclou a si mateixa)', async () => {
      respondre({ tandes: [{ id: 't1', ...tandaFutura() }] });
      getDoc.mockResolvedValueOnce({ data: () => tandaFutura() });
      const user = userEvent.setup();
      renderExistent();
      await user.type(await screen.findByLabelText('Nom'), ' bis');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      await esperaDesat();
      expect(updateDoc).toHaveBeenCalledTimes(1);
    });
  });
});

describe('TandaForm: cicle d\'edició', () => {
  beforeEach(() => {
    addDoc.mockClear();
    updateDoc.mockClear();
    getDoc.mockReset();
    getDocs.mockReset();
  });

  it('obrir una tanda i no tocar res: «Sense canvis», «Desar» deshabilitat i sense «Descartar canvis»', async () => {
    respondre();
    getDoc.mockResolvedValueOnce({ data: () => tandaFutura() });
    renderExistent();
    await screen.findByRole('checkbox', { name: 'Stalker' });
    expect(within(barra()).getByText('Sense canvis')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desar' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Descartar canvis' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nom')).not.toHaveAttribute('readonly');
  });

  it('editar passa a «Hi ha canvis sense desar» i «Descartar canvis» torna als valors desats sense escriure', async () => {
    respondre();
    getDoc.mockResolvedValueOnce({ data: () => tandaFutura() });
    const user = userEvent.setup();
    renderExistent();
    const nom = await screen.findByLabelText('Nom');
    const tancaInicial = screen.getByLabelText('Tanca').value;
    await user.type(nom, ' bis');
    await user.click(screen.getByRole('checkbox', { name: 'Solaris' }));
    await user.clear(screen.getByLabelText('Tanca'));
    expect(within(barra()).getByText('Hi ha canvis sense desar')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Descartar canvis' }));
    expect(nom).toHaveValue('Novembre');
    expect(screen.getByRole('checkbox', { name: 'Solaris' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Stalker' })).toBeChecked();
    expect(screen.getByLabelText('Tanca')).toHaveValue(tancaInicial);
    expect(within(barra()).getByText('Sense canvis')).toBeInTheDocument();
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('després de desar es queda a la fitxa, continua editable i un segon desat parteix de la línia base nova', async () => {
    respondre();
    getDoc.mockResolvedValueOnce({ data: () => tandaFutura() });
    const user = userEvent.setup();
    renderExistent();
    const nom = await screen.findByLabelText('Nom');
    await user.type(nom, ' bis');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await esperaDesat();
    expect(screen.getByRole('link', { name: '← Tandes' })).toHaveAttribute('href', '/tandes');
    await user.click(screen.getByRole('checkbox', { name: 'Solaris' }));
    expect(within(barra()).getByText('Hi ha canvis sense desar')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(2));
    expect(updateDoc.mock.calls[1][1]).toEqual({ nom: 'Novembre bis', propostes: ['p1', 'p3'], tanca: expect.any(Date) });
    expect(nom).toHaveValue('Novembre bis');
  });

  it('si l\'escriptura falla, la barra ho diu i els canvis es conserven', async () => {
    respondre();
    getDoc.mockResolvedValueOnce({ data: () => tandaFutura() });
    updateDoc.mockRejectedValueOnce(new Error('xarxa'));
    const user = userEvent.setup();
    renderExistent();
    await user.type(await screen.findByLabelText('Nom'), ' bis');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await within(barra()).findByRole('alert')).toHaveTextContent("No s'ha pogut desar. Torna-ho a provar.");
    expect(screen.getByLabelText('Nom')).toHaveValue('Novembre bis');
    expect(screen.getByRole('button', { name: 'Desar' })).toBeEnabled();
  });

  it('amb canvis sense desar, sortir per un enllaç demana confirmació', async () => {
    respondre();
    getDoc.mockResolvedValueOnce({ data: () => tandaFutura() });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderExistent();
    await user.type(await screen.findByLabelText('Nom'), ' bis');
    await user.click(screen.getByRole('link', { name: '← Tandes' }));
    expect(confirm).toHaveBeenCalledWith('Hi ha canvis sense desar. Vols sortir igualment?');
    expect(screen.queryByText('Llistat de tandes')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nom')).toHaveValue('Novembre bis');
    confirm.mockRestore();
  });

  it('sense canvis, sortir per l\'enllaç no demana confirmació', async () => {
    respondre();
    getDoc.mockResolvedValueOnce({ data: () => tandaFutura() });
    const confirm = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();
    renderExistent();
    await user.click(await screen.findByRole('link', { name: '← Tandes' }));
    expect(await screen.findByText('Llistat de tandes')).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('en crear, un doble clic a «Desar» escriu un sol document', async () => {
    respondre();
    let resol;
    addDoc.mockImplementationOnce(() => new Promise((r) => { resol = r; }));
    const user = userEvent.setup();
    renderNova();
    await user.click(await screen.findByRole('checkbox', { name: 'Solaris' }));
    await user.type(screen.getByLabelText('Nom'), 'Novembre');
    await user.type(screen.getByLabelText('Tanca'), dataFutura(7));
    await user.dblClick(screen.getByRole('button', { name: 'Desar' }));
    await waitFor(() => expect(addDoc).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(within(barra()).getByText('Desant…')).toBeInTheDocument();
    resol({ id: 't9' });
    await esperaFitxaCreada();
    expect(addDoc).toHaveBeenCalledTimes(1);
  });
});

describe('TandaForm: layout estàndard', () => {
  beforeEach(() => {
    getDoc.mockReset();
    getDocs.mockReset();
    respondrePropostes();
  });

  it('nova: formulari estret amb un sol h1 «Nova tanda» i l\'enllaç «← Tandes»', async () => {
    const { container } = renderNova();
    await screen.findByRole('checkbox', { name: 'Stalker' });
    expect(container.firstChild.tagName).toBe('FORM');
    expect(container.firstChild).toHaveClass('pagina-admin', 'pagina-admin--formulari', 'pagina-admin--amb-barra');
    const titols = screen.getAllByRole('heading', { level: 1 });
    expect(titols).toHaveLength(1);
    expect(titols[0]).toHaveTextContent('Nova tanda');
    expect(screen.getByRole('link', { name: '← Tandes' })).toHaveAttribute('href', '/tandes');
  });

  it('existent: un sol h1 «Tanda» i l\'enllaç «← Tandes»', async () => {
    getDoc.mockResolvedValue({ data: () => tandaPassada() });
    renderExistent();
    const titol = await screen.findByRole('heading', { level: 1, name: 'Tanda' });
    expect(titol.closest('form')).toHaveClass('pagina-admin', 'pagina-admin--formulari', 'pagina-admin--amb-barra');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: '← Tandes' })).toHaveAttribute('href', '/tandes');
  });
});
