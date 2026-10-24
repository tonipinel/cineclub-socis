import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {}, storage: { app: { options: { storageBucket: 'bucket-prova' } } } }));
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn().mockResolvedValue({ id: 'nova' }),
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

function renderNova() {
  return renderAmbConfirmacio(
    <MemoryRouter initialEntries={['/distribuidores/nova']}>
      <Routes>
        <Route path="/distribuidores/nova" element={<DistribuidoraForm />} />
        <Route path="/distribuidores" element={<p>Llistat de distribuïdores</p>} />
      </Routes>
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
const CAMI_LOGO = 'web/distribuidores/atalante-1700000000000.png';
const URL_LOGO = `https://firebasestorage.googleapis.com/v0/b/bucket-prova/o/${encodeURIComponent(CAMI_LOGO)}?alt=media`;

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

  it('crea una distribuïdora amb nom, web, persona i correu de contacte', async () => {
    const user = userEvent.setup();
    renderNova();
    await user.type(screen.getByLabelText('Nom'), '  Surtsey Films ');
    await user.type(screen.getByLabelText('Web'), 'surtseyfilms.com');
    await user.type(screen.getByLabelText('Persona de contacte'), 'Marta');
    await user.type(screen.getByLabelText('Correu electrònic de contacte'), 'marta@surtsey.test');
    await user.type(screen.getByLabelText('Preu per defecte (€)'), '150');
    await user.type(screen.getByLabelText('Condicions per defecte'), ' Projecció només en dimecres ');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByText('Llistat de distribuïdores')).toBeInTheDocument();
    expect(addDoc.mock.calls[0][1]).toEqual({
      nom: 'Surtsey Films',
      web: 'surtseyfilms.com',
      contacte: 'Marta',
      correu: 'marta@surtsey.test',
      preu: 150,
      condicions: 'Projecció només en dimecres',
    });
  });

  it('el preu i les condicions per defecte són opcionals', async () => {
    const user = userEvent.setup();
    renderNova();
    await user.type(screen.getByLabelText('Nom'), 'Atalante');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await screen.findByText('Llistat de distribuïdores');
    expect(addDoc.mock.calls[0][1]).toMatchObject({ preu: null, condicions: '' });
  });

  it('no deixa desar sense nom (ni només amb espais)', async () => {
    const user = userEvent.setup();
    renderNova();
    expect(screen.getByLabelText('Nom')).toBeRequired();
    await user.type(screen.getByLabelText('Nom'), '   ');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByText('El nom no pot estar en blanc.')).toBeInTheDocument();
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('en editar, els camps són de només lectura fins que es desbloqueja', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Atalante', web: '', contacte: '', correu: '' }) });
    const user = userEvent.setup();
    renderExistent();
    expect(await screen.findByLabelText('Nom')).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Desar' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Editar dades' }));
    await user.type(screen.getByLabelText('Web'), 'atalante.test');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await screen.findByText('Llistat de distribuïdores');
    expect(setDoc).toHaveBeenCalledWith({ col: 'distribuidores', id: 'd1' }, {
      nom: 'Atalante', web: 'atalante.test', contacte: '', correu: '', preu: null, condicions: '',
    });
  });

  it('elimina la distribuïdora després de confirmar si no la fa servir cap proposta', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Atalante' }) });
    const user = userEvent.setup();
    renderExistent();
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
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
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Atalante' }) });
    const user = userEvent.setup();
    renderExistent();
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    await tanca(user);
    await waitFor(() => expect(hiHaDialegConfirmacio()).toBe(false));
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(screen.queryByText('Llistat de distribuïdores')).not.toBeInTheDocument();
  });

  it('no deixa eliminar una distribuïdora que ja fa servir alguna proposta', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Atalante' }) });
    respostes.propostesInternes = [[{ id: 'p1' }, { id: 'p2' }]];
    const user = userEvent.setup();
    renderExistent();
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(await screen.findByText("No es pot eliminar: s'està fent servir en 2 proposta(es).")).toBeInTheDocument();
    expect(hiHaDialegConfirmacio()).toBe(false);
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it('desa una distribuïdora existent amb el logo i la pàgina web pública (objecte complet)', async () => {
    getDoc.mockResolvedValueOnce({ data: () => DISTRIBUIDORA_COMPLETA });
    const user = userEvent.setup();
    renderExistent();
    expect(await screen.findByLabelText('Pàgina web pública (enllaç des de la fitxa de la sessió)')).toHaveValue('https://atalante.test/portada');
    expect(screen.getByRole('img', { name: 'Logo' })).toHaveAttribute('src', 'https://logos.test/atalante.png');
    await user.click(screen.getByRole('button', { name: 'Editar dades' }));
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await screen.findByText('Llistat de distribuïdores');
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(setDoc).toHaveBeenCalledWith({ col: 'distribuidores', id: 'd1' }, DISTRIBUIDORA_COMPLETA);
  });

  it('editar només el nom conserva el logo i la pàgina web pública', async () => {
    getDoc.mockResolvedValueOnce({ data: () => DISTRIBUIDORA_COMPLETA });
    const user = userEvent.setup();
    renderExistent();
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    await user.clear(screen.getByLabelText('Nom'));
    await user.type(screen.getByLabelText('Nom'), 'Atalante Films');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await screen.findByText('Llistat de distribuïdores');
    expect(setDoc).toHaveBeenCalledWith({ col: 'distribuidores', id: 'd1' }, { ...DISTRIBUIDORA_COMPLETA, nom: 'Atalante Films' });
  });

  it('una distribuïdora sense logo ni pàgina pública es desa sense aquestes claus', async () => {
    const user = userEvent.setup();
    renderNova();
    await user.type(screen.getByLabelText('Nom'), 'Atalante');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await screen.findByText('Llistat de distribuïdores');
    const desada = addDoc.mock.calls[0][1];
    expect(desada).not.toHaveProperty('logo');
    expect(desada).not.toHaveProperty('urlPublica');
  });

  it('la pàgina web pública té una ajuda i, si és invàlida, mostra l\'error al camp i no desa res', async () => {
    const user = userEvent.setup();
    renderNova();
    const camp = screen.getByLabelText('Pàgina web pública (enllaç des de la fitxa de la sessió)');
    expect(camp).toHaveAttribute('id', 'urlPublica');
    const ajuda = screen.getByText('Pot ser la mateixa que «Web» o una altra, p. ex. la portada. Es mostra al lloc públic.');
    expect(camp.getAttribute('aria-describedby').split(' ')).toContain(ajuda.id);
    expect(camp).not.toHaveAttribute('aria-invalid', 'true');
    await user.type(screen.getByLabelText('Nom'), 'Atalante');
    await user.type(camp, 'atalante.test');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent("L'adreça ha de començar per http:// o https://.");
    expect(camp).toHaveAttribute('aria-invalid', 'true');
    expect(camp.getAttribute('aria-describedby').split(' ')).toEqual(expect.arrayContaining([ajuda.id, error.id]));
    expect(addDoc).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
    expect(screen.queryByText('Llistat de distribuïdores')).not.toBeInTheDocument();
  });

  it('puja el logo a Storage amb un camí propi, el previsualitza i el desa amb «Desar»', async () => {
    const user = userEvent.setup();
    renderNova();
    await user.type(screen.getByLabelText('Nom'), 'Atalante');
    const grup = screen.getByRole('group', { name: 'Logo' });
    const png = fitxer('logo-original.png', 'image/png');
    expect(grup).toContainElement(screen.getByLabelText('Pujar el logo'));
    await user.upload(screen.getByLabelText('Pujar el logo'), png);
    await waitFor(() => expect(uploadBytes).toHaveBeenCalledWith({ cami: CAMI_LOGO }, png, { contentType: 'image/png' }));
    expect(await screen.findByRole('img', { name: 'Logo' })).toHaveAttribute('src', URL_LOGO);
    expect(screen.getByLabelText('Canviar el logo')).toHaveAttribute('type', 'file');
    expect(addDoc).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await screen.findByText('Llistat de distribuïdores');
    expect(addDoc).toHaveBeenCalledWith({ nom: 'distribuidores' }, {
      nom: 'Atalante', web: '', contacte: '', correu: '', preu: null, condicions: '', logo: URL_LOGO,
    });
  });

  it.each([
    ['un GIF', fitxer('animat.gif', 'image/gif'), 'La imatge ha de ser JPG, PNG o WebP.'],
    ['una imatge de 11 MB', fitxer('gran.png', 'image/png', 11 * 1024 * 1024), 'La imatge no pot ocupar més de 10 MB.'],
  ])('rebutja %s sense pujar-lo', async (_nom, f, missatge) => {
    const user = userEvent.setup({ applyAccept: false });
    renderNova();
    await user.type(screen.getByLabelText('Nom'), 'Atalante');
    await user.upload(screen.getByLabelText('Pujar el logo'), f);
    expect(await screen.findByRole('alert')).toHaveTextContent(missatge);
    expect(uploadBytes).not.toHaveBeenCalled();
    expect(screen.queryByRole('img', { name: 'Logo' })).not.toBeInTheDocument();
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

  it('mostra l\'error si la pujada falla i no canvia el logo', async () => {
    uploadBytes.mockRejectedValueOnce(new Error('xarxa'));
    const user = userEvent.setup();
    renderNova();
    await user.type(screen.getByLabelText('Nom'), 'Atalante');
    await user.upload(screen.getByLabelText('Pujar el logo'), fitxer('logo.png', 'image/png'));
    expect(await screen.findByRole('alert')).toHaveTextContent("No s'ha pogut pujar la imatge. Torna-ho a provar.");
    expect(screen.queryByRole('img', { name: 'Logo' })).not.toBeInTheDocument();
  });

  it('«Treure el logo» buida el camp i en desar no hi ha logo (sense esborrar cap fitxer)', async () => {
    getDoc.mockResolvedValueOnce({ data: () => DISTRIBUIDORA_COMPLETA });
    const user = userEvent.setup();
    renderExistent();
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    await user.click(screen.getByRole('button', { name: 'Treure el logo' }));
    expect(screen.queryByRole('img', { name: 'Logo' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Pujar el logo')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    await screen.findByText('Llistat de distribuïdores');
    const { logo: _logo, ...senseLogo } = DISTRIBUIDORA_COMPLETA;
    expect(setDoc).toHaveBeenCalledWith({ col: 'distribuidores', id: 'd1' }, senseLogo);
  });

  it('en lectura es veu el logo però no es pot canviar ni treure', async () => {
    getDoc.mockResolvedValueOnce({ data: () => DISTRIBUIDORA_COMPLETA });
    renderExistent();
    expect(await screen.findByRole('img', { name: 'Logo' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Canviar el logo')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Treure el logo' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Pàgina web pública (enllaç des de la fitxa de la sessió)')).toHaveAttribute('readonly');
  });

  it('no deixa eliminar una distribuïdora que fa servir una sessió: «l\'usa 1 sessió» i el títol', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Atalante' }) });
    respostes.sessions = [[
      { id: 's1', titol: 'Pig', publica: { suportDistribucio: 'Atalante' } },
      { id: 's2', titol: 'Altra', publica: { suportDistribucio: 'Un altre' } },
    ]];
    const user = userEvent.setup();
    renderExistent();
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent("No es pot eliminar: l'usa 1 sessió (Pig)");
    expect(alerta).not.toHaveTextContent('Altra');
    expect(hiHaDialegConfirmacio()).toBe(false);
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it('amb diverses sessions usa el plural: «l\'usen N sessions» i tots els títols', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Atalante' }) });
    respostes.sessions = [[
      { id: 's1', titol: 'Pig', publica: { suportDistribucio: 'Atalante' } },
      { id: 's3', titol: 'Bis', publica: { suportDistribucio: 'Atalante' } },
    ]];
    const user = userEvent.setup();
    renderExistent();
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("No es pot eliminar: l'usen 2 sessions (Pig, Bis)");
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it('comprova l\'ús amb el nom desat, no amb el que s\'està editant', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Atalante' }) });
    respostes.sessions = [[{ id: 's1', titol: 'Pig', publica: { suportDistribucio: 'Atalante' } }]];
    const user = userEvent.setup();
    renderExistent();
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    await user.clear(screen.getByLabelText('Nom'));
    await user.type(screen.getByLabelText('Nom'), 'Atalante Films');
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("No es pot eliminar: l'usa 1 sessió (Pig)");
    expect(hiHaDialegConfirmacio()).toBe(false);
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it('no deixa eliminar si una sessió la referencia per id encara que el nom de la sessió sigui vell', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Atalante' }) });
    respostes.sessions = [[
      { id: 's1', titol: 'Pig', publica: { suportDistribucio: 'Atalante Films', suportDistribucioId: 'd1' } },
      { id: 's2', titol: 'Altra', publica: { suportDistribucio: 'Atalante Films', suportDistribucioId: 'd2' } },
    ]];
    const user = userEvent.setup();
    renderExistent();
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent("No es pot eliminar: l'usa 1 sessió (Pig)");
    expect(alerta).not.toHaveTextContent('Altra');
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it('l\'error de la pàgina web pública desapareix en tornar-la a editar', async () => {
    const user = userEvent.setup();
    renderNova();
    await user.type(screen.getByLabelText('Nom'), 'Atalante');
    const camp = screen.getByLabelText('Pàgina web pública (enllaç des de la fitxa de la sessió)');
    await user.type(camp, 'atalante.test');
    await user.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("L'adreça ha de començar per http:// o https://.");
    await user.type(camp, 'x');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(camp).not.toHaveAttribute('aria-invalid');
    expect(camp).toHaveAttribute('aria-describedby', 'urlPublica-ajuda');
  });

  it('consulta les sessions de nou en cada intent d\'eliminar', async () => {
    getDoc.mockResolvedValueOnce({ data: () => ({ nom: 'Atalante' }) });
    respostes.sessions = [[], [{ id: 's1', titol: 'Pig', publica: { suportDistribucio: 'Atalante' } }]];
    const user = userEvent.setup();
    renderExistent();
    await user.click(await screen.findByRole('button', { name: 'Editar dades' }));
    const boto = screen.getByRole('button', { name: 'Eliminar' });
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

describe('DistribuidoraForm: layout estàndard', () => {
  beforeEach(() => {
    getDoc.mockReset();
    getDoc.mockResolvedValue({ data: () => ({ nom: 'Atalante', condicions: 'Només dimecres' }) });
  });

  it('nova: formulari estret amb un sol h1 i l\'enllaç «← Distribuïdores»', () => {
    const { container } = renderNova();
    expect(container.firstChild.tagName).toBe('FORM');
    expect(container.firstChild).toHaveClass('pagina-admin', 'pagina-admin--formulari');
    const titols = screen.getAllByRole('heading', { level: 1 });
    expect(titols).toHaveLength(1);
    expect(titols[0]).toHaveTextContent('Nova distribuïdora');
    expect(screen.getByRole('link', { name: '← Distribuïdores' })).toHaveAttribute('href', '/distribuidores');
  });

  it('les condicions creixen amb el text i, en lectura, segueixen sent de només lectura', async () => {
    const user = userEvent.setup();
    renderExistent();
    const condicions = await screen.findByLabelText('Condicions per defecte');
    expect(condicions).toHaveClass('textarea-automatic', 'form__input--nomes-lectura');
    expect(condicions).toHaveAttribute('readonly');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Editar dades' }));
    expect(screen.getByLabelText('Condicions per defecte')).not.toHaveClass('form__input--nomes-lectura');
    expect(screen.getByLabelText('Condicions per defecte')).not.toHaveAttribute('readonly');
  });
});
