import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter, Routes, Route, useLocation, useNavigationType,
} from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,ABC') },
}));
vi.mock('firebase/firestore', () => {
  const batchSet = vi.fn();
  const batchUpdate = vi.fn();
  const batchDelete = vi.fn();
  const batchCommit = vi.fn().mockResolvedValue(undefined);
  const writeBatch = vi.fn(() => ({ set: batchSet, update: batchUpdate, delete: batchDelete, commit: batchCommit }));
  return {
    addDoc: vi.fn().mockResolvedValue({ id: 's9' }),
    getDoc: vi.fn(),
    getDocs: vi.fn().mockResolvedValue({ docs: [] }),
    collection: vi.fn((_, nom) => nom),
    doc: vi.fn((...args) => args[args.length - 1]),
    query: vi.fn(),
    where: vi.fn(),
    writeBatch,
    __batchSet: batchSet,
    __batchUpdate: batchUpdate,
    __batchDelete: batchDelete,
    __batchCommit: batchCommit,
  };
});

import {
  addDoc, getDoc, getDocs, writeBatch, __batchSet, __batchUpdate, __batchDelete, __batchCommit,
} from 'firebase/firestore';
import SociForm from './SociForm';
import {
  acceptaDialeg, cancellaDialeg, dialegConfirmacio, hiHaDialegConfirmacio, renderAmbConfirmacio, tancaDialegAmbEsc,
} from '../../test/confirmacio';

// Ruta actual i tipus de l'última navegació (per comprovar el `replace` en crear).
function Ubicacio() {
  const { pathname } = useLocation();
  return <p data-testid="ubicacio">{`${pathname} ${useNavigationType()}`}</p>;
}

function renderNou() {
  return renderAmbConfirmacio(
    <MemoryRouter initialEntries={['/socis/nou']}>
      <Routes>
        <Route path="/socis/nou" element={<SociForm />} />
        <Route path="/socis/:id" element={<p>Fitxa del soci creat</p>} />
        <Route path="/socis" element={<p>Llistat de socis</p>} />
      </Routes>
      <Ubicacio />
    </MemoryRouter>
  );
}

function renderExistent() {
  return renderAmbConfirmacio(
    <MemoryRouter initialEntries={['/socis/1']}>
      <Routes>
        <Route path="/socis/:id" element={<SociForm />} />
        <Route path="/socis" element={<p>Llistat de socis</p>} />
      </Routes>
    </MemoryRouter>
  );
}

const barra = () => document.querySelector('.barra-desar');
const carrega = (dades) => getDoc.mockResolvedValueOnce({ data: () => dades });
const CAMPS_BUITS = {
  numeroSoci: '', nom: '', cognoms: '', poblacio: '', codiPostal: '',
  telefon: '', correuElectronic: '', dni: '', grupWhatsapp: '',
};
const ETIQUETES_CAMPS = ['Nom', 'Cognoms', 'Població', 'Codi postal', 'Telèfon', 'Correu electrònic', 'DNI', 'Grup WhatsApp'];
// Soci desat amb camps que el formulari no mostra (s'han de conservar tal qual en desar).
const SOCI_COMPLET = {
  numeroSoci: 7,
  nom: 'Anna',
  cognoms: 'Vidal',
  poblacio: 'Roda de Berà',
  codiPostal: '43883',
  telefon: '600000000',
  correuElectronic: 'anna@exemple.cat',
  dni: '12345678Z',
  grupWhatsapp: null,
  dataAlta: '2026-02-15',
  ultimPagament: '2026-08-29',
  inicPeriode: '2026-09-01',
  tokenCarnet: 'tok-1',
  actiu: true,
  estatManual: 'pendent',
  motiuDesactivacio: '',
};

function reiniciaEscriptures() {
  addDoc.mockClear();
  writeBatch.mockClear();
  __batchSet.mockClear();
  __batchUpdate.mockClear();
  __batchDelete.mockClear();
  __batchCommit.mockClear();
  __batchCommit.mockResolvedValue(undefined);
}

// Després de desar un soci existent, es queda a la fitxa amb «Desat ✓».
async function esperaDesat() {
  expect(await within(barra()).findByText('Desat ✓')).toBeInTheDocument();
  expect(screen.queryByText('Llistat de socis')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1, name: 'Fitxa del soci/a' })).toBeInTheDocument();
}

describe('SociForm — alta', () => {
  beforeEach(() => {
    reiniciaEscriptures();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('token-alta');
  });
  afterEach(() => vi.restoreAllMocks());

  it('crea un soci nou amb dataAlta i ultimPagament iguals, actiu i amb token de carnet, i passa a la fitxa nova', async () => {
    const user = userEvent.setup();
    renderNou();
    await user.type(screen.getByLabelText('Nom'), 'Anna');
    await user.type(screen.getByLabelText('Cognoms'), 'Vidal');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByText('Fitxa del soci creat')).toBeInTheDocument();
    expect(screen.getByTestId('ubicacio')).toHaveTextContent('/socis/s9 REPLACE');
    expect(addDoc).toHaveBeenCalledTimes(1);
    const [colleccio, dadesDesades] = addDoc.mock.calls[0];
    expect(colleccio).toBe('socis');
    expect(dadesDesades).toEqual({
      ...CAMPS_BUITS,
      nom: 'Anna',
      cognoms: 'Vidal',
      dataAlta: dadesDesades.dataAlta,
      ultimPagament: dadesDesades.dataAlta,
      actiu: true,
      tokenCarnet: 'token-alta',
    });
    expect(dadesDesades.dataAlta).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(writeBatch).not.toHaveBeenCalled();
  });

  it('desa tots els camps escrits i, si es marca, que és de l\'organització', async () => {
    const user = userEvent.setup();
    renderNou();
    const valors = ['Anna', 'Vidal', 'Roda', '43883', '600', 'a@b.cat', '1Z', 'Grup 1'];
    for (const [i, etiqueta] of ETIQUETES_CAMPS.entries()) {
      await user.type(screen.getByLabelText(etiqueta), valors[i]);
    }
    await user.click(screen.getByLabelText("Persona de l'organització del Cineclub"));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await screen.findByText('Fitxa del soci creat');
    const [, dadesDesades] = addDoc.mock.calls[0];
    expect(dadesDesades).toEqual({
      numeroSoci: '',
      nom: 'Anna',
      cognoms: 'Vidal',
      poblacio: 'Roda',
      codiPostal: '43883',
      telefon: '600',
      correuElectronic: 'a@b.cat',
      dni: '1Z',
      grupWhatsapp: 'Grup 1',
      organitzacio: true,
      dataAlta: dadesDesades.dataAlta,
      ultimPagament: dadesDesades.dataAlta,
      actiu: true,
      tokenCarnet: 'token-alta',
    });
  });

  it('mostra l\'error a la barra i es queda a l\'alta amb els valors si la creació falla', async () => {
    addDoc.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    renderNou();
    await user.type(screen.getByLabelText('Nom'), 'Anna');
    await user.type(screen.getByLabelText('Cognoms'), 'Vidal');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await within(barra()).findByRole('alert')).toHaveTextContent("No s'ha pogut desar. Torna-ho a provar.");
    expect(screen.queryByText('Fitxa del soci creat')).not.toBeInTheDocument();
    expect(screen.getByTestId('ubicacio')).toHaveTextContent('/socis/nou');
    expect(screen.getByLabelText('Nom')).toHaveValue('Anna');
  });

  it('en crear, un doble clic a «Desar» escriu un sol document', async () => {
    let resol;
    addDoc.mockImplementationOnce(() => new Promise((r) => { resol = r; }));
    const user = userEvent.setup();
    renderNou();
    await user.type(screen.getByLabelText('Nom'), 'Anna');
    await user.dblClick(screen.getByRole('button', { name: 'Desar' }));
    expect(within(barra()).getByText('Desant…')).toBeInTheDocument();
    resol({ id: 's9' });
    expect(await screen.findByText('Fitxa del soci creat')).toBeInTheDocument();
    expect(addDoc).toHaveBeenCalledTimes(1);
  });

  it('sense cap canvi, «Desar» està deshabilitat i no es crea res', () => {
    renderNou();
    expect(within(barra()).getByText('Sense canvis')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desar' })).toBeDisabled();
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('«Descartar canvis» buida el que s\'ha escrit', async () => {
    const user = userEvent.setup();
    renderNou();
    await user.type(screen.getByLabelText('Nom'), 'Anna');
    await user.click(screen.getByLabelText("Persona de l'organització del Cineclub"));
    await user.click(screen.getByRole('button', { name: 'Descartar canvis' }));
    expect(screen.getByLabelText('Nom')).toHaveValue('');
    expect(screen.getByLabelText("Persona de l'organització del Cineclub")).not.toBeChecked();
    expect(within(barra()).getByText('Sense canvis')).toBeInTheDocument();
  });
});

describe('SociForm — layout', () => {
  it("l'alta usa el layout de fitxa amb un únic h1, l'enllaç «← Socis» i la barra de desar", () => {
    const { container } = renderAmbConfirmacio(
      <MemoryRouter initialEntries={['/socis/nou']}>
        <Routes><Route path="/socis/nou" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(container.querySelector('.pagina-admin')).toHaveClass('pagina-admin', 'pagina-admin--fitxa');
    const titols = screen.getAllByRole('heading', { level: 1 });
    expect(titols).toHaveLength(1);
    expect(titols[0]).toHaveTextContent("Donar d'alta un/a soci/a");
    expect(screen.getByRole('link', { name: '← Socis' })).toHaveAttribute('href', '/socis');
    expect(barra()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desar' }).closest('form')).toHaveAttribute('novalidate');
  });

  it('la fitxa usa el layout de fitxa amb un únic h1, l\'enllaç «← Socis» i sense botó «Editar»', async () => {
    carrega({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7' });
    const { container } = renderExistent();
    await screen.findByLabelText('Nom');
    expect(container.querySelector('.pagina-admin')).toHaveClass('pagina-admin', 'pagina-admin--fitxa');
    const titols = screen.getAllByRole('heading', { level: 1 });
    expect(titols).toHaveLength(1);
    expect(titols[0]).toHaveTextContent('Fitxa del soci/a');
    expect(screen.getByRole('link', { name: '← Socis' })).toHaveAttribute('href', '/socis');
    expect(screen.queryByRole('button', { name: /^Editar/ })).not.toBeInTheDocument();
  });

  it('reserva l\'espai de la barra al final de tota la fitxa (també sota les seccions de pagaments i sessions)', async () => {
    carrega({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7' });
    const { container } = renderExistent();
    await screen.findByText('Pagaments de la quota');
    expect(container.firstChild).toHaveClass('espai-barra-desar');
    expect(container.firstChild).toContainElement(screen.getByText('Pagaments de la quota'));
  });

  it('si la càrrega falla, mostra un avís (no el carregador) i l\'enllaç a la llista', async () => {
    getDoc.mockRejectedValueOnce(new Error('xarxa'));
    renderExistent();
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'ha pogut carregar el soci. Torna-ho a provar.");
    expect(screen.getByRole('link', { name: '← Socis' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Nom')).not.toBeInTheDocument();
  });

  it('un soci inexistent torna al llistat', async () => {
    carrega(undefined);
    renderExistent();
    expect(await screen.findByText('Llistat de socis')).toBeInTheDocument();
  });
});

describe('SociForm — edició directa', () => {
  beforeEach(() => reiniciaEscriptures());
  afterEach(() => vi.restoreAllMocks());

  it('en obrir un soci existent, els camps són editables directament, «Sense canvis» i «Desar» deshabilitat', async () => {
    carrega({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7' });
    renderExistent();
    await screen.findByLabelText('Nom');
    ETIQUETES_CAMPS.forEach((etiqueta) => {
      const camp = screen.getByLabelText(etiqueta);
      expect(camp).not.toHaveAttribute('readonly');
    });
    expect(screen.getByLabelText("Persona de l'organització del Cineclub")).toBeEnabled();
    expect(within(barra()).getByText('Sense canvis')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desar' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Descartar canvis' })).not.toBeInTheDocument();
  });

  it('desa el document complet (inclosos els camps que el formulari no mostra) i es queda a la fitxa', async () => {
    carrega(SOCI_COMPLET);
    const user = userEvent.setup();
    renderExistent();
    await user.type(await screen.findByLabelText('Telèfon'), '1');
    expect(within(barra()).getByText('Hi ha canvis sense desar')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await esperaDesat();
    expect(__batchCommit).toHaveBeenCalledTimes(1);
    expect(__batchUpdate).toHaveBeenCalledTimes(1);
    expect(__batchUpdate).toHaveBeenCalledWith('1', { ...SOCI_COMPLET, telefon: '6000000001' });
    expect(__batchSet).toHaveBeenCalledTimes(1);
    expect(__batchSet).toHaveBeenCalledWith('tok-1', { numeroSoci: 7, nomPublic: 'Anna V.' });
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('afegeix al document els camps del formulari que no hi eren (buits), com abans', async () => {
    carrega({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', actiu: true });
    const user = userEvent.setup();
    renderExistent();
    await user.type(await screen.findByLabelText('DNI'), '1Z');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await esperaDesat();
    expect(__batchUpdate).toHaveBeenCalledWith('1', {
      ...CAMPS_BUITS, nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', actiu: true, dni: '1Z',
    });
  });

  it('després de desar continua editable i un segon desat escriu tots dos canvis', async () => {
    carrega(SOCI_COMPLET);
    const user = userEvent.setup();
    renderExistent();
    await user.type(await screen.findByLabelText('Telèfon'), '1');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await esperaDesat();
    await user.type(screen.getByLabelText('Grup WhatsApp'), 'Grup A');
    expect(within(barra()).getByText('Hi ha canvis sense desar')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(2));
    expect(__batchUpdate.mock.calls[1]).toEqual(['1', { ...SOCI_COMPLET, telefon: '6000000001', grupWhatsapp: 'Grup A' }]);
  });

  it('un doble clic a «Desar» fa una sola escriptura', async () => {
    carrega(SOCI_COMPLET);
    let resol;
    __batchCommit.mockImplementationOnce(() => new Promise((r) => { resol = r; }));
    const user = userEvent.setup();
    renderExistent();
    await user.type(await screen.findByLabelText('Telèfon'), '1');
    await user.dblClick(screen.getByRole('button', { name: 'Desar' }));
    expect(within(barra()).getByText('Desant…')).toBeInTheDocument();
    resol();
    await esperaDesat();
    expect(writeBatch).toHaveBeenCalledTimes(1);
    expect(__batchCommit).toHaveBeenCalledTimes(1);
  });

  it('«Descartar canvis» torna als valors desats sense escriure', async () => {
    carrega(SOCI_COMPLET);
    const user = userEvent.setup();
    renderExistent();
    const nom = await screen.findByLabelText('Nom');
    await user.clear(nom);
    await user.type(nom, 'Joana');
    await user.click(screen.getByLabelText("Persona de l'organització del Cineclub"));
    await user.click(screen.getByRole('button', { name: 'Descartar canvis' }));
    expect(nom).toHaveValue('Anna');
    expect(screen.getByLabelText("Persona de l'organització del Cineclub")).not.toBeChecked();
    expect(within(barra()).getByText('Sense canvis')).toBeInTheDocument();
    expect(__batchCommit).not.toHaveBeenCalled();
  });

  it('si l\'escriptura falla, la barra ho diu i els canvis es conserven', async () => {
    carrega(SOCI_COMPLET);
    __batchCommit.mockRejectedValueOnce(new Error('xarxa'));
    const user = userEvent.setup();
    renderExistent();
    await user.type(await screen.findByLabelText('Telèfon'), '1');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await within(barra()).findByRole('alert')).toHaveTextContent("No s'ha pogut desar. Torna-ho a provar.");
    expect(screen.getByLabelText('Telèfon')).toHaveValue('6000000001');
    expect(screen.getByRole('button', { name: 'Desar' })).toBeEnabled();
  });

  it('amb canvis sense desar, sortir per l\'enllaç demana confirmació', async () => {
    carrega(SOCI_COMPLET);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderExistent();
    await user.type(await screen.findByLabelText('Telèfon'), '1');
    await user.click(screen.getByRole('link', { name: '← Socis' }));
    expect(confirm).toHaveBeenCalledWith('Hi ha canvis sense desar. Vols sortir igualment?');
    expect(screen.queryByText('Llistat de socis')).not.toBeInTheDocument();
  });

  it('sense canvis, sortir per l\'enllaç no demana confirmació', async () => {
    carrega(SOCI_COMPLET);
    const confirm = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();
    renderExistent();
    await user.click(await screen.findByRole('link', { name: '← Socis' }));
    expect(await screen.findByText('Llistat de socis')).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('mostra la data de sol·licitud i la de l\'últim pagament, sense poder-les editar directament', async () => {
    carrega({
      nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', dataAlta: '2026-02-15', ultimPagament: '2026-08-29',
    });
    renderExistent();
    expect(await screen.findByText('Data de sol·licitud: 15/02/2026')).toBeInTheDocument();
    expect(screen.getByText('Últim pagament: 29/08/2026')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('2026-02-15')).not.toBeInTheDocument();
  });

  it('mostra la data d\'activació del carnet (inicPeriode) quan ja s\'ha fixat', async () => {
    carrega({
      nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', ultimPagament: '2026-07-23', inicPeriode: '2026-08-06',
    });
    renderExistent();
    expect(await screen.findByText('Activació del carnet: 06/08/2026')).toBeInTheDocument();
  });

  it('indica que encara no s\'ha activat el carnet quan no hi ha inicPeriode', async () => {
    carrega({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', ultimPagament: '2026-07-23' });
    renderExistent();
    expect(await screen.findByText('Activació del carnet: Encara no ha escanejat des del pagament')).toBeInTheDocument();
  });

  it('en crear un soci nou, els camps ja són editables sense cal clicar res', () => {
    renderNou();
    expect(screen.getByLabelText('Nom')).not.toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Desar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar dades' })).not.toBeInTheDocument();
  });
});


describe('SociForm — accions', () => {
  it('mostra a la columna d\'accions un enllaç per registrar un pagament', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7' }) });
    renderAmbConfirmacio(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    const enllacos = await screen.findAllByRole('link', { name: 'Registrar pagament' });
    expect(enllacos.every((e) => e.getAttribute('href') === '/socis/1/pagament')).toBe(true);
  });
});

describe('SociForm — trucar i escriure un correu', () => {
  beforeEach(() => reiniciaEscriptures());
  afterEach(() => vi.restoreAllMocks());

  const SOCI_CONTACTE = { nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', actiu: true };
  const trucar = () => screen.queryByRole('link', { name: /^Trucar al / });
  const escriure = () => screen.queryByRole('link', { name: /^Escriure un correu a / });

  it('amb telèfon i correu, mostra tots dos enllaços a la capçalera, amb el text visible', async () => {
    carrega({ ...SOCI_CONTACTE, telefon: '+34 600 11 22 33', correuElectronic: 'anna@exemple.cat' });
    renderExistent();
    await screen.findByLabelText('Nom');
    const capcalera = document.querySelector('.pagina-admin__capcalera');
    const enllacTrucar = within(capcalera).getByRole('link', { name: 'Trucar al +34 600 11 22 33' });
    const enllacCorreu = within(capcalera).getByRole('link', { name: 'Escriure un correu a anna@exemple.cat' });
    expect(enllacTrucar).toHaveAttribute('href', 'tel:+34600112233');
    expect(enllacTrucar).toHaveTextContent('Trucar');
    expect(enllacTrucar).not.toHaveAttribute('target');
    expect(enllacCorreu).toHaveAttribute('href', 'mailto:anna@exemple.cat');
    expect(enllacCorreu).toHaveTextContent('Escriure un correu');
    expect(enllacCorreu).toHaveAttribute('target', '_blank');
    expect(enllacCorreu).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('només amb telèfon, mostra només «Trucar»', async () => {
    carrega({ ...SOCI_CONTACTE, telefon: '(977) 12 34 56' });
    renderExistent();
    await screen.findByLabelText('Nom');
    expect(trucar()).toHaveAttribute('href', 'tel:977123456');
    expect(escriure()).not.toBeInTheDocument();
  });

  it('només amb correu, mostra només «Escriure un correu»', async () => {
    carrega({ ...SOCI_CONTACTE, correuElectronic: ' anna@exemple.cat ' });
    renderExistent();
    await screen.findByLabelText('Nom');
    expect(trucar()).not.toBeInTheDocument();
    expect(escriure()).toHaveAttribute('href', 'mailto:anna@exemple.cat');
    expect(escriure()).toHaveAccessibleName('Escriure un correu a anna@exemple.cat');
  });

  it('sense telèfon ni correu (o només amb espais o sense xifres), no en mostra cap', async () => {
    carrega({ ...SOCI_CONTACTE, telefon: '   ', correuElectronic: '  ' });
    const { unmount } = renderExistent();
    await screen.findByLabelText('Nom');
    expect(trucar()).not.toBeInTheDocument();
    expect(escriure()).not.toBeInTheDocument();
    unmount();

    carrega({ ...SOCI_CONTACTE, telefon: 'no en té', correuElectronic: null });
    renderExistent();
    await screen.findByLabelText('Nom');
    expect(trucar()).not.toBeInTheDocument();
    expect(escriure()).not.toBeInTheDocument();
  });

  it('amb un correu sense @ no mostra «Escriure un correu»; amb diverses adreces, enllaça la primera', async () => {
    carrega({ ...SOCI_CONTACTE, correuElectronic: 'no en té' });
    const { unmount } = renderExistent();
    await screen.findByLabelText('Nom');
    expect(escriure()).not.toBeInTheDocument();
    unmount();

    carrega({ ...SOCI_CONTACTE, correuElectronic: 'Anna <a@b.cat>; c@d.cat' });
    renderExistent();
    await screen.findByLabelText('Nom');
    expect(escriure()).toHaveAttribute('href', 'mailto:a@b.cat');
    expect(escriure()).toHaveAccessibleName('Escriure un correu a a@b.cat');
  });

  it('sense els camps al document, no en mostra cap', async () => {
    carrega(SOCI_CONTACTE);
    renderExistent();
    await screen.findByLabelText('Nom');
    expect(trucar()).not.toBeInTheDocument();
    expect(escriure()).not.toBeInTheDocument();
  });

  it('els enllaços fan servir les dades desades: editar sense desar no els canvia, desar sí', async () => {
    carrega({ ...SOCI_CONTACTE, telefon: '600112233', correuElectronic: 'anna@exemple.cat' });
    const user = userEvent.setup();
    renderExistent();
    const telefon = await screen.findByLabelText('Telèfon');
    const correu = screen.getByLabelText('Correu electrònic');
    await user.clear(telefon);
    await user.type(telefon, '977 00 11 22');
    await user.clear(correu);
    expect(trucar()).toHaveAttribute('href', 'tel:600112233');
    expect(escriure()).toHaveAttribute('href', 'mailto:anna@exemple.cat');

    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await esperaDesat();
    expect(trucar()).toHaveAttribute('href', 'tel:977001122');
    expect(trucar()).toHaveAccessibleName('Trucar al 977 00 11 22');
    expect(escriure()).not.toBeInTheDocument();
  });

  it('«Descartar canvis» no toca els enllaços', async () => {
    carrega({ ...SOCI_CONTACTE, telefon: '600112233' });
    const user = userEvent.setup();
    renderExistent();
    const telefon = await screen.findByLabelText('Telèfon');
    await user.clear(telefon);
    await user.click(screen.getByRole('button', { name: 'Descartar canvis' }));
    expect(trucar()).toHaveAttribute('href', 'tel:600112233');
  });

  it('en donar d\'alta un soci nou no surten, ni després d\'escriure telèfon i correu', async () => {
    const user = userEvent.setup();
    renderNou();
    await user.type(screen.getByLabelText('Telèfon'), '600112233');
    await user.type(screen.getByLabelText('Correu electrònic'), 'anna@exemple.cat');
    expect(trucar()).not.toBeInTheDocument();
    expect(escriure()).not.toBeInTheDocument();
  });
});

describe('SociForm — pagaments de la quota', () => {
  beforeEach(() => {
    getDocs.mockReset();
  });

  afterEach(() => {
    getDocs.mockResolvedValue({ docs: [] });
  });

  it('mostra el llistat de pagaments de la quota registrats per aquest soci', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7' }) });
    getDocs
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({
        docs: [{ id: 'moviment-1', data: () => ({ data: '2026-03-05', total: 30, metodePagament: 'efectiu' }) }],
      });
    renderAmbConfirmacio(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Pagaments de la quota')).toBeInTheDocument();
    const enllac = await screen.findByText(/30\.00€/);
    expect(enllac).toBeInTheDocument();
    expect(screen.getByText(/Efectiu/)).toBeInTheDocument();
    expect(enllac.closest('a')).toHaveAttribute('href', '/comptabilitat/moviment-1');
  });
});

describe('SociForm — previsualització del carnet', () => {
  it('no mostra el carnet si el soci encara no té número de soci', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '' }) });
    renderAmbConfirmacio(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    await screen.findByLabelText('Nom');
    expect(screen.queryByText('Carnet')).not.toBeInTheDocument();
  });

  it('mostra el carnet clicable si el soci ja té número de soci, i porta a la pàgina del carnet', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', tokenCarnet: 'tok-1' }) });
    renderAmbConfirmacio(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Anna Vidal')).toBeInTheDocument();
    const enllac = screen.getByText('Anna Vidal').closest('a');
    expect(enllac).toHaveAttribute('href', '/socis/1/carnet');
  });
});

describe('SociForm — assistència a sessions', () => {
  beforeEach(() => {
    getDocs.mockReset();
  });

  afterEach(() => {
    getDocs.mockResolvedValue({ docs: [] });
  });

  it('separa les sessions assistides (amb cartell) de les no assistides (en llista), dins del període actual', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', ultimPagament: '2026-01-01' }),
    });
    getDocs
      .mockResolvedValueOnce({
        docs: [
          { id: 's1', data: () => ({ titol: 'The Artist', data: '2026-03-05' }) },
          { id: 's2', data: () => ({ titol: 'Pig', data: '2026-06-25', imatgeUrl: 'https://exemple.cat/pig.jpg' }) },
        ],
      })
      .mockResolvedValueOnce({ docs: [{ data: () => ({ sessionId: 's2' }) }] })
      .mockResolvedValueOnce({ docs: [] });
    renderAmbConfirmacio(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Pel·lícules a les que ha assistit (període actual)')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Pig' })).toHaveAttribute('src', 'https://exemple.cat/pig.jpg');
    expect(screen.getByText('Sessions a les que no ha assistit (període actual)')).toBeInTheDocument();
    expect(screen.getByText('The Artist')).toBeInTheDocument();
  });

  it('mostra un marcador de posició quan la sessió assistida no té imatge', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', ultimPagament: '2026-01-01' }),
    });
    getDocs
      .mockResolvedValueOnce({ docs: [{ id: 's1', data: () => ({ titol: 'Pig', data: '2026-06-25' }) }] })
      .mockResolvedValueOnce({ docs: [{ data: () => ({ sessionId: 's1' }) }] })
      .mockResolvedValueOnce({ docs: [] });
    renderAmbConfirmacio(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Pel·lícules a les que ha assistit (període actual)')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Pig' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Pig')).toHaveLength(2);
  });

  it('el cartell de la sessió assistida surt de publica.cartell abans que d\'imatgeUrl', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', ultimPagament: '2026-01-01' }),
    });
    getDocs
      .mockResolvedValueOnce({
        docs: [
          { id: 's1', data: () => ({ titol: 'Pig', data: '2026-06-25', imatgeUrl: 'https://cineclubrodadebera.cat/programacio/2026/pig/poster_hu123.jpg', publica: { cartell: 'https://firebasestorage.googleapis.com/v0/b/b/o/web%2Fsessions%2Fpig%2Fposter.jpg?alt=media' } }) },
          { id: 's2', data: () => ({ titol: 'Jane Eyre', data: '2026-08-06', imatgeUrl: '', publica: { cartell: 'https://firebasestorage.googleapis.com/v0/b/b/o/web%2Fsessions%2Fpig%2Fposter.jpg?alt=media&2' } }) },
        ],
      })
      .mockResolvedValueOnce({ docs: [{ data: () => ({ sessionId: 's1' }) }, { data: () => ({ sessionId: 's2' }) }] })
      .mockResolvedValueOnce({ docs: [] });
    renderAmbConfirmacio(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByRole('img', { name: 'Pig' })).toHaveAttribute('src', 'https://firebasestorage.googleapis.com/v0/b/b/o/web%2Fsessions%2Fpig%2Fposter.jpg?alt=media');
    expect(screen.getByRole('img', { name: 'Jane Eyre' })).toHaveAttribute('src', 'https://firebasestorage.googleapis.com/v0/b/b/o/web%2Fsessions%2Fpig%2Fposter.jpg?alt=media&2');
  });

  it('no mostra les seccions d\'assistència si el soci no té número de soci', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '' }) });
    renderAmbConfirmacio(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    await screen.findByLabelText('Nom');
    expect(screen.queryByText('Sessions assistides (període actual)')).not.toBeInTheDocument();
    expect(screen.queryByText('Pel·lícules a les que ha assistit (període actual)')).not.toBeInTheDocument();
    expect(screen.queryByText('Sessions a les que no ha assistit (període actual)')).not.toBeInTheDocument();
  });

  it('ignora les sessions senseControl: no apareixen entre les no assistides', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', ultimPagament: '2026-01-01' }),
    });
    getDocs
      .mockResolvedValueOnce({
        docs: [
          { id: 's1', data: () => ({ titol: 'The Artist', data: '2026-03-05' }) },
          { id: 'e1', data: () => ({ titol: 'Carretera a Gusen', data: '2026-04-05', senseControl: true }) },
        ],
      })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] });
    renderAmbConfirmacio(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('The Artist')).toBeInTheDocument();
    expect(screen.queryByText('Carretera a Gusen')).not.toBeInTheDocument();
  });

  it('no mostra les sessions futures', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', ultimPagament: '2026-01-01' }),
    });
    getDocs
      .mockResolvedValueOnce({
        docs: [
          { id: 's1', data: () => ({ titol: 'The Artist', data: '2026-03-05' }) },
          { id: 's2', data: () => ({ titol: 'Pel·lícula del futur', data: '2099-01-01' }) },
        ],
      })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] });
    renderAmbConfirmacio(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Sessions a les que no ha assistit (període actual)')).toBeInTheDocument();
    expect(screen.getByText('The Artist')).toBeInTheDocument();
    expect(screen.queryByText('Pel·lícula del futur')).not.toBeInTheDocument();
  });

  it('calcula el cost per sessió del període actual (des de l\'últim pagament)', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', ultimPagament: '2026-03-05' }),
    });
    getDocs
      .mockResolvedValueOnce({
        docs: [
          { id: 's0', data: () => ({ titol: 'Pel·lícula antiga', data: '2026-01-10' }) },
          { id: 's1', data: () => ({ titol: 'The Artist', data: '2026-03-05' }) },
        ],
      })
      .mockResolvedValueOnce({ docs: [{ data: () => ({ sessionId: 's0' }) }, { data: () => ({ sessionId: 's1' }) }] })
      .mockResolvedValueOnce({ docs: [{ id: 'm1', data: () => ({ data: '2026-03-05', total: 30, metodePagament: 'efectiu' }) }] });
    renderAmbConfirmacio(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Cost per sessió (període actual)')).toBeInTheDocument();
    expect(screen.getByText('30.00€')).toBeInTheDocument();
  });

  it('exclou del període actual les sessions posteriors al venciment de la quota', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', ultimPagament: '2026-01-01' }),
    });
    getDocs
      .mockResolvedValueOnce({
        docs: [
          { id: 's1', data: () => ({ titol: 'Dins del període', data: '2026-06-01' }) },
          { id: 's2', data: () => ({ titol: 'Ja renovat un cop', data: '2027-06-01' }) },
        ],
      })
      .mockResolvedValueOnce({
        docs: [{ data: () => ({ sessionId: 's1' }) }, { data: () => ({ sessionId: 's2' }) }],
      })
      .mockResolvedValueOnce({ docs: [] });
    renderAmbConfirmacio(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Pel·lícules a les que ha assistit (període actual)')).toBeInTheDocument();
    expect(screen.getAllByText('Dins del període').length).toBeGreaterThan(0);
    expect(screen.queryByText('Ja renovat un cop')).not.toBeInTheDocument();
  });

  it('usa inicPeriode (no ultimPagament) com a inici del període actual', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({
        nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', ultimPagament: '2026-01-01', inicPeriode: '2026-05-01',
      }),
    });
    getDocs
      .mockResolvedValueOnce({
        docs: [
          { id: 's1', data: () => ({ titol: 'Abans de l\'activació', data: '2026-02-01' }) },
          { id: 's2', data: () => ({ titol: 'Després de l\'activació', data: '2026-06-01' }) },
        ],
      })
      .mockResolvedValueOnce({
        docs: [{ data: () => ({ sessionId: 's1' }) }, { data: () => ({ sessionId: 's2' }) }],
      })
      .mockResolvedValueOnce({ docs: [] });
    renderAmbConfirmacio(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Pel·lícules a les que ha assistit (període actual)')).toBeInTheDocument();
    expect(screen.getAllByText('Després de l\'activació').length).toBeGreaterThan(0);
    expect(screen.queryByText('Abans de l\'activació')).not.toBeInTheDocument();
  });

  it('si ha assistit a sessions però no hi ha cap pagament registrat, ho diu explícitament (no que no ha assistit)', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', ultimPagament: '2026-03-05' }),
    });
    getDocs
      .mockResolvedValueOnce({ docs: [{ id: 's1', data: () => ({ titol: 'The Artist', data: '2026-03-05' }) }] })
      .mockResolvedValueOnce({ docs: [{ data: () => ({ sessionId: 's1' }) }] })
      .mockResolvedValueOnce({ docs: [] });
    renderAmbConfirmacio(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Cost per sessió (període actual)')).toBeInTheDocument();
    expect(screen.getByText('No hi ha cap pagament de quota registrat.')).toBeInTheDocument();
    expect(screen.queryByText(/Encara no ha assistit/)).not.toBeInTheDocument();
  });
});

describe('SociForm — desactivació', () => {
  beforeEach(() => {
    writeBatch.mockClear();
    __batchSet.mockClear();
    __batchUpdate.mockClear();
    __batchDelete.mockClear();
    __batchCommit.mockClear();
    __batchCommit.mockResolvedValue(undefined);
  });

  it('per defecte mostra l\'estat Actiu i el formulari de desactivació amagat', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7' }) });
    renderAmbConfirmacio(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Actiu')).toBeInTheDocument();
    expect(screen.queryByLabelText('Motiu de la desactivació')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desactivar soci' })).toBeInTheDocument();
  });

  it('en clicar "Desactivar soci" mostra el formulari, i exigeix un motiu abans de desar', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7' }) });
    const user = userEvent.setup();
    renderAmbConfirmacio(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Desactivar soci' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar desactivació' }));
    expect(await screen.findByText('Cal indicar el motiu de la desactivació.')).toBeInTheDocument();
    expect(__batchCommit).not.toHaveBeenCalled();
  });

  it('desactiva el soci amb el motiu indicat, després de confirmar, i esborra el seu socisPublic', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', tokenCarnet: 'tok-1' }),
    });
    const user = userEvent.setup();
    renderAmbConfirmacio(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Desactivar soci' }));
    await user.type(screen.getByLabelText('Motiu de la desactivació'), 'Mal comportament');
    await user.click(screen.getByRole('button', { name: 'Confirmar desactivació' }));
    const dialeg = await dialegConfirmacio();
    expect(dialeg).toHaveAttribute('role', 'alertdialog');
    expect(dialeg).toHaveTextContent("Segur que vols desactivar aquest soci? El seu carnet deixarà de funcionar a l'escaneig.");
    expect(__batchCommit).not.toHaveBeenCalled();
    await acceptaDialeg('Desactiva');
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(1));
    const [, actualitzacio] = __batchUpdate.mock.calls[0];
    expect(actualitzacio.actiu).toBe(false);
    expect(actualitzacio.motiuDesactivacio).toBe('Mal comportament');
    expect(__batchDelete).toHaveBeenCalledWith('tok-1');
    expect(await screen.findByText('Desactivat')).toBeInTheDocument();
  });

  it('esborra socisPublic pel token en desactivar, encara que el soci no tingui numeroSoci (esborrar per token és inofensiu)', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '', tokenCarnet: 'tok-1' }) });
    const user = userEvent.setup();
    renderAmbConfirmacio(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Desactivar soci' }));
    await user.type(screen.getByLabelText('Motiu de la desactivació'), 'Mal comportament');
    await user.click(screen.getByRole('button', { name: 'Confirmar desactivació' }));
    await acceptaDialeg('Desactiva');
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(1));
    expect(__batchDelete).toHaveBeenCalledWith('tok-1');
  });

  it('no toca socisPublic en desactivar un soci sense tokenCarnet', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7' }) });
    const user = userEvent.setup();
    renderAmbConfirmacio(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Desactivar soci' }));
    await user.type(screen.getByLabelText('Motiu de la desactivació'), 'Mal comportament');
    await user.click(screen.getByRole('button', { name: 'Confirmar desactivació' }));
    await acceptaDialeg('Desactiva');
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(1));
    expect(__batchDelete).not.toHaveBeenCalled();
  });

  it('mostra el motiu i permet reactivar un soci desactivat, tornant a escriure socisPublic', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({
        nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', tokenCarnet: 'tok-1', actiu: false,
        motiuDesactivacio: 'Mal comportament', dataDesactivacio: '2026-06-01',
      }),
    });
    const user = userEvent.setup();
    renderAmbConfirmacio(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Desactivat')).toBeInTheDocument();
    expect(screen.getByText(/Mal comportament/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reactivar soci' }));
    expect(await dialegConfirmacio()).toHaveTextContent('Segur que vols reactivar aquest soci?');
    expect(__batchCommit).not.toHaveBeenCalled();
    await acceptaDialeg('Reactiva');
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(1));
    const [, actualitzacio] = __batchUpdate.mock.calls[0];
    expect(actualitzacio.actiu).toBe(true);
    expect(actualitzacio.motiuDesactivacio).toBe(null);
    expect(__batchSet).toHaveBeenCalledWith('tok-1', { numeroSoci: 7, nomPublic: 'Anna V.' });
  });
});

describe('SociForm — cancel·lar les confirmacions de desactivar i reactivar', () => {
  beforeEach(() => {
    writeBatch.mockClear();
    __batchCommit.mockClear();
    __batchCommit.mockResolvedValue(undefined);
  });

  it.each([
    ['Cancel·lar', (user) => cancellaDialeg(user)],
    ['ESC', (user) => tancaDialegAmbEsc(user)],
  ])('no desactiva el soci si es tanca la confirmació amb %s', async (_nom, tanca) => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', tokenCarnet: 'tok-1' }),
    });
    const user = userEvent.setup();
    renderAmbConfirmacio(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Desactivar soci' }));
    await user.type(screen.getByLabelText('Motiu de la desactivació'), 'Mal comportament');
    await user.click(screen.getByRole('button', { name: 'Confirmar desactivació' }));
    await tanca(user);
    await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
    expect(writeBatch).not.toHaveBeenCalled();
    expect(__batchCommit).not.toHaveBeenCalled();
    expect(screen.getByText('Actiu')).toBeInTheDocument();
    expect(screen.getByLabelText('Motiu de la desactivació')).toHaveValue('Mal comportament');
  });

  it('no reactiva el soci si es cancel·la la confirmació', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({
        nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', tokenCarnet: 'tok-1', actiu: false,
        motiuDesactivacio: 'Mal comportament', dataDesactivacio: '2026-06-01',
      }),
    });
    const user = userEvent.setup();
    renderAmbConfirmacio(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Reactivar soci' }));
    await cancellaDialeg(user);
    await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
    expect(__batchCommit).not.toHaveBeenCalled();
    expect(screen.getByText('Desactivat')).toBeInTheDocument();
  });
});


describe('SociForm — sincronització de socisPublic en desar', () => {
  beforeEach(() => reiniciaEscriptures());

  it('en editar un soci amb numeroSoci i tokenCarnet, sincronitza socisPublic dins del mateix lot', async () => {
    carrega({ nom: 'Isabel', cognoms: 'Mondéjar', numeroSoci: '7', tokenCarnet: 'tok-1' });
    const user = userEvent.setup();
    renderExistent();
    await user.type(await screen.findByLabelText('Telèfon'), '600');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(1));
    expect(writeBatch).toHaveBeenCalledTimes(1);
    expect(__batchUpdate).toHaveBeenCalledWith('1', {
      ...CAMPS_BUITS, nom: 'Isabel', cognoms: 'Mondéjar', numeroSoci: '7', tokenCarnet: 'tok-1', telefon: '600',
    });
    expect(__batchSet).toHaveBeenCalledWith('tok-1', { numeroSoci: 7, nomPublic: 'Isabel M.' });
  });

  it('un canvi de nom es reflecteix al nom públic que es desa', async () => {
    carrega({ nom: 'Isabel', cognoms: 'Mondéjar', numeroSoci: '7', tokenCarnet: 'tok-1' });
    const user = userEvent.setup();
    renderExistent();
    await user.clear(await screen.findByLabelText('Cognoms'));
    await user.type(screen.getByLabelText('Cognoms'), 'Puig');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(1));
    expect(__batchSet).toHaveBeenCalledWith('tok-1', { numeroSoci: 7, nomPublic: 'Isabel P.' });
  });

  it('en editar un soci sense numeroSoci encara, no toca socisPublic', async () => {
    carrega({ nom: 'Isabel', cognoms: 'Mondéjar', numeroSoci: '', tokenCarnet: 'tok-1' });
    const user = userEvent.setup();
    renderExistent();
    await user.type(await screen.findByLabelText('Telèfon'), '600');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(1));
    expect(__batchSet).not.toHaveBeenCalled();
  });

  it('en editar un soci desactivat, no torna a escriure socisPublic', async () => {
    carrega({ nom: 'Isabel', cognoms: 'Mondéjar', numeroSoci: '7', tokenCarnet: 'tok-1', actiu: false });
    const user = userEvent.setup();
    renderExistent();
    await user.type(await screen.findByLabelText('Telèfon'), '600');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(1));
    expect(__batchUpdate).toHaveBeenCalledWith('1', expect.objectContaining({ actiu: false, telefon: '600' }));
    expect(__batchSet).not.toHaveBeenCalled();
  });
});

describe('SociForm — persona de l\'organització', () => {
  beforeEach(() => {
    reiniciaEscriptures();
    getDocs.mockClear();
  });
  afterEach(() => getDocs.mockResolvedValue({ docs: [] }));

  const SOCI = { nom: 'Toni', cognoms: 'Pinel', numeroSoci: '9', tokenCarnet: 'tok-9' };
  const ORGANITZACIO = "Persona de l'organització del Cineclub";

  it('en marcar-lo com a persona de l\'organització, el seu nom públic passa a ser el de l\'organització', async () => {
    carrega(SOCI);
    const user = userEvent.setup();
    renderExistent();
    await user.click(await screen.findByLabelText(ORGANITZACIO));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(1));
    expect(__batchSet).toHaveBeenCalledWith('tok-9', { numeroSoci: 9, nomPublic: 'Organització Cineclub Roda de Berà' });
    expect(__batchUpdate.mock.calls[0]).toEqual(['1', { ...CAMPS_BUITS, ...SOCI, organitzacio: true }]);
  });

  it('el canvi es propaga al nom que mostren les propostes que ja havia fet', async () => {
    carrega(SOCI);
    const referencia = { id: 'p1' };
    getDocs.mockImplementation(async () => ({ docs: [{ ref: referencia, data: () => ({}) }] }));
    const user = userEvent.setup();
    renderExistent();
    await user.click(await screen.findByLabelText(ORGANITZACIO));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(1));
    expect(__batchUpdate).toHaveBeenCalledWith(referencia, { nomProposant: 'Organització Cineclub Roda de Berà' });
  });

  it('en deixar de ser-ho, les seves propostes tornen a mostrar el seu nom', async () => {
    carrega({ ...SOCI, organitzacio: true });
    const referencia = { id: 'p1' };
    getDocs.mockImplementation(async () => ({ docs: [{ ref: referencia, data: () => ({}) }] }));
    const user = userEvent.setup();
    renderExistent();
    await user.click(await screen.findByLabelText(ORGANITZACIO));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(1));
    expect(__batchUpdate).toHaveBeenCalledWith(referencia, { nomProposant: 'Toni P.' });
    expect(__batchUpdate).toHaveBeenCalledWith('1', { ...CAMPS_BUITS, ...SOCI, organitzacio: false });
  });

  it('si no es canvia, no es toquen les propostes', async () => {
    carrega({ ...SOCI, organitzacio: true });
    const user = userEvent.setup();
    renderExistent();
    await user.type(await screen.findByLabelText('Telèfon'), '600');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(1));
    expect(__batchUpdate).toHaveBeenCalledTimes(1);
    expect(__batchUpdate).toHaveBeenCalledWith('1', { ...CAMPS_BUITS, ...SOCI, organitzacio: true, telefon: '600' });
  });

  it('un soci sense el camp organitzacio no el rep en desar un altre canvi', async () => {
    carrega(SOCI);
    const user = userEvent.setup();
    renderExistent();
    await user.type(await screen.findByLabelText('Telèfon'), '600');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(1));
    expect(__batchUpdate.mock.calls[0][1]).not.toHaveProperty('organitzacio');
  });

  it('després de desar, la comparació es fa amb el valor desat: desmarcar-lo i tornar a desar torna a propagar', async () => {
    carrega(SOCI);
    const referencia = { id: 'p1' };
    getDocs.mockImplementation(async () => ({ docs: [{ ref: referencia, data: () => ({}) }] }));
    const user = userEvent.setup();
    renderExistent();
    await user.click(await screen.findByLabelText(ORGANITZACIO));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await esperaDesat();
    await user.click(screen.getByLabelText(ORGANITZACIO));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(2));
    expect(__batchUpdate).toHaveBeenCalledWith(referencia, { nomProposant: 'Organització Cineclub Roda de Berà' });
    expect(__batchUpdate).toHaveBeenLastCalledWith(referencia, { nomProposant: 'Toni P.' });
    expect(__batchUpdate).toHaveBeenCalledWith('1', { ...CAMPS_BUITS, ...SOCI, organitzacio: false });
  });
});

describe('SociForm — accions de la fitxa amb canvis pendents', () => {
  beforeEach(() => {
    reiniciaEscriptures();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('token-nou');
  });
  afterEach(() => vi.restoreAllMocks());

  it('desactivar amb canvis pendents no els desa ni els perd, i el desat posterior conserva la desactivació', async () => {
    carrega(SOCI_COMPLET);
    const user = userEvent.setup();
    renderExistent();
    await user.type(await screen.findByLabelText('Telèfon'), '1');
    await user.click(screen.getByRole('button', { name: 'Desactivar soci' }));
    await user.type(screen.getByLabelText('Motiu de la desactivació'), 'Baixa');
    await user.click(screen.getByRole('button', { name: 'Confirmar desactivació' }));
    await acceptaDialeg('Desactiva');
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(1));
    const [, desactivacio] = __batchUpdate.mock.calls[0];
    expect(desactivacio).toEqual({ actiu: false, motiuDesactivacio: 'Baixa', dataDesactivacio: expect.any(String) });
    expect(await screen.findByText('Desactivat')).toBeInTheDocument();
    expect(screen.getByLabelText('Telèfon')).toHaveValue('6000000001');
    expect(within(barra()).getByText('Hi ha canvis sense desar')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(2));
    expect(__batchUpdate.mock.calls[1]).toEqual(['1', {
      ...SOCI_COMPLET, telefon: '6000000001', actiu: false, motiuDesactivacio: 'Baixa', dataDesactivacio: desactivacio.dataDesactivacio,
    }]);
    expect(__batchSet).not.toHaveBeenCalled();
  });

  it('regenerar el carnet amb un nom pendent sincronitza socisPublic amb el nom desat, i el desat posterior porta el token nou', async () => {
    carrega(SOCI_COMPLET);
    const user = userEvent.setup();
    renderExistent();
    await user.clear(await screen.findByLabelText('Cognoms'));
    await user.type(screen.getByLabelText('Cognoms'), 'Puig');
    await user.click(screen.getByRole('button', { name: 'Regenerar carnet' }));
    await acceptaDialeg('Regenera');
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(1));
    expect(__batchUpdate.mock.calls[0]).toEqual(['1', { tokenCarnet: 'token-nou' }]);
    expect(__batchDelete).toHaveBeenCalledWith('tok-1');
    expect(__batchSet).toHaveBeenCalledWith('token-nou', { numeroSoci: 7, nomPublic: 'Anna V.' });
    expect(screen.getByLabelText('Cognoms')).toHaveValue('Puig');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(2));
    expect(__batchUpdate.mock.calls[1]).toEqual(['1', { ...SOCI_COMPLET, cognoms: 'Puig', tokenCarnet: 'token-nou' }]);
    expect(__batchSet).toHaveBeenLastCalledWith('token-nou', { numeroSoci: 7, nomPublic: 'Anna P.' });
  });

  it('reactivar amb canvis pendents sincronitza socisPublic amb les dades desades', async () => {
    carrega({
      ...SOCI_COMPLET, actiu: false, motiuDesactivacio: 'Baixa', dataDesactivacio: '2026-06-01',
    });
    const user = userEvent.setup();
    renderExistent();
    await user.clear(await screen.findByLabelText('Cognoms'));
    await user.type(screen.getByLabelText('Cognoms'), 'Puig');
    await user.click(screen.getByRole('button', { name: 'Reactivar soci' }));
    await acceptaDialeg('Reactiva');
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(1));
    expect(__batchUpdate.mock.calls[0]).toEqual(['1', { actiu: true, motiuDesactivacio: null, dataDesactivacio: null }]);
    expect(__batchSet).toHaveBeenCalledWith('tok-1', { numeroSoci: 7, nomPublic: 'Anna V.' });
    expect(screen.getByLabelText('Cognoms')).toHaveValue('Puig');
  });

  it('mentre es desa, les accions del soci queden deshabilitades', async () => {
    carrega(SOCI_COMPLET);
    let resol;
    __batchCommit.mockImplementationOnce(() => new Promise((r) => { resol = r; }));
    const user = userEvent.setup();
    renderExistent();
    await user.type(await screen.findByLabelText('Telèfon'), '1');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(screen.getByRole('button', { name: 'Regenerar carnet' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Desactivar soci' })).toBeDisabled();
    resol();
    await esperaDesat();
    expect(screen.getByRole('button', { name: 'Regenerar carnet' })).toBeEnabled();
  });

  it('mentre es regenera el carnet, «Desar» queda bloquejat', async () => {
    carrega(SOCI_COMPLET);
    let resol;
    __batchCommit.mockImplementationOnce(() => new Promise((r) => { resol = r; }));
    const user = userEvent.setup();
    renderExistent();
    await user.type(await screen.findByLabelText('Telèfon'), '1');
    await user.click(screen.getByRole('button', { name: 'Regenerar carnet' }));
    await acceptaDialeg('Regenera');
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Desar' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Desactivar soci' })).toBeDisabled();
    resol();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Desar' })).toBeEnabled());
  });
});


describe('SociForm — regenerar carnet', () => {
  beforeEach(() => {
    writeBatch.mockClear();
    __batchSet.mockClear();
    __batchUpdate.mockClear();
    __batchDelete.mockClear();
    __batchCommit.mockClear();
    __batchCommit.mockResolvedValue(undefined);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('token-nou');
  });

  it('regenera el token del carnet després de confirmar, i sincronitza socisPublic', async () => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', tokenCarnet: 'token-vell' }),
    });
    const user = userEvent.setup();
    renderAmbConfirmacio(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Regenerar carnet' }));
    const dialeg = await dialegConfirmacio();
    expect(dialeg).toHaveAttribute('role', 'alertdialog');
    expect(dialeg).toHaveTextContent('Segur que vols regenerar el carnet? El QR físic actual deixarà de funcionar i caldrà imprimir-ne un de nou.');
    expect(__batchCommit).not.toHaveBeenCalled();
    await acceptaDialeg('Regenera');
    await vi.waitFor(() => expect(__batchCommit).toHaveBeenCalledTimes(1));
    const [, actualitzacio] = __batchUpdate.mock.calls[0];
    expect(actualitzacio.tokenCarnet).toBe('token-nou');
    expect(__batchDelete).toHaveBeenCalledWith('token-vell');
    expect(__batchSet).toHaveBeenCalledWith('token-nou', { numeroSoci: 7, nomPublic: 'Anna V.' });
  });

  it.each([
    ['Cancel·lar', (user) => cancellaDialeg(user)],
    ['ESC', (user) => tancaDialegAmbEsc(user)],
  ])('no regenera el token si es tanca la confirmació amb %s', async (_nom, tanca) => {
    getDoc.mockResolvedValueOnce({
      data: () => ({ nom: 'Anna', cognoms: 'Vidal', numeroSoci: '7', tokenCarnet: 'token-vell' }),
    });
    const user = userEvent.setup();
    renderAmbConfirmacio(
      <MemoryRouter initialEntries={['/socis/1']}>
        <Routes><Route path="/socis/:id" element={<SociForm />} /></Routes>
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Regenerar carnet' }));
    await tanca(user);
    await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
    expect(writeBatch).not.toHaveBeenCalled();
    expect(__batchCommit).not.toHaveBeenCalled();
  });
});
