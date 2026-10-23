import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn().mockResolvedValue({ id: 'nova' }),
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
  addDoc, updateDoc, getDoc, getDocs, collection,
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

function renderNova() {
  return render(
    <MemoryRouter initialEntries={['/tandes/nova']}>
      <Routes>
        <Route path="/tandes/nova" element={<TandaForm />} />
        <Route path="/tandes" element={<p>Llistat de tandes</p>} />
      </Routes>
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
    expect(await screen.findByText('Llistat de tandes')).toBeInTheDocument();
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
    await user.click(await screen.findByRole('button', { name: 'Desar' }));
    expect(await screen.findByText('El nom no pot estar en blanc.')).toBeInTheDocument();
    expect(screen.getByText('Cal triar almenys una proposta.')).toBeInTheDocument();
    expect(screen.getByText('Cal indicar un tancament futur.')).toBeInTheDocument();
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('en editar una tanda oberta, desa amb updateDoc sense tocar «creada»', async () => {
    respondrePropostes();
    getDoc.mockResolvedValueOnce({
      data: () => ({
        nom: 'Novembre', propostes: ['p1'], tanca: stamp(new Date(Date.now() + 7 * DIA)), creada: stamp(new Date()),
      }),
    });
    const user = userEvent.setup();
    renderExistent();
    expect(await screen.findByRole('checkbox', { name: 'Stalker' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Solaris' })).not.toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Solaris' }));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByText('Llistat de tandes')).toBeInTheDocument();
    expect(addDoc).not.toHaveBeenCalled();
    const [ref, dades] = updateDoc.mock.calls[0];
    expect(ref).toBe('DOC_REF');
    expect(dades).toEqual({ nom: 'Novembre', propostes: ['p1', 'p3'], tanca: expect.any(Date) });
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
    expect(await screen.findByText('Llistat de tandes')).toBeInTheDocument();
    const dades = updateDoc.mock.calls[0][1];
    expect(dades.tanca.getTime()).toBeGreaterThanOrEqual(abans);
    expect(dades.tanca.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('no ofereix «Tancar ara» en una tanda ja tancada ni en crear', async () => {
    respondrePropostes();
    getDoc.mockResolvedValueOnce({
      data: () => ({
        nom: 'Setembre', propostes: ['p1'], tanca: stamp(new Date('2026-09-30T20:00:00')), creada: stamp(new Date('2026-09-15')),
      }),
    });
    renderExistent();
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
    expect(await screen.findByText('Llistat de tandes')).toBeInTheDocument();
    expect(updateDoc.mock.calls[0][1]).toMatchObject({ nom: 'Setembre bis' });
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
      expect(await screen.findByText('Llistat de tandes')).toBeInTheDocument();
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
      expect(await screen.findByText('Llistat de tandes')).toBeInTheDocument();
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
      expect(await screen.findByText('Llistat de tandes')).toBeInTheDocument();
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
      expect(await screen.findByText('Llistat de tandes')).toBeInTheDocument();
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
      expect(addDoc).not.toHaveBeenCalled();
    });

    it('desa una tanda nova si les altres són tancades', async () => {
      respondre({ tandes: [{ ...altraOberta, tanca: stamp(new Date('2026-09-30')) }] });
      const user = userEvent.setup();
      renderNova();
      await user.click(await screen.findByRole('checkbox', { name: 'Solaris' }));
      await user.type(screen.getByLabelText('Nom'), 'Novembre');
      await user.type(screen.getByLabelText('Tanca'), dataFutura(7));
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      expect(await screen.findByText('Llistat de tandes')).toBeInTheDocument();
      expect(addDoc).toHaveBeenCalledTimes(1);
    });

    it('reanomenar una tanda tancada sense tocar el tancament es desa encara que n\'hi hagi una altra d\'oberta', async () => {
      respondre({ tandes: [altraOberta, { id: 't1', ...tandaPassada() }] });
      getDoc.mockResolvedValueOnce({ data: () => tandaPassada() });
      const user = userEvent.setup();
      renderExistent();
      await user.type(await screen.findByLabelText('Nom'), ' bis');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      expect(await screen.findByText('Llistat de tandes')).toBeInTheDocument();
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
      expect(await screen.findByText('Llistat de tandes')).toBeInTheDocument();
      expect(updateDoc).toHaveBeenCalledTimes(1);
    });

    it('editar la mateixa tanda oberta no compta com una segona (s\'exclou a si mateixa)', async () => {
      respondre({ tandes: [{ id: 't1', ...tandaFutura() }] });
      getDoc.mockResolvedValueOnce({ data: () => tandaFutura() });
      const user = userEvent.setup();
      renderExistent();
      await user.type(await screen.findByLabelText('Nom'), ' bis');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      expect(await screen.findByText('Llistat de tandes')).toBeInTheDocument();
      expect(updateDoc).toHaveBeenCalledTimes(1);
    });
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
    expect(container.firstChild).toHaveClass('pagina-admin', 'pagina-admin--formulari');
    const titols = screen.getAllByRole('heading', { level: 1 });
    expect(titols).toHaveLength(1);
    expect(titols[0]).toHaveTextContent('Nova tanda');
    expect(screen.getByRole('link', { name: '← Tandes' })).toHaveAttribute('href', '/tandes');
  });

  it('existent: un sol h1 «Tanda» i l\'enllaç «← Tandes»', async () => {
    getDoc.mockResolvedValue({ data: () => tandaPassada() });
    renderExistent();
    expect(await screen.findByRole('heading', { level: 1, name: 'Tanda' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: '← Tandes' })).toHaveAttribute('href', '/tandes');
  });
});
