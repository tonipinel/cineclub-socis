import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fireEvent, screen, waitFor, within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter, Routes, Route, useLocation, useNavigationType,
} from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {}, storage: { app: { options: { storageBucket: 'bucket-prova' } } } }));
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn().mockResolvedValue({ id: 'd9' }),
  setDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  doc: vi.fn((_db, col, id) => ({ col, id })),
  collection: vi.fn((_db, nom) => ({ nom })),
  query: vi.fn((col, ...filtres) => ({ ...col, filtres })),
  where: vi.fn((camp, op, valor) => ({ camp, op, valor })),
}));
vi.mock('firebase/storage', () => ({
  ref: vi.fn((_storage, cami) => ({ cami })),
  uploadBytes: vi.fn().mockResolvedValue({}),
  deleteObject: vi.fn(),
}));

import {
  addDoc, deleteDoc, getDoc, getDocs, setDoc,
} from 'firebase/firestore';
import { deleteObject, ref, uploadBytes } from 'firebase/storage';
import DistribuidoraForm from './DistribuidoraForm';
import {
  acceptaDialeg, cancellaDialeg, dialegConfirmacio, hiHaDialegConfirmacio, renderAmbConfirmacio, tancaDialegAmbEsc,
} from '../../test/confirmacio';

// Ruta actual i tipus de l'última navegació (per comprovar el `replace` en crear).
function Ubicacio() {
  const { pathname } = useLocation();
  return <p data-testid="ubicacio">{`${pathname} ${useNavigationType()}`}</p>;
}

function renderNova() {
  return renderAmbConfirmacio(
    <MemoryRouter initialEntries={['/distribuidores/nova']}>
      <Routes>
        <Route path="/distribuidores/nova" element={<DistribuidoraForm />} />
        <Route path="/distribuidores/:id" element={<p>Fitxa de la distribuïdora creada</p>} />
        <Route path="/distribuidores" element={<p>Llistat de distribuïdores</p>} />
      </Routes>
      <Ubicacio />
    </MemoryRouter>
  );
}

function renderExistent() {
  return renderAmbConfirmacio(
    <MemoryRouter initialEntries={['/distribuidores/d1']}>
      <Routes>
        <Route path="/distribuidores/:id" element={<DistribuidoraForm />} />
        <Route path="/distribuidores" element={<p>Llistat de distribuïdores</p>} />
      </Routes>
    </MemoryRouter>
  );
}

const resposta = (llista) => ({ empty: llista.length === 0, docs: llista.map(({ id, ...d }) => ({ id, data: () => d })) });

// getDocs rep la consulta o la col·lecció (mocks de `query`/`collection`): cada col·lecció té la seva cua de respostes
// (l'última es repeteix).
let respostes;
const mockGetDocs = () => getDocs.mockImplementation(async ({ nom }) => {
  const cua = respostes[nom];
  return resposta(cua.length > 1 ? cua.shift() : cua[0]);
});

const fitxer = (nom, tipus, mida = 1) => new File(['x'.repeat(mida)], nom, { type: tipus });
const DISTRIBUIDORA_COMPLETA = {
  nom: 'Atalante',
  web: 'atalante.test',
  contacte: 'Pere',
  correu: 'pere@atalante.test',
  preu: 120,
  condicions: 'Només dimecres',
  logo: 'https://logos.test/atalante.png',
  urlPublica: 'https://atalante.test/portada',
};
const ETIQUETA_URL_PUBLICA = 'Pàgina web pública';
const AJUDA_URL_PUBLICA = 'Adreça on porta el logo al lloc públic. Pot ser la mateixa que «Web» o una altra, p. ex. la portada.';
const ERROR_URL_PUBLICA = "L'adreça ha de començar per http:// o https://.";
const CAMI_LOGO = 'web/distribuidores/atalante-1700000000000.png';
const URL_LOGO = `https://firebasestorage.googleapis.com/v0/b/bucket-prova/o/${encodeURIComponent(CAMI_LOGO)}?alt=media`;
const barra = () => document.querySelector('.barra-desar');
// La previsualització és decorativa (alt buit): es busca dins del grup «Logo».
const previsualitzacio = () => screen.getByRole('group', { name: 'Logo' }).querySelector('img');
const zonaPerill = () => screen.getByRole('region', { name: 'Zona de perill' });
const carrega = (dades) => getDoc.mockResolvedValue({ data: () => dades });

// Després de crear, es passa a la fitxa del nou id substituint «Nova distribuïdora» a l'historial.
async function esperaFitxaCreada() {
  expect(await screen.findByText('Fitxa de la distribuïdora creada')).toBeInTheDocument();
  expect(screen.getByTestId('ubicacio')).toHaveTextContent('/distribuidores/d9 REPLACE');
}
// Després de desar una distribuïdora existent, es queda a la fitxa amb «Desat ✓».
async function esperaDesat() {
  expect(await within(barra()).findByText('Desat ✓')).toBeInTheDocument();
  expect(screen.queryByText('Llistat de distribuïdores')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1, name: 'Distribuïdora' })).toBeInTheDocument();
}
// L'error d'un camp surt sota el camp (vinculat) i a la barra, com a botó que hi porta.
function esperaErrorCamp(etiqueta, camp, missatge) {
  const input = screen.getByLabelText(etiqueta);
  expect(input).toHaveAttribute('aria-invalid', 'true');
  const descrits = input.getAttribute('aria-describedby').split(' ').map((id) => document.getElementById(id));
  expect(descrits.some((el) => el?.textContent === missatge)).toBe(true);
  expect(within(barra()).getByRole('button', { name: `${camp}: ${missatge}` })).toBeInTheDocument();
}

describe('DistribuidoraForm', () => {
  beforeEach(() => {
    addDoc.mockClear();
    setDoc.mockClear();
    deleteDoc.mockClear();
    uploadBytes.mockClear();
    ref.mockClear();
    deleteObject.mockClear();
    getDoc.mockReset();
    getDocs.mockReset();
    respostes = { propostesInternes: [[]], sessions: [[]] };
    mockGetDocs();
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  describe('crear', () => {
    it('crea una distribuïdora amb nom, web, persona i correu de contacte i passa a la fitxa nova', async () => {
      const user = userEvent.setup();
      renderNova();
      await user.type(screen.getByLabelText('Nom'), '  Surtsey Films ');
      await user.type(screen.getByLabelText('Web'), 'surtseyfilms.com');
      await user.type(screen.getByLabelText('Persona de contacte'), 'Marta');
      await user.type(screen.getByLabelText('Correu electrònic de contacte'), 'marta@surtsey.test');
      await user.type(screen.getByLabelText('Preu per defecte (€)'), '150');
      await user.type(screen.getByLabelText('Condicions per defecte'), ' Projecció només en dimecres ');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      await esperaFitxaCreada();
      expect(addDoc).toHaveBeenCalledTimes(1);
      expect(addDoc.mock.calls[0][1]).toEqual({
        nom: 'Surtsey Films',
        web: 'surtseyfilms.com',
        contacte: 'Marta',
        correu: 'marta@surtsey.test',
        preu: 150,
        condicions: 'Projecció només en dimecres',
      });
      expect(setDoc).not.toHaveBeenCalled();
    });

    it('el preu i les condicions per defecte són opcionals', async () => {
      const user = userEvent.setup();
      renderNova();
      await user.type(screen.getByLabelText('Nom'), 'Atalante');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      await esperaFitxaCreada();
      expect(addDoc.mock.calls[0][1]).toMatchObject({ preu: null, condicions: '' });
    });

    it('no deixa desar sense nom (ni només amb espais)', async () => {
      const user = userEvent.setup();
      renderNova();
      expect(screen.getByLabelText('Nom')).toBeRequired();
      await user.type(screen.getByLabelText('Nom'), '   ');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      expect(await within(barra()).findByRole('alert')).toHaveTextContent("No s'ha pogut desar");
      esperaErrorCamp('Nom', 'Nom', 'El nom no pot estar en blanc.');
      expect(addDoc).not.toHaveBeenCalled();
      expect(screen.getByTestId('ubicacio')).toHaveTextContent('/distribuidores/nova');
    });

    it('si s\'esborra el nom i es canvia un altre camp, l\'error és el de la fitxa i no escriu res', async () => {
      const user = userEvent.setup();
      renderNova();
      await user.type(screen.getByLabelText('Nom'), 'A');
      await user.clear(screen.getByLabelText('Nom'));
      await user.type(screen.getByLabelText('Web'), 'atalante.test');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      expect(await within(barra()).findByRole('alert')).toBeInTheDocument();
      esperaErrorCamp('Nom', 'Nom', 'El nom no pot estar en blanc.');
      expect(addDoc).not.toHaveBeenCalled();
    });

    it('una distribuïdora sense logo ni pàgina pública es desa sense aquestes claus', async () => {
      const user = userEvent.setup();
      renderNova();
      await user.type(screen.getByLabelText('Nom'), 'Atalante');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      await esperaFitxaCreada();
      const desada = addDoc.mock.calls[0][1];
      expect(desada).not.toHaveProperty('logo');
      expect(desada).not.toHaveProperty('urlPublica');
    });

    it('en crear, un doble clic a «Desar» escriu un sol document', async () => {
      let resol;
      addDoc.mockImplementationOnce(() => new Promise((r) => { resol = r; }));
      const user = userEvent.setup();
      renderNova();
      await user.type(screen.getByLabelText('Nom'), 'Atalante');
      await user.dblClick(screen.getByRole('button', { name: 'Desar' }));
      expect(within(barra()).getByText('Desant…')).toBeInTheDocument();
      resol({ id: 'd9' });
      await esperaFitxaCreada();
      expect(addDoc).toHaveBeenCalledTimes(1);
    });

    it('si la creació falla, la barra ho diu i es queda a «Nova distribuïdora» amb els valors', async () => {
      addDoc.mockRejectedValueOnce(new Error('xarxa'));
      const user = userEvent.setup();
      renderNova();
      await user.type(screen.getByLabelText('Nom'), 'Atalante');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      expect(await within(barra()).findByRole('alert')).toHaveTextContent("No s'ha pogut desar. Torna-ho a provar.");
      expect(screen.getByLabelText('Nom')).toHaveValue('Atalante');
      expect(screen.getByTestId('ubicacio')).toHaveTextContent('/distribuidores/nova');
    });
  });

  describe('editar', () => {
    it('en editar, els camps són editables directament (sense «Editar») i desa l\'objecte complet sense sortir', async () => {
      carrega({ nom: 'Atalante', web: '', contacte: '', correu: '' });
      const user = userEvent.setup();
      renderExistent();
      expect(await screen.findByLabelText('Nom')).not.toHaveAttribute('readonly');
      expect(screen.queryByRole('button', { name: 'Editar dades' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Desar' })).toBeDisabled();
      await user.type(screen.getByLabelText('Web'), 'atalante.test');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      await esperaDesat();
      expect(setDoc).toHaveBeenCalledTimes(1);
      expect(setDoc).toHaveBeenCalledWith({ col: 'distribuidores', id: 'd1' }, {
        nom: 'Atalante', web: 'atalante.test', contacte: '', correu: '', preu: null, condicions: '',
      });
      expect(addDoc).not.toHaveBeenCalled();
    });

    it('mostra el logo i la pàgina web pública desats, i editar només un camp els conserva (objecte complet)', async () => {
      carrega(DISTRIBUIDORA_COMPLETA);
      const user = userEvent.setup();
      renderExistent();
      expect(await screen.findByLabelText(ETIQUETA_URL_PUBLICA)).toHaveValue('https://atalante.test/portada');
      expect(previsualitzacio()).toHaveAttribute('src', 'https://logos.test/atalante.png');
      expect(screen.getByLabelText('Preu per defecte (€)')).toHaveValue(120);
      await user.type(screen.getByLabelText('Persona de contacte'), ' Puig');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      await esperaDesat();
      expect(setDoc).toHaveBeenCalledTimes(1);
      expect(setDoc).toHaveBeenCalledWith({ col: 'distribuidores', id: 'd1' }, { ...DISTRIBUIDORA_COMPLETA, contacte: 'Pere Puig' });
    });

    it('editar només el nom conserva el logo i la pàgina web pública', async () => {
      carrega(DISTRIBUIDORA_COMPLETA);
      const user = userEvent.setup();
      renderExistent();
      await user.clear(await screen.findByLabelText('Nom'));
      await user.type(screen.getByLabelText('Nom'), 'Atalante Films');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      await esperaDesat();
      expect(setDoc).toHaveBeenCalledWith({ col: 'distribuidores', id: 'd1' }, { ...DISTRIBUIDORA_COMPLETA, nom: 'Atalante Films' });
    });

    it('obrir una distribuïdora i no tocar res: «Sense canvis», «Desar» deshabilitat i sense «Descartar canvis» ni «Editar»', async () => {
      carrega(DISTRIBUIDORA_COMPLETA);
      renderExistent();
      await screen.findByLabelText('Nom');
      expect(within(barra()).getByText('Sense canvis')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Desar' })).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'Descartar canvis' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Editar/ })).not.toBeInTheDocument();
      ['Nom', 'Web', ETIQUETA_URL_PUBLICA, 'Persona de contacte', 'Correu electrònic de contacte', 'Preu per defecte (€)', 'Condicions per defecte']
        .forEach((etiqueta) => expect(screen.getByLabelText(etiqueta)).not.toHaveAttribute('readonly'));
      expect(setDoc).not.toHaveBeenCalled();
    });

    it('editar passa a «Hi ha canvis sense desar» i «Descartar canvis» torna als valors desats sense escriure', async () => {
      carrega(DISTRIBUIDORA_COMPLETA);
      const user = userEvent.setup();
      renderExistent();
      const web = await screen.findByLabelText('Web');
      await user.type(web, 'x');
      await user.clear(screen.getByLabelText('Preu per defecte (€)'));
      await user.click(screen.getByRole('button', { name: 'Treure el logo' }));
      expect(within(barra()).getByText('Hi ha canvis sense desar')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Descartar canvis' }));
      // El botó desapareix: el focus passa a l'estat de la barra en comptes de perdre's.
      expect(within(barra()).getByText('Sense canvis')).toHaveFocus();
      expect(web).toHaveValue('atalante.test');
      expect(screen.getByLabelText('Preu per defecte (€)')).toHaveValue(120);
      expect(previsualitzacio()).toHaveAttribute('src', 'https://logos.test/atalante.png');
      expect(within(barra()).getByText('Sense canvis')).toBeInTheDocument();
      expect(setDoc).not.toHaveBeenCalled();
    });

    it('després de desar continua editable i un segon desat escriu l\'objecte complet amb tots dos canvis', async () => {
      carrega(DISTRIBUIDORA_COMPLETA);
      const user = userEvent.setup();
      renderExistent();
      await user.type(await screen.findByLabelText('Persona de contacte'), ' Puig');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      await esperaDesat();
      expect(screen.getByRole('link', { name: '← Distribuïdores' })).toHaveAttribute('href', '/distribuidores');
      const preu = screen.getByLabelText('Preu per defecte (€)');
      await user.clear(preu);
      await user.type(preu, '90.5');
      expect(within(barra()).getByText('Hi ha canvis sense desar')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      await waitFor(() => expect(setDoc).toHaveBeenCalledTimes(2));
      expect(setDoc.mock.calls[1]).toEqual([
        { col: 'distribuidores', id: 'd1' },
        { ...DISTRIBUIDORA_COMPLETA, contacte: 'Pere Puig', preu: 90.5 },
      ]);
    });

    it('si l\'escriptura falla, la barra ho diu i els canvis es conserven', async () => {
      carrega(DISTRIBUIDORA_COMPLETA);
      setDoc.mockRejectedValueOnce(new Error('xarxa'));
      const user = userEvent.setup();
      renderExistent();
      await user.type(await screen.findByLabelText('Web'), 'x');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      expect(await within(barra()).findByRole('alert')).toHaveTextContent("No s'ha pogut desar. Torna-ho a provar.");
      expect(screen.getByLabelText('Web')).toHaveValue('atalante.testx');
      expect(screen.getByRole('button', { name: 'Desar' })).toBeEnabled();
    });

    it('amb canvis sense desar, sortir per l\'enllaç demana confirmació', async () => {
      carrega(DISTRIBUIDORA_COMPLETA);
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const user = userEvent.setup();
      renderExistent();
      await user.type(await screen.findByLabelText('Web'), 'x');
      await user.click(screen.getByRole('link', { name: '← Distribuïdores' }));
      expect(confirm).toHaveBeenCalledWith('Hi ha canvis sense desar. Vols sortir igualment?');
      expect(screen.queryByText('Llistat de distribuïdores')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Web')).toHaveValue('atalante.testx');
    });

    it('sense canvis, sortir per l\'enllaç no demana confirmació', async () => {
      carrega(DISTRIBUIDORA_COMPLETA);
      const confirm = vi.spyOn(window, 'confirm');
      const user = userEvent.setup();
      renderExistent();
      await user.click(await screen.findByRole('link', { name: '← Distribuïdores' }));
      expect(await screen.findByText('Llistat de distribuïdores')).toBeInTheDocument();
      expect(confirm).not.toHaveBeenCalled();
    });

    it('una distribuïdora inexistent torna al llistat', async () => {
      carrega(undefined);
      renderExistent();
      expect(await screen.findByText('Llistat de distribuïdores')).toBeInTheDocument();
    });
  });

  describe('pàgina web pública', () => {
    it('té una ajuda i, si és invàlida, mostra l\'error al camp i a la barra i no desa res', async () => {
      const user = userEvent.setup();
      renderNova();
      const camp = screen.getByLabelText(ETIQUETA_URL_PUBLICA);
      expect(camp).toHaveAttribute('id', 'urlPublica');
      const ajuda = screen.getByText(AJUDA_URL_PUBLICA);
      expect(camp.getAttribute('aria-describedby').split(' ')).toContain(ajuda.id);
      expect(camp).not.toHaveAttribute('aria-invalid', 'true');
      await user.type(screen.getByLabelText('Nom'), 'Atalante');
      await user.type(camp, 'atalante.test');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      expect(await within(barra()).findByRole('alert')).toHaveTextContent("No s'ha pogut desar");
      const error = screen.getByText(ERROR_URL_PUBLICA, { selector: '.form__error' });
      expect(camp).toHaveAttribute('aria-invalid', 'true');
      expect(camp.getAttribute('aria-describedby').split(' ')).toEqual(expect.arrayContaining([ajuda.id, error.id]));
      esperaErrorCamp(ETIQUETA_URL_PUBLICA, 'Pàgina web pública', ERROR_URL_PUBLICA);
      expect(addDoc).not.toHaveBeenCalled();
      expect(setDoc).not.toHaveBeenCalled();
      expect(screen.getByTestId('ubicacio')).toHaveTextContent('/distribuidores/nova');
    });

    it('en editar, una URL pública invàlida tampoc no escriu res', async () => {
      carrega(DISTRIBUIDORA_COMPLETA);
      const user = userEvent.setup();
      renderExistent();
      const camp = await screen.findByLabelText(ETIQUETA_URL_PUBLICA);
      await user.clear(camp);
      await user.type(camp, 'ftp://atalante.test');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      expect(await within(barra()).findByRole('alert')).toBeInTheDocument();
      esperaErrorCamp(ETIQUETA_URL_PUBLICA, 'Pàgina web pública', ERROR_URL_PUBLICA);
      expect(setDoc).not.toHaveBeenCalled();
    });

    it('clicar l\'error de la barra enfoca el camp', async () => {
      const user = userEvent.setup();
      renderNova();
      await user.type(screen.getByLabelText('Nom'), '  ');
      await user.type(screen.getByLabelText(ETIQUETA_URL_PUBLICA), 'atalante.test');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      expect(await within(barra()).findByRole('alert')).toBeInTheDocument();
      esperaErrorCamp('Nom', 'Nom', 'El nom no pot estar en blanc.');
      esperaErrorCamp(ETIQUETA_URL_PUBLICA, 'Pàgina web pública', ERROR_URL_PUBLICA);
      await user.click(within(barra()).getByRole('button', { name: /^Pàgina web pública:/ }));
      expect(screen.getByLabelText(ETIQUETA_URL_PUBLICA)).toHaveFocus();
      await user.click(within(barra()).getByRole('button', { name: /^Nom:/ }));
      expect(screen.getByLabelText('Nom')).toHaveFocus();
    });

    it('l\'error desapareix en tornar-la a editar', async () => {
      const user = userEvent.setup();
      renderNova();
      await user.type(screen.getByLabelText('Nom'), 'Atalante');
      const camp = screen.getByLabelText(ETIQUETA_URL_PUBLICA);
      await user.type(camp, 'atalante.test');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      expect(await within(barra()).findByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(ERROR_URL_PUBLICA, { selector: '.form__error' })).toBeInTheDocument();
      await user.type(camp, 'x');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByText(ERROR_URL_PUBLICA)).not.toBeInTheDocument();
      expect(camp).not.toHaveAttribute('aria-invalid');
      expect(camp).toHaveAttribute('aria-describedby', 'urlPublica-ajuda');
      expect(within(barra()).getByText('Hi ha canvis sense desar')).toBeInTheDocument();
    });
  });

  describe('correu i preu', () => {
    const ERROR_CORREU = "El correu electrònic no és vàlid.";
    const ERROR_PREU = 'El preu ha de ser un número igual o més gran que 0.';

    it('el formulari no fa la validació nativa: la fa la fitxa', () => {
      const { container } = renderNova();
      expect(container.firstChild).toHaveAttribute('novalidate');
    });

    it('un correu no vàlid surt al camp i a la barra i no escriu res', async () => {
      const user = userEvent.setup();
      renderNova();
      await user.type(screen.getByLabelText('Nom'), 'Atalante');
      await user.type(screen.getByLabelText('Correu electrònic de contacte'), 'pere arroba atalante');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      expect(await within(barra()).findByRole('alert')).toHaveTextContent("No s'ha pogut desar");
      esperaErrorCamp('Correu electrònic de contacte', 'Correu electrònic', ERROR_CORREU);
      await user.click(within(barra()).getByRole('button', { name: /^Correu electrònic:/ }));
      expect(screen.getByLabelText('Correu electrònic de contacte')).toHaveFocus();
      expect(addDoc).not.toHaveBeenCalled();
    });

    it('un preu negatiu surt al camp i a la barra i no escriu res', async () => {
      const user = userEvent.setup();
      renderNova();
      await user.type(screen.getByLabelText('Nom'), 'Atalante');
      await user.type(screen.getByLabelText('Preu per defecte (€)'), '-5');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      expect(await within(barra()).findByRole('alert')).toBeInTheDocument();
      esperaErrorCamp('Preu per defecte (€)', 'Preu per defecte', ERROR_PREU);
      expect(addDoc).not.toHaveBeenCalled();
    });

    it('un correu i un preu desats incorrectes no bloquegen en silenci: es veuen els errors i, corregits, desa la resta', async () => {
      carrega({ ...DISTRIBUIDORA_COMPLETA, correu: 'pere@', preu: -10 });
      const user = userEvent.setup();
      renderExistent();
      await user.type(await screen.findByLabelText('Persona de contacte'), ' Puig');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      expect(await within(barra()).findByRole('alert')).toBeInTheDocument();
      esperaErrorCamp('Correu electrònic de contacte', 'Correu electrònic', ERROR_CORREU);
      esperaErrorCamp('Preu per defecte (€)', 'Preu per defecte', ERROR_PREU);
      expect(setDoc).not.toHaveBeenCalled();
      await user.clear(screen.getByLabelText('Correu electrònic de contacte'));
      await user.clear(screen.getByLabelText('Preu per defecte (€)'));
      expect(screen.getByLabelText('Correu electrònic de contacte')).not.toHaveAttribute('aria-invalid');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      await esperaDesat();
      expect(setDoc).toHaveBeenCalledWith({ col: 'distribuidores', id: 'd1' }, {
        ...DISTRIBUIDORA_COMPLETA, contacte: 'Pere Puig', correu: '', preu: null,
      });
    });

    // jsdom no modela `validity.badInput`: el navegador hi posa true i el valor buit quan el text no és un número («12e», «-»).
    const simulaTextNoNumeric = (input, illegible) => Object.defineProperty(input, 'validity', {
      configurable: true, get: () => ({ valid: !illegible, badInput: illegible }),
    });

    it('un preu que el navegador no pot llegir és un error i no esborra el preu desat', async () => {
      carrega(DISTRIBUIDORA_COMPLETA);
      const user = userEvent.setup();
      renderExistent();
      const preu = await screen.findByLabelText('Preu per defecte (€)');
      simulaTextNoNumeric(preu, true);
      await user.clear(preu);
      await user.type(screen.getByLabelText('Persona de contacte'), ' Puig');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      expect(await within(barra()).findByRole('alert')).toHaveTextContent("No s'ha pogut desar");
      esperaErrorCamp('Preu per defecte (€)', 'Preu per defecte', 'El preu ha de ser un número.');
      expect(setDoc).not.toHaveBeenCalled();
      // En tornar-lo a editar, l'error desapareix; buit de debò (llegible), desa sense preu.
      simulaTextNoNumeric(preu, false);
      await user.type(preu, '9');
      expect(preu).not.toHaveAttribute('aria-invalid');
      await user.clear(preu);
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      await esperaDesat();
      expect(setDoc).toHaveBeenCalledWith({ col: 'distribuidores', id: 'd1' }, { ...DISTRIBUIDORA_COMPLETA, contacte: 'Pere Puig', preu: null });
    });

    it('un preu il·legible tampoc no deixa crear', async () => {
      const user = userEvent.setup();
      renderNova();
      await user.type(screen.getByLabelText('Nom'), 'Atalante');
      simulaTextNoNumeric(screen.getByLabelText('Preu per defecte (€)'), true);
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      expect(await within(barra()).findByRole('alert')).toBeInTheDocument();
      esperaErrorCamp('Preu per defecte (€)', 'Preu per defecte', 'El preu ha de ser un número.');
      expect(addDoc).not.toHaveBeenCalled();
    });

    it('descartar després d\'un preu il·legible torna al preu desat i ja no és error', async () => {
      carrega(DISTRIBUIDORA_COMPLETA);
      const user = userEvent.setup();
      renderExistent();
      const preu = await screen.findByLabelText('Preu per defecte (€)');
      simulaTextNoNumeric(preu, true);
      await user.clear(preu);
      await user.click(screen.getByRole('button', { name: 'Descartar canvis' }));
      expect(preu).toHaveValue(120);
      simulaTextNoNumeric(preu, false);
      await user.type(screen.getByLabelText('Web'), 'x');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      await esperaDesat();
      expect(setDoc).toHaveBeenCalledWith({ col: 'distribuidores', id: 'd1' }, { ...DISTRIBUIDORA_COMPLETA, web: 'atalante.testx' });
    });

    it('accepta un correu vàlid amb espais al voltant i un preu amb tres decimals', async () => {
      const user = userEvent.setup();
      renderNova();
      await user.type(screen.getByLabelText('Nom'), 'Atalante');
      await user.type(screen.getByLabelText('Correu electrònic de contacte'), ' pere@atalante.test ');
      await user.type(screen.getByLabelText('Preu per defecte (€)'), '0.125');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      await esperaFitxaCreada();
      // Sense validació nativa, el `step` no limita els decimals.
      expect(addDoc.mock.calls[0][1]).toMatchObject({ correu: 'pere@atalante.test', preu: 0.125 });
    });
  });

  it('si la càrrega inicial falla, mostra un avís i no el carregador', async () => {
    getDoc.mockRejectedValue(new Error('permission-denied'));
    renderExistent();
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'ha pogut carregar la distribuïdora.");
    expect(screen.queryByText(/Carregant/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Distribuïdora');
    expect(screen.getByRole('link', { name: '← Distribuïdores' })).toHaveAttribute('href', '/distribuidores');
    const lectures = getDoc.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Torna-ho a provar' }));
    await waitFor(() => expect(getDoc.mock.calls.length).toBeGreaterThan(lectures));
  });

  describe('logo', () => {
    it('puja el logo a Storage amb un camí propi, el previsualitza i el desa amb «Desar»', async () => {
      const user = userEvent.setup();
      renderNova();
      await user.type(screen.getByLabelText('Nom'), 'Atalante');
      const grup = screen.getByRole('group', { name: 'Logo' });
      const png = fitxer('logo-original.png', 'image/png');
      expect(grup).toContainElement(screen.getByLabelText('Pujar el logo'));
      await user.upload(screen.getByLabelText('Pujar el logo'), png);
      await waitFor(() => expect(uploadBytes).toHaveBeenCalledWith({ cami: CAMI_LOGO }, png, { contentType: 'image/png' }));
      await waitFor(() => expect(previsualitzacio()).toHaveAttribute('src', URL_LOGO));
      expect(screen.getByLabelText('Canviar el logo')).toHaveAttribute('type', 'file');
      expect(addDoc).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      await esperaFitxaCreada();
      expect(addDoc).toHaveBeenCalledWith({ nom: 'distribuidores' }, {
        nom: 'Atalante', web: '', contacte: '', correu: '', preu: null, condicions: '', logo: URL_LOGO,
      });
    });

    it('en editar, el logo pujat queda pendent fins a «Desar» i s\'escriu amb la resta de l\'objecte', async () => {
      carrega(DISTRIBUIDORA_COMPLETA);
      const user = userEvent.setup();
      renderExistent();
      const png = fitxer('logo.png', 'image/png');
      await user.upload(await screen.findByLabelText('Canviar el logo'), png);
      await waitFor(() => expect(uploadBytes).toHaveBeenCalledWith({ cami: CAMI_LOGO }, png, { contentType: 'image/png' }));
      await waitFor(() => expect(previsualitzacio()).toHaveAttribute('src', URL_LOGO));
      expect(within(barra()).getByText('Hi ha canvis sense desar')).toBeInTheDocument();
      expect(setDoc).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      await esperaDesat();
      expect(setDoc).toHaveBeenCalledWith({ col: 'distribuidores', id: 'd1' }, { ...DISTRIBUIDORA_COMPLETA, logo: URL_LOGO });
    });

    it('descartar després de pujar un logo torna al logo desat i no escriu res', async () => {
      carrega(DISTRIBUIDORA_COMPLETA);
      const user = userEvent.setup();
      renderExistent();
      await user.upload(await screen.findByLabelText('Canviar el logo'), fitxer('logo.png', 'image/png'));
      await waitFor(() => expect(previsualitzacio()).toHaveAttribute('src', URL_LOGO));
      await user.click(screen.getByRole('button', { name: 'Descartar canvis' }));
      expect(previsualitzacio()).toHaveAttribute('src', 'https://logos.test/atalante.png');
      expect(within(barra()).getByText('Sense canvis')).toBeInTheDocument();
      expect(setDoc).not.toHaveBeenCalled();
    });

    it('mentre es puja el logo, «Desar» i «Descartar canvis» queden bloquejats', async () => {
      carrega(DISTRIBUIDORA_COMPLETA);
      let resol;
      uploadBytes.mockImplementationOnce(() => new Promise((r) => { resol = r; }));
      const user = userEvent.setup();
      renderExistent();
      await user.type(await screen.findByLabelText('Web'), 'x');
      await user.upload(screen.getByLabelText('Canviar el logo'), fitxer('logo.png', 'image/png'));
      expect(screen.getByRole('button', { name: 'Desar' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Descartar canvis' })).toBeDisabled();
      expect(screen.getByLabelText('Canviar el logo')).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Eliminar' })).toBeDisabled();
      // La barra diu per què no es pot desar (nota informativa, no un error).
      expect(within(barra()).getByText("S'està pujant el logo…")).toHaveClass('barra-desar__nota');
      expect(within(barra()).queryByRole('alert')).not.toBeInTheDocument();
      resol({});
      await waitFor(() => expect(previsualitzacio()).toHaveAttribute('src', URL_LOGO));
      expect(within(barra()).queryByText("S'està pujant el logo…")).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Desar' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Eliminar' })).toBeEnabled();
    });

    it('mentre es desa, «Eliminar» queda bloquejat', async () => {
      carrega(DISTRIBUIDORA_COMPLETA);
      let resol;
      setDoc.mockImplementationOnce(() => new Promise((r) => { resol = r; }));
      const user = userEvent.setup();
      renderExistent();
      await user.type(await screen.findByLabelText('Web'), 'x');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      expect(within(barra()).getByText('Desant…')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Eliminar' })).toBeDisabled();
      resol();
      expect(await within(barra()).findByText('Desat ✓')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Eliminar' })).toBeEnabled();
    });

    it.each([
      ['un GIF', fitxer('animat.gif', 'image/gif'), 'La imatge ha de ser JPG, PNG o WebP.'],
      ['una imatge de 11 MB', fitxer('gran.png', 'image/png', 11 * 1024 * 1024), 'La imatge no pot ocupar més de 10 MB.'],
    ])('rebutja %s sense pujar-lo', async (_nom, f, missatge) => {
      const user = userEvent.setup({ applyAccept: false });
      renderNova();
      await user.type(screen.getByLabelText('Nom'), 'Atalante');
      await user.upload(screen.getByLabelText('Pujar el logo'), f);
      const alerta = await screen.findByRole('alert');
      expect(alerta).toHaveTextContent(missatge);
      expect(screen.getByRole('group', { name: 'Logo' })).toContainElement(alerta);
      expect(uploadBytes).not.toHaveBeenCalled();
      expect(previsualitzacio()).toBeNull();
    });

    it('el mateix fitxer triat dues vegades es torna a pujar', async () => {
      const user = userEvent.setup();
      renderNova();
      await user.type(screen.getByLabelText('Nom'), 'Atalante');
      const png = fitxer('logo.png', 'image/png');
      await user.upload(screen.getByLabelText('Pujar el logo'), png);
      await waitFor(() => expect(uploadBytes).toHaveBeenCalledTimes(1));
      await user.upload(await screen.findByLabelText('Canviar el logo'), png);
      await waitFor(() => expect(uploadBytes).toHaveBeenCalledTimes(2));
    });

    it('demana el nom abans de pujar el logo', async () => {
      const user = userEvent.setup();
      renderNova();
      await user.upload(screen.getByLabelText('Pujar el logo'), fitxer('logo.png', 'image/png'));
      expect(await screen.findByRole('alert')).toHaveTextContent('Escriu primer el nom per poder pujar el logo.');
      expect(uploadBytes).not.toHaveBeenCalled();
    });

    it('mostra l\'error si la pujada falla i no canvia el logo ni marca canvis', async () => {
      carrega(DISTRIBUIDORA_COMPLETA);
      uploadBytes.mockRejectedValueOnce(new Error('xarxa'));
      const user = userEvent.setup();
      renderExistent();
      await user.upload(await screen.findByLabelText('Canviar el logo'), fitxer('logo.png', 'image/png'));
      expect(await screen.findByRole('alert')).toHaveTextContent("No s'ha pogut pujar la imatge. Torna-ho a provar.");
      expect(previsualitzacio()).toHaveAttribute('src', 'https://logos.test/atalante.png');
      expect(within(barra()).getByText('Sense canvis')).toBeInTheDocument();
    });

    it('si la pujada falla en crear, no hi ha logo', async () => {
      uploadBytes.mockRejectedValueOnce(new Error('xarxa'));
      const user = userEvent.setup();
      renderNova();
      await user.type(screen.getByLabelText('Nom'), 'Atalante');
      await user.upload(screen.getByLabelText('Pujar el logo'), fitxer('logo.png', 'image/png'));
      expect(await screen.findByRole('alert')).toHaveTextContent("No s'ha pogut pujar la imatge. Torna-ho a provar.");
      expect(previsualitzacio()).toBeNull();
    });

    it('«Treure el logo» buida el camp i en desar no hi ha logo (sense esborrar cap fitxer)', async () => {
      carrega(DISTRIBUIDORA_COMPLETA);
      const user = userEvent.setup();
      renderExistent();
      await user.click(await screen.findByRole('button', { name: 'Treure el logo' }));
      expect(previsualitzacio()).toBeNull();
      expect(screen.getByLabelText('Pujar el logo')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      await esperaDesat();
      const { logo: _logo, ...senseLogo } = DISTRIBUIDORA_COMPLETA;
      expect(setDoc).toHaveBeenCalledWith({ col: 'distribuidores', id: 'd1' }, senseLogo);
    });

    it('amb un logo desat es veu i es pot canviar o treure directament', async () => {
      carrega(DISTRIBUIDORA_COMPLETA);
      renderExistent();
      await waitFor(() => expect(previsualitzacio()).not.toBeNull());
      const grup = screen.getByRole('group', { name: 'Logo' });
      expect(grup).toContainElement(screen.getByLabelText('Canviar el logo'));
      expect(grup).toContainElement(screen.getByRole('button', { name: 'Treure el logo' }));
      expect(screen.queryByText('Sense logo')).not.toBeInTheDocument();
    });
  });

  describe('eliminar', () => {
    it('el botó «Eliminar» és dins de la zona de perill, i en crear no hi ha zona de perill', async () => {
      carrega({ nom: 'Atalante' });
      const { unmount } = renderExistent();
      await screen.findByLabelText('Nom');
      expect(zonaPerill()).toContainElement(screen.getByRole('button', { name: 'Eliminar' }));
      expect(zonaPerill()).toHaveTextContent('No es pot eliminar mentre alguna proposta o sessió la faci servir. Aquesta acció no es pot desfer.');
      unmount();
      renderNova();
      expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Zona de perill' })).not.toBeInTheDocument();
    });

    it('elimina la distribuïdora després de confirmar si no la fa servir cap proposta', async () => {
      carrega({ nom: 'Atalante' });
      const user = userEvent.setup();
      renderExistent();
      await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
      const dialeg = await dialegConfirmacio();
      expect(dialeg).toHaveAttribute('role', 'alertdialog');
      expect(dialeg).toHaveTextContent('Segur que vols eliminar aquesta distribuïdora? Aquesta acció no es pot desfer.');
      expect(deleteDoc).not.toHaveBeenCalled();
      await acceptaDialeg('Elimina');
      expect(await screen.findByText('Llistat de distribuïdores')).toBeInTheDocument();
      expect(deleteDoc).toHaveBeenCalledTimes(1);
      expect(deleteDoc).toHaveBeenCalledWith({ col: 'distribuidores', id: 'd1' });
    });

    it.each([
      ['Cancel·lar', (user) => cancellaDialeg(user)],
      ['ESC', (user) => tancaDialegAmbEsc(user)],
    ])('no elimina la distribuïdora si es tanca el diàleg amb %s', async (_nom, tanca) => {
      carrega({ nom: 'Atalante' });
      const user = userEvent.setup();
      renderExistent();
      await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
      await tanca(user);
      await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
      expect(deleteDoc).not.toHaveBeenCalled();
      expect(screen.queryByText('Llistat de distribuïdores')).not.toBeInTheDocument();
    });

    it('si l\'eliminació falla, ho diu a la zona de perill i es queda a la fitxa', async () => {
      carrega({ nom: 'Atalante' });
      deleteDoc.mockRejectedValueOnce(new Error('xarxa'));
      const user = userEvent.setup();
      renderExistent();
      await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
      await acceptaDialeg('Elimina');
      expect(await within(zonaPerill()).findByRole('alert')).toHaveTextContent("No s'ha pogut eliminar. Torna-ho a provar.");
      expect(screen.queryByText('Llistat de distribuïdores')).not.toBeInTheDocument();
    });

    it('no deixa eliminar una distribuïdora que ja fa servir alguna proposta (per id)', async () => {
      carrega({ nom: 'Atalante' });
      respostes.propostesInternes = [[{ id: 'p1' }, { id: 'p2' }]];
      const user = userEvent.setup();
      renderExistent();
      await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
      expect(await within(zonaPerill()).findByRole('alert')).toHaveTextContent("No es pot eliminar: l'usen 2 propostes");
      expect(hiHaDialegConfirmacio()).toBe(false);
      expect(deleteDoc).not.toHaveBeenCalled();
      const consulta = getDocs.mock.calls.find(([c]) => c.nom === 'propostesInternes')[0];
      expect(consulta.filtres).toEqual([{ camp: 'distribuidoraId', op: '==', valor: 'd1' }]);
    });

    it('amb una sola proposta usa el singular: «l\'usa 1 proposta»', async () => {
      carrega({ nom: 'Atalante' });
      respostes.propostesInternes = [[{ id: 'p1' }]];
      const user = userEvent.setup();
      renderExistent();
      await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
      expect(await within(zonaPerill()).findByRole('alert')).toHaveTextContent("No es pot eliminar: l'usa 1 proposta");
      expect(getDocs.mock.calls.filter(([c]) => c.nom === 'sessions')).toHaveLength(0);
      expect(deleteDoc).not.toHaveBeenCalled();
    });

    it('no deixa eliminar una distribuïdora que fa servir una sessió: «l\'usa 1 sessió» i el títol', async () => {
      carrega({ nom: 'Atalante' });
      respostes.sessions = [[
        { id: 's1', titol: 'Pig', publica: { suportDistribucio: 'Atalante' } },
        { id: 's2', titol: 'Altra', publica: { suportDistribucio: 'Un altre' } },
      ]];
      const user = userEvent.setup();
      renderExistent();
      await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
      const alerta = await within(zonaPerill()).findByRole('alert');
      expect(alerta).toHaveTextContent("No es pot eliminar: l'usa 1 sessió (Pig)");
      expect(alerta).not.toHaveTextContent('Altra');
      expect(hiHaDialegConfirmacio()).toBe(false);
      expect(deleteDoc).not.toHaveBeenCalled();
    });

    it('amb diverses sessions usa el plural: «l\'usen N sessions» i tots els títols', async () => {
      carrega({ nom: 'Atalante' });
      respostes.sessions = [[
        { id: 's1', titol: 'Pig', publica: { suportDistribucio: 'Atalante' } },
        { id: 's3', titol: 'Bis', publica: { suportDistribucio: 'Atalante' } },
      ]];
      const user = userEvent.setup();
      renderExistent();
      await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
      expect(await screen.findByRole('alert')).toHaveTextContent("No es pot eliminar: l'usen 2 sessions (Pig, Bis)");
      expect(deleteDoc).not.toHaveBeenCalled();
    });

    it('comprova l\'ús amb el nom desat, no amb el que s\'està editant sense desar', async () => {
      carrega({ nom: 'Atalante' });
      respostes.sessions = [[{ id: 's1', titol: 'Pig', publica: { suportDistribucio: 'Atalante' } }]];
      const user = userEvent.setup();
      renderExistent();
      await user.clear(await screen.findByLabelText('Nom'));
      await user.type(screen.getByLabelText('Nom'), 'Atalante Films');
      await user.click(screen.getByRole('button', { name: 'Eliminar' }));
      expect(await screen.findByRole('alert')).toHaveTextContent("No es pot eliminar: l'usa 1 sessió (Pig)");
      expect(hiHaDialegConfirmacio()).toBe(false);
      expect(deleteDoc).not.toHaveBeenCalled();
      expect(setDoc).not.toHaveBeenCalled();
    });

    it('després de desar un nom nou, la comprovació d\'ús fa servir el nom desat nou', async () => {
      carrega({ nom: 'Atalante' });
      respostes.sessions = [[{ id: 's1', titol: 'Pig', publica: { suportDistribucio: 'Atalante Films' } }]];
      const user = userEvent.setup();
      renderExistent();
      await user.clear(await screen.findByLabelText('Nom'));
      await user.type(screen.getByLabelText('Nom'), ' Atalante Films ');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      await esperaDesat();
      await user.click(screen.getByRole('button', { name: 'Eliminar' }));
      expect(await within(zonaPerill()).findByRole('alert')).toHaveTextContent("No es pot eliminar: l'usa 1 sessió (Pig)");
      expect(deleteDoc).not.toHaveBeenCalled();
    });

    it('no deixa eliminar si una sessió la referencia per id encara que el nom de la sessió sigui vell', async () => {
      carrega({ nom: 'Atalante' });
      respostes.sessions = [[
        { id: 's1', titol: 'Pig', publica: { suportDistribucio: 'Atalante Films', suportDistribucioId: 'd1' } },
        { id: 's2', titol: 'Altra', publica: { suportDistribucio: 'Atalante Films', suportDistribucioId: 'd2' } },
      ]];
      const user = userEvent.setup();
      renderExistent();
      await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
      const alerta = await screen.findByRole('alert');
      expect(alerta).toHaveTextContent("No es pot eliminar: l'usa 1 sessió (Pig)");
      expect(alerta).not.toHaveTextContent('Altra');
      expect(deleteDoc).not.toHaveBeenCalled();
    });

    it('consulta les sessions de nou en cada intent d\'eliminar', async () => {
      carrega({ nom: 'Atalante' });
      respostes.sessions = [[], [{ id: 's1', titol: 'Pig', publica: { suportDistribucio: 'Atalante' } }]];
      const user = userEvent.setup();
      renderExistent();
      const boto = await screen.findByRole('button', { name: 'Eliminar' });
      await user.click(boto);
      await cancellaDialeg(user);
      await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
      await user.click(boto);
      expect(await screen.findByRole('alert')).toHaveTextContent("No es pot eliminar: l'usa 1 sessió (Pig)");
      expect(hiHaDialegConfirmacio()).toBe(false);
      expect(getDocs.mock.calls.filter(([c]) => c.nom === 'sessions')).toHaveLength(2);
      expect(deleteDoc).not.toHaveBeenCalled();
    });
  });
});

describe('DistribuidoraForm: layout estàndard', () => {
  beforeEach(() => {
    getDoc.mockReset();
    getDoc.mockResolvedValue({ data: () => ({ nom: 'Atalante', condicions: 'Només dimecres' }) });
  });

  it('nova: formulari estret amb un sol h1, l\'enllaç «← Distribuïdores» i la barra de desar', () => {
    const { container } = renderNova();
    expect(container.firstChild.tagName).toBe('FORM');
    expect(container.firstChild).toHaveClass('pagina-admin', 'pagina-admin--formulari', 'pagina-admin--amb-barra');
    expect(container.firstChild).toContainElement(barra());
    const titols = screen.getAllByRole('heading', { level: 1 });
    expect(titols).toHaveLength(1);
    expect(titols[0]).toHaveTextContent('Nova distribuïdora');
    expect(screen.getByRole('link', { name: '← Distribuïdores' })).toHaveAttribute('href', '/distribuidores');
    expect(within(barra()).getByText('Sense canvis')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desar' })).toBeDisabled();
  });

  it('existent: formulari estret amb un sol h1 «Distribuïdora», l\'enllaç «← Distribuïdores» i la barra de desar', async () => {
    const { container } = renderExistent();
    await screen.findByLabelText('Nom');
    expect(container.firstChild.tagName).toBe('FORM');
    expect(container.firstChild).toHaveClass('pagina-admin', 'pagina-admin--formulari', 'pagina-admin--amb-barra');
    expect(container.firstChild).toContainElement(barra());
    const titols = screen.getAllByRole('heading', { level: 1 });
    expect(titols).toHaveLength(1);
    expect(titols[0]).toHaveTextContent('Distribuïdora');
    expect(screen.getByRole('link', { name: '← Distribuïdores' })).toHaveAttribute('href', '/distribuidores');
  });

  it('les condicions creixen amb el text i són editables directament', async () => {
    const user = userEvent.setup();
    renderExistent();
    const condicions = await screen.findByLabelText('Condicions per defecte');
    expect(condicions).toHaveClass('textarea-automatic');
    expect(condicions).toHaveValue('Només dimecres');
    expect(condicions).not.toHaveAttribute('readonly');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    await user.type(condicions, '!');
    expect(condicions).toHaveValue('Només dimecres!');
  });
});
