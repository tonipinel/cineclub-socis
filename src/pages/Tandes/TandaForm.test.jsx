import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  { id: 'p1', titol: 'Stalker', estat: 'aprovada' },
  { id: 'p2', titol: 'Pendent film', estat: 'pendent' },
  { id: 'p3', titol: 'Solaris', estat: 'aprovada' },
  { id: 'p4', titol: 'Rebutjada film', estat: 'rebutjada' },
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

// Respon cada lectura segons la col·lecció: propostes, vots de la tanda t1 i llistat de tandes.
function respondre({ vots = [], tandes = [] } = {}) {
  getDocs.mockImplementation(async (ref) => {
    if (ref === 'propostes') return docs(PROPOSTES);
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
      expect(screen.queryByText(AVIS_VOTS)).not.toBeInTheDocument();
    });

    it('en crear una tanda nova els checkboxes són editables i no es llegeixen vots', async () => {
      respondre();
      renderNova();
      expect(await screen.findByRole('checkbox', { name: 'Solaris' })).toBeEnabled();
      expect(getDocs).not.toHaveBeenCalledWith('tandes/t1/vots');
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
