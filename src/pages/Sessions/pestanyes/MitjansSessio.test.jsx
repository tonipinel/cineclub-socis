import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEffect, useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../firebase/firebase', () => ({ storage: { app: { options: { storageBucket: 'bucket-prova' } } } }));
vi.mock('firebase/storage', () => ({
  ref: vi.fn((_storage, cami) => ({ cami })),
  uploadBytes: vi.fn().mockResolvedValue({}),
}));

import { ref, uploadBytes } from 'firebase/storage';
import { storage } from '../../../firebase/firebase';
import { publicaAFormulari } from '../../../lib/sessioPublica';
import MitjansSessio from './MitjansSessio';

// Migrades de PaginaPublicaSessio.test.jsx: pujada del cartell i de la galeria, validació i treure
// (el ↑ ↓ es prova a GaleriaImatges.test.jsx, perquè només surt sense arrossegament).
const canvis = {};

function Arnes({ publica, sessio = {} }) {
  const [form, setForm] = useState(publicaAFormulari(publica));
  useEffect(() => {
    canvis.form = form;
  }, [form]);
  return (
    <MitjansSessio
      dades={{ id: '1', titol: 'Pig', data: '2026-10-08', slug: '', ...sessio }}
      onCanviDades={() => {}}
      form={form}
      onCanviForm={(camp, valor) => setForm((f) => ({ ...f, [camp]: valor }))}
      errors={{}}
      altresSessions={[]}
      original={{}}
    />
  );
}

const fitxer = (nom, tipus, mida = 1000) => {
  const f = new File(['x'], nom, { type: tipus });
  Object.defineProperty(f, 'size', { value: mida });
  return f;
};

const url = (cami) => `https://firebasestorage.googleapis.com/v0/b/bucket-prova/o/${encodeURIComponent(cami)}?alt=media`;
const galeria = () => within(screen.getByRole('list', { name: 'Galeria' }));

describe('MitjansSessio', () => {
  beforeEach(() => {
    uploadBytes.mockReset();
    uploadBytes.mockResolvedValue({});
    ref.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('té el camp del tràiler', async () => {
    const user = userEvent.setup();
    render(<Arnes />);
    await user.type(screen.getByLabelText('Tràiler de YouTube (URL o id)'), 'dQw4w9WgXcQ');
    expect(canvis.form.trailerYoutubeId).toBe('dQw4w9WgXcQ');
  });

  it('previsualitza el tràiler només si s\'hi reconeix un id de YouTube', async () => {
    const user = userEvent.setup();
    render(<Arnes />);
    expect(screen.queryByTitle('Tràiler')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Tràiler de YouTube (URL o id)'), 'https://youtu.be/dQw4w9WgXcQ');
    const iframe = screen.getByTitle('Tràiler');
    expect(iframe.tagName).toBe('IFRAME');
    expect(iframe).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(iframe).toHaveAttribute('loading', 'lazy');
    await user.clear(screen.getByLabelText('Tràiler de YouTube (URL o id)'));
    expect(screen.queryByTitle('Tràiler')).not.toBeInTheDocument();
  });

  it('desactiva la pujada d\'imatges si no hi ha slug', () => {
    const { container } = render(<Arnes />);
    expect(screen.getByLabelText('Pujar cartell')).toBeDisabled();
    expect(screen.getByLabelText('Afegir imatges a la galeria')).toBeDisabled();
    expect(screen.getAllByText('Cal un slug per poder pujar imatges.')).toHaveLength(2);
    const zones = container.querySelectorAll('.zona-pujada');
    expect(zones).toHaveLength(2);
    zones.forEach((zona) => {
      expect(zona).toHaveClass('zona-pujada--deshabilitada');
      fireEvent.drop(zona, { dataTransfer: { files: [fitxer('a.jpg', 'image/jpeg')] } });
    });
    expect(uploadBytes).not.toHaveBeenCalled();
  });

  it('mostra el cartell actual o «Sense cartell.»', () => {
    const { unmount } = render(<Arnes />);
    expect(screen.getByText('Sense cartell.')).toBeInTheDocument();
    unmount();
    render(<Arnes publica={{ cartell: 'https://x/c.jpg' }} />);
    expect(screen.getByRole('img', { name: 'Cartell' })).toHaveAttribute('src', 'https://x/c.jpg');
  });

  it('rebutja imatges d\'un tipus o una mida no permesos sense pujar-les', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<Arnes sessio={{ slug: 'pig' }} />);
    await user.upload(screen.getByLabelText('Pujar cartell'), fitxer('a.gif', 'image/gif'));
    expect(await screen.findByRole('alert')).toHaveTextContent('a.gif: La imatge ha de ser JPG, PNG o WebP.');
    await user.upload(screen.getByLabelText('Pujar cartell'), fitxer('a.jpg', 'image/jpeg', 11 * 1024 * 1024));
    expect(await screen.findByRole('alert')).toHaveTextContent('a.jpg: La imatge no pot ocupar més de 10 MB.');
    expect(uploadBytes).not.toHaveBeenCalled();
    expect(canvis.form.cartell).toBe('');
  });

  it('puja el cartell a web/sessions/<slug>/ i en desa la URL pública', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    const user = userEvent.setup();
    render(<Arnes sessio={{ slug: 'pig' }} publica={{ cartell: 'https://x/carteils/vell.jpg' }} />);
    expect(screen.getByRole('img', { name: 'Cartell' })).toHaveAttribute('src', 'https://x/carteils/vell.jpg');
    await user.upload(screen.getByLabelText('Pujar cartell'), fitxer('El meu cartell!.png', 'image/png'));
    await vi.waitFor(() => expect(uploadBytes).toHaveBeenCalledTimes(1));
    expect(ref).toHaveBeenCalledWith(expect.anything(), 'web/sessions/pig/poster-1700000000000.png');
    expect(uploadBytes.mock.calls[0][2]).toEqual({ contentType: 'image/png' });
    await vi.waitFor(() => expect(canvis.form.cartell).toBe(url('web/sessions/pig/poster-1700000000000.png')));
    expect(screen.getByRole('status')).toHaveTextContent('El meu cartell!.png: pujada');
  });

  it('pujar 3 fitxers amb 1 d\'invàlid afegeix els 2 vàlids en ordre i mostra l\'error del tercer', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(5);
    const user = userEvent.setup({ applyAccept: false });
    render(<Arnes sessio={{ slug: 'pig' }} publica={{ galeria: ['https://x/a.jpg'] }} />);
    await user.upload(screen.getByLabelText('Afegir imatges a la galeria'), [
      fitxer('b.jpg', 'image/jpeg'), fitxer('c.webp', 'image/webp'), fitxer('d.gif', 'image/gif'),
    ]);
    await vi.waitFor(() => expect(canvis.form.galeria).toEqual([
      'https://x/a.jpg', url('web/sessions/pig/gallery-5-1.jpg'), url('web/sessions/pig/gallery-5-2.webp'),
    ]));
    expect(uploadBytes).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole('alert')).toHaveTextContent('d.gif: La imatge ha de ser JPG, PNG o WebP.');
    expect(galeria().getAllByRole('img')).toHaveLength(3);
  });

  it('afegeix imatges a la galeria i les treu de la llista', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(5);
    const user = userEvent.setup();
    render(<Arnes sessio={{ slug: 'pig' }} publica={{ galeria: ['https://x/a.jpg'] }} />);
    await user.upload(screen.getByLabelText('Afegir imatges a la galeria'), [fitxer('b.jpg', 'image/jpeg'), fitxer('c.webp', 'image/webp')]);
    await vi.waitFor(() => expect(canvis.form.galeria).toHaveLength(3));
    expect(ref).toHaveBeenCalledWith(expect.anything(), 'web/sessions/pig/gallery-5-1.jpg');
    expect(ref).toHaveBeenCalledWith(expect.anything(), 'web/sessions/pig/gallery-5-2.webp');
    await user.click(galeria().getByRole('button', { name: 'Treure la imatge 2' }));
    expect(canvis.form.galeria).toEqual(['https://x/a.jpg', url('web/sessions/pig/gallery-5-2.webp')]);
  });

  it('tornar a pujar una imatge que ja és a la galeria no la duplica', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(5);
    const user = userEvent.setup();
    const existent = url('web/sessions/pig/gallery-5-1.jpg');
    render(<Arnes sessio={{ slug: 'pig' }} publica={{ galeria: [existent, 'https://x/a.jpg'] }} />);
    await user.upload(screen.getByLabelText('Afegir imatges a la galeria'), [fitxer('b.jpg', 'image/jpeg'), fitxer('c.png', 'image/png')]);
    await vi.waitFor(() => expect(uploadBytes).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(canvis.form.galeria).toEqual([existent, 'https://x/a.jpg', url('web/sessions/pig/gallery-5-2.png')]));
    expect(galeria().getAllByRole('img')).toHaveLength(3);
  });

  it('treure una imatge mentre es puja no es perd quan la pujada acaba', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(5);
    let acabar;
    uploadBytes.mockImplementationOnce(() => new Promise((resolve) => { acabar = resolve; }));
    const user = userEvent.setup();
    render(<Arnes sessio={{ slug: 'pig' }} publica={{ galeria: ['https://x/a.jpg', 'https://x/b.jpg'] }} />);
    await user.upload(screen.getByLabelText('Afegir imatges a la galeria'), fitxer('c.jpg', 'image/jpeg'));
    await vi.waitFor(() => expect(uploadBytes).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('Afegir imatges a la galeria')).toBeDisabled();
    // dnd-kit també té una regió role="status" (els anuncis), per això es busca pel text.
    expect(screen.getByText('c.jpg: pujant…').closest('[role="status"]')).toBeInTheDocument();
    await user.click(galeria().getByRole('button', { name: 'Treure la imatge 1' }));
    expect(canvis.form.galeria).toEqual(['https://x/b.jpg']);
    await act(async () => acabar({}));
    await vi.waitFor(() => expect(canvis.form.galeria).toEqual(['https://x/b.jpg', url('web/sessions/pig/gallery-5-1.jpg')]));
    expect(screen.getByLabelText('Afegir imatges a la galeria')).toBeEnabled();
  });

  it('si la pujada falla de manera inesperada, les zones tornen a estar habilitades', async () => {
    vi.spyOn(storage.app, 'options', 'get').mockImplementation(() => { throw new Error('inesperat'); });
    const user = userEvent.setup();
    render(<Arnes sessio={{ slug: 'pig' }} />);
    const entrada = screen.getByLabelText('Afegir imatges a la galeria');
    // L'error surt de pujarImatges: la promesa del gestor es rebutja i no hi ha qui la reculli (el vitest la donaria per fallada).
    const noGestionats = [];
    const anteriors = globalThis.process.listeners('unhandledRejection');
    globalThis.process.removeAllListeners('unhandledRejection');
    globalThis.process.on('unhandledRejection', (motiu) => noGestionats.push(motiu));
    await user.upload(entrada, fitxer('c.jpg', 'image/jpeg'));
    await vi.waitFor(() => expect(noGestionats).toHaveLength(1));
    expect(uploadBytes).not.toHaveBeenCalled();
    expect(entrada).toBeEnabled();
    expect(screen.getByLabelText('Pujar cartell')).toBeEnabled();
    expect(noGestionats[0].message).toBe('inesperat');
    globalThis.process.removeAllListeners('unhandledRejection');
    anteriors.forEach((l) => globalThis.process.on('unhandledRejection', l));
  });

  it('fa preventDefault dels dragover/drop de fitxers fora de la zona, i deixa de fer-ho en desmuntar', () => {
    const dropAmbFitxers = () => {
      const e = new Event('drop', { bubbles: true, cancelable: true });
      e.dataTransfer = { types: ['Files'], files: [fitxer('a.jpg', 'image/jpeg')] };
      document.body.dispatchEvent(e);
      return e;
    };
    const { unmount } = render(<Arnes sessio={{ slug: 'pig' }} />);
    expect(dropAmbFitxers().defaultPrevented).toBe(true);
    const dragover = new Event('dragover', { bubbles: true, cancelable: true });
    dragover.dataTransfer = { types: ['Files'] };
    document.body.dispatchEvent(dragover);
    expect(dragover.defaultPrevented).toBe(true);
    const text = new Event('drop', { bubbles: true, cancelable: true });
    text.dataTransfer = { types: ['text/plain'], files: [] };
    document.body.dispatchEvent(text);
    expect(text.defaultPrevented).toBe(false);
    unmount();
    expect(dropAmbFitxers().defaultPrevented).toBe(false);
  });

  it('«Fer cartell» posa la imatge de la galeria com a cartell i la manté a la galeria', async () => {
    const user = userEvent.setup();
    render(<Arnes sessio={{ slug: 'pig' }} publica={{ galeria: ['https://x/a.jpg', 'https://x/b.jpg'] }} />);
    await user.click(galeria().getByRole('button', { name: 'Fer cartell la imatge 2' }));
    expect(canvis.form.cartell).toBe('https://x/b.jpg');
    expect(canvis.form.galeria).toEqual(['https://x/a.jpg', 'https://x/b.jpg']);
    expect(screen.getByRole('img', { name: 'Cartell' })).toHaveAttribute('src', 'https://x/b.jpg');
    expect(galeria().getByRole('button', { name: 'Fer cartell la imatge 2' })).toBeDisabled();
  });
});
