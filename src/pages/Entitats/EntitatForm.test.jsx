import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {}, storage: { app: { options: { storageBucket: 'bucket-prova' } } } }));
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn().mockResolvedValue({ id: 'nova' }),
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

function renderNova() {
  return renderAmbConfirmacio(
    <MemoryRouter initialEntries={['/entitats/nova']}>
      <Routes>
        <Route path="/entitats/nova" element={<EntitatForm />} />
        <Route path="/entitats" element={<p>Llistat d'entitats</p>} />
      </Routes>
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

  it('crea una entitat amb nom i URL, sense logo', async () => {
    const user = userEvent.setup();
    renderNova();
    await user.type(await screen.findByLabelText('Nom'), '  Cineclub Nou ');
    await user.type(screen.getByLabelText('URL'), 'https://nou.test/');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await waitFor(() => expect(addDoc).toHaveBeenCalledTimes(1));
    expect(addDoc).toHaveBeenCalledWith({ nom: 'entitats' }, { nom: 'Cineclub Nou', url: 'https://nou.test/', creatEl: 'ara' });
    expect(await screen.findByText("Llistat d'entitats")).toBeInTheDocument();
  });

  it('rebutja un nom repetit sense escriure res', async () => {
    const user = userEvent.setup();
    renderNova();
    await user.type(await screen.findByLabelText('Nom'), 'ateneu rodenc');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ja hi ha una entitat amb aquest nom.');
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('rebutja un nom amb comes sense escriure res', async () => {
    const user = userEvent.setup();
    renderNova();
    await user.type(await screen.findByLabelText('Nom'), 'Foo, Bar');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('El nom no pot contenir comes.');
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('en editar el nom és de només lectura amb ajuda, i desa només la URL canviada', async () => {
    const user = userEvent.setup();
    renderExistent();
    const nom = await screen.findByLabelText('Nom');
    expect(nom).toHaveValue('Ateneu Rodenc');
    expect(nom).toHaveAttribute('readonly');
    expect(screen.getByText('El nom no es pot canviar: les sessions el fan servir per triar-la')).toBeInTheDocument();
    const url = screen.getByLabelText('URL');
    await user.clear(url);
    await user.type(url, 'https://nova.test/');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
    expect(updateDoc).toHaveBeenCalledWith({ col: 'entitats', id: 'e1' }, { url: 'https://nova.test/' });
    expect(addDoc).not.toHaveBeenCalled();
    expect(await screen.findByText("Llistat d'entitats")).toBeInTheDocument();
  });

  it('puja el logo a Storage, el previsualitza i el desa amb «Desar»', async () => {
    const user = userEvent.setup();
    renderExistent();
    await screen.findByLabelText('Nom');
    const png = fitxer('logo-original.png', 'image/png');
    await user.upload(screen.getByLabelText('Pujar el logo'), png);
    const cami = 'web/entitats/ateneu-rodenc-1700000000000.png';
    const urlEsperada = `https://firebasestorage.googleapis.com/v0/b/bucket-prova/o/${encodeURIComponent(cami)}?alt=media`;
    await waitFor(() => expect(uploadBytes).toHaveBeenCalledWith({ cami }, png, { contentType: 'image/png' }));
    expect(await screen.findByRole('img', { name: 'Logo' })).toHaveAttribute('src', urlEsperada);
    expect(updateDoc).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
    expect(updateDoc).toHaveBeenCalledWith({ col: 'entitats', id: 'e1' }, { logo: urlEsperada });
  });

  it('rebutja un fitxer que no és JPG, PNG o WebP sense pujar-lo', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderExistent();
    await screen.findByLabelText('Nom');
    await user.upload(screen.getByLabelText('Pujar el logo'), fitxer('animat.gif', 'image/gif'));
    expect(await screen.findByRole('alert')).toHaveTextContent('La imatge ha de ser JPG, PNG o WebP.');
    expect(uploadBytes).not.toHaveBeenCalled();
    expect(screen.queryByRole('img', { name: 'Logo' })).not.toBeInTheDocument();
  });

  it('mostra l\'error si la pujada falla i no canvia el logo', async () => {
    uploadBytes.mockRejectedValueOnce(new Error('xarxa'));
    const user = userEvent.setup();
    renderExistent();
    await screen.findByLabelText('Nom');
    await user.upload(screen.getByLabelText('Pujar el logo'), fitxer('logo.png', 'image/png'));
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'ha pogut pujar la imatge. Torna-ho a provar.");
    expect(screen.queryByRole('img', { name: 'Logo' })).not.toBeInTheDocument();
  });

  it("«Treure el logo» buida el camp (logo: '') sense esborrar cap fitxer", async () => {
    getDoc.mockResolvedValue({ data: () => ({ nom: 'Ateneu Rodenc', logo: 'https://logos.test/a.png' }) });
    const user = userEvent.setup();
    renderExistent();
    expect(await screen.findByRole('img', { name: 'Logo' })).toHaveAttribute('src', 'https://logos.test/a.png');
    await user.click(screen.getByRole('button', { name: 'Treure el logo' }));
    expect(screen.queryByRole('img', { name: 'Logo' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await waitFor(() => expect(updateDoc).toHaveBeenCalledTimes(1));
    expect(updateDoc).toHaveBeenCalledWith({ col: 'entitats', id: 'e1' }, { logo: '' });
  });

  it('si la càrrega inicial falla, mostra un avís i no el carregador', async () => {
    getDocs.mockRejectedValue(new Error('permission-denied'));
    renderExistent();
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'han pogut carregar les entitats. Torna-ho a provar.");
    expect(screen.queryByText(/Carregant/)).not.toBeInTheDocument();
  });

  it('no esborra una entitat en ús: mostra el recompte i els títols de les sessions', async () => {
    respostesSessions = [[sessioAmbUs, { id: 's2', titol: 'Altra', publica: { organitza: 'Un altre' } }]];
    const user = userEvent.setup();
    renderExistent();
    await user.click(await screen.findByRole('button', { name: 'Esborrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("No es pot esborrar: l'usa 1 sessió (Pig)");
    expect(screen.getByRole('alert')).toHaveTextContent('Pig');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Altra');
    expect(hiHaDialegConfirmacio()).toBe(false);
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it('amb diverses sessions usa el plural: «l\'usen N sessions» i tots els títols', async () => {
    respostesSessions = [[sessioAmbUs, { id: 's3', titol: 'Bis', publica: { organitza: 'Ateneu Rodenc' } }]];
    const user = userEvent.setup();
    renderExistent();
    await user.click(await screen.findByRole('button', { name: 'Esborrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("No es pot esborrar: l'usen 2 sessions (Pig, Bis)");
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it('esborra una entitat sense ús després de confirmar', async () => {
    const user = userEvent.setup();
    renderExistent();
    await user.click(await screen.findByRole('button', { name: 'Esborrar' }));
    const dialeg = await dialegConfirmacio();
    expect(dialeg).toHaveAttribute('role', 'alertdialog');
    expect(dialeg).toHaveTextContent('Segur que vols esborrar aquesta entitat? Aquesta acció no es pot desfer.');
    expect(deleteDoc).not.toHaveBeenCalled();
    await acceptaDialeg('Esborra');
    await waitFor(() => expect(deleteDoc).toHaveBeenCalledTimes(1));
    expect(deleteDoc).toHaveBeenCalledWith({ col: 'entitats', id: 'e1' });
    expect(await screen.findByText("Llistat d'entitats")).toBeInTheDocument();
    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it('no esborra si l\'usuari cancel·la', async () => {
    const user = userEvent.setup();
    renderExistent();
    await user.click(await screen.findByRole('button', { name: 'Esborrar' }));
    await cancellaDialeg(user);
    await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Esborrar' })).toHaveFocus();
  });

  it('no esborra si l\'usuari tanca el diàleg amb ESC', async () => {
    const user = userEvent.setup();
    renderExistent();
    await user.click(await screen.findByRole('button', { name: 'Esborrar' }));
    await tancaDialegAmbEsc(user);
    await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it('consulta les sessions de nou en cada intent d\'esborrar', async () => {
    respostesSessions = [[], [sessioAmbUs]];
    const user = userEvent.setup();
    renderExistent();
    const boto = await screen.findByRole('button', { name: 'Esborrar' });
    await user.click(boto);
    await cancellaDialeg(user);
    await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
    await user.click(boto);
    expect(await screen.findByRole('alert')).toHaveTextContent("No es pot esborrar: l'usa 1 sessió (Pig)");
    expect(hiHaDialegConfirmacio()).toBe(false);
    const consultesSessions = getDocs.mock.calls.filter(([c]) => c.nom === 'sessions');
    expect(consultesSessions).toHaveLength(2);
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it('en crear no hi ha botó d\'esborrar', async () => {
    renderNova();
    await screen.findByLabelText('Nom');
    expect(screen.queryByRole('button', { name: 'Esborrar' })).not.toBeInTheDocument();
  });

  describe('layout estàndard', () => {
    it('és un formulari estret amb un sol h1 i l\'enllaç «← Entitats»', async () => {
      const { container } = renderExistent();
      await screen.findByLabelText('Nom');
      expect(container.firstChild.tagName).toBe('FORM');
      expect(container.firstChild).toHaveClass('pagina-admin', 'pagina-admin--formulari');
      const titols = screen.getAllByRole('heading', { level: 1 });
      expect(titols).toHaveLength(1);
      expect(titols[0]).toHaveTextContent('Entitat');
      expect(screen.getByRole('link', { name: '← Entitats' })).toHaveAttribute('href', '/entitats');
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
