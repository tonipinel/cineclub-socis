import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {}, storage: { app: { options: { storageBucket: 'cinema.test' } } } }));
vi.mock('firebase/storage', () => ({ ref: vi.fn(), uploadBytes: vi.fn(), deleteObject: vi.fn() }));
vi.mock('../../lib/pellicules', () => ({ cercarPellicules: vi.fn(), assignarPellicula: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  setDoc: vi.fn(),
  query: vi.fn((c) => c),
  where: vi.fn(),
  runTransaction: vi.fn(),
  writeBatch: vi.fn(),
}));

import {
  collection, deleteDoc, doc, getDoc, getDocs, runTransaction, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { deleteObject, ref, uploadBytes } from 'firebase/storage';
import { assignarPellicula, cercarPellicules } from '../../lib/pellicules';
import PropostaForm from './PropostaForm';
import {
  acceptaDialeg, cancellaDialeg, dialegConfirmacio, hiHaDialegConfirmacio, renderAmbConfirmacio, tancaDialegAmbEsc,
} from '../../test/confirmacio';

const SOCIS = [
  { id: 's7', nom: 'Anna', cognoms: 'Vidal', numeroSoci: 7 },
  { id: 's9', nom: 'Toni', cognoms: 'Pinel', numeroSoci: 9 },
];
const DISTRIBUIDORES = [
  {
    id: 'd2', nom: 'Surtsey Films', web: 'surtseyfilms.com', contacte: 'Marta', correu: 'marta@surtsey.test', preu: 150, condicions: 'Només en dimecres',
  },
  { id: 'd1', nom: 'Atalante', web: '', contacte: '', correu: '' },
];
const PROPOSTA = {
  titol: 'Amélie', numeroSoci: 7, estat: 'pendent', comentari: 'Molt bona!', tmdbId: 5,
};

const docsDe = (llista) => ({ docs: llista.map((d) => ({ id: d.id, data: () => d })) });

// Mocks de Firestore per camí: `falla` fa fallar la lectura d'aquests camins (col·lecció o document).
// `sessionsDespres`: les sessions que veu una segona lectura (p. ex. una sessió creada després d'obrir la fitxa).
function preparar({
  proposta = PROPOSTA, interna, socis = SOCIS, distribuidores = DISTRIBUIDORES, tandes = [], sessions = [], sessionsDespres, falla = [],
} = {}) {
  collection.mockImplementation((_db, ...cami) => ({ path: cami.join('/') }));
  doc.mockImplementation((_db, ...cami) => ({ path: cami.join('/'), id: cami[cami.length - 1] }));
  getDoc.mockImplementation(async (ref) => {
    if (falla.includes(ref.path)) throw new Error('boom');
    if (ref.path === 'propostes/p1') return { data: () => proposta };
    if (ref.path === 'propostesInternes/p1') return { data: () => interna };
    return { data: () => undefined };
  });
  let lecturesSessions = 0;
  getDocs.mockImplementation(async (ref) => {
    if (falla.includes(ref.path)) throw new Error('boom');
    if (ref.path === 'sessions') {
      lecturesSessions += 1;
      return docsDe(lecturesSessions > 1 && sessionsDespres ? sessionsDespres : sessions);
    }
    return docsDe({ socis, distribuidores, tandes }[ref.path] ?? []);
  });
}

function UbicacioProva() {
  return <p>Edició de sessió a {useLocation().pathname}</p>;
}

function Cerca() {
  return <p data-testid="cerca">{useLocation().search}</p>;
}

function renderFitxa(url = '/propostes/pendents/p1') {
  return renderAmbConfirmacio(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/propostes/pendents/:id" element={<><PropostaForm /><Cerca /></>} />
        <Route path="/propostes/pendents" element={<p>Llistat de propostes</p>} />
        <Route path="/sessions/:id" element={<UbicacioProva />} />
      </Routes>
    </MemoryRouter>,
  );
}

const pestanya = (nom) => screen.getByRole('tab', { name: new RegExp(`^${nom}`) });
const botoDesar = () => screen.getByRole('button', { name: 'Desar' });
const titol = () => screen.findByRole('heading', { level: 1, name: 'Amélie' });

async function obrirGestio(opcions) {
  preparar(opcions);
  const user = userEvent.setup();
  const render = renderFitxa('/propostes/pendents/p1?pestanya=gestio');
  await screen.findByLabelText('Estat');
  return { user, ...render };
}

// Lot d'escriptura (writeBatch) compartit per tots els desats d'una prova: `lot.update`/`lot.set` acumulen les crides.
let lot;

function senseEscriptures() {
  expect(updateDoc).not.toHaveBeenCalled();
  expect(setDoc).not.toHaveBeenCalled();
  expect(deleteDoc).not.toHaveBeenCalled();
  expect(lot.update).not.toHaveBeenCalled();
  expect(lot.set).not.toHaveBeenCalled();
  expect(lot.commit).not.toHaveBeenCalled();
}

// Espera que s'hagin fet `vegades` commits i que el desat hagi acabat (no depèn del «Desat ✓» transitori).
async function esperaDesat(vegades = 1) {
  await waitFor(() => expect(lot.commit).toHaveBeenCalledTimes(vegades), { timeout: 3000 });
  await waitFor(() => expect(screen.queryByText('Desant…')).not.toBeInTheDocument(), { timeout: 3000 });
}

// Cap escriptura directa: tot passa pel lot.
function nomesPelLot() {
  expect(updateDoc).not.toHaveBeenCalled();
  expect(setDoc).not.toHaveBeenCalled();
}

beforeEach(() => {
  updateDoc.mockReset().mockResolvedValue(undefined);
  setDoc.mockReset().mockResolvedValue(undefined);
  deleteDoc.mockReset().mockResolvedValue(undefined);
  getDoc.mockReset();
  getDocs.mockReset();
  where.mockClear();
  runTransaction.mockReset();
  lot = { update: vi.fn(), set: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };
  writeBatch.mockReset().mockImplementation(() => lot);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PropostaForm: càrrega, capçalera i pestanyes', () => {
  it('per defecte obre el Resum, sense barra de desar, amb un sol h1, amplada de fitxa i «← Propostes»', async () => {
    preparar();
    const { container } = renderFitxa();
    await titol();
    expect(pestanya('Resum')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'panell-resum');
    expect(screen.queryByRole('button', { name: 'Desar' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(container.firstChild.tagName).toBe('FORM');
    expect(container.firstChild).toHaveClass('pagina-admin', 'pagina-admin--fitxa');
    expect(container.firstChild).not.toHaveClass('pagina-admin--amb-barra');
    expect(screen.getByRole('link', { name: '← Propostes' })).toHaveAttribute('href', '/propostes/pendents');
    expect(screen.queryByRole('button', { name: 'Editar dades' })).not.toBeInTheDocument();
  });

  it('una pestanya invàlida a ?pestanya= cau al Resum sense error', async () => {
    preparar();
    renderFitxa('/propostes/pendents/p1?pestanya=xyz');
    await titol();
    expect(pestanya('Resum')).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('?pestanya=gestio obre Gestió amb la barra de desar i la reserva d\'espai a sota', async () => {
    const { container } = await obrirGestio();
    expect(pestanya('Gestió')).toHaveAttribute('aria-selected', 'true');
    expect(botoDesar()).toBeDisabled();
    expect(botoDesar()).toHaveAttribute('type', 'submit');
    expect(container.firstChild).toHaveClass('pagina-admin--amb-barra');
    expect(container.firstChild).toContainElement(botoDesar());
  });

  it('canviar de pestanya actualitza ?pestanya=', async () => {
    preparar();
    const user = userEvent.setup();
    renderFitxa();
    await titol();
    await user.click(pestanya('Gestió'));
    expect(screen.getByTestId('cerca')).toHaveTextContent('?pestanya=gestio');
    expect(screen.getByLabelText('Estat')).toBeInTheDocument();
    await user.click(pestanya('Resum'));
    expect(screen.getByTestId('cerca')).toHaveTextContent('?pestanya=resum');
  });

  it.each([['pellicula', 'Pel·lícula'], ['mitjans', 'Mitjans']])('la pestanya %s existeix i té la barra de desar', async (id, nom) => {
    preparar();
    renderFitxa(`/propostes/pendents/p1?pestanya=${id}`);
    await titol();
    expect(pestanya(nom)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', `panell-${id}`);
    expect(botoDesar()).toBeDisabled();
  });

  it.each([
    ['falla la lectura', { falla: ['propostes/p1'] }],
    // `null` i no `undefined`, que faria servir la proposta per defecte de `preparar`.
    ['no existeix', { proposta: null }],
  ])('si la proposta %s, mostra un error amb l\'enllaç «← Propostes»', async (_cas, opcions) => {
    preparar(opcions);
    renderFitxa();
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'ha pogut carregar la proposta.");
    expect(screen.getByRole('link', { name: '← Propostes' })).toHaveAttribute('href', '/propostes/pendents');
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('si fallen els socis, les distribuïdores, les tandes i les sessions, la fitxa es mostra igualment', async () => {
    preparar({ falla: ['socis', 'distribuidores', 'tandes', 'sessions'] });
    renderFitxa();
    await titol();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('la capçalera mostra el cartell, el lema, l\'estat i les tandes (amb «oberta»)', async () => {
    const futur = { toDate: () => new Date(Date.now() + 86400000) };
    const passat = { toDate: () => new Date('2026-01-31T20:00:00') };
    preparar({
      proposta: {
        ...PROPOSTA, estat: 'aprovada', lema: 'Un lema', imatgeUrl: 'https://exemple.test/c.jpg',
      },
      tandes: [
        { id: 't1', nom: 'Gener', propostes: ['p1'], tanca: passat },
        { id: 't2', nom: 'Novembre', propostes: ['p1'], tanca: futur },
      ],
    });
    const { container } = renderFitxa();
    await titol();
    const capcalera = container.querySelector('.fitxa-proposta__capcalera');
    expect(capcalera.querySelector('img')).toHaveAttribute('src', 'https://exemple.test/c.jpg');
    expect(within(capcalera).getByText('Un lema')).toBeInTheDocument();
    expect(within(capcalera).getByText('Aprovada')).toHaveClass('badge');
    expect(await within(capcalera).findByText('Novembre · oberta')).toHaveClass('badge');
    expect(within(capcalera).getByText('Gener')).toHaveClass('badge');
  });

  it('la capçalera mostra «Veure la sessió» (i no «Programar sessió») si la proposta ja en té', async () => {
    preparar({
      proposta: { ...PROPOSTA, estat: 'aprovada' },
      sessions: [{ id: 's5', titol: 'Sessió Amélie', propostaId: 'p1' }],
    });
    renderFitxa();
    expect(await screen.findByRole('link', { name: 'Veure la sessió' })).toHaveAttribute('href', '/sessions/s5');
    expect(screen.queryByRole('button', { name: 'Programar sessió' })).not.toBeInTheDocument();
  });
});

describe('PropostaForm: Resum', () => {
  it('mostra el proposant amb la data, l\'estat i el comentari', async () => {
    preparar({ proposta: { ...PROPOSTA, timestamp: { toDate: () => new Date('2026-03-04T10:00:00') } } });
    renderFitxa();
    await titol();
    const panell = screen.getByRole('tabpanel');
    expect(within(panell).getByText(/Anna Vidal — núm\. 7/)).toHaveTextContent('Anna Vidal — núm. 7 · 04/03/2026');
    expect(within(panell).getByText('Molt bona!')).toBeInTheDocument();
    expect(within(panell).getByText('Pendent')).toHaveClass('badge');
  });

  it('una proposta sense pel·lícula de TMDB ho avisa al Resum', async () => {
    preparar({ proposta: { ...PROPOSTA, tmdbId: null } });
    renderFitxa();
    expect(await screen.findByText("Encara no té pel·lícula de TMDB associada: tria'n una a la pestanya Pel·lícula.")).toBeInTheDocument();
  });

  it('amb pel·lícula de TMDB no hi ha l\'avís', async () => {
    preparar();
    renderFitxa();
    await titol();
    expect(screen.queryByText(/Encara no té pel·lícula de TMDB/)).not.toBeInTheDocument();
  });

  it('mostra la gestió interna amb els valors per defecte de la distribuïdora', async () => {
    preparar({ interna: { preu: null, condicions: '', distribuidoraId: 'd2' } });
    renderFitxa();
    expect(await screen.findByRole('link', { name: 'Surtsey Films' })).toHaveAttribute('href', '/distribuidores/d2');
    expect(screen.getByText('150.00€')).toBeInTheDocument();
    expect(screen.getByText('Només en dimecres')).toBeInTheDocument();
    expect(screen.getAllByText(/per defecte de la distribuïdora/)).toHaveLength(2);
  });

  it('avisa que la sinopsi és en castellà', async () => {
    preparar({ proposta: { ...PROPOSTA, sinopsi: 'Tres jóvenes…', sinopsiIdioma: 'es' } });
    renderFitxa();
    expect(await screen.findByText('Tres jóvenes…')).toBeInTheDocument();
    expect(screen.getByText(/Aquesta sinopsi és en castellà/)).toBeInTheDocument();
  });

  it('no llegeix ni mostra el recompte de vots antic (propostes/*/vots)', async () => {
    preparar();
    renderFitxa();
    await titol();
    expect(collection.mock.calls.some((c) => c.includes('vots'))).toBe(false);
    expect(screen.queryByText('Vots')).not.toBeInTheDocument();
  });

  // Les dades de la pel·lícula (TMDB, cercador, «Actualitzar des de TMDB», editar la sinopsi): a «PropostaForm: Pel·lícula».
});

describe('PropostaForm: Pel·lícula', () => {
  const PROPOSTA_TMDB = {
    ...PROPOSTA,
    any: 2001,
    durada: 122,
    directors: ['Jean-Pierre Jeunet'],
    // Formes que un viatge format → parse podria alterar: un nom amb comes, un personatge amb parèntesis, un actor sense personatge.
    guionistes: ['Guillaume Laurant, el bo', 'Jean-Pierre Jeunet'],
    repartiment: [
      { nom: 'Audrey Tautou', personatge: 'Amélie (de petita)' },
      { nom: 'Mathieu Kassovitz', personatge: '' },
    ],
    lema: 'Ella canviarà la teva vida',
    sinopsi: 'Amélie es una chica…',
    sinopsiIdioma: 'es',
    tmdbUrl: 'https://www.themoviedb.org/movie/5',
    valoracio: 7.9,
    campsEditats: ['directors'],
  };

  async function obrirPellicula(proposta = PROPOSTA_TMDB) {
    preparar({ proposta });
    const user = userEvent.setup();
    renderFitxa('/propostes/pendents/p1?pestanya=pellicula');
    await screen.findByLabelText('Direcció');
    return { user };
  }

  const botoActualitzar = () => screen.getByRole('button', { name: 'Actualitzar des de TMDB' });

  beforeEach(() => {
    assignarPellicula.mockReset();
    cercarPellicules.mockReset();
  });

  it('mostra les dades desades, la insígnia «Editat a mà» i la valoració', async () => {
    await obrirPellicula();
    expect(screen.getByLabelText('Títol')).toHaveValue('Amélie');
    expect(screen.getByLabelText('Any')).toHaveValue('2001');
    expect(screen.getByLabelText('Guió')).toHaveValue('Guillaume Laurant, el bo, Jean-Pierre Jeunet');
    expect(screen.getByLabelText('Repartiment')).toHaveValue('Audrey Tautou (Amélie (de petita))\nMathieu Kassovitz');
    expect(screen.getAllByText('Editat a mà')).toHaveLength(1);
    expect(screen.getByText('★ 7,9 / 10')).toBeInTheDocument();
    expect(screen.getByText('Aquesta sinopsi és en castellà: tradueix-la aquí.')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('obrir i desar sense tocar res no escriu res (ni el repartiment ni les llistes)', async () => {
    const { user } = await obrirPellicula();
    expect(botoDesar()).toBeDisabled();
    await user.type(screen.getByLabelText('Títol'), '{Enter}');
    expect(screen.getByText('Sense canvis')).toBeInTheDocument();
    senseEscriptures();
  });

  it('editar la direcció escriu exactament { directors, campsEditats } i no toca l\'idioma de la sinopsi', async () => {
    const { user } = await obrirPellicula({ ...PROPOSTA_TMDB, campsEditats: [] });
    await user.type(screen.getByLabelText('Direcció'), ', Marc Caro');
    expect(screen.getByText('Hi ha canvis sense desar · Pel·lícula')).toBeInTheDocument();
    await user.click(botoDesar());
    await esperaDesat();
    expect(lot.update).toHaveBeenCalledTimes(1);
    expect(lot.update).toHaveBeenCalledWith(
      { path: 'propostes/p1', id: 'p1' },
      { directors: ['Jean-Pierre Jeunet', 'Marc Caro'], campsEditats: ['directors'] },
    );
    expect(lot.set).not.toHaveBeenCalled();
    nomesPelLot();
    // Ja desat, el camp passa a mostrar la insígnia.
    expect(screen.getAllByText('Editat a mà')).toHaveLength(1);
  });

  it('editar la sinopsi la desa com a catalana i la marca editada; ja no avisa de l\'idioma', async () => {
    const { user } = await obrirPellicula({ ...PROPOSTA_TMDB, campsEditats: [] });
    const sinopsi = screen.getByLabelText('Sinopsi');
    await user.clear(sinopsi);
    await user.type(sinopsi, 'Amélie és una noia…');
    await user.click(botoDesar());
    await esperaDesat();
    expect(lot.update).toHaveBeenCalledWith(
      { path: 'propostes/p1', id: 'p1' },
      { sinopsi: 'Amélie és una noia…', sinopsiIdioma: 'ca', campsEditats: ['sinopsi'] },
    );
    expect(screen.queryByText(/Aquesta sinopsi és en castellà/)).not.toBeInTheDocument();
    expect(screen.getAllByText('Editat a mà')).toHaveLength(1);
  });

  it('els camps ja editats es conserven a campsEditats en desar-ne un altre', async () => {
    const { user } = await obrirPellicula();
    await user.type(screen.getByLabelText('Lema'), '!');
    await user.click(botoDesar());
    await esperaDesat();
    expect(lot.update.mock.calls[0][1]).toEqual({ lema: 'Ella canviarà la teva vida!', campsEditats: ['directors', 'lema'] });
  });

  it.each([
    ['Any', '20O1', "L'any ha de tenir 4 xifres."],
    ['Durada (minuts)', '-5', 'La durada ha de ser un nombre enter de minuts.'],
  ])('un valor no vàlid a «%s» bloqueja el desat i mostra l\'error sota el camp', async (etiqueta, valor, missatge) => {
    const { user } = await obrirPellicula();
    // Primer a una altra pestanya: l'error ha de tornar a la pestanya Pel·lícula i enfocar el camp.
    const camp = screen.getByLabelText(etiqueta);
    await user.clear(camp);
    await user.type(camp, valor);
    await user.click(pestanya('Gestió'));
    await user.click(botoDesar());
    expect(await screen.findByLabelText(etiqueta)).toHaveFocus();
    expect(pestanya('Pel·lícula')).toHaveAttribute('aria-selected', 'true');
    const enCamp = screen.getByLabelText(etiqueta);
    expect(enCamp).toHaveAttribute('aria-invalid', 'true');
    const error = document.getElementById(enCamp.getAttribute('aria-describedby').split(' ').at(-1));
    expect(error).toHaveTextContent(missatge);
    expect(error).toHaveAttribute('role', 'alert');
    senseEscriptures();
  });

  it('amb canvis pendents «Actualitzar des de TMDB» és deshabilitat amb la nota, i torna a estar actiu en descartar', async () => {
    const { user } = await obrirPellicula();
    expect(botoActualitzar()).toBeEnabled();
    await user.type(screen.getByLabelText('Lema'), '!');
    expect(botoActualitzar()).toBeDisabled();
    expect(screen.getByText("Desa o descarta els canvis abans d'actualitzar.")).toBeInTheDocument();
    await user.click(botoActualitzar());
    expect(hiHaDialegConfirmacio()).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Descartar canvis' }));
    expect(botoActualitzar()).toBeEnabled();
    expect(assignarPellicula).not.toHaveBeenCalled();
  });

  it('«Actualitza (conserva els meus canvis)» crida assignarPellicula sense sobreescriure i reinicia el formulari amb els valors nous', async () => {
    assignarPellicula.mockResolvedValue({
      titol: 'Amélie', lema: 'Un lema nou de TMDB', sinopsi: 'Amélie es una chica…', sinopsiIdioma: 'es', valoracio: 8.1,
    });
    const { user } = await obrirPellicula();
    await user.click(botoActualitzar());
    const dialeg = await dialegConfirmacio();
    expect(dialeg).toHaveTextContent('Es mantindran els camps que has editat: Direcció.');
    expect(within(dialeg).getByRole('button', { name: 'Actualitza i sobreescriu-ho tot' })).toHaveClass('btn--perill');
    await acceptaDialeg('Actualitza (conserva els meus canvis)');

    await waitFor(() => expect(screen.getByLabelText('Lema')).toHaveValue('Un lema nou de TMDB'));
    expect(assignarPellicula).toHaveBeenCalledTimes(1);
    expect(assignarPellicula).toHaveBeenCalledWith('p1', 5);
    expect(screen.getByText('★ 8,1 / 10')).toBeInTheDocument();
    expect(screen.getByLabelText('Direcció')).toHaveValue('Jean-Pierre Jeunet');
    expect(screen.getAllByText('Editat a mà')).toHaveLength(1);
    // Nova línia base: res pendent, i el desat següent només escriu el que es toqui després.
    expect(botoDesar()).toBeDisabled();
    expect(screen.getByText('Sense canvis')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Títol'), ' (2001)');
    await user.click(botoDesar());
    await esperaDesat();
    expect(lot.update.mock.calls[0][1]).toEqual({ titol: 'Amélie (2001)', campsEditats: ['titol', 'directors'] });
    nomesPelLot();
  });

  it('«Actualitza i sobreescriu-ho tot» crida assignarPellicula amb sobreescriure i treu les insígnies', async () => {
    assignarPellicula.mockResolvedValue({
      titol: 'Amélie', directors: ['Jean-Pierre Jeunet', 'Guillaume Laurant'], sinopsi: 'Amélie es una chica…', sinopsiIdioma: 'es', campsEditats: [],
    });
    const { user } = await obrirPellicula();
    await user.click(botoActualitzar());
    await acceptaDialeg('Actualitza i sobreescriu-ho tot');
    await waitFor(() => expect(screen.getByLabelText('Direcció')).toHaveValue('Jean-Pierre Jeunet, Guillaume Laurant'));
    expect(assignarPellicula).toHaveBeenCalledTimes(1);
    expect(assignarPellicula).toHaveBeenCalledWith('p1', 5, { sobreescriure: true });
    expect(screen.queryByText('Editat a mà')).not.toBeInTheDocument();
    expect(botoDesar()).toBeDisabled();
  });

  it.each([
    ['Cancel·lar', (user) => cancellaDialeg(user)],
    ['ESC', (user) => tancaDialegAmbEsc(user)],
  ])('%s al diàleg no crida assignarPellicula', async (_cas, tanca) => {
    const { user } = await obrirPellicula();
    await user.click(botoActualitzar());
    await tanca(user);
    await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
    expect(assignarPellicula).not.toHaveBeenCalled();
    expect(botoActualitzar()).toBeEnabled();
  });

  it('sense camps editats, el diàleg ho diu i ofereix una sola actualització', async () => {
    assignarPellicula.mockResolvedValue({ lema: 'Nou' });
    const { user } = await obrirPellicula({ ...PROPOSTA_TMDB, campsEditats: [] });
    await user.click(botoActualitzar());
    const dialeg = await dialegConfirmacio();
    expect(dialeg).toHaveTextContent("No hi ha cap camp editat a mà: s'actualitzarà tota la fitxa.");
    expect(within(dialeg).getAllByRole('button').map((b) => b.textContent)).toEqual(['Cancel·lar', 'Actualitza']);
    await acceptaDialeg('Actualitza');
    await waitFor(() => expect(screen.getByLabelText('Lema')).toHaveValue('Nou'));
    expect(assignarPellicula).toHaveBeenCalledWith('p1', 5);
  });

  it('si falla l\'actualització, mostra l\'alerta i la fitxa continua igual', async () => {
    assignarPellicula.mockRejectedValue(new Error('boom'));
    const { user } = await obrirPellicula();
    await user.click(botoActualitzar());
    await acceptaDialeg('Actualitza (conserva els meus canvis)');
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'ha pogut actualitzar la fitxa des de TMDB. Torna-ho a provar.");
    expect(screen.getByLabelText('Lema')).toHaveValue('Ella canviarà la teva vida');
    expect(botoActualitzar()).toBeEnabled();
    expect(botoDesar()).toBeDisabled();
    senseEscriptures();
  });

  it('amb tmdbId, la pel·lícula surt fixa; «Canviar» obre el cercador i triar-ne una carrega la fitxa nova i reinicia el formulari', async () => {
    cercarPellicules.mockResolvedValue([{ tmdbId: 7, titol: 'Delicatessen', any: '1991', posterUrl: null }]);
    assignarPellicula.mockResolvedValue({
      tmdbId: 7, titol: 'Delicatessen', any: 1991, directors: ['Jean-Pierre Jeunet', 'Marc Caro'], sinopsi: 'Un carnisser…', sinopsiIdioma: 'es', campsEditats: [],
    });
    const { user } = await obrirPellicula();
    expect(screen.getByText('Amélie (2001)')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Pel·lícula' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Canviar' }));
    expect(screen.getByRole('combobox', { name: 'Pel·lícula' })).toHaveValue('Amélie');
    expect(assignarPellicula).not.toHaveBeenCalled();

    await user.click(await screen.findByRole('button', { name: /Delicatessen \(1991\)/ }));
    await waitFor(() => expect(screen.getByLabelText('Títol')).toHaveValue('Delicatessen'));
    expect(assignarPellicula).toHaveBeenCalledTimes(1);
    expect(assignarPellicula).toHaveBeenCalledWith('p1', 7);
    expect(screen.getByLabelText('Direcció')).toHaveValue('Jean-Pierre Jeunet, Marc Caro');
    expect(screen.getByRole('heading', { level: 1, name: 'Delicatessen' })).toBeInTheDocument();
    expect(screen.queryByText('Editat a mà')).not.toBeInTheDocument();
    expect(botoDesar()).toBeDisabled();
    senseEscriptures();
  });

  it('si falla carregar la pel·lícula triada, mostra un error i no canvia res', async () => {
    cercarPellicules.mockResolvedValue([{ tmdbId: 7, titol: 'Delicatessen', any: '1991', posterUrl: null }]);
    assignarPellicula.mockRejectedValue(new Error('boom'));
    const { user } = await obrirPellicula({ ...PROPOSTA_TMDB, tmdbId: null });
    await user.click(await screen.findByRole('button', { name: /Delicatessen \(1991\)/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'ha pogut carregar la fitxa de la pel·lícula. Torna-ho a provar.");
    expect(screen.getByLabelText('Títol')).toHaveValue('Amélie');
    // El cercador torna a l'estat desat (sense cap pel·lícula triada).
    expect(screen.getByRole('combobox', { name: 'Pel·lícula' })).toBeInTheDocument();
  });

  it('sense tmdbId: hi ha el cercador amb el títol, no hi ha «Actualitzar» i els camps es desen igualment', async () => {
    cercarPellicules.mockResolvedValue([]);
    const { user } = await obrirPellicula({ ...PROPOSTA, tmdbId: null });
    expect(screen.getByRole('combobox', { name: 'Pel·lícula' })).toHaveValue('Amélie');
    expect(screen.queryByRole('button', { name: /Actualitzar des de TMDB/ })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Direcció'), 'Jean-Pierre Jeunet');
    await user.type(screen.getByLabelText('Any'), '2001');
    await user.click(botoDesar());
    await esperaDesat();
    expect(lot.update).toHaveBeenCalledWith(
      { path: 'propostes/p1', id: 'p1' },
      { any: 2001, directors: ['Jean-Pierre Jeunet'], campsEditats: ['any', 'directors'] },
    );
  });

  describe('bloqueig mentre es carrega des de TMDB', () => {
    const NOTA_TMDB = "S'està actualitzant la fitxa des de TMDB…";
    const programar = () => screen.getByRole('button', { name: 'Programar sessió' });
    let resol;
    beforeEach(() => {
      assignarPellicula.mockImplementation(() => new Promise((r) => { resol = r; }));
    });

    function esperaBloquejada() {
      for (const tab of screen.getAllByRole('tab')) expect(tab).toBeDisabled();
      expect(botoDesar()).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'Descartar canvis' })).not.toBeInTheDocument();
      expect(screen.getByLabelText('Títol')).toBeDisabled();
      expect(screen.getByLabelText('Sinopsi')).toBeDisabled();
      expect(programar()).toBeDisabled();
      expect(programar()).toHaveAttribute('aria-describedby', screen.getByText(NOTA_TMDB).id);
    }

    function esperaDesbloquejada() {
      for (const tab of screen.getAllByRole('tab')) expect(tab).toBeEnabled();
      expect(screen.getByLabelText('Títol')).toBeEnabled();
      expect(programar()).toBeEnabled();
      expect(screen.queryByText(NOTA_TMDB)).not.toBeInTheDocument();
      expect(screen.getByText('Sense canvis')).toBeInTheDocument();
    }

    it('«Actualitza»: pestanyes, barra, camps i «Programar sessió» bloquejats fins que acaba; després, valors nous i res pendent', async () => {
      const { user } = await obrirPellicula({ ...PROPOSTA_TMDB, estat: 'aprovada' });
      await user.click(botoActualitzar());
      await acceptaDialeg('Actualitza (conserva els meus canvis)');
      await waitFor(() => expect(assignarPellicula).toHaveBeenCalledTimes(1));
      esperaBloquejada();
      await user.click(pestanya('Gestió'));
      expect(pestanya('Pel·lícula')).toHaveAttribute('aria-selected', 'true');
      await user.click(programar());
      expect(hiHaDialegConfirmacio()).toBe(false);

      resol({ lema: 'Un lema nou de TMDB' });
      await waitFor(() => expect(screen.getByLabelText('Lema')).toHaveValue('Un lema nou de TMDB'));
      esperaDesbloquejada();
      expect(botoDesar()).toBeDisabled();
      expect(runTransaction).not.toHaveBeenCalled();
      senseEscriptures();
    });

    it('triar una pel·lícula al cercador també bloqueja la fitxa fins que acaba', async () => {
      cercarPellicules.mockResolvedValue([{ tmdbId: 7, titol: 'Delicatessen', any: '1991', posterUrl: null }]);
      const { user } = await obrirPellicula({ ...PROPOSTA_TMDB, tmdbId: null, estat: 'aprovada' });
      await user.click(await screen.findByRole('button', { name: /Delicatessen \(1991\)/ }));
      await waitFor(() => expect(assignarPellicula).toHaveBeenCalledWith('p1', 7));
      esperaBloquejada();
      resol({ tmdbId: 7, titol: 'Delicatessen', campsEditats: [] });
      await waitFor(() => expect(screen.getByLabelText('Títol')).toHaveValue('Delicatessen'));
      esperaDesbloquejada();
    });

    it('amb el diàleg de «Programar sessió» obert, «Actualitzar des de TMDB» no fa res', async () => {
      const { user } = await obrirPellicula({ ...PROPOSTA_TMDB, estat: 'aprovada' });
      await user.click(programar());
      await dialegConfirmacio();
      await user.click(botoActualitzar());
      await cancellaDialeg(user);
      await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
      expect(assignarPellicula).not.toHaveBeenCalled();
    });

    it('amb el diàleg d\'actualitzar obert, «Programar sessió» no fa res', async () => {
      const { user } = await obrirPellicula({ ...PROPOSTA_TMDB, estat: 'aprovada' });
      await user.click(botoActualitzar());
      await dialegConfirmacio();
      await user.click(programar());
      await cancellaDialeg(user);
      await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
      expect(runTransaction).not.toHaveBeenCalled();
      expect(assignarPellicula).not.toHaveBeenCalled();
    });
  });
});

describe('PropostaForm: enllaços amb tandes i sessió (Resum)', () => {
  const futur = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const passat = new Date('2026-01-31T20:00:00');
  const TANDES = [
    { id: 't1', nom: 'Gener', propostes: ['p1', 'p9'], tanca: { toDate: () => passat } },
    { id: 't2', nom: 'Novembre', propostes: ['p1'], tanca: { toDate: () => futur } },
    { id: 't3', nom: 'Altra', propostes: ['p9'], tanca: { toDate: () => passat } },
    { id: 't4', nom: 'Corrupta', propostes: 'p1', tanca: { toDate: () => passat } },
  ];
  const dd = (etiqueta) => within(screen.getByRole('tabpanel')).getByText(etiqueta, { selector: 'dt' }).nextElementSibling;

  it('mostra les tandes que contenen la proposta (amb «(oberta)» i «Resultats») i la sessió, enllaçades', async () => {
    preparar({
      proposta: { ...PROPOSTA, estat: 'aprovada' },
      tandes: TANDES,
      sessions: [{ id: 's5', titol: 'Sessió Amélie', propostaId: 'p1' }, { id: 's8', titol: 'Una altra', propostaId: 'p9' }],
    });
    renderFitxa();
    const gener = await screen.findByRole('link', { name: 'Gener' });
    expect(gener).toHaveAttribute('href', '/tandes/t1');
    expect(screen.getByRole('link', { name: 'Novembre' })).toHaveAttribute('href', '/tandes/t2');
    expect(screen.getByRole('link', { name: 'Resultats de Gener' })).toHaveAttribute('href', '/tandes/t1/resultats');
    expect(screen.getByRole('link', { name: 'Resultats de Novembre' })).toHaveAttribute('href', '/tandes/t2/resultats');
    expect(screen.queryByRole('link', { name: 'Altra' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Corrupta' })).not.toBeInTheDocument();
    expect(dd('Tandes')).toContainElement(gener);
    expect(dd('Tandes')).toHaveTextContent('Novembre (oberta)');
    expect(dd('Tandes')).not.toHaveTextContent('Gener (oberta)');
    const sessio = await screen.findByRole('link', { name: 'Sessió Amélie' });
    expect(sessio).toHaveAttribute('href', '/sessions/s5');
    expect(dd('Sessió')).toContainElement(sessio);
    expect(where).toHaveBeenCalledWith('propostaId', '==', 'p1');
  });

  it('llista les tandes com al llistat (oberta primer, després per tancament descendent), una per línia', async () => {
    const tanca = (iso) => ({ toDate: () => new Date(iso) });
    preparar({
      tandes: [
        { id: 'a', nom: 'Tanda antiga amb un nom molt llarg', propostes: ['p1'], tanca: tanca('2025-03-01T20:00:00') },
        { id: 'o', nom: 'Oberta', propostes: ['p1'], tanca: { toDate: () => futur } },
        { id: 'r', nom: 'Recent', propostes: ['p1'], tanca: tanca('2026-05-01T20:00:00') },
      ],
    });
    renderFitxa();
    await screen.findByRole('link', { name: 'Oberta' });
    const items = within(dd('Tandes')).getAllByRole('listitem');
    expect(items.map((li) => within(li).getAllByRole('link')[0].textContent)).toEqual(['Oberta', 'Recent', 'Tanda antiga amb un nom molt llarg']);
    expect(items[0]).toHaveTextContent('Oberta (oberta)');
    expect(within(items[0]).getByRole('link', { name: 'Oberta' })).toHaveAttribute('href', '/tandes/o');
  });

  it('si diverses sessions comparteixen proposta, tria la de data més recent', async () => {
    preparar({
      sessions: [
        { id: 'a', titol: 'Antiga', propostaId: 'p1', data: '2026-01-10' },
        { id: 'b', titol: 'Recent', propostaId: 'p1', data: '2026-03-10' },
      ],
    });
    renderFitxa();
    expect(await screen.findByRole('link', { name: 'Recent' })).toHaveAttribute('href', '/sessions/b');
    expect(screen.queryByRole('link', { name: 'Antiga' })).not.toBeInTheDocument();
  });

  it('sense tandes, sessió ni dades internes mostra «—»', async () => {
    preparar({ tandes: [TANDES[2]] });
    renderFitxa();
    await titol();
    await waitFor(() => {
      const llegides = getDocs.mock.calls.map(([ref]) => ref.path);
      expect(llegides).toEqual(expect.arrayContaining(['tandes', 'sessions']));
    });
    for (const etiqueta of ['Tandes', 'Sessió', 'Distribuïdora', 'Preu', 'Condicions especials']) {
      expect(dd(etiqueta)).toHaveTextContent('—');
    }
  });

  it.each([['tandes'], ['sessions']])('si falla la lectura de %s, la fitxa es mostra igualment amb «—»', async (ruta) => {
    preparar({ tandes: TANDES, sessions: [{ id: 's5', titol: 'Sessió Amélie', propostaId: 'p1' }], falla: [ruta] });
    renderFitxa();
    await titol();
    if (ruta === 'tandes') await screen.findByRole('link', { name: 'Sessió Amélie' });
    else await screen.findByRole('link', { name: 'Gener' });
    expect(dd(ruta === 'tandes' ? 'Tandes' : 'Sessió')).toHaveTextContent('—');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('PropostaForm: Gestió i desat', () => {
  it('mostra els camps amb els valors desats i textareas que creixen', async () => {
    await obrirGestio({ interna: { preu: 350, condicions: 'Només 35mm', distribuidoraId: 'd2' } });
    expect(screen.getByLabelText('Soci')).toHaveValue('Anna Vidal — núm. 7');
    expect(screen.getByLabelText('Estat')).toHaveValue('pendent');
    expect(screen.getByLabelText('Comentari del soci')).toHaveValue('Molt bona!');
    expect(screen.getByLabelText('Distribuïdora')).toHaveValue('d2');
    expect(screen.getByLabelText('Preu (€)')).toHaveValue(350);
    expect(screen.getByLabelText('Condicions especials')).toHaveValue('Només 35mm');
    for (const etiqueta of ['Comentari del soci', 'Condicions especials']) {
      expect(screen.getByLabelText(etiqueta)).toHaveClass('textarea-automatic');
    }
  });

  it('obrir i no tocar res: «Desar» deshabilitat, sense «Descartar canvis» i cap escriptura', async () => {
    const { user } = await obrirGestio({ interna: { preu: 350, condicions: '', distribuidoraId: 'd2' } });
    expect(botoDesar()).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Descartar canvis' })).not.toBeInTheDocument();
    await user.click(botoDesar());
    // Enter en un camp envia el formulari: tampoc no escriu res.
    await user.type(screen.getByLabelText('Soci'), '{Enter}');
    expect(screen.getByText('Sense canvis')).toBeInTheDocument();
    senseEscriptures();
  });

  it('canviar només l\'estat escriu exactament { estat }, no toca la col·lecció privada i la fitxa es queda oberta', async () => {
    const { user } = await obrirGestio({
      proposta: {
        ...PROPOSTA,
        directors: ['Jean-Pierre Jeunet, el bo', 'Marc Caro'],
        repartiment: [{ nom: 'Audrey Tautou', personatge: 'Amélie (de petita)' }, { nom: 'Mathieu Kassovitz', personatge: '' }],
        any: 2001,
        durada: 122,
      },
      interna: { preu: 350, condicions: '', distribuidoraId: 'd2' },
    });
    await user.selectOptions(screen.getByLabelText('Estat'), 'aprovada');
    expect(screen.getByText('Hi ha canvis sense desar · Gestió')).toBeInTheDocument();
    await user.click(botoDesar());

    await esperaDesat();
    expect(screen.getByText(/^(Desat ✓|Sense canvis)$/)).toBeInTheDocument();
    expect(lot.update).toHaveBeenCalledTimes(1);
    expect(lot.update).toHaveBeenCalledWith({ path: 'propostes/p1', id: 'p1' }, { estat: 'aprovada' });
    expect(lot.set).not.toHaveBeenCalled();
    expect(screen.queryByText('Llistat de propostes')).not.toBeInTheDocument();
    expect(botoDesar()).toBeDisabled();
    // Canviar l'estat no programa res; la capçalera ja mostra l'estat desat.
    expect(runTransaction).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Programar sessió' })).toBeInTheDocument();
  });

  it('canviar només el preu escriu el document privat sencer i cap camp de la proposta', async () => {
    const { user } = await obrirGestio({ interna: { preu: null, condicions: 'Només 35mm', distribuidoraId: 'd2' } });
    await user.type(screen.getByLabelText('Preu (€)'), '120.5');
    await user.click(botoDesar());
    await esperaDesat();
    expect(lot.set).toHaveBeenCalledTimes(1);
    expect(lot.set).toHaveBeenCalledWith(
      { path: 'propostesInternes/p1', id: 'p1' },
      { preu: 120.5, condicions: 'Només 35mm', distribuidoraId: 'd2' },
    );
    expect(lot.update).not.toHaveBeenCalled();
  });

  it('desa la distribuïdora, el preu i les condicions (retallades) a la col·lecció privada', async () => {
    const { user } = await obrirGestio({ interna: undefined });
    await user.selectOptions(screen.getByLabelText('Distribuïdora'), 'd1');
    await user.type(screen.getByLabelText('Preu (€)'), '120.5');
    await user.type(screen.getByLabelText('Condicions especials'), '  Cal copia digital  ');
    await user.click(botoDesar());
    await esperaDesat();
    expect(lot.set.mock.calls[0][1]).toEqual({ preu: 120.5, condicions: 'Cal copia digital', distribuidoraId: 'd1' });
    expect(lot.update).not.toHaveBeenCalled();
  });

  it('un preu esborrat es desa com a null', async () => {
    const { user } = await obrirGestio({ interna: { preu: 350, condicions: '', distribuidoraId: 'd2' } });
    await user.clear(screen.getByLabelText('Preu (€)'));
    await user.click(botoDesar());
    await esperaDesat();
    expect(lot.set.mock.calls[0][1]).toEqual({ preu: null, condicions: '', distribuidoraId: 'd2' });
  });

  it('avisa de quins són els valors per defecte de la distribuïdora triada', async () => {
    await obrirGestio({ interna: { preu: null, condicions: '', distribuidoraId: 'd2' } });
    expect(screen.getByLabelText('Preu (€)')).toHaveAttribute('placeholder', '150 (per defecte)');
    expect(screen.getByText(/s'aplica el preu per defecte de Surtsey Films/)).toBeInTheDocument();
    expect(screen.getByText(/s'apliquen les condicions per defecte de Surtsey Films/)).toBeInTheDocument();
  });

  it('canviar el soci escriu el número i el nom públic', async () => {
    const { user } = await obrirGestio();
    const campSoci = screen.getByLabelText('Soci');
    await user.clear(campSoci);
    await user.type(campSoci, 'Toni Pinel — núm. 9');
    await user.click(botoDesar());
    await esperaDesat();
    expect(lot.update).toHaveBeenCalledWith({ path: 'propostes/p1', id: 'p1' }, { numeroSoci: 9, nomProposant: 'Toni P.' });
    expect(lot.set).not.toHaveBeenCalled();
  });

  it('un soci que no és de la llista no desa res, marca el camp i ho resumeix a la barra', async () => {
    const { user } = await obrirGestio();
    const campSoci = screen.getByLabelText('Soci');
    await user.clear(campSoci);
    await user.type(campSoci, 'Algú que no existeix');
    await user.selectOptions(screen.getByLabelText('Estat'), 'aprovada');
    await user.click(botoDesar());

    expect(await screen.findByText('Selecciona un soci vàlid de la llista.')).toBeInTheDocument();
    expect(campSoci).toHaveAttribute('aria-invalid', 'true');
    expect(campSoci).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Gestió: Selecciona un soci vàlid de la llista.' })).toBeInTheDocument();
    senseEscriptures();
  });

  it('un error de validació porta a la pestanya del camp i hi posa el focus', async () => {
    const { user } = await obrirGestio();
    const campSoci = screen.getByLabelText('Soci');
    await user.clear(campSoci);
    await user.type(campSoci, 'Ningú');
    await user.click(pestanya('Pel·lícula'));
    await user.click(botoDesar());
    await waitFor(() => expect(pestanya('Gestió')).toHaveAttribute('aria-selected', 'true'));
    await waitFor(() => expect(screen.getByLabelText('Soci')).toHaveFocus());
    senseEscriptures();
  });

  it('un soci original que ja no és a la llista no bloqueja desar altres camps', async () => {
    const { user } = await obrirGestio({ proposta: { ...PROPOSTA, numeroSoci: 99 } });
    expect(screen.getByLabelText('Soci')).toHaveValue('');
    await user.selectOptions(screen.getByLabelText('Estat'), 'rebutjada');
    await user.click(botoDesar());
    await esperaDesat();
    expect(lot.update).toHaveBeenCalledWith({ path: 'propostes/p1', id: 'p1' }, { estat: 'rebutjada' });
  });

  it('desa el comentari del soci retallat, i es pot esborrar', async () => {
    const { user } = await obrirGestio();
    const comentari = screen.getByLabelText('Comentari del soci');
    await user.clear(comentari);
    await user.type(comentari, '  Una pel·lícula tendra i divertida  ');
    await user.click(botoDesar());
    await esperaDesat(1);
    expect(lot.update).toHaveBeenLastCalledWith({ path: 'propostes/p1', id: 'p1' }, { comentari: 'Una pel·lícula tendra i divertida' });

    await user.clear(comentari);
    await user.click(botoDesar());
    await esperaDesat(2);
    expect(lot.update).toHaveBeenLastCalledWith({ path: 'propostes/p1', id: 'p1' }, { comentari: '' });
  });

  it('després d\'un desat, la línia base és la nova: tornar al valor desat no és cap canvi', async () => {
    const { user } = await obrirGestio();
    await user.selectOptions(screen.getByLabelText('Estat'), 'aprovada');
    await user.click(botoDesar());
    await esperaDesat();
    await user.selectOptions(screen.getByLabelText('Estat'), 'rebutjada');
    await user.selectOptions(screen.getByLabelText('Estat'), 'aprovada');
    expect(screen.getByText('Sense canvis')).toBeInTheDocument();
    expect(botoDesar()).toBeDisabled();
  });

  it('un segon desat només escriu el que ha canviat després del primer', async () => {
    const { user } = await obrirGestio();
    const comentari = screen.getByLabelText('Comentari del soci');
    await user.clear(comentari);
    await user.type(comentari, 'Nou');
    await user.click(botoDesar());
    await esperaDesat(1);
    await user.selectOptions(screen.getByLabelText('Estat'), 'aprovada');
    await user.click(botoDesar());
    await esperaDesat(2);
    expect(lot.update.mock.calls[0][1]).toEqual({ comentari: 'Nou' });
    expect(lot.update.mock.calls[1][1]).toEqual({ estat: 'aprovada' });
  });

  it('els canvis a Gestió no es perden en canviar de pestanya i tornar', async () => {
    const { user } = await obrirGestio();
    const comentari = screen.getByLabelText('Comentari del soci');
    await user.clear(comentari);
    await user.type(comentari, 'Nou comentari');
    expect(pestanya('Gestió')).toHaveTextContent('amb canvis');
    await user.click(pestanya('Resum'));
    await user.click(pestanya('Gestió'));
    expect(screen.getByLabelText('Comentari del soci')).toHaveValue('Nou comentari');
    expect(botoDesar()).toBeEnabled();
    senseEscriptures();
  });

  it('un doble clic a «Desar» fa una sola escriptura', async () => {
    const { user } = await obrirGestio();
    lot.commit.mockImplementation(() => new Promise((r) => { setTimeout(r, 30); }));
    await user.selectOptions(screen.getByLabelText('Estat'), 'aprovada');
    await user.dblClick(botoDesar());
    await esperaDesat(1);
    expect(lot.update).toHaveBeenCalledTimes(1);
  });

  it('si l\'escriptura falla, avisa, manté els canvis i es pot tornar a provar', async () => {
    const { user } = await obrirGestio();
    lot.commit.mockRejectedValueOnce(new Error('xarxa'));
    await user.selectOptions(screen.getByLabelText('Estat'), 'aprovada');
    await user.click(botoDesar());
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'ha pogut desar. Torna-ho a provar.");
    expect(screen.getByLabelText('Estat')).toHaveValue('aprovada');
    expect(botoDesar()).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Programar sessió' })).not.toBeInTheDocument();

    await user.click(botoDesar());
    await esperaDesat(2);
    expect(lot.update).toHaveBeenCalledTimes(2);
    expect(lot.update.mock.calls[1][1]).toEqual({ estat: 'aprovada' });
  });

  it('els canvis a la proposta i a les dades internes es desen junts en un sol lot (tot o res)', async () => {
    const { user } = await obrirGestio({ interna: { preu: 350, condicions: '', distribuidoraId: 'd2' } });
    await user.selectOptions(screen.getByLabelText('Estat'), 'aprovada');
    await user.clear(screen.getByLabelText('Preu (€)'));
    await user.type(screen.getByLabelText('Preu (€)'), '99');
    await user.click(botoDesar());
    await esperaDesat(1);
    expect(writeBatch).toHaveBeenCalledTimes(1);
    expect(lot.update).toHaveBeenCalledTimes(1);
    expect(lot.update).toHaveBeenCalledWith({ path: 'propostes/p1', id: 'p1' }, { estat: 'aprovada' });
    expect(lot.set).toHaveBeenCalledTimes(1);
    expect(lot.set).toHaveBeenCalledWith({ path: 'propostesInternes/p1', id: 'p1' }, { preu: 99, condicions: '', distribuidoraId: 'd2' });
    expect(lot.commit).toHaveBeenCalledTimes(1);
    nomesPelLot();
  });

  it('si el lot falla no s\'aplica res localment: la capçalera i el Resum continuen amb l\'estat desat', async () => {
    const { user, container } = await obrirGestio({ interna: { preu: 350, condicions: '', distribuidoraId: 'd2' } });
    lot.commit.mockRejectedValueOnce(new Error('xarxa'));
    await user.selectOptions(screen.getByLabelText('Estat'), 'aprovada');
    await user.clear(screen.getByLabelText('Preu (€)'));
    await user.type(screen.getByLabelText('Preu (€)'), '99');
    await user.click(botoDesar());
    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent("No s'ha pogut desar. Torna-ho a provar.");
    const capcalera = container.querySelector('.fitxa-proposta__capcalera');
    expect(within(capcalera).getByText('Pendent')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Programar sessió' })).not.toBeInTheDocument();
    await user.click(pestanya('Resum'));
    expect(screen.getByText('Preu', { selector: 'dt' }).nextElementSibling).toHaveTextContent('350.00€');
    await user.click(pestanya('Gestió'));
    expect(screen.getByLabelText('Preu (€)')).toHaveValue(99);

    await user.click(botoDesar());
    await esperaDesat(2);
    expect(lot.update.mock.calls[1][1]).toEqual({ estat: 'aprovada' });
    expect(lot.set.mock.calls[1][1]).toEqual({ preu: 99, condicions: '', distribuidoraId: 'd2' });
    expect(within(capcalera).getByText('Aprovada')).toBeInTheDocument();
    nomesPelLot();
  });

  it('«Descartar canvis» torna als valors desats sense escriure res', async () => {
    const { user } = await obrirGestio();
    await user.selectOptions(screen.getByLabelText('Estat'), 'rebutjada');
    await user.type(screen.getByLabelText('Comentari del soci'), ' i tant');
    await user.click(screen.getByRole('button', { name: 'Descartar canvis' }));
    expect(screen.getByLabelText('Estat')).toHaveValue('pendent');
    expect(screen.getByLabelText('Comentari del soci')).toHaveValue('Molt bona!');
    expect(botoDesar()).toBeDisabled();
    senseEscriptures();
  });

  it('si no es poden llegir les dades internes, els seus camps queden bloquejats i no s\'hi escriu mai', async () => {
    const { user } = await obrirGestio({ falla: ['propostesInternes/p1'] });
    expect(screen.getByText("No s'han pogut carregar les dades internes: no es poden editar ara.")).toBeInTheDocument();
    expect(screen.getByLabelText('Preu (€)')).toBeDisabled();
    expect(screen.getByLabelText('Distribuïdora')).toBeDisabled();
    expect(screen.getByLabelText('Condicions especials')).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Estat'), 'aprovada');
    await user.click(botoDesar());
    await esperaDesat();
    expect(lot.update).toHaveBeenCalledWith({ path: 'propostes/p1', id: 'p1' }, { estat: 'aprovada' });
    expect(lot.set).not.toHaveBeenCalled();
  });
});

describe('PropostaForm: «Programar sessió» amb canvis sense desar', () => {
  const NOTA = 'Desa els canvis abans de programar la sessió.';
  const programar = () => screen.getByRole('button', { name: 'Programar sessió' });

  it('amb canvis pendents és deshabilitat amb la nota, i clicar-lo no confirma ni programa res', async () => {
    const { user } = await obrirGestio({ proposta: { ...PROPOSTA, estat: 'aprovada' } });
    expect(programar()).toBeEnabled();
    expect(screen.queryByText(NOTA)).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Estat'), 'rebutjada');
    expect(programar()).toBeDisabled();
    const nota = screen.getByText(NOTA);
    expect(programar()).toHaveAttribute('aria-describedby', nota.id);
    await user.click(programar());
    expect(hiHaDialegConfirmacio()).toBe(false);
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('es torna a activar després de «Descartar canvis»', async () => {
    const { user } = await obrirGestio({ proposta: { ...PROPOSTA, estat: 'aprovada' } });
    await user.type(screen.getByLabelText('Comentari del soci'), ' i tant');
    expect(programar()).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Descartar canvis' }));
    expect(programar()).toBeEnabled();
    expect(screen.queryByText(NOTA)).not.toBeInTheDocument();
  });

  it('es torna a activar després de desar', async () => {
    const { user } = await obrirGestio({ proposta: { ...PROPOSTA, estat: 'aprovada' } });
    await user.type(screen.getByLabelText('Comentari del soci'), ' i tant');
    expect(programar()).toBeDisabled();
    await user.click(botoDesar());
    await esperaDesat();
    expect(programar()).toBeEnabled();
    expect(screen.queryByText(NOTA)).not.toBeInTheDocument();
  });

  it('mentre es desa és deshabilitat', async () => {
    const { user } = await obrirGestio({ proposta: { ...PROPOSTA, estat: 'aprovada' } });
    let acaba;
    lot.commit.mockImplementation(() => new Promise((r) => { acaba = r; }));
    await user.type(screen.getByLabelText('Comentari del soci'), ' i tant');
    await user.click(botoDesar());
    await screen.findByText('Desant…');
    expect(programar()).toBeDisabled();
    acaba();
    await esperaDesat();
    expect(programar()).toBeEnabled();
  });

  it('fins que no s\'han llegit les sessions no mostra cap acció (ni «Programar» ni «Veure la sessió»)', async () => {
    preparar({ proposta: { ...PROPOSTA, estat: 'aprovada' }, sessions: [{ id: 's5', propostaId: 'p1' }] });
    let resol;
    const original = getDocs.getMockImplementation();
    getDocs.mockImplementation((ref) => (ref.path === 'sessions'
      ? new Promise((r) => { resol = () => r(original(ref)); })
      : original(ref)));
    renderFitxa();
    await titol();
    expect(screen.queryByRole('button', { name: 'Programar sessió' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Veure la sessió' })).not.toBeInTheDocument();
    resol();
    expect(await screen.findByRole('link', { name: 'Veure la sessió' })).toHaveAttribute('href', '/sessions/s5');
    expect(screen.queryByRole('button', { name: 'Programar sessió' })).not.toBeInTheDocument();
  });

  it('si falla la lectura de les sessions, sí que ofereix «Programar sessió»', async () => {
    preparar({ proposta: { ...PROPOSTA, estat: 'aprovada' }, falla: ['sessions'] });
    renderFitxa();
    expect(await screen.findByRole('button', { name: 'Programar sessió' })).toBeEnabled();
  });
});

describe('PropostaForm: Eliminar proposta', () => {
  it('elimina la proposta i les dades internes després de confirmar i torna al llistat', async () => {
    const { user } = await obrirGestio();
    const zona = screen.getByRole('region', { name: 'Zona de perill' });
    await user.click(within(zona).getByRole('button', { name: 'Eliminar proposta' }));

    const dialeg = await dialegConfirmacio();
    expect(dialeg).toHaveAttribute('role', 'alertdialog');
    expect(dialeg).toHaveTextContent(
      'Segur que vols eliminar definitivament la proposta "Amélie"? Aquesta acció no es pot desfer.',
    );
    expect(deleteDoc).not.toHaveBeenCalled();
    await acceptaDialeg('Elimina');
    expect(await screen.findByText('Llistat de propostes')).toBeInTheDocument();
    expect(deleteDoc).toHaveBeenCalledTimes(2);
    expect(deleteDoc.mock.calls.map(([ref]) => ref.path)).toEqual(['propostes/p1', 'propostesInternes/p1']);
  });

  it.each([
    ['Cancel·lar', (user) => cancellaDialeg(user)],
    ['ESC', (user) => tancaDialegAmbEsc(user)],
  ])('no elimina la proposta si es tanca la confirmació amb %s', async (_nom, tanca) => {
    const { user } = await obrirGestio();
    await user.click(screen.getByRole('button', { name: 'Eliminar proposta' }));
    await tanca(user);
    await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));

    expect(deleteDoc).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1, name: 'Amélie' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar proposta' })).toHaveFocus();
  });

  it('si falla l\'eliminació, ho avisa i es queda a la fitxa', async () => {
    const { user } = await obrirGestio();
    deleteDoc.mockRejectedValueOnce(new Error('boom'));
    await user.click(screen.getByRole('button', { name: 'Eliminar proposta' }));
    await acceptaDialeg('Elimina');
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'ha pogut eliminar. Torna-ho a provar.");
    expect(screen.queryByText('Llistat de propostes')).not.toBeInTheDocument();
  });
});

describe('PropostaForm: Programar sessió', () => {
  let tx;
  const APROVADA = {
    titol: 'Amélie', titolLocal: 'Amèlie', numeroSoci: 7, estat: 'aprovada', any: '2001', directors: ['Jean-Pierre Jeunet'], sinopsi: 'Una noia a París.',
    distribuidora: 'Secreta SL', preu: 500,
  };
  const INTERNA = { preu: 500, condicions: 'secret', distribuidoraId: 'd1' };

  // `estatTx` i `sessioTx`: l'estat de la proposta i si la sessió existeix DINS de la transacció.
  function prepararProgramar({
    sessionsDespres, estatTx = 'aprovada', sessioTx = false, proposta = APROVADA,
  } = {}) {
    preparar({ proposta, interna: INTERNA, sessionsDespres });
    tx = {
      get: vi.fn(async (ref) => (ref.path === 'propostes/p1'
        ? { data: () => ({ estat: estatTx }) }
        : { exists: () => sessioTx })),
      set: vi.fn(),
      update: vi.fn(),
    };
    runTransaction.mockImplementation(async (_db, fn) => fn(tx));
  }

  async function obrirProgramar(user) {
    await user.click(await screen.findByRole('button', { name: 'Programar sessió' }));
    return dialegConfirmacio();
  }

  async function programar(user) {
    await obrirProgramar(user);
    await acceptaDialeg('Programa');
  }

  const lecturesSessions = () => getDocs.mock.calls.filter(([ref]) => ref.path === 'sessions').length;

  it('només mostra el botó en propostes aprovades', async () => {
    prepararProgramar({ proposta: { ...APROVADA, estat: 'pendent' } });
    renderFitxa();
    await titol();
    expect(screen.queryByRole('button', { name: 'Programar sessió' })).not.toBeInTheDocument();
  });

  it('crea la sessió amb id determinista i passa la proposta a programada dins la transacció', async () => {
    prepararProgramar();
    const user = userEvent.setup();
    renderFitxa();
    await screen.findByRole('button', { name: 'Programar sessió' });
    const consultesPropostaId = () => where.mock.calls.filter((c) => c[0] === 'propostaId' && c[1] === '==' && c[2] === 'p1').length;
    await waitFor(() => expect(lecturesSessions()).toBe(1));
    const whereAbans = consultesPropostaId();
    await programar(user);
    expect(await screen.findByText('Edició de sessió a /sessions/proposta-p1')).toBeInTheDocument();
    // La fitxa ja ha fet la seva pròpia consulta en carregar: «Programar» n'afegeix exactament una.
    expect(consultesPropostaId()).toBe(whereAbans + 1);
    expect(lecturesSessions()).toBe(2);
    expect(tx.set).toHaveBeenCalledTimes(1);
    const [ref, sessio] = tx.set.mock.calls[0];
    expect(ref.path).toBe('sessions/proposta-p1');
    expect(sessio).toMatchObject({
      titol: 'Amèlie', propostaId: 'p1', publicada: false, data: '', slug: '',
    });
    expect(tx.update).toHaveBeenCalledWith({ path: 'propostes/p1', id: 'p1' }, { estat: 'programada' });
    expect(runTransaction).toHaveBeenCalledTimes(1);
    senseEscriptures();
  });

  it('la sessió no conté cap dada interna de la proposta', async () => {
    prepararProgramar();
    const user = userEvent.setup();
    renderFitxa();
    await programar(user);
    await screen.findByText(/Edició de sessió/);
    const text = JSON.stringify(tx.set.mock.calls[0][1]);
    expect(text).not.toMatch(/Secreta|secret|500|preu|condicions|distribuidor/);
  });

  it('si mentrestant s\'ha creat una sessió amb aquest propostaId, hi navega i només passa la proposta a programada', async () => {
    prepararProgramar({ sessionsDespres: [{ id: 'sX', propostaId: 'p1' }], sessioTx: true });
    const user = userEvent.setup();
    renderFitxa();
    await programar(user);
    expect(await screen.findByText("Aquesta proposta ja té una sessió: s'obre per editar-la.")).toBeInTheDocument();
    // L'avís surt abans de navegar, i navega en tancar-lo.
    expect(screen.queryByText(/Edició de sessió/)).not.toBeInTheDocument();
    const avis = await dialegConfirmacio();
    expect(avis.querySelectorAll('button')).toHaveLength(1);
    await acceptaDialeg('Entesos');
    expect(await screen.findByText('Edició de sessió a /sessions/sX')).toBeInTheDocument();
    expect(tx.set).not.toHaveBeenCalled();
    expect(tx.update).toHaveBeenCalledWith({ path: 'propostes/p1', id: 'p1' }, { estat: 'programada' });
    expect(runTransaction).toHaveBeenCalledTimes(1);
    senseEscriptures();
  });

  it('cursa: si dins la transacció la sessió ja existeix, no la sobreescriu i hi navega', async () => {
    prepararProgramar({ sessioTx: true });
    const user = userEvent.setup();
    renderFitxa();
    await programar(user);
    expect(await screen.findByText("Aquesta proposta ja té una sessió: s'obre per editar-la.")).toBeInTheDocument();
    await acceptaDialeg('Entesos');
    expect(await screen.findByText('Edició de sessió a /sessions/proposta-p1')).toBeInTheDocument();
    expect(tx.set).not.toHaveBeenCalled();
  });

  it('si la proposta ja no és aprovada i no hi ha sessió, no escriu res i mostra l\'error', async () => {
    prepararProgramar({ estatTx: 'programada' });
    const user = userEvent.setup();
    renderFitxa();
    await programar(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Aquesta proposta ja no és aprovada.');
    expect(tx.set).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(screen.queryByText(/Edició de sessió/)).not.toBeInTheDocument();
  });

  it('la confirmació explica què passarà, sense perill i amb «Programa»', async () => {
    prepararProgramar();
    const user = userEvent.setup();
    renderFitxa();
    await screen.findByRole('button', { name: 'Programar sessió' });
    await waitFor(() => expect(lecturesSessions()).toBe(1));
    const dialeg = await obrirProgramar(user);
    expect(dialeg).toHaveTextContent('Vols programar una sessió amb "Amélie"? Es crearà una sessió sense publicar i la proposta passarà a «Programada».');
    expect(dialeg).not.toHaveAttribute('role', 'alertdialog');
    expect(runTransaction).not.toHaveBeenCalled();
    // La lectura de la fitxa ja ha consultat les sessions; programar no n'hi afegeix cap abans de confirmar.
    expect(lecturesSessions()).toBe(1);
  });

  it.each([
    ['Cancel·lar', (user) => cancellaDialeg(user)],
    ['ESC', (user) => tancaDialegAmbEsc(user)],
  ])('si tanques la confirmació amb %s no fa res i es pot tornar a programar', async (_nom, tanca) => {
    prepararProgramar();
    const user = userEvent.setup();
    renderFitxa();
    await obrirProgramar(user);
    await tanca(user);
    await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
    expect(runTransaction).not.toHaveBeenCalled();
    expect(tx.set).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(screen.queryByText(/Edició de sessió/)).not.toBeInTheDocument();
    senseEscriptures();
    // El bloqueig contra dobles execucions s'allibera en cancel·lar.
    expect(screen.getByRole('button', { name: 'Programar sessió' })).toBeEnabled();
    await programar(user);
    expect(await screen.findByText('Edició de sessió a /sessions/proposta-p1')).toBeInTheDocument();
    expect(runTransaction).toHaveBeenCalledTimes(1);
  });

  it('si la transacció falla mostra l\'error i no navega', async () => {
    prepararProgramar();
    runTransaction.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    renderFitxa();
    await programar(user);
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'ha pogut programar la sessió");
    expect(screen.queryByText(/Edició de sessió/)).not.toBeInTheDocument();
    senseEscriptures();
  });

  it('un doble clic fa una sola transacció', async () => {
    prepararProgramar();
    runTransaction.mockImplementation(async (_db, fn) => {
      await new Promise((r) => { setTimeout(r, 30); });
      return fn(tx);
    });
    const user = userEvent.setup();
    renderFitxa();
    await user.dblClick(await screen.findByRole('button', { name: 'Programar sessió' }));
    await dialegConfirmacio();
    expect(document.querySelectorAll('dialog.dialeg-confirmacio')).toHaveLength(1);
    await acceptaDialeg('Programa');
    await screen.findByText(/Edició de sessió/);
    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(hiHaDialegConfirmacio()).toBe(false);
  });
});

describe('PropostaForm: Mitjans', () => {
  const INSTANT = 1700000000000;
  const CAMI = `web/propostes/p1/cartell-${INSTANT}.jpg`;
  const URL_ESPERADA = `https://firebasestorage.googleapis.com/v0/b/cinema.test/o/${encodeURIComponent(CAMI)}?alt=media`;
  const PROPOSTA_MITJANS = { ...PROPOSTA, imatgeUrl: 'https://exemple.test/vell.jpg', campsEditats: ['lema'] };

  async function obrirMitjans(proposta = PROPOSTA_MITJANS) {
    preparar({ proposta });
    const user = userEvent.setup({ applyAccept: false });
    const render = renderFitxa('/propostes/pendents/p1?pestanya=mitjans');
    await screen.findByLabelText('URL del tràiler');
    return { user, ...render };
  }

  const fitxer = (nom = 'c.jpg', tipus = 'image/jpeg') => new File(['x'], nom, { type: tipus });
  const selector = () => screen.getByLabelText(/(Pujar un|Canviar el) cartell/);

  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(INSTANT);
    ref.mockReset().mockImplementation((_st, cami) => ({ fullPath: cami }));
    uploadBytes.mockReset().mockResolvedValue({});
    deleteObject.mockReset();
  });

  it('mostra el cartell actual i el selector diu «Canviar el cartell»; sense cartell, un espai neutre i «Pujar un cartell»', async () => {
    const { unmount } = await obrirMitjans();
    expect(screen.getByRole('img', { name: 'Cartell' })).toHaveAttribute('src', 'https://exemple.test/vell.jpg');
    expect(screen.getByRole('img', { name: 'Cartell' })).toHaveAttribute('loading', 'lazy');
    expect(screen.getByLabelText('Canviar el cartell')).toBeInTheDocument();
    expect(screen.getByLabelText('URL del cartell')).toHaveValue('https://exemple.test/vell.jpg');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    unmount();
    await obrirMitjans({ ...PROPOSTA, imatgeUrl: '' });
    expect(screen.queryByRole('img', { name: 'Cartell' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Pujar un cartell')).toBeInTheDocument();
  });

  it('pujar un cartell vàlid el puja al camí exacte, posa la URL i en desar escriu { imatgeUrl, campsEditats } (unió)', async () => {
    const { user } = await obrirMitjans();
    const f = fitxer();
    await user.upload(selector(), f);
    await waitFor(() => expect(screen.getByLabelText('URL del cartell')).toHaveValue(URL_ESPERADA));
    expect(ref).toHaveBeenCalledWith(expect.anything(), CAMI);
    expect(uploadBytes).toHaveBeenCalledWith({ fullPath: CAMI }, f, { contentType: 'image/jpeg' });
    expect(screen.getByText('Hi ha canvis sense desar · Mitjans')).toBeInTheDocument();
    senseEscriptures();
    await user.click(botoDesar());
    await esperaDesat();
    expect(lot.update).toHaveBeenCalledWith(
      { path: 'propostes/p1', id: 'p1' },
      { imatgeUrl: URL_ESPERADA, campsEditats: ['lema', 'imatgeUrl'] },
    );
    expect(deleteObject).not.toHaveBeenCalled();
    expect(screen.getByText('Editat a mà')).toBeInTheDocument();
  });

  it('amb una proposta sense campsEditats, desa { imatgeUrl, campsEditats: [\'imatgeUrl\'] }', async () => {
    const { user } = await obrirMitjans({ ...PROPOSTA, imatgeUrl: '' });
    await user.upload(selector(), fitxer());
    await waitFor(() => expect(screen.getByLabelText('URL del cartell')).toHaveValue(URL_ESPERADA));
    await user.click(botoDesar());
    await esperaDesat();
    expect(lot.update.mock.calls[0][1]).toEqual({ imatgeUrl: URL_ESPERADA, campsEditats: ['imatgeUrl'] });
  });

  it.each([
    ['image/gif', 1, 'La imatge ha de ser JPG, PNG o WebP.'],
    ['image/jpeg', 11 * 1024 * 1024, 'La imatge no pot ocupar més de 10 MB.'],
  ])('un fitxer %s (%i bytes) no es puja i mostra l\'error', async (tipus, mida, missatge) => {
    const { user } = await obrirMitjans();
    const f = fitxer('g', tipus);
    Object.defineProperty(f, 'size', { value: mida });
    await user.upload(selector(), f);
    expect(await screen.findByRole('alert')).toHaveTextContent(missatge);
    expect(uploadBytes).not.toHaveBeenCalled();
    expect(screen.getByLabelText('URL del cartell')).toHaveValue('https://exemple.test/vell.jpg');
    expect(screen.getByText('Sense canvis')).toBeInTheDocument();
  });

  it('el mateix fitxer dues vegades torna a pujar', async () => {
    const { user } = await obrirMitjans();
    const f = fitxer();
    await user.upload(selector(), f);
    await waitFor(() => expect(uploadBytes).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(selector()).not.toBeDisabled());
    await user.upload(selector(), f);
    await waitFor(() => expect(uploadBytes).toHaveBeenCalledTimes(2));
  });

  it('si la pujada falla, mostra una alerta i deixa imatgeUrl intacte', async () => {
    uploadBytes.mockRejectedValue(new Error('boom'));
    const { user } = await obrirMitjans();
    await user.upload(selector(), fitxer());
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'ha pogut pujar la imatge. Torna-ho a provar.");
    expect(screen.getByLabelText('URL del cartell')).toHaveValue('https://exemple.test/vell.jpg');
    expect(screen.getByText('Sense canvis')).toBeInTheDocument();
    expect(selector()).not.toBeDisabled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('el control és deshabilitat mentre es puja', async () => {
    let acaba;
    uploadBytes.mockReturnValue(new Promise((resolve) => { acaba = resolve; }));
    const { user } = await obrirMitjans();
    await user.upload(selector(), fitxer());
    await waitFor(() => expect(selector()).toBeDisabled());
    acaba({});
    await waitFor(() => expect(selector()).not.toBeDisabled());
  });

  it('enganxar una URL de cartell la desa com a canvi normal', async () => {
    const { user } = await obrirMitjans();
    const camp = screen.getByLabelText('URL del cartell');
    await user.clear(camp);
    await user.type(camp, 'https://exemple.test/nou.jpg');
    await user.click(botoDesar());
    await esperaDesat();
    expect(lot.update.mock.calls[0][1]).toEqual({ imatgeUrl: 'https://exemple.test/nou.jpg', campsEditats: ['lema', 'imatgeUrl'] });
    expect(uploadBytes).not.toHaveBeenCalled();
  });

  it('la vista prèvia del tràiler apareix amb una URL de YouTube i no amb text qualsevol', async () => {
    const { user, container } = await obrirMitjans();
    expect(container.querySelector('iframe')).toBeNull();
    const camp = screen.getByLabelText('URL del tràiler');
    await user.type(camp, 'això no és un tràiler');
    expect(container.querySelector('iframe')).toBeNull();
    await user.clear(camp);
    // Sense http(s) no es pot desar: tampoc no hi ha vista prèvia (ni amb un id nu ni amb «youtu.be/…» sense esquema).
    await user.type(camp, 'dQw4w9WgXcQ');
    expect(container.querySelector('iframe')).toBeNull();
    await user.clear(camp);
    await user.type(camp, 'youtu.be/dQw4w9WgXcQ');
    expect(container.querySelector('iframe')).toBeNull();
    await user.clear(camp);
    await user.type(camp, 'https://youtu.be/dQw4w9WgXcQ');
    const iframe = screen.getByTitle('Tràiler');
    expect(iframe).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(iframe).toHaveAttribute('loading', 'lazy');
  });

  it('una URL de tràiler no vàlida bloqueja el desat i mostra l\'error sota el camp', async () => {
    const { user } = await obrirMitjans();
    const camp = screen.getByLabelText('URL del tràiler');
    await user.type(camp, 'això no és una url');
    await user.click(botoDesar());
    await waitFor(() => expect(camp).toHaveAttribute('aria-invalid', 'true'));
    const error = document.getElementById('trailerUrl-error');
    expect(error).toHaveTextContent("L'adreça ha de començar per http:// o https://.");
    expect(error).toHaveAttribute('role', 'alert');
    expect(camp.getAttribute('aria-describedby')).toContain('trailerUrl-error');
    expect(camp).toHaveFocus();
    expect(lot.commit).not.toHaveBeenCalled();
  });

  it('mostra «Editat a mà» als camps de cartell i tràiler editats', async () => {
    await obrirMitjans({ ...PROPOSTA_MITJANS, trailerUrl: 'https://youtu.be/dQw4w9WgXcQ', campsEditats: ['imatgeUrl', 'trailerUrl'] });
    expect(screen.getAllByText('Editat a mà')).toHaveLength(2);
  });

  describe('amb una pujada en curs', () => {
    const PROPOSTA_APROVADA = { ...PROPOSTA_MITJANS, estat: 'aprovada' };

    async function iniciaPujada(proposta = PROPOSTA_APROVADA) {
      let acaba;
      let falla;
      uploadBytes.mockReturnValue(new Promise((resolve, reject) => { acaba = resolve; falla = reject; }));
      const ctx = await obrirMitjans(proposta);
      // Un canvi pendent ja existent perquè «Desar» i «Descartar» tinguin sentit.
      await ctx.user.type(screen.getByLabelText('URL del tràiler'), 'https://youtu.be/dQw4w9WgXcQ');
      await ctx.user.upload(selector(), fitxer());
      await waitFor(() => expect(selector()).toBeDisabled());
      return { ...ctx, acaba, falla };
    }

    it('bloqueja Desar, Descartar, les pestanyes i Programar sessió, i no deixa començar una segona pujada', async () => {
      const { acaba, container } = await iniciaPujada();
      expect(botoDesar()).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Descartar canvis' })).toBeDisabled();
      for (const nom of ['Resum', 'Pel·lícula', 'Gestió']) expect(pestanya(nom)).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Programar sessió' })).toBeDisabled();
      expect(screen.getByText("S'està pujant el cartell…", { selector: '#programar-nota' })).toBeInTheDocument();
      // Ni enviant el formulari a la força (el botó és deshabilitat, però el gestor també ho ha de vigilar) ni amb una segona pujada.
      fireEvent.submit(container.querySelector('form'));
      fireEvent.change(selector(), { target: { files: [fitxer('d.jpg')] } });
      expect(uploadBytes).toHaveBeenCalledTimes(1);
      expect(lot.commit).not.toHaveBeenCalled();
      acaba({});
      await waitFor(() => expect(selector()).not.toBeDisabled());
    });

    it('en acabar bé, la URL és un canvi pendent i tot es reactiva', async () => {
      const { acaba } = await iniciaPujada();
      acaba({});
      await waitFor(() => expect(screen.getByLabelText('URL del cartell')).toHaveValue(URL_ESPERADA));
      await waitFor(() => expect(botoDesar()).toBeEnabled());
      expect(screen.getByRole('button', { name: 'Descartar canvis' })).toBeEnabled();
      expect(pestanya('Gestió')).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Programar sessió' })).toBeDisabled();
      expect(screen.getByText('Desa els canvis abans de programar la sessió.')).toBeInTheDocument();
    });

    it('si la pujada falla, mostra l\'alerta (a la pestanya, que continua muntada) i tot es reactiva', async () => {
      const { falla } = await iniciaPujada();
      falla(new Error('boom'));
      expect(await screen.findByText("No s'ha pogut pujar la imatge. Torna-ho a provar.")).toBeInTheDocument();
      expect(selector()).not.toBeDisabled();
      expect(pestanya('Gestió')).toBeEnabled();
      expect(screen.getByLabelText('URL del cartell')).toHaveValue('https://exemple.test/vell.jpg');
    });
  });

  it('obrir i desar sense tocar res no escriu res', async () => {
    const { user } = await obrirMitjans();
    expect(botoDesar()).toBeDisabled();
    await user.type(screen.getByLabelText('URL del tràiler'), '{Enter}');
    expect(screen.getByText('Sense canvis')).toBeInTheDocument();
    senseEscriptures();
    expect(uploadBytes).not.toHaveBeenCalled();
  });
});
