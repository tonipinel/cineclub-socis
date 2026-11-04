import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn().mockResolvedValue({ id: 'f9' }),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  doc: vi.fn((_db, col, id) => ({ col, id })),
  collection: vi.fn((_db, nom) => ({ nom })),
  serverTimestamp: vi.fn(() => 'ara'),
}));

import {
  addDoc, getDoc, getDocs, onSnapshot, updateDoc,
} from 'firebase/firestore';
import FlyerForm from './FlyerForm';
import { renderAmbConfirmacio } from '../../test/confirmacio';

const sessio = (id, data, extra = {}) => ({
  id, data, hora: '20:00', titol: `Film ${id}`, publicada: true, publica: { versioTipus: 'vosc' }, ...extra,
});
const SESSIONS = [
  sessio('s1', '2026-11-03'), sessio('s2', '2026-11-10'), sessio('s3', '2026-11-17'), sessio('s4', '2026-11-24'),
  sessio('fora', '2026-12-05'),
  sessio('draft', '2026-11-12', { publicada: false }),
];
const resposta = (llista) => ({ docs: llista.map(({ id, ...d }) => ({ id, data: () => d })) });

let sessions;
let flyer;
beforeEach(() => {
  vi.clearAllMocks();
  sessions = SESSIONS;
  flyer = null;
  getDocs.mockImplementation(async () => resposta(sessions));
  getDoc.mockImplementation(async () => ({ data: () => flyer }));
});

const renderNou = () => renderAmbConfirmacio(
  <MemoryRouter initialEntries={['/flyers/nou']}>
    <Routes>
      <Route path="/flyers/nou" element={<FlyerForm />} />
      <Route path="/flyers/:id" element={<p>Fitxa creada</p>} />
      <Route path="/flyers" element={<p>Llistat de flyers</p>} />
    </Routes>
  </MemoryRouter>
);
const renderExistent = () => renderAmbConfirmacio(
  <MemoryRouter initialEntries={['/flyers/f1']}>
    <Routes>
      <Route path="/flyers/:id" element={<FlyerForm />} />
      <Route path="/flyers" element={<p>Llistat de flyers</p>} />
    </Routes>
  </MemoryRouter>
);

const base = (s) => ({
  data: s.data, hora: s.hora, titol: s.titol, versioTipus: 'vosc', publicada: true,
});
const flyerExistent = (extra = {}) => ({
  nom: 'Novembre', desde: '2026-11-01', fins: '2026-11-30', estat: 'esborrany', clauPrevia: 'abc123', sessionsIds: ['s1', 's2', 's3'], ...extra,
});

const omple = async () => {
  await screen.findByLabelText('Nom');
  fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Novembre' } });
  fireEvent.change(screen.getByLabelText('Des de'), { target: { value: '2026-11-01' } });
  fireEvent.change(screen.getByLabelText('Fins a'), { target: { value: '2026-11-30' } });
};
const casella = (titol) => screen.getByRole('checkbox', { name: new RegExp(titol) });

describe('FlyerForm', () => {
  it('en canviar les dates marca les sessions publicades del rang i es pot desmarcar una', async () => {
    renderNou();
    await omple();
    expect(casella('Film s1')).toBeChecked();
    expect(casella('Film s4')).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: /Film fora/ })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /Film draft/ })).toBeNull();
    await userEvent.click(casella('Film s2'));
    expect(casella('Film s2')).not.toBeChecked();
    expect(screen.getByText('Sessions (3)')).toBeInTheDocument();
  });

  it('amb menys de 3 marcades Publicar és desactivat i surt l\'error', async () => {
    renderNou();
    await omple();
    await userEvent.click(casella('Film s1'));
    await userEvent.click(casella('Film s2'));
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled();
    expect(screen.getByText('Calen almenys 3 sessions.')).toBeInTheDocument();
  });

  it('una sessió sense versió bloqueja Publicar i en diu el títol', async () => {
    sessions = [...SESSIONS, sessio('s0', '2026-11-05', { publica: {} })];
    renderNou();
    await omple();
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled();
    expect(screen.getAllByText('«Film s0» no té versió.').length).toBeGreaterThan(0);
    expect(screen.getByText('Falta la versió')).toBeInTheDocument();
  });

  it('amb 7 sessions només avisa', async () => {
    sessions = Array.from({ length: 7 }, (_, i) => sessio(`m${i}`, `2026-11-0${i + 1}`));
    renderNou();
    await omple();
    expect(screen.getByText(/Més de 6 sessions/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeEnabled();
  });

  it('en publicar escriu estat, publicatEl, base, sessionsIds i la clau prèvia', async () => {
    renderNou();
    await omple();
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    await waitFor(() => expect(addDoc).toHaveBeenCalled());
    const dades = addDoc.mock.calls[0][1];
    expect(dades).toMatchObject({
      nom: 'Novembre', desde: '2026-11-01', fins: '2026-11-30', estat: 'publicat', publicatEl: 'ara', sessionsIds: ['s1', 's2', 's3', 's4'],
    });
    expect(dades.base).toEqual({ s1: base(SESSIONS[0]), s2: base(SESSIONS[1]), s3: base(SESSIONS[2]), s4: base(SESSIONS[3]) });
    expect(dades.clauPrevia).toMatch(/^[a-z0-9]{24}$/);
    expect(dades).not.toHaveProperty('pdfs');
    expect(await screen.findByText('Fitxa creada')).toBeInTheDocument();
  });

  it('desar un alta crea un esborrany sense base ni publicatEl', async () => {
    renderNou();
    await omple();
    await userEvent.click(screen.getByRole('button', { name: 'Desar' }));
    await waitFor(() => expect(addDoc).toHaveBeenCalled());
    const dades = addDoc.mock.calls[0][1];
    expect(dades.estat).toBe('esborrany');
    expect(dades).not.toHaveProperty('publicatEl');
    expect(dades).not.toHaveProperty('base');
  });

  it('la base no té cap camp undefined (sessió sense hora)', async () => {
    sessions = [
      { id: 'a', data: '2026-11-03', titol: 'A', publicada: true, publica: { versioTipus: 'vo' } },
      sessio('b', '2026-11-04'), sessio('c', '2026-11-05'),
    ];
    renderNou();
    await omple();
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    await waitFor(() => expect(addDoc).toHaveBeenCalled());
    const { base: b } = addDoc.mock.calls[0][1];
    expect(Object.values(b).flatMap(Object.values)).not.toContain(undefined);
    expect(b.a).not.toHaveProperty('hora');
  });

  it('retocar un flyer publicat conserva publicatEl i no el torna a escriure', async () => {
    flyer = flyerExistent({
      estat: 'publicat', publicatEl: 'abans', base: { s1: base(SESSIONS[0]), s2: base(SESSIONS[1]), s3: { ...base(SESSIONS[2]), hora: '19:00' } },
    });
    renderExistent();
    await screen.findByLabelText('Nom');
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Novembre 2026' } });
    await userEvent.click(screen.getByRole('button', { name: 'Desar' }));
    await waitFor(() => expect(updateDoc).toHaveBeenCalled());
    const canvis = updateDoc.mock.calls[0][1];
    expect(canvis.nom).toBe('Novembre 2026');
    expect(canvis).not.toHaveProperty('publicatEl');
    expect(canvis).not.toHaveProperty('estat');
    expect(Object.keys(canvis.base)).toEqual(['s1', 's2', 's3']);
    expect(canvis.base.s3).toEqual({ ...base(SESSIONS[2]), hora: '19:00' });
    expect(screen.queryByRole('button', { name: 'Publicar' })).toBeNull();
  });

  it('un flyer desactualitzat mostra l\'avís i «Marcar com a revisat» refà la base', async () => {
    flyer = flyerExistent({
      estat: 'publicat', publicatEl: 'abans', base: { s1: base(SESSIONS[0]), s2: base(SESSIONS[1]), s3: { ...base(SESSIONS[2]), hora: '19:00' } },
    });
    renderExistent();
    expect(await screen.findByText('Aquest flyer és desactualitzat')).toBeInTheDocument();
    expect(screen.getByText('Film s3: ha canviat l\'hora')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Marcar com a revisat' }));
    await waitFor(() => expect(updateDoc).toHaveBeenCalled());
    expect(updateDoc.mock.calls[0][1].base).toEqual({ s1: base(SESSIONS[0]), s2: base(SESSIONS[1]), s3: base(SESSIONS[2]) });
    await waitFor(() => expect(screen.queryByText('Aquest flyer és desactualitzat')).toBeNull());
  });

  it('els enllaços d\'un esborrany porten la clau; el publicat té «Copiar l\'enllaç»', async () => {
    flyer = flyerExistent();
    const { unmount } = renderExistent();
    const previ = await screen.findByRole('link', { name: 'Previsualització de la pàgina' });
    expect(previ).toHaveAttribute('href', 'https://cineclubrodadebera.cat/flyer/f1/?clau=abc123');
    expect(screen.queryByRole('button', { name: "Copiar l'enllaç" })).toBeNull();
    unmount();

    flyer = flyerExistent({ estat: 'publicat', publicatEl: 'abans', base: {} });
    renderExistent();
    expect(await screen.findByRole('link', { name: 'Pàgina pública' })).toHaveAttribute('href', 'https://cineclubrodadebera.cat/flyer/f1/');
    expect(screen.getByRole('button', { name: "Copiar l'enllaç" })).toBeInTheDocument();
  });

  it('desar sense nom mostra l\'error i no escriu', async () => {
    renderNou();
    await screen.findByLabelText('Nom');
    fireEvent.change(screen.getByLabelText('Des de'), { target: { value: '2026-11-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findAllByText('Cal un nom.')).not.toHaveLength(0);
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('un flyer publicat no es pot desar amb menys de 3 sessions', async () => {
    flyer = flyerExistent({ estat: 'publicat', publicatEl: 'abans', base: {} });
    renderExistent();
    await screen.findByLabelText('Nom');
    await userEvent.click(casella('Film s1'));
    await userEvent.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findAllByText(/Calen almenys 3 sessions/)).not.toHaveLength(0);
    expect(updateDoc).not.toHaveBeenCalled();
    expect(document.querySelector('.barra-desar')).toHaveTextContent('Sessions');
  });

  it('un flyer publicat no es pot desar amb una sessió sense versió', async () => {
    sessions = [...SESSIONS, sessio('s0', '2026-11-05', { publica: {} })];
    flyer = flyerExistent({ estat: 'publicat', publicatEl: 'abans', sessionsIds: ['s1', 's2', 's3', 's0'], base: {} });
    renderExistent();
    await screen.findByLabelText('Nom');
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Altre' } });
    await userEvent.click(screen.getByRole('button', { name: 'Desar' }));
    expect(await screen.findAllByText(/«Film s0» no té versió/)).not.toHaveLength(0);
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('amb el nom buit Publicar mostra l\'error del camp', async () => {
    renderNou();
    await screen.findByLabelText('Nom');
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled();
    expect(screen.getByText('Cal un nom.')).toBeInTheDocument();
  });

  describe('estat dels PDF', () => {
    const ts = (data) => ({ toDate: () => data });
    const generat = new Date(2026, 10, 5, 19, 30);
    const pdfs = () => ({
      simple: { path: 'a', firma: 'x', generatEl: ts(generat) },
      impremta: { path: 'b', firma: 'y', generatEl: ts(generat) },
    });

    it('sense pdfs mostra «PDF en preparació…» i cap enllaç de PDF', async () => {
      flyer = flyerExistent();
      renderExistent();
      expect(await screen.findByText('PDF en preparació…')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'PDF simple' })).toBeNull();
      expect(screen.queryByRole('link', { name: 'PDF per a impremta' })).toBeNull();
    });

    it('amb només una variant segueix en preparació', async () => {
      flyer = flyerExistent({ pdfs: { simple: pdfs().simple } });
      renderExistent();
      expect(await screen.findByText('PDF en preparació…')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'PDF simple' })).toBeNull();
    });

    it('amb pdfs mostra els enllaços (amb la clau) i la data de generació', async () => {
      flyer = flyerExistent({ pdfs: pdfs(), actualitzatEl: ts(new Date(2026, 10, 5, 19, 0)) });
      renderExistent();
      expect(await screen.findByRole('link', { name: 'PDF simple' })).toHaveAttribute('href', 'https://cineclubrodadebera.cat/flyer/f1/flyer.pdf?clau=abc123');
      expect(screen.getByRole('link', { name: 'PDF per a impremta' })).toHaveAttribute('href', expect.stringContaining('variant=impremta&clau=abc123'));
      expect(screen.getAllByText(/generat el 05\/11\/2026 19:30/)).toHaveLength(2);
      expect(screen.queryByText('PDF en preparació…')).toBeNull();
      expect(screen.queryByText("S'està actualitzant…")).toBeNull();
    });

    it('si el PDF és anterior al darrer desat mostra «S\'està actualitzant…»', async () => {
      flyer = flyerExistent({ pdfs: pdfs(), actualitzatEl: ts(new Date(2026, 10, 5, 20, 0)) });
      renderExistent();
      expect(await screen.findByText("S'està actualitzant…")).toBeInTheDocument();
    });

    it('l\'actualització en viu dels pdfs no trepitja les edicions sense desar', async () => {
      flyer = flyerExistent();
      let alSnapshot;
      onSnapshot.mockImplementationOnce((_ref, cb) => { alSnapshot = cb; return () => {}; });
      renderExistent();
      await screen.findByLabelText('Nom');
      fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Editat' } });
      act(() => alSnapshot({ data: () => ({ ...flyerExistent({ nom: 'Del servidor' }), pdfs: pdfs() }) }));
      expect(await screen.findByRole('link', { name: 'PDF simple' })).toBeInTheDocument();
      expect(screen.getByLabelText('Nom')).toHaveValue('Editat');
    });

    it('amb actualitzatEl pendent (null) no mostra l\'avís ni falla', async () => {
      flyer = flyerExistent({ pdfs: pdfs(), actualitzatEl: null });
      renderExistent();
      expect(await screen.findByRole('link', { name: 'PDF simple' })).toBeInTheDocument();
      expect(screen.queryByText("S'està actualitzant…")).toBeNull();
    });

    it('desfà la subscripció en desmuntar', async () => {
      flyer = flyerExistent();
      const desfa = vi.fn();
      onSnapshot.mockImplementationOnce(() => desfa);
      const { unmount } = renderExistent();
      await screen.findByLabelText('Nom');
      unmount();
      expect(desfa).toHaveBeenCalled();
    });

    it('un snapshot sense dades no falla i conserva l\'estat', async () => {
      flyer = flyerExistent({ pdfs: pdfs() });
      let alSnapshot;
      onSnapshot.mockImplementationOnce((_ref, cb) => { alSnapshot = cb; return () => {}; });
      renderExistent();
      await screen.findByRole('link', { name: 'PDF simple' });
      act(() => alSnapshot({ data: () => undefined }));
      expect(screen.getByRole('link', { name: 'PDF simple' })).toBeInTheDocument();
    });

    it('si el snapshot falla mostra l\'avís, conserva els pdfs i el formulari segueix funcionant', async () => {
      flyer = flyerExistent({ pdfs: pdfs() });
      let alError;
      onSnapshot.mockImplementationOnce((_ref, _cb, err) => { alError = err; return () => {}; });
      renderExistent();
      await screen.findByRole('link', { name: 'PDF simple' });
      act(() => alError(new Error('permission-denied')));
      expect(screen.getByText("No s'ha pogut actualitzar l'estat dels PDF.")).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'PDF simple' })).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Editat' } });
      expect(screen.getByLabelText('Nom')).toHaveValue('Editat');
    });
  });
});
