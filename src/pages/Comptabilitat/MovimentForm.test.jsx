import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fireEvent, screen, waitFor, within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter, Routes, Route, useLocation, useNavigationType,
} from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  updateDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  doc: vi.fn((_db, col, id) => ({ col, id })),
  collection: vi.fn((_db, nom) => ({ nom })),
  query: vi.fn((col, ...condicions) => ({ nom: col.nom, condicions })),
  where: vi.fn((camp, op, valor) => ({ camp, op, valor })),
}));

vi.mock('../../lib/adjunts', async (importOriginal) => ({
  ...(await importOriginal()),
  pujarAdjunt: vi.fn(),
  urlAdjunt: vi.fn(),
  eliminarAdjunt: vi.fn(),
}));

import {
  addDoc, deleteDoc, getDoc, getDocs, setDoc, updateDoc,
} from 'firebase/firestore';
import {
  ACCEPT_ADJUNT, eliminarAdjunt, pujarAdjunt, urlAdjunt,
} from '../../lib/adjunts';
import MovimentForm from './MovimentForm';
import {
  acceptaDialeg, cancellaDialeg, dialegConfirmacio, hiHaDialegConfirmacio, renderAmbConfirmacio, tancaDialegAmbEsc,
} from '../../test/confirmacio';

const MOVIMENT_EXISTENT = {
  data: '2026-03-05', concepte: 'Quotes de març', tipus: 'ingres', categoria: 'Quotes socis',
  metodePagament: 'efectiu', preuUnitari: 100, quantitat: 1, total: 100, sessionId: '',
};
const APORTACIO = {
  data: '2026-03-05', concepte: 'Aportacions de març', tipus: 'ingres', categoria: 'Aportacions',
  metodePagament: 'datafon', preuUnitari: 5, quantitat: 4, total: 20, sessionId: 's1',
};
const SESSIO = { id: 's1', titol: 'The Artist', data: '2026-05-01' };
const ADJUNT = { path: 'factures/abc/factura.pdf', nom: 'factura.pdf' };
const ADJUNT_NOU = { path: 'factures/xyz/nova.pdf', nom: 'nova.pdf' };

// Firestore en memòria: el que s'escriu es torna a llegir (p. ex. en passar a la fitxa creada).
let bd;
let respostes;
const resposta = (llista) => ({ empty: llista.length === 0, docs: llista });
const pdf = (nom = 'nova.pdf') => new File(['contingut'], nom, { type: 'application/pdf' });

beforeEach(() => {
  vi.clearAllMocks();
  bd = {};
  respostes = { sessions: [], moviments: [], socis: [] };
  getDoc.mockImplementation(async ({ col, id }) => ({ data: () => bd[`${col}/${id}`] }));
  getDocs.mockImplementation(async ({ nom }) => resposta(respostes[nom] ?? []));
  addDoc.mockImplementation(async ({ nom }, dades) => {
    bd[`${nom}/m9`] = dades;
    return { id: 'm9' };
  });
  setDoc.mockImplementation(async ({ col, id }, dades) => { bd[`${col}/${id}`] = dades; });
  deleteDoc.mockResolvedValue(undefined);
  updateDoc.mockResolvedValue(undefined);
  eliminarAdjunt.mockResolvedValue(undefined);
  urlAdjunt.mockResolvedValue('https://storage.test/factura.pdf');
});

const ambSessions = (...sessions) => {
  respostes.sessions = sessions.map(({ id, ...d }) => ({ id, data: () => d }));
};
const desa = (id, dades) => { bd[`moviments/${id}`] = dades; };

function Ubicacio() {
  const { pathname, search } = useLocation();
  return <p data-testid="ubicacio">{`${pathname}${search} ${useNavigationType()}`}</p>;
}

function renderRuta(entrada) {
  return renderAmbConfirmacio(
    <MemoryRouter initialEntries={[entrada]}>
      <Routes>
        <Route path="/comptabilitat/nou" element={<MovimentForm />} />
        <Route path="/comptabilitat/:id" element={<MovimentForm />} />
        <Route path="/comptabilitat" element={<p>Llibre de moviments</p>} />
        <Route path="/sessions/:id" element={<p>Fitxa de la sessió</p>} />
      </Routes>
      <Ubicacio />
    </MemoryRouter>
  );
}
const renderNou = (cerca = '') => renderRuta(`/comptabilitat/nou${cerca}`);
async function renderExistent(dades, id = '1') {
  desa(id, dades);
  const resultat = renderRuta(`/comptabilitat/${id}`);
  await screen.findByRole('heading', { level: 1, name: 'Moviment' });
  return resultat;
}

const barra = () => document.querySelector('.barra-desar');
const textBarra = () => barra().querySelector('.barra-desar__text').textContent;
const botoDesar = () => within(barra()).getByRole('button', { name: 'Desar' });
const zonaPerill = () => screen.getByRole('region', { name: 'Zona de perill' });
const grupAdjunt = () => screen.getByRole('group', { name: 'Document / factura' });
const ubicacio = () => screen.getByTestId('ubicacio').textContent;

// Després de desar un moviment existent es queda a la fitxa amb «Desat ✓».
async function esperaDesat(id = '1') {
  expect(await within(barra()).findByText('Desat ✓')).toBeInTheDocument();
  expect(ubicacio()).toBe(`/comptabilitat/${id} POP`);
  expect(screen.getByRole('heading', { level: 1, name: 'Moviment' })).toBeInTheDocument();
}
// Després de crear des de Comptabilitat, es passa a la fitxa del nou moviment substituint l'alta a l'historial.
async function esperaFitxaCreada() {
  await waitFor(() => expect(ubicacio()).toBe('/comptabilitat/m9 REPLACE'));
  expect(await screen.findByRole('heading', { level: 1, name: 'Moviment' })).toBeInTheDocument();
  expect(textBarra()).toBe('Sense canvis');
}
// L'error d'un camp surt sota el camp (vinculat) i a la barra, com a botó que hi porta.
function esperaErrorCamp(etiqueta, camp, missatge) {
  const input = screen.getByLabelText(etiqueta);
  expect(input).toHaveAttribute('aria-invalid', 'true');
  const descrits = input.getAttribute('aria-describedby').split(' ').map((id) => document.getElementById(id));
  expect(descrits.some((el) => el?.textContent === missatge)).toBe(true);
  expect(within(barra()).getByRole('button', { name: `${camp}: ${missatge}` })).toBeInTheDocument();
}
// jsdom no modela `validity.badInput` ni `stepMismatch`: el navegador hi posa true quan el text no és un número
// («12e») o no compleix el `step` (preu amb més de dos decimals, quantitat no entera).
const simulaValidesa = (input, validesa) => Object.defineProperty(input, 'validity', {
  configurable: true, get: () => ({ badInput: false, stepMismatch: false, ...validesa }),
});

async function omplirNou(user) {
  await user.type(screen.getByLabelText('Data'), '2026-03-05');
  await user.type(screen.getByLabelText('Concepte'), 'Quotes de març');
  await user.type(screen.getByLabelText('Preu unitari'), '100');
}

describe('MovimentForm — layout', () => {
  it("l'alta és un formulari amb el layout de fitxa, la barra «Desar», un únic h1 i l'enllaç a Comptabilitat", () => {
    const { container } = renderNou();
    const form = container.firstChild;
    expect(form.tagName).toBe('FORM');
    expect(form).toHaveClass('pagina-admin', 'pagina-admin--fitxa', 'pagina-admin--amb-barra');
    expect(form).toHaveAttribute('novalidate');
    const titols = screen.getAllByRole('heading', { level: 1 });
    expect(titols).toHaveLength(1);
    expect(titols[0]).toHaveTextContent('Nou moviment');
    expect(screen.getByRole('link', { name: '← Comptabilitat' })).toHaveAttribute('href', '/comptabilitat');
    expect(form).toContainElement(barra());
    expect(textBarra()).toBe('Sense canvis');
    expect(botoDesar()).toBeDisabled();
    expect(screen.queryByRole('region', { name: 'Zona de perill' })).not.toBeInTheDocument();
  });

  it('un moviment existent és sempre editable: sense «Editar», amb la barra i la zona de perill', async () => {
    const { container } = await renderExistent(APORTACIO);
    expect(container.firstChild).toHaveClass('pagina-admin', 'pagina-admin--fitxa', 'pagina-admin--amb-barra');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Editar dades' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Comptabilitat' })).toHaveAttribute('href', '/comptabilitat');
    for (const etiqueta of ['Data', 'Concepte', 'Preu unitari', 'Quantitat']) {
      expect(screen.getByLabelText(etiqueta)).not.toHaveAttribute('readonly');
    }
    for (const etiqueta of ['Tipus', 'Categoria', 'Mètode de pagament', 'Sessió (opcional)']) {
      expect(screen.getByLabelText(etiqueta)).toBeEnabled();
    }
    expect(textBarra()).toBe('Sense canvis');
    expect(zonaPerill()).toContainElement(screen.getByRole('button', { name: 'Eliminar' }));
  });

  it('carrega els valors desats del moviment', async () => {
    ambSessions(SESSIO);
    await renderExistent(APORTACIO);
    await screen.findByRole('option', { name: 'The Artist' });
    expect(screen.getByLabelText('Data')).toHaveValue('2026-03-05');
    expect(screen.getByLabelText('Concepte')).toHaveValue('Aportacions de març');
    expect(screen.getByLabelText('Tipus')).toHaveValue('ingres');
    expect(screen.getByLabelText('Categoria')).toHaveValue('Aportacions');
    expect(screen.getByLabelText('Mètode de pagament')).toHaveValue('datafon');
    expect(screen.getByLabelText('Sessió (opcional)')).toHaveValue('s1');
    expect(screen.getByLabelText('Preu unitari')).toHaveValue(5);
    expect(screen.getByLabelText('Quantitat')).toHaveValue(4);
    expect(screen.getByLabelText('Total')).toHaveValue(20);
  });
});

describe('MovimentForm — alta', () => {
  it('crea un ingrés amb categoria i mètode de pagament i passa a la fitxa del nou moviment', async () => {
    const user = userEvent.setup();
    renderNou();
    await omplirNou(user);
    expect(textBarra()).toBe('Hi ha canvis sense desar');
    await user.click(botoDesar());
    await esperaFitxaCreada();
    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(addDoc).toHaveBeenCalledWith({ nom: 'moviments' }, {
      data: '2026-03-05',
      concepte: 'Quotes de març',
      tipus: 'ingres',
      categoria: 'Aportacions',
      metodePagament: 'efectiu',
      preuUnitari: 100,
      quantitat: 1,
      total: 100,
      sessionId: '',
    });
    // La fitxa creada mostra el que s'ha desat.
    expect(screen.getByLabelText('Concepte')).toHaveValue('Quotes de març');
    expect(screen.getByLabelText('Total')).toHaveValue(100);
  });

  it('un doble clic a «Desar» crea un sol moviment', async () => {
    let resol;
    addDoc.mockImplementationOnce(async ({ nom }, dades) => {
      await new Promise((r) => { resol = r; });
      bd[`${nom}/m9`] = dades;
      return { id: 'm9' };
    });
    const user = userEvent.setup();
    renderNou();
    await omplirNou(user);
    await user.dblClick(botoDesar());
    await user.click(botoDesar());
    expect(textBarra()).toBe('Desant…');
    resol();
    await esperaFitxaCreada();
    expect(addDoc).toHaveBeenCalledTimes(1);
  });

  it('un concepte en blanc és un error del camp i no crea res', async () => {
    const user = userEvent.setup();
    renderNou();
    expect(screen.getByLabelText('Concepte')).toHaveAttribute('aria-required', 'true');
    await user.type(screen.getByLabelText('Preu unitari'), '100');
    await user.click(botoDesar());
    expect(await within(barra()).findByRole('alert')).toHaveTextContent("No s'ha pogut desar");
    esperaErrorCamp('Concepte', 'Concepte', 'El concepte no pot estar en blanc.');
    expect(addDoc).not.toHaveBeenCalled();
    // L'error de la barra porta al camp.
    await user.click(within(barra()).getByRole('button', { name: 'Concepte: El concepte no pot estar en blanc.' }));
    expect(screen.getByLabelText('Concepte')).toHaveFocus();
  });

  it('no deixa desar un moviment amb el concepte només amb espais, i el retalla en desar-lo', async () => {
    const user = userEvent.setup();
    renderNou();
    await user.type(screen.getByLabelText('Concepte'), '   ');
    await user.type(screen.getByLabelText('Preu unitari'), '100');
    await user.click(botoDesar());
    esperaErrorCamp('Concepte', 'Concepte', 'El concepte no pot estar en blanc.');
    expect(addDoc).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Concepte'));
    expect(screen.getByLabelText('Concepte')).not.toHaveAttribute('aria-invalid');
    await user.type(screen.getByLabelText('Concepte'), '  Quotes de març  ');
    await user.click(botoDesar());
    await esperaFitxaCreada();
    expect(addDoc.mock.calls[0][1].concepte).toBe('Quotes de març');
  });

  it('en triar tipus Traspàs, desa la direcció en comptes de categoria i mètode', async () => {
    const user = userEvent.setup();
    renderNou();
    await user.type(screen.getByLabelText('Data'), '2026-03-05');
    await user.type(screen.getByLabelText('Concepte'), 'Recaptació a banc');
    await user.selectOptions(screen.getByLabelText('Tipus'), 'traspas');
    expect(screen.queryByLabelText('Categoria')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Mètode de pagament')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Direcció')).toHaveValue('caixa-a-banc');
    await user.selectOptions(screen.getByLabelText('Direcció'), 'banc-a-caixa');
    await user.type(screen.getByLabelText('Preu unitari'), '200');
    await user.click(botoDesar());
    await esperaFitxaCreada();
    expect(addDoc.mock.calls[0][1]).toEqual({
      data: '2026-03-05',
      concepte: 'Recaptació a banc',
      tipus: 'traspas',
      direccio: 'banc-a-caixa',
      preuUnitari: 200,
      quantitat: 1,
      total: 200,
      sessionId: '',
    });
  });

  it('crea una despesa amb els mètodes de pagament de les despeses', async () => {
    const user = userEvent.setup();
    renderNou();
    await user.selectOptions(screen.getByLabelText('Tipus'), 'despesa');
    const metodes = Array.from(screen.getByLabelText('Mètode de pagament').querySelectorAll('option')).map((o) => o.value);
    expect(metodes).toEqual(['efectiu', 'banc']);
    await user.selectOptions(screen.getByLabelText('Mètode de pagament'), 'banc');
    await user.selectOptions(screen.getByLabelText('Categoria'), 'Gestió associació');
    await user.type(screen.getByLabelText('Data'), '2026-04-01');
    await user.type(screen.getByLabelText('Concepte'), 'Lloguer');
    await user.type(screen.getByLabelText('Preu unitari'), '12.5');
    await user.clear(screen.getByLabelText('Quantitat'));
    await user.type(screen.getByLabelText('Quantitat'), '2');
    await user.click(botoDesar());
    await esperaFitxaCreada();
    expect(addDoc.mock.calls[0][1]).toEqual({
      data: '2026-04-01',
      concepte: 'Lloguer',
      tipus: 'despesa',
      categoria: 'Gestió associació',
      metodePagament: 'banc',
      preuUnitari: 12.5,
      quantitat: 2,
      total: 25,
      sessionId: '',
    });
  });

  it('en passar a despesa, un mètode que les despeses no tenen torna al primer (efectiu)', async () => {
    const user = userEvent.setup();
    renderNou();
    await user.selectOptions(screen.getByLabelText('Mètode de pagament'), 'datafon');
    await user.selectOptions(screen.getByLabelText('Tipus'), 'despesa');
    expect(screen.getByLabelText('Mètode de pagament')).toHaveValue('efectiu');
    expect(screen.getByLabelText('Categoria')).toHaveValue('Gestió pel·lícules');
  });

  it('no permet triar "Quotes socis" com a categoria (només es crea des de la fitxa del soci)', () => {
    renderNou();
    const opcions = Array.from(screen.getByLabelText('Categoria').querySelectorAll('option')).map((o) => o.value);
    expect(opcions).not.toContain('Quotes socis');
  });

  it('si no es pot crear, ho diu a la barra, no canvia de pàgina i es pot tornar a provar', async () => {
    addDoc.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    renderNou();
    await omplirNou(user);
    await user.click(botoDesar());
    expect(await within(barra()).findByRole('alert')).toHaveTextContent("No s'ha pogut desar. Torna-ho a provar.");
    expect(ubicacio()).toBe('/comptabilitat/nou POP');
    await user.click(botoDesar());
    await esperaFitxaCreada();
    expect(addDoc).toHaveBeenCalledTimes(2);
  });
});

describe('MovimentForm — edició directa', () => {
  it('desa un canvi amb el document sencer, es queda a la fitxa i un segon canvi també es desa', async () => {
    const user = userEvent.setup();
    await renderExistent(APORTACIO);
    await user.clear(screen.getByLabelText('Concepte'));
    await user.type(screen.getByLabelText('Concepte'), 'Aportacions d\'abril');
    expect(textBarra()).toBe('Hi ha canvis sense desar');
    await user.click(botoDesar());
    await esperaDesat();
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(setDoc).toHaveBeenCalledWith({ col: 'moviments', id: '1' }, { ...APORTACIO, concepte: 'Aportacions d\'abril' });
    expect(addDoc).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Quantitat'));
    await user.type(screen.getByLabelText('Quantitat'), '6');
    expect(textBarra()).toBe('Hi ha canvis sense desar');
    await user.click(botoDesar());
    await esperaDesat();
    expect(setDoc).toHaveBeenCalledTimes(2);
    expect(setDoc).toHaveBeenLastCalledWith({ col: 'moviments', id: '1' }, {
      ...APORTACIO, concepte: 'Aportacions d\'abril', quantitat: 6, total: 30,
    });
  });

  it('sense canvis, «Desar» està deshabilitat', async () => {
    await renderExistent(APORTACIO);
    expect(botoDesar()).toBeDisabled();
  });

  it('«Descartar canvis» torna als valors desats sense escriure res', async () => {
    const user = userEvent.setup();
    await renderExistent(APORTACIO);
    await user.clear(screen.getByLabelText('Concepte'));
    await user.type(screen.getByLabelText('Concepte'), 'Un altre');
    await user.selectOptions(screen.getByLabelText('Tipus'), 'traspas');
    await user.click(within(barra()).getByRole('button', { name: 'Descartar canvis' }));
    expect(screen.getByLabelText('Concepte')).toHaveValue('Aportacions de març');
    expect(screen.getByLabelText('Tipus')).toHaveValue('ingres');
    expect(screen.getByLabelText('Mètode de pagament')).toHaveValue('datafon');
    expect(textBarra()).toBe('Sense canvis');
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('un doble clic a «Desar» escriu una sola vegada', async () => {
    let resol;
    setDoc.mockImplementationOnce(() => new Promise((r) => { resol = r; }));
    const user = userEvent.setup();
    await renderExistent(APORTACIO);
    await user.type(screen.getByLabelText('Concepte'), '!');
    await user.dblClick(botoDesar());
    resol();
    await esperaDesat();
    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  it('si no es pot desar, ho diu a la barra i els canvis continuen pendents', async () => {
    setDoc.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    await renderExistent(APORTACIO);
    await user.type(screen.getByLabelText('Concepte'), '!');
    await user.click(botoDesar());
    expect(await within(barra()).findByRole('alert')).toHaveTextContent("No s'ha pogut desar. Torna-ho a provar.");
    expect(screen.getByLabelText('Concepte')).toHaveValue('Aportacions de març!');
    await user.click(botoDesar());
    await esperaDesat();
    expect(setDoc).toHaveBeenCalledTimes(2);
  });

  it('en editar un moviment de "Quotes socis" existent, la categoria es manté visible i seleccionada', async () => {
    await renderExistent(MOVIMENT_EXISTENT);
    expect(screen.getByLabelText('Categoria')).toHaveValue('Quotes socis');
  });
});

describe('MovimentForm — canviar tipus en editar', () => {
  it('en canviar el tipus d\'un moviment existent, no deixa camps obsolets del tipus anterior', async () => {
    const user = userEvent.setup();
    await renderExistent({ ...MOVIMENT_EXISTENT, categoria: 'Aportacions' });
    await user.selectOptions(screen.getByLabelText('Tipus'), 'traspas');
    await user.click(botoDesar());
    await esperaDesat();
    expect(setDoc).toHaveBeenCalledWith({ col: 'moviments', id: '1' }, {
      data: '2026-03-05',
      concepte: 'Quotes de març',
      tipus: 'traspas',
      direccio: 'caixa-a-banc',
      preuUnitari: 100,
      quantitat: 1,
      total: 100,
      sessionId: '',
    });
  });

  it('en passar un traspàs a ingrés, tria la primera categoria i el primer mètode d\'ingrés', async () => {
    const user = userEvent.setup();
    await renderExistent({
      data: '2026-03-05', concepte: 'Recaptació', tipus: 'traspas', direccio: 'banc-a-caixa', categoria: null, metodePagament: null,
      preuUnitari: 50, quantitat: 1, total: 50, sessionId: '',
    });
    expect(screen.getByLabelText('Direcció')).toHaveValue('banc-a-caixa');
    await user.selectOptions(screen.getByLabelText('Tipus'), 'ingres');
    await user.click(botoDesar());
    await esperaDesat();
    expect(setDoc.mock.calls[0][1]).toEqual({
      data: '2026-03-05', concepte: 'Recaptació', tipus: 'ingres', categoria: 'Aportacions', metodePagament: 'efectiu',
      preuUnitari: 50, quantitat: 1, total: 50, sessionId: '',
    });
  });

  it('en editar un moviment de "Quotes socis", Tipus i Categoria queden bloquejats', async () => {
    await renderExistent(MOVIMENT_EXISTENT);
    expect(screen.getByLabelText('Tipus')).toBeDisabled();
    expect(screen.getByLabelText('Categoria')).toBeDisabled();
    expect(screen.getByLabelText('Tipus')).toHaveClass('form__input', 'form__input--bloquejat');
    expect(screen.getByLabelText('Categoria')).toHaveClass('form__input', 'form__input--bloquejat');
    expect(screen.getByLabelText('Mètode de pagament')).not.toBeDisabled();
    expect(screen.getByLabelText('Mètode de pagament')).not.toHaveClass('form__input--bloquejat');
  });

  it('en editar un moviment de "Quotes socis" de tipusQuota "renovacio", Tipus i Categoria també queden bloquejats', async () => {
    await renderExistent({ ...MOVIMENT_EXISTENT, tipusQuota: 'renovacio', sessionId: '' });
    expect(screen.getByLabelText('Tipus')).toBeDisabled();
    expect(screen.getByLabelText('Categoria')).toBeDisabled();
    expect(screen.getByLabelText('Categoria')).toHaveValue('Quotes socis');
  });
});

describe('MovimentForm — numeroSoci', () => {
  it('conserva el numeroSoci d\'un moviment de quota en desar, encara que no sigui un camp editable', async () => {
    const user = userEvent.setup();
    await renderExistent({ ...MOVIMENT_EXISTENT, numeroSoci: 7 });
    await user.selectOptions(screen.getByLabelText('Mètode de pagament'), 'datafon');
    await user.click(botoDesar());
    await esperaDesat();
    expect(setDoc).toHaveBeenCalledWith({ col: 'moviments', id: '1' }, {
      ...MOVIMENT_EXISTENT, metodePagament: 'datafon', numeroSoci: 7,
    });
  });

  it('conserva el tipusQuota d\'un moviment de quota en desar, encara que no sigui un camp editable', async () => {
    const user = userEvent.setup();
    await renderExistent({ ...MOVIMENT_EXISTENT, tipusQuota: 'renovacio' });
    expect(screen.getByLabelText('Tipus de quota')).toHaveValue('Renovació');
    expect(screen.getByLabelText('Tipus de quota')).toHaveAttribute('readonly');
    await user.type(screen.getByLabelText('Concepte'), '!');
    await user.click(botoDesar());
    await esperaDesat();
    expect(setDoc.mock.calls[0][1]).toEqual({ ...MOVIMENT_EXISTENT, concepte: 'Quotes de març!', tipusQuota: 'renovacio' });
  });

  it('conserva el vencimentAnterior d\'una renovació en desar (és el que la fa comptar des del venciment anterior)', async () => {
    const user = userEvent.setup();
    await renderExistent({ ...MOVIMENT_EXISTENT, tipusQuota: 'renovacio', vencimentAnterior: '2026-04-01' });
    await user.type(screen.getByLabelText('Concepte'), '!');
    await user.click(botoDesar());
    await esperaDesat();
    expect(setDoc.mock.calls[0][1]).toEqual({
      ...MOVIMENT_EXISTENT, concepte: 'Quotes de març!', tipusQuota: 'renovacio', vencimentAnterior: '2026-04-01',
    });
  });

  it('conserva el modeVigencia d\'una quota en desar (és el que diu si s\'encadena o compta des del primer escaneig)', async () => {
    const user = userEvent.setup();
    await renderExistent({
      ...MOVIMENT_EXISTENT, tipusQuota: 'renovacio', vencimentAnterior: '2026-04-01', modeVigencia: 'encadenada',
    });
    await user.type(screen.getByLabelText('Concepte'), '!');
    await user.click(botoDesar());
    await esperaDesat();
    expect(setDoc.mock.calls[0][1]).toEqual({
      ...MOVIMENT_EXISTENT, concepte: 'Quotes de març!', tipusQuota: 'renovacio', vencimentAnterior: '2026-04-01',
      modeVigencia: 'encadenada',
    });
  });

  it('mostra "Alta nova" com a tipus de quota per defecte', async () => {
    await renderExistent({ ...MOVIMENT_EXISTENT, tipusQuota: 'alta' });
    expect(screen.getByLabelText('Tipus de quota')).toHaveValue('Alta nova');
  });

  it('no afegeix numeroSoci (ni camps desats que el formulari no coneix) a un moviment que no en tenia', async () => {
    const user = userEvent.setup();
    await renderExistent({ ...MOVIMENT_EXISTENT, numeroSoci: null, tipusQuota: null });
    await user.type(screen.getByLabelText('Concepte'), '!');
    await user.click(botoDesar());
    await esperaDesat();
    expect(setDoc.mock.calls[0][1]).toEqual({ ...MOVIMENT_EXISTENT, concepte: 'Quotes de març!' });
  });
});

// Abans, desar o eliminar qualsevol moviment de quota escrivia `{ ultimPagament: data més recent, inicPeriode: null }`:
// fins i tot canviar només el concepte reiniciava l'any del soci al proper escaneig. Ara la fitxa es recalcula amb
// l'historial de quotes (calcularPeriodes) i només s'escriu el que canvia de debò.
describe('MovimentForm — sincronització de la fitxa del soci amb l\'historial de quotes', () => {
  // `quotes`: els moviments de quota del soci tal com queden després de desar o eliminar (és el que llegeix la
  // sincronització, que es fa després de l'escriptura).
  const ambHistorial = (soci, ...quotes) => {
    respostes.moviments = quotes.map((q) => ({ data: () => (typeof q === 'string' ? { data: q } : q) }));
    respostes.socis = [{ ref: 'socis/abc', data: () => soci }];
  };
  const QUOTA = { ...MOVIMENT_EXISTENT, data: '2026-08-06', numeroSoci: 7, tipusQuota: 'renovacio' };

  it('si només canvia el concepte, no toca la fitxa (ni l\'activació del carnet)', async () => {
    ambHistorial({ ultimPagament: '2026-08-06', inicPeriode: '2026-08-10' }, '2025-08-06', '2026-08-06');
    const user = userEvent.setup();
    await renderExistent(QUOTA);
    await user.type(screen.getByLabelText('Concepte'), '!');
    await user.click(botoDesar());
    await esperaDesat();
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('en corregir la data d\'una renovació feta després de vèncer, recalcula ultimPagament i vigenciaDes i conserva l\'activació vàlida', async () => {
    ambHistorial({ ultimPagament: '2026-08-06', inicPeriode: '2026-08-10' }, '2024-08-01', '2026-08-04');
    const user = userEvent.setup();
    await renderExistent(QUOTA);
    await user.clear(screen.getByLabelText('Data'));
    await user.type(screen.getByLabelText('Data'), '2026-08-04');
    await user.click(botoDesar());
    await esperaDesat();
    expect(updateDoc.mock.calls).toEqual([['socis/abc', { ultimPagament: '2026-08-04', vigenciaDes: '2026-08-04' }]]);
  });

  // Fitxa d'abans: la renovació es va desar amb el venciment (2026-08-06) com a data. Posar-hi la data real del
  // cobrament (dos dies abans) no li fa perdre aquests dos dies: la quota continua comptant des del 2026-08-06.
  it('en posar la data real (anterior al venciment) a una renovació antiga, la quota continua comptant des del venciment', async () => {
    ambHistorial({ ultimPagament: '2026-08-06', inicPeriode: '2026-08-10' }, '2025-08-06', '2026-08-04');
    const user = userEvent.setup();
    await renderExistent(QUOTA);
    await user.clear(screen.getByLabelText('Data'));
    await user.type(screen.getByLabelText('Data'), '2026-08-04');
    await user.click(botoDesar());
    await esperaDesat();
    expect(updateDoc.mock.calls).toEqual([['socis/abc', { ultimPagament: '2026-08-04', vigenciaDes: '2026-08-06' }]]);
  });

  it('una renovació anticipada continua comptant des del venciment anterior desat al moviment', async () => {
    const anticipada = { data: '2026-07-20', vencimentAnterior: '2026-08-20' };
    ambHistorial({ ultimPagament: '2026-07-25', vigenciaDes: '2026-08-20' }, '2025-08-06', anticipada);
    const user = userEvent.setup();
    await renderExistent({ ...QUOTA, data: '2026-07-25', vencimentAnterior: '2026-08-20' });
    await user.clear(screen.getByLabelText('Data'));
    await user.type(screen.getByLabelText('Data'), '2026-07-20');
    await user.click(botoDesar());
    await esperaDesat();
    expect(setDoc.mock.calls[0][1]).toEqual({ ...QUOTA, data: '2026-07-20', vencimentAnterior: '2026-08-20' });
    expect(updateDoc.mock.calls).toEqual([['socis/abc', { ultimPagament: '2026-07-20' }]]);
  });

  it('amb dues quotes del mateix dia (alta i renovació), l\'ordre en què arriben no afegeix cap any', async () => {
    const soci = { ultimPagament: '2026-08-06', vigenciaDes: '2027-08-06' };
    const alta = { data: '2026-08-06', tipusQuota: 'alta' };
    const renovacio = { data: '2026-08-06', tipusQuota: 'renovacio', vencimentAnterior: '2027-08-06' };
    for (const ordre of [[alta, renovacio], [renovacio, alta]]) {
      updateDoc.mockClear();
      setDoc.mockClear();
      ambHistorial(soci, ...ordre);
      const user = userEvent.setup();
      const { unmount } = await renderExistent(QUOTA);
      await user.type(screen.getByLabelText('Concepte'), '!');
      await user.click(botoDesar());
      await esperaDesat();
      expect(updateDoc).not.toHaveBeenCalled();
      unmount();
    }
  });

  it('una renovació encadenada no aplica l\'activació en sincronitzar; en eliminar-la, la fitxa torna a l\'alta', async () => {
    const alta = { data: '2025-08-06', tipusQuota: 'alta', modeVigencia: 'primer-escaneig' };
    const renovacio = { data: '2026-07-20', tipusQuota: 'renovacio', vencimentAnterior: '2026-08-20', modeVigencia: 'encadenada' };
    const soci = { ultimPagament: '2026-07-20', vigenciaDes: '2026-08-20', modeVigencia: 'encadenada', inicPeriode: null };
    ambHistorial(soci, alta, renovacio);
    const user = userEvent.setup();
    const { unmount } = await renderExistent({ ...QUOTA, ...renovacio });
    await user.type(screen.getByLabelText('Concepte'), '!');
    await user.click(botoDesar());
    await esperaDesat();
    expect(updateDoc).not.toHaveBeenCalled();
    unmount();

    ambHistorial(soci, alta);
    await renderExistent({ ...QUOTA, ...renovacio });
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    await acceptaDialeg('Elimina');
    await screen.findByText('Llibre de moviments');
    expect(updateDoc.mock.calls).toEqual([['socis/abc', {
      ultimPagament: '2025-08-06', vigenciaDes: '2025-08-06', modeVigencia: 'primer-escaneig',
    }]]);
  });

  it('no toca res si el moviment desat no té numeroSoci', async () => {
    ambHistorial({ ultimPagament: '2020-01-01' }, '2026-03-05');
    const user = userEvent.setup();
    await renderExistent(MOVIMENT_EXISTENT);
    await user.type(screen.getByLabelText('Concepte'), '!');
    await user.click(botoDesar());
    await esperaDesat();
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('en eliminar l\'última quota, la fitxa torna a la quota anterior i descarta l\'activació de l\'eliminada', async () => {
    ambHistorial({ ultimPagament: '2026-08-06', inicPeriode: '2026-08-10' }, '2025-08-06');
    const user = userEvent.setup();
    await renderExistent(QUOTA);
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    await acceptaDialeg('Elimina');
    await screen.findByText('Llibre de moviments');
    expect(updateDoc.mock.calls).toEqual([
      ['socis/abc', { ultimPagament: '2025-08-06', vigenciaDes: '2025-08-06', inicPeriode: null }],
    ]);
  });

  it('no actualitza la fitxa si no queda cap moviment de quota per aquell soci', async () => {
    ambHistorial({ ultimPagament: '2026-08-06' });
    const user = userEvent.setup();
    await renderExistent(QUOTA);
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    await acceptaDialeg('Elimina');
    await screen.findByText('Llibre de moviments');
    expect(updateDoc).not.toHaveBeenCalled();
  });
});

describe('MovimentForm — eliminar', () => {
  it('demana confirmació i esborra el moviment', async () => {
    const user = userEvent.setup();
    await renderExistent(MOVIMENT_EXISTENT);
    await user.click(within(zonaPerill()).getByRole('button', { name: 'Eliminar' }));
    const dialeg = await dialegConfirmacio();
    expect(dialeg).toHaveAttribute('role', 'alertdialog');
    expect(dialeg).toHaveTextContent('Segur que vols eliminar aquest moviment? Aquesta acció no es pot desfer.');
    expect(deleteDoc).not.toHaveBeenCalled();
    await acceptaDialeg('Elimina');
    expect(await screen.findByText('Llibre de moviments')).toBeInTheDocument();
    expect(deleteDoc).toHaveBeenCalledTimes(1);
    expect(deleteDoc).toHaveBeenCalledWith({ col: 'moviments', id: '1' });
    expect(setDoc).not.toHaveBeenCalled();
  });

  it.each([
    ['Cancel·lar', (user) => cancellaDialeg(user)],
    ['ESC', (user) => tancaDialegAmbEsc(user)],
  ])('no esborra res si es tanca la confirmació amb %s', async (_nom, tanca) => {
    const user = userEvent.setup();
    await renderExistent(MOVIMENT_EXISTENT);
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    await tanca(user);
    await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(screen.queryByText('Llibre de moviments')).not.toBeInTheDocument();
  });

  it('amb canvis pendents, elimina amb les dades desades (numeroSoci i document desats)', async () => {
    ambSessions();
    respostes.moviments = [];
    respostes.socis = [{ ref: 'socis/abc', data: () => ({ ultimPagament: '2026-03-05' }) }];
    const user = userEvent.setup();
    await renderExistent({ ...MOVIMENT_EXISTENT, numeroSoci: 7, adjunt: ADJUNT });
    await user.click(within(grupAdjunt()).getByRole('button', { name: 'Treure' }));
    await acceptaDialeg('Treu');
    await user.type(screen.getByLabelText('Concepte'), '!');
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    await acceptaDialeg('Elimina');
    await screen.findByText('Llibre de moviments');
    expect(deleteDoc).toHaveBeenCalledWith({ col: 'moviments', id: '1' });
    expect(eliminarAdjunt).toHaveBeenCalledWith(ADJUNT.path);
    expect(setDoc).not.toHaveBeenCalled();
  });

  it("si no es pot eliminar, ho diu a la zona de perill i es queda a la fitxa", async () => {
    deleteDoc.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    await renderExistent(MOVIMENT_EXISTENT);
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    await acceptaDialeg('Elimina');
    expect(await within(zonaPerill()).findByRole('alert')).toHaveTextContent("No s'ha pogut eliminar. Torna-ho a provar.");
    expect(ubicacio()).toBe('/comptabilitat/1 POP');
  });
});

describe('MovimentForm — preu, quantitat i total', () => {
  it('el total sempre és de només lectura', () => {
    renderNou();
    expect(screen.getByLabelText('Total')).toHaveAttribute('readonly');
  });

  it('quan la quantitat és 1, el total es calcula a partir del preu unitari', async () => {
    const user = userEvent.setup();
    renderNou();
    await user.type(screen.getByLabelText('Preu unitari'), '75');
    expect(screen.getByLabelText('Total')).toHaveValue(75);
  });

  it('quan la quantitat no és 1, el total es calcula com preu unitari × quantitat', async () => {
    const user = userEvent.setup();
    renderNou();
    await user.clear(screen.getByLabelText('Quantitat'));
    await user.type(screen.getByLabelText('Quantitat'), '3');
    await user.type(screen.getByLabelText('Preu unitari'), '10');
    expect(screen.getByLabelText('Total')).toHaveValue(30);
    expect(screen.getByLabelText('Total')).toHaveAttribute('readonly');
  });

  it('un preu i una quantitat en blanc es desen com a 0, com abans', async () => {
    const user = userEvent.setup();
    await renderExistent(APORTACIO);
    await user.clear(screen.getByLabelText('Preu unitari'));
    await user.clear(screen.getByLabelText('Quantitat'));
    await user.click(botoDesar());
    await esperaDesat();
    expect(setDoc.mock.calls[0][1]).toEqual({ ...APORTACIO, preuUnitari: 0, quantitat: 0, total: 0 });
  });

  it('un preu unitari que el navegador no pot llegir és un error i no esborra el preu desat', async () => {
    const user = userEvent.setup();
    await renderExistent(APORTACIO);
    const preu = screen.getByLabelText('Preu unitari');
    simulaValidesa(preu, { badInput: true });
    await user.clear(preu);
    await user.click(botoDesar());
    expect(await within(barra()).findByRole('alert')).toHaveTextContent("No s'ha pogut desar");
    esperaErrorCamp('Preu unitari', 'Preu unitari', 'El preu unitari ha de ser un número.');
    expect(setDoc).not.toHaveBeenCalled();
    simulaValidesa(preu, {});
    await user.type(preu, '6');
    expect(preu).not.toHaveAttribute('aria-invalid');
    await user.click(botoDesar());
    await esperaDesat();
    expect(setDoc.mock.calls[0][1]).toEqual({ ...APORTACIO, preuUnitari: 6, total: 24 });
  });

  it('una data a mig esborrar (que el navegador no pot llegir) és un error i no esborra la data desada', async () => {
    const user = userEvent.setup();
    await renderExistent(APORTACIO);
    const data = screen.getByLabelText('Data');
    simulaValidesa(data, { badInput: true });
    await user.clear(data);
    await user.click(botoDesar());
    expect(await within(barra()).findByRole('alert')).toHaveTextContent("No s'ha pogut desar");
    esperaErrorCamp('Data', 'Data', 'La data no és vàlida.');
    expect(setDoc).not.toHaveBeenCalled();
    simulaValidesa(data, {});
    await user.type(data, '2026-03-06');
    expect(data).not.toHaveAttribute('aria-invalid');
    await user.click(botoDesar());
    await esperaDesat();
    expect(setDoc.mock.calls[0][1]).toEqual({ ...APORTACIO, data: '2026-03-06' });
  });

  it('una quantitat que el navegador no pot llegir és un error i no crea res', async () => {
    const user = userEvent.setup();
    renderNou();
    await omplirNou(user);
    simulaValidesa(screen.getByLabelText('Quantitat'), { badInput: true });
    await user.clear(screen.getByLabelText('Quantitat'));
    await user.click(botoDesar());
    expect(await within(barra()).findByRole('alert')).toBeInTheDocument();
    esperaErrorCamp('Quantitat', 'Quantitat', 'La quantitat ha de ser un número.');
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('com feia el navegador, un preu amb més de dos decimals o una quantitat no entera no es desen', async () => {
    const user = userEvent.setup();
    await renderExistent(APORTACIO);
    simulaValidesa(screen.getByLabelText('Preu unitari'), { stepMismatch: true });
    simulaValidesa(screen.getByLabelText('Quantitat'), { stepMismatch: true });
    await user.clear(screen.getByLabelText('Preu unitari'));
    await user.type(screen.getByLabelText('Preu unitari'), '1.234');
    await user.clear(screen.getByLabelText('Quantitat'));
    await user.type(screen.getByLabelText('Quantitat'), '1.5');
    await user.click(botoDesar());
    expect(await within(barra()).findByRole('alert')).toBeInTheDocument();
    esperaErrorCamp('Preu unitari', 'Preu unitari', 'El preu unitari pot tenir com a màxim dos decimals.');
    esperaErrorCamp('Quantitat', 'Quantitat', 'La quantitat ha de ser un número enter.');
    expect(setDoc).not.toHaveBeenCalled();
  });
});

describe('MovimentForm — "Gestió pel·lícules" requereix sessió', () => {
  it('no deixa desar un moviment de "Gestió pel·lícules" sense sessió: error al camp de la sessió', async () => {
    const user = userEvent.setup();
    renderNou();
    await user.selectOptions(screen.getByLabelText('Tipus'), 'despesa');
    await user.selectOptions(screen.getByLabelText('Categoria'), 'Gestió pel·lícules');
    expect(screen.getByLabelText('Sessió (pel·lícula)')).toHaveAttribute('aria-required', 'true');
    await user.type(screen.getByLabelText('Concepte'), 'Lloguer sala');
    await user.type(screen.getByLabelText('Preu unitari'), '100');
    await user.click(botoDesar());
    expect(await within(barra()).findByRole('alert')).toBeInTheDocument();
    esperaErrorCamp('Sessió (pel·lícula)', 'Sessió', 'Un moviment de "Gestió pel·lícules" ha d\'estar vinculat a una sessió.');
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('desa correctament un moviment de "Gestió pel·lícules" amb sessió vinculada', async () => {
    ambSessions(SESSIO);
    const user = userEvent.setup();
    renderNou();
    await screen.findByRole('option', { name: 'The Artist' });
    await user.selectOptions(screen.getByLabelText('Tipus'), 'despesa');
    await user.selectOptions(screen.getByLabelText('Categoria'), 'Gestió pel·lícules');
    await user.selectOptions(screen.getByLabelText('Sessió (pel·lícula)'), 's1');
    await user.type(screen.getByLabelText('Concepte'), 'Lloguer sala');
    await user.type(screen.getByLabelText('Preu unitari'), '100');
    await user.click(botoDesar());
    await esperaFitxaCreada();
    expect(addDoc.mock.calls[0][1]).toEqual({
      data: '', concepte: 'Lloguer sala', tipus: 'despesa', categoria: 'Gestió pel·lícules', metodePagament: 'efectiu',
      preuUnitari: 100, quantitat: 1, total: 100, sessionId: 's1',
    });
  });

  it('un traspàs que venia de "Gestió pel·lícules" es pot desar (no té sessió ni categoria)', async () => {
    const user = userEvent.setup();
    renderNou();
    await user.selectOptions(screen.getByLabelText('Tipus'), 'despesa');
    await user.selectOptions(screen.getByLabelText('Categoria'), 'Gestió pel·lícules');
    await user.selectOptions(screen.getByLabelText('Tipus'), 'traspas');
    await user.type(screen.getByLabelText('Concepte'), 'Traspàs');
    await user.click(botoDesar());
    await esperaFitxaCreada();
    expect(addDoc.mock.calls[0][1]).not.toHaveProperty('categoria');
  });
});

describe('MovimentForm — categories vàlides per tipus', () => {
  it('un ingrés només ofereix "Aportacions" com a categoria', () => {
    renderNou();
    const opcions = Array.from(screen.getByLabelText('Categoria').querySelectorAll('option')).map((o) => o.value);
    expect(opcions).toEqual(['Aportacions']);
  });

  it('una despesa només ofereix "Gestió pel·lícules" i "Gestió associació" com a categoria', async () => {
    const user = userEvent.setup();
    renderNou();
    await user.selectOptions(screen.getByLabelText('Tipus'), 'despesa');
    const opcions = Array.from(screen.getByLabelText('Categoria').querySelectorAll('option')).map((o) => o.value);
    expect(opcions).toEqual(['Gestió pel·lícules', 'Gestió associació']);
  });
});

describe('MovimentForm — un traspàs no es pot vincular a cap sessió', () => {
  it('no mostra el selector de sessió quan el tipus és Traspàs', async () => {
    const user = userEvent.setup();
    renderNou();
    await user.selectOptions(screen.getByLabelText('Tipus'), 'traspas');
    expect(screen.queryByLabelText('Sessió (opcional)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Sessió (pel·lícula)')).not.toBeInTheDocument();
  });

  it('desa un traspàs sense sessionId encara que se n\'hagués triat una abans', async () => {
    ambSessions(SESSIO);
    const user = userEvent.setup();
    renderNou();
    await screen.findByRole('option', { name: 'The Artist' });
    await user.selectOptions(screen.getByLabelText('Sessió (opcional)'), 's1');
    await user.selectOptions(screen.getByLabelText('Tipus'), 'traspas');
    await user.type(screen.getByLabelText('Concepte'), 'Traspàs a banc');
    await user.type(screen.getByLabelText('Preu unitari'), '50');
    await user.click(botoDesar());
    await esperaFitxaCreada();
    expect(addDoc.mock.calls[0][1].sessionId).toBe('');
  });
});

describe('MovimentForm — preomplenat via paràmetres d\'URL', () => {
  const URL_APORTACIONS = '?sessionId=s1&data=2026-03-05&tipus=ingres&categoria=Aportacions&concepte=Aportacions&preuUnitari=5&quantitat=10';

  it('preomple data, tipus, categoria, concepte, preu unitari i quantitat des de la URL', () => {
    renderNou(URL_APORTACIONS);
    expect(screen.getByLabelText('Data')).toHaveValue('2026-03-05');
    expect(screen.getByLabelText('Categoria')).toHaveValue('Aportacions');
    expect(screen.getByLabelText('Concepte')).toHaveValue('Aportacions');
    expect(screen.getByLabelText('Preu unitari')).toHaveValue(5);
    expect(screen.getByLabelText('Quantitat')).toHaveValue(10);
    expect(screen.getByLabelText('Total')).toHaveValue(50);
  });

  it('el que ve preomplert ja és un canvi pendent: es pot desar directament', async () => {
    ambSessions(SESSIO);
    const user = userEvent.setup();
    renderNou(URL_APORTACIONS);
    await screen.findByRole('option', { name: 'The Artist' });
    expect(textBarra()).toBe('Hi ha canvis sense desar');
    await user.click(botoDesar());
    await screen.findByText('Fitxa de la sessió');
    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(addDoc.mock.calls[0][1]).toEqual({
      data: '2026-03-05', concepte: 'Aportacions', tipus: 'ingres', categoria: 'Aportacions', metodePagament: 'efectiu',
      preuUnitari: 5, quantitat: 10, total: 50, sessionId: 's1',
    });
  });

  it('ignora una categoria de la URL que no és vàlida per al tipus indicat', () => {
    renderNou('?tipus=ingres&categoria=Gestió pel·lícules');
    expect(screen.getByLabelText('Categoria')).toHaveValue('Aportacions');
  });

  it('una despesa per URL comença amb la seva categoria i el mètode efectiu', () => {
    renderNou('?tipus=despesa');
    expect(screen.getByLabelText('Tipus')).toHaveValue('despesa');
    expect(screen.getByLabelText('Categoria')).toHaveValue('Gestió pel·lícules');
    expect(screen.getByLabelText('Mètode de pagament')).toHaveValue('efectiu');
  });
});

describe('MovimentForm — preselecció de sessió des de la URL', () => {
  it('preselecciona la sessió quan arriba amb el paràmetre sessionId', async () => {
    ambSessions(SESSIO);
    renderNou('?sessionId=s1');
    await screen.findByRole('option', { name: 'The Artist' });
    expect(screen.getByLabelText('Sessió (opcional)')).toHaveValue('s1');
  });

  it('bloqueja el selector de sessió quan ve preseleccionada per URL', async () => {
    ambSessions(SESSIO);
    renderNou('?sessionId=s1');
    await screen.findByRole('option', { name: 'The Artist' });
    expect(screen.getByLabelText('Sessió (opcional)')).toBeDisabled();
  });

  it('no bloqueja el selector de sessió quan s\'obre el formulari sense sessió a la URL', async () => {
    ambSessions(SESSIO);
    renderNou();
    await screen.findByRole('option', { name: 'The Artist' });
    expect(screen.getByLabelText('Sessió (opcional)')).not.toBeDisabled();
  });

  it("venint d'una sessió, l'enllaç de tornada i el desat porten a les estadístiques d'aquella sessió", async () => {
    ambSessions(SESSIO);
    const user = userEvent.setup();
    renderNou('?sessionId=s1');
    await screen.findByRole('option', { name: 'The Artist' });
    expect(screen.getByRole('link', { name: '← Sessió' })).toHaveAttribute('href', '/sessions/s1?pestanya=estadistiques');
    await user.type(screen.getByLabelText('Concepte'), 'Lloguer projector');
    await user.type(screen.getByLabelText('Preu unitari'), '30');
    await user.click(botoDesar());
    await screen.findByText('Fitxa de la sessió');
    expect(ubicacio()).toBe('/sessions/s1?pestanya=estadistiques REPLACE');
    expect(addDoc).toHaveBeenCalledTimes(1);
    expect(addDoc.mock.calls[0][1]).toEqual({
      data: '', concepte: 'Lloguer projector', tipus: 'ingres', categoria: 'Aportacions', metodePagament: 'efectiu',
      preuUnitari: 30, quantitat: 1, total: 30, sessionId: 's1',
    });
  });

  it("venint d'una sessió, «Descartar canvis» no perd la sessió i el desat la vincula", async () => {
    ambSessions(SESSIO);
    const user = userEvent.setup();
    renderNou('?sessionId=s1');
    await screen.findByRole('option', { name: 'The Artist' });
    await user.type(screen.getByLabelText('Concepte'), 'Un altre');
    await user.click(within(barra()).getByRole('button', { name: 'Descartar canvis' }));
    expect(screen.getByLabelText('Concepte')).toHaveValue('');
    expect(screen.getByLabelText('Sessió (opcional)')).toHaveValue('s1');
    expect(screen.getByLabelText('Sessió (opcional)')).toBeDisabled();
    // El preomplert continua pendent de desar.
    expect(textBarra()).toBe('Hi ha canvis sense desar');
    await user.type(screen.getByLabelText('Concepte'), 'Lloguer projector');
    await user.click(botoDesar());
    await screen.findByText('Fitxa de la sessió');
    expect(addDoc.mock.calls[0][1].sessionId).toBe('s1');
  });

  it("venint d'una sessió, triar Despesa després de descartar no demana una sessió que no es pot triar", async () => {
    ambSessions(SESSIO);
    const user = userEvent.setup();
    renderNou('?sessionId=s1');
    await screen.findByRole('option', { name: 'The Artist' });
    await user.type(screen.getByLabelText('Concepte'), 'Lloguer');
    await user.click(within(barra()).getByRole('button', { name: 'Descartar canvis' }));
    await user.selectOptions(screen.getByLabelText('Tipus'), 'despesa');
    expect(screen.getByLabelText('Categoria')).toHaveValue('Gestió pel·lícules');
    expect(screen.getByLabelText('Sessió (pel·lícula)')).toHaveValue('s1');
    await user.type(screen.getByLabelText('Concepte'), 'Lloguer sala');
    await user.click(botoDesar());
    await screen.findByText('Fitxa de la sessió');
    expect(addDoc.mock.calls[0][1]).toMatchObject({ tipus: 'despesa', categoria: 'Gestió pel·lícules', sessionId: 's1' });
  });

  it("venint d'una sessió, passar a Traspàs i tornar a Ingrés recupera la sessió bloquejada", async () => {
    ambSessions(SESSIO);
    const user = userEvent.setup();
    renderNou('?sessionId=s1');
    await screen.findByRole('option', { name: 'The Artist' });
    await user.selectOptions(screen.getByLabelText('Tipus'), 'traspas');
    expect(screen.queryByLabelText('Sessió (opcional)')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Tipus'), 'ingres');
    expect(screen.getByLabelText('Sessió (opcional)')).toHaveValue('s1');
    expect(screen.getByLabelText('Sessió (opcional)')).toBeDisabled();
    await user.type(screen.getByLabelText('Concepte'), 'Aportació');
    await user.click(botoDesar());
    await screen.findByText('Fitxa de la sessió');
    expect(addDoc.mock.calls[0][1].sessionId).toBe('s1');
  });

  it("venint d'una sessió, un traspàs es desa sense sessió", async () => {
    ambSessions(SESSIO);
    const user = userEvent.setup();
    renderNou('?sessionId=s1');
    await screen.findByRole('option', { name: 'The Artist' });
    await user.selectOptions(screen.getByLabelText('Tipus'), 'traspas');
    await user.type(screen.getByLabelText('Concepte'), 'Traspàs');
    await user.click(botoDesar());
    await screen.findByText('Fitxa de la sessió');
    expect(addDoc.mock.calls[0][1]).toMatchObject({ tipus: 'traspas', sessionId: '' });
  });

  it('un moviment existent amb sessió no la té bloquejada i, en desar, es queda a la fitxa', async () => {
    ambSessions(SESSIO, { id: 's2', titol: 'Vertigo', data: '2026-06-01' });
    const user = userEvent.setup();
    await renderExistent(APORTACIO);
    await screen.findByRole('option', { name: 'Vertigo' });
    expect(screen.getByLabelText('Sessió (opcional)')).toBeEnabled();
    expect(screen.getByRole('link', { name: '← Comptabilitat' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Sessió (opcional)'), 's2');
    await user.click(botoDesar());
    await esperaDesat();
    expect(setDoc.mock.calls[0][1]).toEqual({ ...APORTACIO, sessionId: 's2' });
  });
});

describe('MovimentForm — càrrega', () => {
  it('si no es poden llegir les sessions, ho diu sota el selector i «Torna-ho a provar» les torna a llegir', async () => {
    const errorConsola = vi.spyOn(console, 'error').mockImplementation(() => {});
    ambSessions({ id: 's1', titol: 'The Artist', data: '2026-03-05' });
    getDocs.mockRejectedValueOnce(new Error('unavailable'));
    renderRuta('/comptabilitat/nou');
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'han pogut carregar les sessions.");
    fireEvent.click(screen.getByRole('button', { name: 'Torna-ho a provar' }));
    expect(await screen.findByRole('option', { name: 'The Artist' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    errorConsola.mockRestore();
  });

  it('navega al llistat si el moviment no existeix', async () => {
    renderRuta('/comptabilitat/inexistent');
    expect(await screen.findByText('Llibre de moviments')).toBeInTheDocument();
    expect(ubicacio()).toBe('/comptabilitat REPLACE');
  });

  it('si no es pot carregar, ho diu i no mostra el formulari', async () => {
    getDoc.mockRejectedValueOnce(new Error('offline'));
    bd['moviments/1'] = { tipus: 'despesa', concepte: 'Lloguer', data: '2026-03-01', total: 40 };
    renderRuta('/comptabilitat/1');
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'ha pogut carregar el moviment.");
    expect(screen.getByRole('heading', { level: 1, name: 'Moviment' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Comptabilitat' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Concepte')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Torna-ho a provar' }));
    expect(await screen.findByLabelText('Concepte')).toBeInTheDocument();
  });
});

describe('MovimentForm — document / factura adjunt', () => {
  it('en crear un moviment amb un document, el puja i en desa la referència', async () => {
    pujarAdjunt.mockResolvedValue(ADJUNT);
    const user = userEvent.setup();
    renderNou();
    await omplirNou(user);
    await user.upload(screen.getByLabelText('Adjuntar un document'), pdf('factura.pdf'));
    await user.click(botoDesar());
    await esperaFitxaCreada();
    expect(pujarAdjunt).toHaveBeenCalledTimes(1);
    expect(pujarAdjunt).toHaveBeenCalledWith(expect.objectContaining({ name: 'factura.pdf' }));
    expect(addDoc.mock.calls[0][1]).toEqual({
      data: '2026-03-05', concepte: 'Quotes de març', tipus: 'ingres', categoria: 'Aportacions', metodePagament: 'efectiu',
      preuUnitari: 100, quantitat: 1, total: 100, sessionId: '', adjunt: ADJUNT,
    });
    // La fitxa creada en mostra l'enllaç.
    expect(await within(grupAdjunt()).findByRole('link', { name: 'factura.pdf' })).toHaveAttribute('href', 'https://storage.test/factura.pdf');
  });

  it('triar un document és un canvi pendent i «Descartar canvis» el treu sense pujar res', async () => {
    const user = userEvent.setup();
    await renderExistent(APORTACIO);
    await user.upload(screen.getByLabelText('Adjuntar un document'), pdf('factura.pdf'));
    expect(within(grupAdjunt()).getByText('factura.pdf')).toBeInTheDocument();
    expect(textBarra()).toBe('Hi ha canvis sense desar');
    await user.click(within(barra()).getByRole('button', { name: 'Descartar canvis' }));
    expect(within(grupAdjunt()).getByText('Cap fitxer seleccionat')).toBeInTheDocument();
    expect(textBarra()).toBe('Sense canvis');
    expect(pujarAdjunt).not.toHaveBeenCalled();
  });

  it('el selector del document és dins del grup «Document / factura» i mostra el nom del fitxer triat', async () => {
    const user = userEvent.setup();
    renderNou();
    const selector = screen.getByLabelText('Adjuntar un document');
    expect(selector).toHaveAttribute('type', 'file');
    expect(selector).toHaveClass('selector-fitxer__input');
    expect(selector).toHaveAttribute('accept', ACCEPT_ADJUNT);
    expect(grupAdjunt()).toContainElement(selector);
    expect(screen.getByText('Cap fitxer seleccionat')).toBeInTheDocument();
    await user.upload(selector, pdf('factura.pdf'));
    expect(screen.getByText('factura.pdf')).toBeInTheDocument();
  });

  it('un fitxer rebutjat no queda com a triat (i treu el que hi havia triat abans)', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderNou();
    await user.upload(screen.getByLabelText('Adjuntar un document'), pdf('bona.pdf'));
    expect(screen.getByText('bona.pdf')).toBeInTheDocument();
    await user.upload(screen.getByLabelText('Adjuntar un document'), new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(screen.queryByText('notes.txt')).not.toBeInTheDocument();
    expect(screen.queryByText('bona.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('Cap fitxer seleccionat')).toBeInTheDocument();
    expect(textBarra()).toBe('Sense canvis');
  });

  it('amb un document desat, el selector diu «Canviar el document» i «Treure» el deixa pendent de treure', async () => {
    const user = userEvent.setup();
    await renderExistent({ ...MOVIMENT_EXISTENT, adjunt: ADJUNT });
    expect(grupAdjunt()).toContainElement(screen.getByLabelText('Canviar el document'));
    await user.click(within(grupAdjunt()).getByRole('button', { name: 'Treure' }));
    await acceptaDialeg('Treu');
    expect(await screen.findByLabelText('Adjuntar un document')).toBeInTheDocument();
    expect(within(grupAdjunt()).queryByRole('link', { name: 'factura.pdf' })).not.toBeInTheDocument();
    expect(textBarra()).toBe('Hi ha canvis sense desar');
    await user.click(within(barra()).getByRole('button', { name: 'Descartar canvis' }));
    expect(within(grupAdjunt()).getByRole('link', { name: 'factura.pdf' })).toBeInTheDocument();
    expect(screen.getByLabelText('Canviar el document')).toBeInTheDocument();
  });

  it('sense cap document, no puja res ni desa cap camp adjunt', async () => {
    const user = userEvent.setup();
    renderNou();
    await omplirNou(user);
    await user.click(botoDesar());
    await esperaFitxaCreada();
    expect(pujarAdjunt).not.toHaveBeenCalled();
    expect(addDoc.mock.calls[0][1]).not.toHaveProperty('adjunt');
  });

  it('rebutja un fitxer que no és PDF ni imatge', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderNou();
    await user.upload(screen.getByLabelText('Adjuntar un document'), new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(within(grupAdjunt()).getByRole('alert')).toHaveTextContent('El document ha de ser un PDF o una imatge.');
  });

  it('rebutja un fitxer de més de 10 MB, i l\'avís desapareix en triar-ne un de bo', async () => {
    const user = userEvent.setup();
    renderNou();
    const gran = pdf('gran.pdf');
    Object.defineProperty(gran, 'size', { value: 10 * 1024 * 1024 + 1 });
    await user.upload(screen.getByLabelText('Adjuntar un document'), gran);
    expect(screen.getByText('El document no pot ocupar més de 10 MB.')).toBeInTheDocument();
    await user.upload(screen.getByLabelText('Adjuntar un document'), pdf('petit.pdf'));
    expect(screen.queryByText('El document no pot ocupar més de 10 MB.')).not.toBeInTheDocument();
  });

  it('si no es pot desar el moviment, esborra el fitxer que ja s\'havia pujat i el torna a pujar en reintentar', async () => {
    pujarAdjunt.mockResolvedValueOnce(ADJUNT).mockResolvedValueOnce(ADJUNT_NOU);
    addDoc.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    renderNou();
    await omplirNou(user);
    await user.upload(screen.getByLabelText('Adjuntar un document'), pdf());
    await user.click(botoDesar());
    expect(await within(barra()).findByRole('alert')).toHaveTextContent("No s'ha pogut desar. Torna-ho a provar.");
    expect(eliminarAdjunt).toHaveBeenCalledWith(ADJUNT.path);
    await user.click(botoDesar());
    await esperaFitxaCreada();
    expect(pujarAdjunt).toHaveBeenCalledTimes(2);
    expect(addDoc.mock.calls[1][1].adjunt).toEqual(ADJUNT_NOU);
  });

  it('si el moviment ja s\'ha escrit i falla un pas posterior, no esborra el document que ara hi està vinculat', async () => {
    pujarAdjunt.mockResolvedValue(ADJUNT_NOU);
    // La fitxa no quadra amb l'historial: la sincronització ha d'escriure (i el primer cop falla).
    respostes.socis = [{ ref: 'socis/abc', data: () => ({ ultimPagament: '2020-01-01' }) }];
    respostes.moviments = [{ data: () => ({ data: '2026-03-05' }) }];
    updateDoc.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    await renderExistent({ ...MOVIMENT_EXISTENT, numeroSoci: 7 });
    await user.upload(screen.getByLabelText('Adjuntar un document'), pdf());
    await user.click(botoDesar());
    expect(await within(barra()).findByRole('alert')).toHaveTextContent("No s'ha pogut desar. Torna-ho a provar.");
    expect(setDoc.mock.calls[0][1].adjunt).toEqual(ADJUNT_NOU);
    expect(eliminarAdjunt).not.toHaveBeenCalled();
  });

  it('si falla un pas posterior en substituir el document, l\'antic ja s\'ha esborrat i reintentar no deixa orfes', async () => {
    pujarAdjunt.mockResolvedValue(ADJUNT_NOU);
    urlAdjunt.mockImplementation(async (path) => `https://storage.test/${path}`);
    // La fitxa no quadra amb l'historial: la sincronització ha d'escriure (i el primer cop falla).
    respostes.socis = [{ ref: 'socis/abc', data: () => ({ ultimPagament: '2020-01-01' }) }];
    respostes.moviments = [{ data: () => ({ data: '2026-03-05' }) }];
    updateDoc.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    await renderExistent({ ...MOVIMENT_EXISTENT, numeroSoci: 7, adjunt: ADJUNT });
    await user.upload(screen.getByLabelText('Canviar el document'), pdf());
    await user.click(botoDesar());
    expect(await within(barra()).findByRole('alert')).toHaveTextContent("No s'ha pogut desar. Torna-ho a provar.");
    expect(eliminarAdjunt).toHaveBeenCalledTimes(1);
    expect(eliminarAdjunt).toHaveBeenCalledWith(ADJUNT.path);
    // La fitxa ja mostra el document escrit; reintentar torna a escriure el mateix i sincronitza, sense pujar ni esborrar res més.
    expect(await within(grupAdjunt()).findByRole('link', { name: 'nova.pdf' })).toBeInTheDocument();
    await user.click(botoDesar());
    await esperaDesat();
    expect(pujarAdjunt).toHaveBeenCalledTimes(1);
    expect(eliminarAdjunt).toHaveBeenCalledTimes(1);
    expect(setDoc).toHaveBeenCalledTimes(2);
    expect(setDoc.mock.calls[1][1]).toEqual({ ...MOVIMENT_EXISTENT, numeroSoci: 7, adjunt: ADJUNT_NOU });
    expect(updateDoc).toHaveBeenCalledTimes(2);
  });

  it('en veure un moviment amb document, mostra l\'enllaç al fitxer dins del grup', async () => {
    await renderExistent({ ...MOVIMENT_EXISTENT, adjunt: ADJUNT });
    const enllac = await screen.findByRole('link', { name: 'factura.pdf' });
    expect(enllac).toHaveAttribute('href', 'https://storage.test/factura.pdf');
    expect(urlAdjunt).toHaveBeenCalledWith(ADJUNT.path);
    expect(grupAdjunt()).toContainElement(enllac);
    expect(within(grupAdjunt()).getByRole('button', { name: 'Treure' })).toBeInTheDocument();
    expect(screen.queryByText('Cap document adjunt.')).not.toBeInTheDocument();
  });

  it('en veure un moviment sense document, ho indica', async () => {
    await renderExistent(MOVIMENT_EXISTENT);
    expect(within(grupAdjunt()).getByText('Cap document adjunt.')).toBeInTheDocument();
    expect(screen.getByLabelText('Adjuntar un document')).toBeInTheDocument();
  });

  it('en desar sense tocar el document, el conserva', async () => {
    const user = userEvent.setup();
    await renderExistent({ ...MOVIMENT_EXISTENT, adjunt: ADJUNT });
    await user.type(screen.getByLabelText('Concepte'), '!');
    await user.click(botoDesar());
    await esperaDesat();
    expect(setDoc.mock.calls[0][1]).toEqual({ ...MOVIMENT_EXISTENT, concepte: 'Quotes de març!', adjunt: ADJUNT });
    expect(pujarAdjunt).not.toHaveBeenCalled();
    expect(eliminarAdjunt).not.toHaveBeenCalled();
  });

  it('en substituir el document, desa el nou, esborra l\'antic i es queda a la fitxa amb el nou', async () => {
    pujarAdjunt.mockResolvedValue(ADJUNT_NOU);
    urlAdjunt.mockImplementation(async (path) => `https://storage.test/${path}`);
    const user = userEvent.setup();
    await renderExistent({ ...MOVIMENT_EXISTENT, adjunt: ADJUNT });
    await user.upload(screen.getByLabelText('Canviar el document'), pdf());
    await user.click(botoDesar());
    await esperaDesat();
    expect(setDoc.mock.calls[0][1]).toEqual({ ...MOVIMENT_EXISTENT, adjunt: ADJUNT_NOU });
    expect(eliminarAdjunt).toHaveBeenCalledTimes(1);
    expect(eliminarAdjunt).toHaveBeenCalledWith(ADJUNT.path);
    expect(await within(grupAdjunt()).findByRole('link', { name: 'nova.pdf' })).toHaveAttribute('href', `https://storage.test/${ADJUNT_NOU.path}`);
    expect(within(grupAdjunt()).getByText('Cap fitxer seleccionat')).toBeInTheDocument();

    // Un segon desat no torna a pujar el document ni n'esborra cap.
    await user.type(screen.getByLabelText('Concepte'), '!');
    await user.click(botoDesar());
    await esperaDesat();
    expect(pujarAdjunt).toHaveBeenCalledTimes(1);
    expect(eliminarAdjunt).toHaveBeenCalledTimes(1);
    expect(setDoc.mock.calls[1][1]).toEqual({ ...MOVIMENT_EXISTENT, concepte: 'Quotes de març!', adjunt: ADJUNT_NOU });
  });

  it('no treu el document si es cancel·la la confirmació', async () => {
    const user = userEvent.setup();
    await renderExistent({ ...MOVIMENT_EXISTENT, adjunt: ADJUNT });
    await user.click(within(grupAdjunt()).getByRole('button', { name: 'Treure' }));
    expect(await dialegConfirmacio()).toHaveTextContent('Segur que vols treure el document?');
    await cancellaDialeg(user);
    expect(within(grupAdjunt()).getByRole('link', { name: 'factura.pdf' })).toBeInTheDocument();
    expect(textBarra()).not.toBe('Hi ha canvis sense desar');
  });

  it('en treure el document, no el desa, l\'esborra de l\'emmagatzematge i se\'n pot adjuntar un altre després', async () => {
    pujarAdjunt.mockResolvedValue(ADJUNT_NOU);
    const user = userEvent.setup();
    await renderExistent({ ...MOVIMENT_EXISTENT, adjunt: ADJUNT });
    await user.click(within(grupAdjunt()).getByRole('button', { name: 'Treure' }));
    await acceptaDialeg('Treu');
    await user.click(botoDesar());
    await esperaDesat();
    expect(setDoc.mock.calls[0][1]).toEqual(MOVIMENT_EXISTENT);
    expect(eliminarAdjunt).toHaveBeenCalledWith(ADJUNT.path);
    expect(within(grupAdjunt()).getByText('Cap document adjunt.')).toBeInTheDocument();

    await user.upload(screen.getByLabelText('Adjuntar un document'), pdf());
    await user.click(botoDesar());
    await esperaDesat();
    expect(setDoc.mock.calls[1][1]).toEqual({ ...MOVIMENT_EXISTENT, adjunt: ADJUNT_NOU });
    expect(eliminarAdjunt).toHaveBeenCalledTimes(1);
  });

  it('en eliminar el moviment, esborra també el seu document', async () => {
    const user = userEvent.setup();
    await renderExistent({ ...MOVIMENT_EXISTENT, adjunt: ADJUNT });
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    await acceptaDialeg('Elimina');
    await screen.findByText('Llibre de moviments');
    expect(deleteDoc).toHaveBeenCalled();
    expect(eliminarAdjunt).toHaveBeenCalledWith(ADJUNT.path);
  });
});

describe('MovimentForm — sessions especials sense control', () => {
  it('no ofereix les sessions senseControl al selector de sessió', async () => {
    ambSessions(SESSIO, { id: 'e1', titol: 'Carretera a Gusen', senseControl: true });
    renderNou();
    await screen.findByRole('option', { name: 'The Artist' });
    expect(screen.queryByRole('option', { name: 'Carretera a Gusen' })).not.toBeInTheDocument();
  });
});
