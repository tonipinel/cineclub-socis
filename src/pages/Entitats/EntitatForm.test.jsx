import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter, Routes, Route, useLocation, useNavigationType,
} from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {}, storage: { app: { options: { storageBucket: 'bucket-prova' } } } }));
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn().mockResolvedValue({ id: 'e9' }),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  doc: vi.fn((_db, col, id) => ({ col, id })),
  collection: vi.fn((_db, nom) => ({ nom })),
  serverTimestamp: vi.fn(() => 'ara'),
}));
vi.mock('firebase/storage', () => ({
  ref: vi.fn((_storage, cami) => ({ cami })),
  uploadBytes: vi.fn().mockResolvedValue({}),
}));

import {
  addDoc, deleteDoc, getDoc, getDocs, updateDoc,
} from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import EntitatForm from './EntitatForm';
import {
  acceptaDialeg, cancellaDialeg, dialegConfirmacio, hiHaDialegConfirmacio, renderAmbConfirmacio, tancaDialegAmbEsc,
} from '../../test/confirmacio';

const EXISTENTS = [
  { id: 'e1', nom: 'Ateneu Rodenc', url: 'https://ateneu.test/' },
  { id: 'e2', nom: 'Àgora' },
];
const resposta = (llista) => ({ docs: llista.map(({ id, ...d }) => ({ id, data: () => d })) });

// getDocs rep la col·lecció (mock de `collection`): entitats sempre igual, sessions en cadascuna de les seves respostes.
let respostesSessions;
const mockGetDocs = () => getDocs.mockImplementation(async ({ nom }) => {
  if (nom === 'entitats') return resposta(EXISTENTS);
  return resposta(respostesSessions.length > 1 ? respostesSessions.shift() : respostesSessions[0]);
});

// Ruta actual i tipus de l'última navegació (per comprovar el `replace` en crear).
function Ubicacio() {
  const { pathname } = useLocation();
  return <p data-testid="ubicacio">{`${pathname} ${useNavigationType()}`}</p>;
}

function renderNova() {
  return renderAmbConfirmacio(
    <MemoryRouter initialEntries={['/entitats/nova']}>
      <Routes>
        <Route path="/entitats/nova" element={<EntitatForm />} />
        <Route path="/entitats/:id" element={<p>Fitxa de l&apos;entitat creada</p>} />
        <Route path="/entitats" element={<p>Llistat d'entitats</p>} />
      </Routes>
      <Ubicacio />
    </MemoryRouter>
  );
}

function renderExistent() {
  return renderAmbConfirmacio(
    <MemoryRouter initialEntries={['/entitats/e1']}>
      <Routes>
        <Route path="/entitats/:id" element={<EntitatForm />} />
        <Route path="/entitats" element={<p>Llistat d'entitats</p>} />
      </Routes>
    </MemoryRouter>
  );
}

const fitxer = (nom, tipus) => new File(['x'], nom, { type: tipus });
const sessioAmbUs = { id: 's1', titol: 'Pig', publica: { organitza: 'Ateneu Rodenc' } };
const barra = () => document.querySelector('.barra-desar');
const ETIQUETA_URL = 'Pàgina web pública';
const AJUDA_URL = 'Adreça on porta el logo al lloc públic.';
const ERROR_URL = "L'adreça ha de començar per http:// o https://.";
// La previsualització és decorativa (alt buit): es busca dins del grup «Logo».
const previsualitzacio = () => screen.getByRole('group', { name: 'Logo' }).querySelector('img');
const zonaPerill = () => screen.getByRole('region', { name: 'Zona de perill' });

// Després de crear, es passa a la fitxa del nou id substituint «Nova entitat» a l'historial.
async function esperaFitxaCreada() {
  expect(await screen.findByText("Fitxa de l'entitat creada")).toBeInTheDocument();
  expect(screen.getByTestId('ubicacio')).toHaveTextContent('/entitats/e9 REPLACE');
}
// Després de desar una entitat existent, es queda a la fitxa amb «Desat ✓».
async function esperaDesat() {
  expect(await within(barra()).findByText('Desat ✓')).toBeInTheDocument();
  expect(screen.queryByText("Llistat d'entitats")).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1, name: 'Entitat' })).toBeInTheDocument();
}
// L'error d'un camp surt sota el camp (vinculat) i a la barra, com a botó que hi porta.
function esperaErrorCamp(etiqueta, camp, missatge) {
  const input = screen.getByLabelText(etiqueta);
  expect(input).toHaveAttribute('aria-invalid', 'true');
  const descrits = input.getAttribute('aria-describedby').split(' ').map((id) => document.getElementById(id));
  expect(descrits.some((el) => el?.textContent === missatge)).toBe(true);
  expect(within(barra()).getByRole('button', { name: `${camp}: ${missatge}` })).toBeInTheDocument();
}

describe('EntitatForm', () => {
  beforeEach(() => {
    [addDoc, updateDoc, deleteDoc, getDoc, getDocs, uploadBytes, ref].forEach((m) => m.mockClear());
    respostesSessions = [[]];
    mockGetDocs();
    getDoc.mockResolvedValue({ data: () => ({ nom: 'Ateneu Rodenc', url: 'https://ateneu.test/' }) });
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('crea una entitat amb nom i URL, sense logo, i passa a la fitxa nova', async () => {
    const user = userEvent.setup();
    renderNova();
    await user.type(await screen.findByLabelText('Nom'), '  Cineclub Nou ');
    await user.type(screen.getByLabelText(ETIQUETA_URL), 'https://nou.test/');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await waitFor(() => expect(addDoc).toHaveBeenCalledTimes(1));
    expect(addDoc).toHaveBeenCalledWith({ nom: 'entitats' }, { nom: 'Cineclub Nou', url: 'https://nou.test/', creatEl: 'ara' });
    await esperaFitxaCreada();
  });

  it('crea una entitat amb el logo pujat', async () => {
    const user = userEvent.setup();
    renderNova();
    await user.type(await screen.findByLabelText('Nom'), 'Cineclub Nou');
    await user.upload(screen.getByLabelText('Pujar el logo'), fitxer('logo.png', 'image/png'));
    const cami = 'web/entitats/cineclub-nou-1700000000000.png';
    const urlEsperada = `https://firebasestorage.googleapis.com/v0/b/bucket-prova/o/${encodeURIComponent(cami)}?alt=media`;
    await waitFor(() => expect(previsualitzacio()).toHaveAttribute('src', urlEsperada));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await waitFor(() => expect(addDoc).toHaveBeenCalledTimes(1));
    expect(addDoc).toHaveBeenCalledWith({ nom: 'entitats' }, { nom: 'Cineclub Nou', logo: urlEsperada, creatEl: 'ara' });
    await esperaFitxaCreada();
  });

  it('rebutja un nom repetit sense escriure res', async () => {
    const user = userEvent.setup();
    renderNova();
    await user.type(await screen.findByLabelText('Nom'), 'ateneu rodenc');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await within(barra()).findByRole('alert')).toHaveTextContent("No s'ha pogut desar");
    esperaErrorCamp('Nom', 'Nom', 'Ja hi ha una entitat amb aquest nom.');
    expect(addDoc).not.toHaveBeenCalled();
    expect(screen.getByTestId('ubicacio')).toHaveTextContent('/entitats/nova');
  });

  it('rebutja un nom amb comes sense escriure res', async () => {
    const user = userEvent.setup();
    renderNova();
    await user.type(await screen.findByLabelText('Nom'), 'Foo, Bar');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await within(barra()).findByRole('alert')).toBeInTheDocument();
    esperaErrorCamp('Nom', 'Nom', 'El nom no pot contenir comes.');
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('rebutja un nom en blanc i una URL no vàlida, i clicar l\'error de la barra enfoca el camp', async () => {
    const user = userEvent.setup();
    renderNova();
    await user.type(await screen.findByLabelText('Nom'), '   ');
    await user.type(screen.getByLabelText(ETIQUETA_URL), 'ftp://x.test');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await within(barra()).findByRole('alert')).toBeInTheDocument();
    esperaErrorCamp('Nom', 'Nom', 'El nom no pot estar en blanc.');
    esperaErrorCamp(ETIQUETA_URL, 'Pàgina web pública', ERROR_URL);
    await user.click(within(barra()).getByRole('button', { name: /^Pàgina web pública:/ }));
    expect(screen.getByLabelText(ETIQUETA_URL)).toHaveFocus();
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('l\'error d\'un camp desapareix en corregir-lo', async () => {
    const user = userEvent.setup();
    renderNova();
    const nom = await screen.findByLabelText('Nom');
    await user.type(nom, 'Àgora');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await within(barra()).findByRole('alert')).toBeInTheDocument();
    await user.type(nom, ' 2');
    expect(nom).not.toHaveAttribute('aria-invalid');
    expect(within(barra()).getByText('Hi ha canvis sense desar')).toBeInTheDocument();
  });

  it('en crear, un doble clic a «Desar» escriu un sol document', async () => {
    let resol;
    addDoc.mockImplementationOnce(() => new Promise((r) => { resol = r; }));
    const user = userEvent.setup();
    renderNova();
    await user.type(await screen.findByLabelText('Nom'), 'Cineclub Nou');
    const desar = screen.getByRole('button', { name: 'Desar' });
    await user.dblClick(desar);
    expect(within(barra()).getByText('Desant…')).toBeInTheDocument();
    resol({ id: 'e9' });
    await esperaFitxaCreada();
    expect(addDoc).toHaveBeenCalledTimes(1);
  });

  it('si la creació falla, la barra ho diu i es queda a «Nova entitat» amb els valors', async () => {
    addDoc.mockRejectedValueOnce(new Error('xarxa'));
    const user = userEvent.setup();
    renderNova();
    await user.type(await screen.findByLabelText('Nom'), 'Cineclub Nou');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await within(barra()).findByRole('alert')).toHaveTextContent("No s'ha pogut desar. Torna-ho a provar.");
    expect(screen.getByLabelText('Nom')).toHaveValue('Cineclub Nou');
    expect(screen.getByTestId('ubicacio')).toHaveTextContent('/entitats/nova');
  });

  it('en editar el nom és de només lectura amb ajuda, i desa només la URL canviada sense sortir de la fitxa', async () => {
    const user = userEvent.setup();
    renderExistent();
    const nom = await screen.findByLabelText('Nom');
    expect(nom).toHaveValue('Ateneu Rodenc');
    expect(nom).toHaveAttribute('readonly');
    expect(nom).toHaveClass('form__input', 'form__input--bloquejat');
    expect(screen.getByText('El nom no es pot canviar: les sessions el fan servir per triar-la')).toBeInTheDocument();
    const url = screen.getByLabelText(ETIQUETA_URL);
    await user.clear(url);
    await user.type(url, 'https://nova.test/');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
    expect(updateDoc).toHaveBeenCalledWith({ col: 'entitats', id: 'e1' }, { url: 'https://nova.test/' });
    expect(addDoc).not.toHaveBeenCalled();
    await esperaDesat();
    expect(url).toHaveValue('https://nova.test/');
  });

  it('desa la URL retallada i, si només canvien espais, no escriu res', async () => {
    const user = userEvent.setup();
    renderExistent();
    const url = await screen.findByLabelText(ETIQUETA_URL);
    await user.type(url, '  ');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await esperaDesat();
    expect(updateDoc).not.toHaveBeenCalled();
    await user.clear(url);
    await user.type(url, ' https://nova.test/ ');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
    expect(updateDoc).toHaveBeenCalledWith({ col: 'entitats', id: 'e1' }, { url: 'https://nova.test/' });
  });

  it('desa la URL i el logo alhora en una sola escriptura', async () => {
    const user = userEvent.setup();
    renderExistent();
    const url = await screen.findByLabelText(ETIQUETA_URL);
    await user.clear(url);
    await user.type(url, 'https://nova.test/');
    await user.upload(screen.getByLabelText('Pujar el logo'), fitxer('logo.webp', 'image/webp'));
    const cami = 'web/entitats/ateneu-rodenc-1700000000000.webp';
    const urlLogo = `https://firebasestorage.googleapis.com/v0/b/bucket-prova/o/${encodeURIComponent(cami)}?alt=media`;
    await waitFor(() => expect(previsualitzacio()).not.toBeNull());
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
    expect(updateDoc).toHaveBeenCalledWith({ col: 'entitats', id: 'e1' }, { url: 'https://nova.test/', logo: urlLogo });
  });

  describe('cicle d\'edició', () => {
    it('obrir una entitat i no tocar res: «Sense canvis», «Desar» deshabilitat i sense «Descartar canvis» ni «Editar»', async () => {
      renderExistent();
      await screen.findByLabelText('Nom');
      expect(within(barra()).getByText('Sense canvis')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Desar' })).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'Descartar canvis' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
      expect(screen.getByLabelText(ETIQUETA_URL)).not.toHaveAttribute('readonly');
    });

    it('editar passa a «Hi ha canvis sense desar» i «Descartar canvis» torna als valors desats sense escriure', async () => {
      getDoc.mockResolvedValue({ data: () => ({ nom: 'Ateneu Rodenc', url: 'https://ateneu.test/', logo: 'https://logos.test/a.png' }) });
      const user = userEvent.setup();
      renderExistent();
      const url = await screen.findByLabelText(ETIQUETA_URL);
      await user.type(url, 'x');
      await user.click(screen.getByRole('button', { name: 'Treure el logo' }));
      expect(within(barra()).getByText('Hi ha canvis sense desar')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Descartar canvis' }));
      // El botó desapareix: el focus passa a l'estat de la barra en comptes de perdre's.
      expect(within(barra()).getByText('Sense canvis')).toHaveFocus();
      expect(url).toHaveValue('https://ateneu.test/');
      expect(previsualitzacio()).toHaveAttribute('src', 'https://logos.test/a.png');
      expect(within(barra()).getByText('Sense canvis')).toBeInTheDocument();
      expect(updateDoc).not.toHaveBeenCalled();
    });

    it('després de desar continua editable i un segon desat parteix de la línia base nova', async () => {
      const user = userEvent.setup();
      renderExistent();
      const url = await screen.findByLabelText(ETIQUETA_URL);
      await user.clear(url);
      await user.type(url, 'https://nova.test/');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      await esperaDesat();
      expect(screen.getByRole('link', { name: '← Entitats' })).toHaveAttribute('href', '/entitats');
      await user.upload(screen.getByLabelText('Pujar el logo'), fitxer('logo.png', 'image/png'));
      await waitFor(() => expect(previsualitzacio()).not.toBeNull());
      expect(within(barra()).getByText('Hi ha canvis sense desar')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      await waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(2));
      // Només el logo: la URL ja és la desada.
      expect(updateDoc.mock.calls[1][1]).toEqual({ logo: expect.stringContaining('ateneu-rodenc-1700000000000.png') });
    });

    it('si l\'escriptura falla, la barra ho diu i els canvis es conserven', async () => {
      updateDoc.mockRejectedValueOnce(new Error('xarxa'));
      const user = userEvent.setup();
      renderExistent();
      const url = await screen.findByLabelText(ETIQUETA_URL);
      await user.type(url, 'x');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      expect(await within(barra()).findByRole('alert')).toHaveTextContent("No s'ha pogut desar. Torna-ho a provar.");
      expect(url).toHaveValue('https://ateneu.test/x');
      expect(screen.getByRole('button', { name: 'Desar' })).toBeEnabled();
    });

    it('amb canvis sense desar, sortir per l\'enllaç demana confirmació', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const user = userEvent.setup();
      renderExistent();
      await user.type(await screen.findByLabelText(ETIQUETA_URL), 'x');
      await user.click(screen.getByRole('link', { name: '← Entitats' }));
      expect(confirm).toHaveBeenCalledWith('Hi ha canvis sense desar. Vols sortir igualment?');
      expect(screen.queryByText("Llistat d'entitats")).not.toBeInTheDocument();
      expect(screen.getByLabelText(ETIQUETA_URL)).toHaveValue('https://ateneu.test/x');
    });

    it('sense canvis, sortir per l\'enllaç no demana confirmació', async () => {
      const confirm = vi.spyOn(window, 'confirm');
      const user = userEvent.setup();
      renderExistent();
      await user.click(await screen.findByRole('link', { name: '← Entitats' }));
      expect(await screen.findByText("Llistat d'entitats")).toBeInTheDocument();
      expect(confirm).not.toHaveBeenCalled();
    });

    it('una entitat inexistent torna al llistat', async () => {
      getDoc.mockResolvedValue({ data: () => undefined });
      renderExistent();
      expect(await screen.findByText("Llistat d'entitats")).toBeInTheDocument();
    });
  });

  describe('logo', () => {
    it('puja el logo a Storage, el previsualitza i queda pendent fins a «Desar»', async () => {
      const user = userEvent.setup();
      renderExistent();
      await screen.findByLabelText('Nom');
      const png = fitxer('logo-original.png', 'image/png');
      await user.upload(screen.getByLabelText('Pujar el logo'), png);
      const cami = 'web/entitats/ateneu-rodenc-1700000000000.png';
      const urlEsperada = `https://firebasestorage.googleapis.com/v0/b/bucket-prova/o/${encodeURIComponent(cami)}?alt=media`;
      await waitFor(() => expect(uploadBytes).toHaveBeenCalledWith({ cami }, png, { contentType: 'image/png' }));
      await waitFor(() => expect(previsualitzacio()).toHaveAttribute('src', urlEsperada));
      expect(updateDoc).not.toHaveBeenCalled();
      expect(within(barra()).getByText('Hi ha canvis sense desar')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      await waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
      expect(updateDoc).toHaveBeenCalledWith({ col: 'entitats', id: 'e1' }, { logo: urlEsperada });
      await esperaDesat();
    });

    it('descartar després de pujar un logo torna al logo desat i no escriu res', async () => {
      const user = userEvent.setup();
      renderExistent();
      await screen.findByLabelText('Nom');
      await user.upload(screen.getByLabelText('Pujar el logo'), fitxer('logo.png', 'image/png'));
      await waitFor(() => expect(previsualitzacio()).not.toBeNull());
      await user.click(screen.getByRole('button', { name: 'Descartar canvis' }));
      expect(previsualitzacio()).toBeNull();
      expect(within(barra()).getByText('Sense canvis')).toBeInTheDocument();
      expect(updateDoc).not.toHaveBeenCalled();
    });

    it('mentre es puja el logo, «Desar» i «Descartar canvis» queden bloquejats', async () => {
      let resol;
      uploadBytes.mockImplementationOnce(() => new Promise((r) => { resol = r; }));
      const user = userEvent.setup();
      renderExistent();
      await user.type(await screen.findByLabelText(ETIQUETA_URL), 'x');
      await user.upload(screen.getByLabelText('Pujar el logo'), fitxer('logo.png', 'image/png'));
      expect(screen.getByRole('button', { name: 'Desar' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Descartar canvis' })).toBeDisabled();
      expect(screen.getByLabelText('Pujar el logo')).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Eliminar' })).toBeDisabled();
      // La barra diu per què no es pot desar (nota informativa, no un error).
      expect(within(barra()).getByText("S'està pujant el logo…")).toHaveClass('barra-desar__nota');
      expect(within(barra()).queryByRole('alert')).not.toBeInTheDocument();
      resol({});
      await waitFor(() => expect(previsualitzacio()).not.toBeNull());
      expect(within(barra()).queryByText("S'està pujant el logo…")).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Desar' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Eliminar' })).toBeEnabled();
    });

    it('mentre es desa, «Eliminar» queda bloquejat', async () => {
      let resol;
      updateDoc.mockImplementationOnce(() => new Promise((r) => { resol = r; }));
      const user = userEvent.setup();
      renderExistent();
      await user.type(await screen.findByLabelText(ETIQUETA_URL), 'x');
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      expect(within(barra()).getByText('Desant…')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Eliminar' })).toBeDisabled();
      resol();
      expect(await within(barra()).findByText('Desat ✓')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Eliminar' })).toBeEnabled();
    });

    it('en crear, cal el nom abans de pujar el logo', async () => {
      const user = userEvent.setup();
      renderNova();
      await user.upload(await screen.findByLabelText('Pujar el logo'), fitxer('logo.png', 'image/png'));
      expect(await screen.findByRole('alert')).toHaveTextContent('Escriu primer el nom per poder pujar el logo.');
      expect(uploadBytes).not.toHaveBeenCalled();
    });

    it('rebutja un fitxer que no és JPG, PNG o WebP sense pujar-lo', async () => {
      const user = userEvent.setup({ applyAccept: false });
      renderExistent();
      await screen.findByLabelText('Nom');
      await user.upload(screen.getByLabelText('Pujar el logo'), fitxer('animat.gif', 'image/gif'));
      expect(await screen.findByRole('alert')).toHaveTextContent('La imatge ha de ser JPG, PNG o WebP.');
      expect(uploadBytes).not.toHaveBeenCalled();
      expect(previsualitzacio()).toBeNull();
      expect(within(barra()).getByText('Sense canvis')).toBeInTheDocument();
    });

    it('mostra l\'error si la pujada falla i no canvia el logo', async () => {
      uploadBytes.mockRejectedValueOnce(new Error('xarxa'));
      const user = userEvent.setup();
      renderExistent();
      await screen.findByLabelText('Nom');
      await user.upload(screen.getByLabelText('Pujar el logo'), fitxer('logo.png', 'image/png'));
      expect(await screen.findByRole('alert')).toHaveTextContent("No s'ha pogut pujar la imatge. Torna-ho a provar.");
      expect(previsualitzacio()).toBeNull();
      expect(within(barra()).getByText('Sense canvis')).toBeInTheDocument();
    });

    it("«Treure el logo» buida el camp (logo: '') sense esborrar cap fitxer", async () => {
      getDoc.mockResolvedValue({ data: () => ({ nom: 'Ateneu Rodenc', logo: 'https://logos.test/a.png' }) });
      const user = userEvent.setup();
      renderExistent();
      await waitFor(() => expect(previsualitzacio()).toHaveAttribute('src', 'https://logos.test/a.png'));
      await user.click(screen.getByRole('button', { name: 'Treure el logo' }));
      expect(previsualitzacio()).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Desar' }));
      await waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
      expect(updateDoc).toHaveBeenCalledWith({ col: 'entitats', id: 'e1' }, { logo: '' });
      await esperaDesat();
    });
  });

  it('si la càrrega inicial falla, mostra un avís i no el carregador', async () => {
    getDocs.mockRejectedValue(new Error('permission-denied'));
    renderExistent();
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'ha pogut carregar l'entitat. Torna-ho a provar.");
    expect(screen.getByRole('heading', { level: 1, name: 'Entitat' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Entitats' })).toHaveAttribute('href', '/entitats');
    expect(screen.queryByText(/Carregant/)).not.toBeInTheDocument();
  });

  describe('eliminar', () => {
    it('el botó «Eliminar» és dins de la zona de perill, amb la mateixa descripció que la resta de fitxes', async () => {
      renderExistent();
      await screen.findByLabelText('Nom');
      expect(zonaPerill()).toContainElement(screen.getByRole('button', { name: 'Eliminar' }));
      expect(zonaPerill()).toHaveTextContent('No es pot eliminar mentre alguna sessió la faci servir. Aquesta acció no es pot desfer.');
    });

    it('no elimina una entitat en ús: mostra el recompte i els títols de les sessions', async () => {
      respostesSessions = [[sessioAmbUs, { id: 's2', titol: 'Altra', publica: { organitza: 'Un altre' } }]];
      const user = userEvent.setup();
      renderExistent();
      await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
      const avis = await within(zonaPerill()).findByRole('alert');
      expect(avis).toHaveTextContent("No es pot eliminar: l'usa 1 sessió (Pig)");
      expect(avis).not.toHaveTextContent('Altra');
      expect(hiHaDialegConfirmacio()).toBe(false);
      expect(deleteDoc).not.toHaveBeenCalled();
    });

    it('amb diverses sessions usa el plural: «l\'usen N sessions» i tots els títols', async () => {
      respostesSessions = [[sessioAmbUs, { id: 's3', titol: 'Bis', publica: { organitza: 'Ateneu Rodenc' } }]];
      const user = userEvent.setup();
      renderExistent();
      await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
      expect(await screen.findByRole('alert')).toHaveTextContent("No es pot eliminar: l'usen 2 sessions (Pig, Bis)");
      expect(deleteDoc).not.toHaveBeenCalled();
    });

    it('elimina una entitat sense ús després de confirmar i torna al llistat', async () => {
      const user = userEvent.setup();
      renderExistent();
      await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
      const dialeg = await dialegConfirmacio();
      expect(dialeg).toHaveAttribute('role', 'alertdialog');
      expect(dialeg).toHaveTextContent('Segur que vols eliminar aquesta entitat? Aquesta acció no es pot desfer.');
      expect(deleteDoc).not.toHaveBeenCalled();
      await acceptaDialeg('Elimina');
      await waitFor(() => expect(deleteDoc).toHaveBeenCalledTimes(1));
      expect(deleteDoc).toHaveBeenCalledWith({ col: 'entitats', id: 'e1' });
      expect(await screen.findByText("Llistat d'entitats")).toBeInTheDocument();
      expect(deleteDoc).toHaveBeenCalledTimes(1);
    });

    it('si l\'eliminació falla, ho diu a la zona de perill i es queda a la fitxa', async () => {
      deleteDoc.mockRejectedValueOnce(new Error('xarxa'));
      const user = userEvent.setup();
      renderExistent();
      await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
      await acceptaDialeg('Elimina');
      expect(await within(zonaPerill()).findByRole('alert')).toHaveTextContent("No s'ha pogut eliminar. Torna-ho a provar.");
      expect(screen.queryByText("Llistat d'entitats")).not.toBeInTheDocument();
    });

    it('no elimina si l\'usuari cancel·la', async () => {
      const user = userEvent.setup();
      renderExistent();
      await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
      await cancellaDialeg(user);
      await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
      expect(deleteDoc).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Eliminar' })).toHaveFocus();
    });

    it('no elimina si l\'usuari tanca el diàleg amb ESC', async () => {
      const user = userEvent.setup();
      renderExistent();
      await user.click(await screen.findByRole('button', { name: 'Eliminar' }));
      await tancaDialegAmbEsc(user);
      await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
      expect(deleteDoc).not.toHaveBeenCalled();
    });

    it('consulta les sessions de nou en cada intent d\'eliminar', async () => {
      respostesSessions = [[], [sessioAmbUs]];
      const user = userEvent.setup();
      renderExistent();
      const boto = await screen.findByRole('button', { name: 'Eliminar' });
      await user.click(boto);
      await cancellaDialeg(user);
      await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
      await user.click(boto);
      expect(await screen.findByRole('alert')).toHaveTextContent("No es pot eliminar: l'usa 1 sessió (Pig)");
      expect(hiHaDialegConfirmacio()).toBe(false);
      const consultesSessions = getDocs.mock.calls.filter(([c]) => c.nom === 'sessions');
      expect(consultesSessions).toHaveLength(2);
      expect(deleteDoc).not.toHaveBeenCalled();
    });

    it('en crear no hi ha botó d\'eliminar ni zona de perill', async () => {
      renderNova();
      await screen.findByLabelText('Nom');
      expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Zona de perill' })).not.toBeInTheDocument();
    });
  });

  describe('layout estàndard', () => {
    it('és un formulari estret amb un sol h1, l\'enllaç «← Entitats» i la barra de desar', async () => {
      const { container } = renderExistent();
      await screen.findByLabelText('Nom');
      expect(container.firstChild.tagName).toBe('FORM');
      expect(container.firstChild).toHaveClass('pagina-admin', 'pagina-admin--formulari', 'pagina-admin--amb-barra');
      expect(container.firstChild).toContainElement(barra());
      const titols = screen.getAllByRole('heading', { level: 1 });
      expect(titols).toHaveLength(1);
      expect(titols[0]).toHaveTextContent('Entitat');
      expect(screen.getByRole('link', { name: '← Entitats' })).toHaveAttribute('href', '/entitats');
    });

    it('el formulari no fa la validació nativa i el nom és obligatori per als lectors de pantalla', async () => {
      const { container } = renderNova();
      await screen.findByLabelText('Nom');
      expect(container.firstChild).toHaveAttribute('novalidate');
      expect(screen.getByLabelText('Nom')).toBeRequired();
    });

    it('la pàgina web pública té la mateixa ajuda (vinculada) que la de les distribuïdores', async () => {
      renderNova();
      const camp = await screen.findByLabelText(ETIQUETA_URL);
      expect(camp).toHaveAttribute('id', 'url');
      expect(camp).toHaveAttribute('aria-describedby', 'url-ajuda');
      expect(document.getElementById('url-ajuda')).toHaveTextContent(AJUDA_URL);
    });

    it('en crear, el títol és «Nova entitat» i també hi ha la barra', async () => {
      renderNova();
      await screen.findByLabelText('Nom');
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Nova entitat');
      expect(within(barra()).getByText('Sense canvis')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Desar' })).toBeDisabled();
    });

    it('el logo es tria amb el selector de fitxers en català, que mostra el nom del fitxer triat', async () => {
      const user = userEvent.setup();
      renderExistent();
      await screen.findByLabelText('Nom');
      const input = screen.getByLabelText('Pujar el logo');
      expect(input).toHaveAttribute('type', 'file');
      expect(input).toHaveClass('selector-fitxer__input');
      expect(screen.getByText('Cap fitxer seleccionat')).toBeInTheDocument();
      await user.upload(input, fitxer('logo-original.png', 'image/png'));
      expect(await screen.findByText('logo-original.png')).toBeInTheDocument();
      await waitFor(() => expect(uploadBytes).toHaveBeenCalledTimes(1));
    });

    it('el selector és dins del grup «Logo»; sense logo diu «Pujar el logo» i, després de pujar-ne un, «Canviar el logo»', async () => {
      const user = userEvent.setup();
      renderExistent();
      await screen.findByLabelText('Nom');
      const grup = screen.getByRole('group', { name: 'Logo' });
      expect(grup).toContainElement(screen.getByLabelText('Pujar el logo'));
      await user.upload(screen.getByLabelText('Pujar el logo'), fitxer('logo.png', 'image/png'));
      expect(await screen.findByLabelText('Canviar el logo')).toHaveAttribute('type', 'file');
      expect(screen.queryByLabelText('Pujar el logo')).not.toBeInTheDocument();
    });

    it('amb un logo ja desat, el selector diu «Canviar el logo» i es pot pujar igualment', async () => {
      getDoc.mockResolvedValue({ data: () => ({ nom: 'Ateneu Rodenc', logo: 'https://logos.test/a.png' }) });
      const user = userEvent.setup();
      renderExistent();
      const input = await screen.findByLabelText('Canviar el logo');
      expect(screen.getByRole('group', { name: 'Logo' })).toContainElement(input);
      expect(screen.queryByLabelText('Pujar el logo')).not.toBeInTheDocument();
      await user.upload(input, fitxer('nou.png', 'image/png'));
      await waitFor(() => expect(uploadBytes).toHaveBeenCalledTimes(1));
    });
  });
});
