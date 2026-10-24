import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

vi.mock('../firebase/firebase', () => ({ storage: { app: { options: { storageBucket: 'bucket-prova' } } } }));
vi.mock('firebase/storage', () => ({
  ref: vi.fn((_storage, cami) => ({ cami })),
  uploadBytes: vi.fn().mockResolvedValue({}),
}));

import { uploadBytes } from 'firebase/storage';
import CampLogo from './CampLogo';

const fitxer = (nom, tipus, mida = 1) => new File(['x'.repeat(mida)], nom, { type: tipus });
const cami = vi.fn((nom, f, instant) => `web/prova/${nom.toLowerCase()}-${instant}.png`);
const URL_PUJADA = `https://firebasestorage.googleapis.com/v0/b/bucket-prova/o/${encodeURIComponent('web/prova/atalante-1700000000000.png')}?alt=media`;

// Com el fa servir una fitxa: el logo és un valor del formulari i `pujant` bloqueja la resta.
function Fitxa({ inicial = '', nom: nomInicial = 'Atalante', onCanvia = () => {} }) {
  const [logo, setLogo] = useState(inicial);
  const [nom, setNom] = useState(nomInicial);
  const [pujant, setPujant] = useState(false);
  return (
    <>
      <label htmlFor="nom">Nom</label>
      <input id="nom" value={nom} onChange={(e) => setNom(e.target.value)} />
      <button type="button" onClick={() => setLogo(inicial)}>Descartar canvis</button>
      <CampLogo
        logo={logo}
        nom={nom}
        cami={cami}
        pujant={pujant}
        onPujant={setPujant}
        onCanvia={(v) => { setLogo(v); onCanvia(v); }}
      />
      <p data-testid="pujant">{String(pujant)}</p>
    </>
  );
}

const grup = () => screen.getByRole('group', { name: 'Logo' });
const previsualitzacio = () => grup().querySelector('img');

describe('CampLogo', () => {
  beforeEach(() => {
    uploadBytes.mockClear();
    cami.mockClear();
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
  });
  afterEach(() => vi.restoreAllMocks());

  it('és un grup «Logo» amb el selector «Pujar el logo» i l\'ajuda vinculada', () => {
    render(<Fitxa />);
    const g = grup();
    expect(g).toContainElement(screen.getByLabelText('Pujar el logo'));
    expect(screen.getByLabelText('Pujar el logo')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    const ajuda = screen.getByText('JPG, PNG o WebP, fins a 10 MB.');
    expect(g).toHaveAttribute('aria-describedby', ajuda.id);
    expect(previsualitzacio()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Treure el logo' })).not.toBeInTheDocument();
  });

  it('amb logo, la previsualització és decorativa (alt buit) i hi ha «Canviar el logo» i «Treure el logo»', () => {
    render(<Fitxa inicial="https://logos.test/a.png" />);
    expect(previsualitzacio()).toHaveAttribute('src', 'https://logos.test/a.png');
    expect(previsualitzacio()).toHaveAttribute('alt', '');
    expect(within(grup()).queryByRole('img')).not.toBeInTheDocument();
    expect(grup()).toContainElement(screen.getByLabelText('Canviar el logo'));
    expect(grup()).toContainElement(screen.getByRole('button', { name: 'Treure el logo' }));
  });

  it('puja el fitxer amb el camí de la fitxa i passa la URL pública com a canvi', async () => {
    const onCanvia = vi.fn();
    const user = userEvent.setup();
    render(<Fitxa onCanvia={onCanvia} />);
    const png = fitxer('logo.png', 'image/png');
    await user.upload(screen.getByLabelText('Pujar el logo'), png);
    await waitFor(() => expect(onCanvia).toHaveBeenCalledWith(URL_PUJADA));
    expect(cami).toHaveBeenCalledWith('Atalante', png, 1700000000000);
    expect(uploadBytes).toHaveBeenCalledWith({ cami: 'web/prova/atalante-1700000000000.png' }, png, { contentType: 'image/png' });
    expect(previsualitzacio()).toHaveAttribute('src', URL_PUJADA);
    expect(screen.getByLabelText('Canviar el logo')).toBeInTheDocument();
  });

  it('mentre puja, avisa la fitxa i deshabilita el selector i «Treure el logo»', async () => {
    let resol;
    uploadBytes.mockImplementationOnce(() => new Promise((r) => { resol = r; }));
    const user = userEvent.setup();
    render(<Fitxa inicial="https://logos.test/a.png" />);
    await user.upload(screen.getByLabelText('Canviar el logo'), fitxer('logo.png', 'image/png'));
    expect(screen.getByTestId('pujant')).toHaveTextContent('true');
    expect(screen.getByLabelText('Canviar el logo')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Treure el logo' })).toBeDisabled();
    resol({});
    await waitFor(() => expect(screen.getByTestId('pujant')).toHaveTextContent('false'));
    expect(screen.getByRole('button', { name: 'Treure el logo' })).toBeEnabled();
  });

  it('«Treure el logo» passa un logo buit', async () => {
    const onCanvia = vi.fn();
    const user = userEvent.setup();
    render(<Fitxa inicial="https://logos.test/a.png" onCanvia={onCanvia} />);
    await user.click(screen.getByRole('button', { name: 'Treure el logo' }));
    expect(onCanvia).toHaveBeenCalledWith('');
    expect(previsualitzacio()).toBeNull();
  });

  it.each([
    ['sense nom', '  ', fitxer('logo.png', 'image/png'), 'Escriu primer el nom per poder pujar el logo.'],
    ['un GIF', 'Atalante', fitxer('animat.gif', 'image/gif'), 'La imatge ha de ser JPG, PNG o WebP.'],
    ['una imatge massa gran', 'Atalante', fitxer('gran.png', 'image/png', 11 * 1024 * 1024), 'La imatge no pot ocupar més de 10 MB.'],
  ])('rebutja %s dins del grup, sense pujar res', async (_cas, nom, f, missatge) => {
    const onCanvia = vi.fn();
    const user = userEvent.setup({ applyAccept: false });
    render(<Fitxa nom={nom} onCanvia={onCanvia} />);
    await user.upload(screen.getByLabelText('Pujar el logo'), f);
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(missatge);
    expect(grup()).toContainElement(alerta);
    expect(grup().getAttribute('aria-describedby').split(' ')).toEqual(['logo-ajuda', alerta.id]);
    expect(uploadBytes).not.toHaveBeenCalled();
    expect(onCanvia).not.toHaveBeenCalled();
  });

  it('si la pujada falla, ho diu al grup, no canvia el logo i deixa de bloquejar', async () => {
    uploadBytes.mockRejectedValueOnce(new Error('xarxa'));
    const onCanvia = vi.fn();
    const user = userEvent.setup();
    render(<Fitxa onCanvia={onCanvia} />);
    await user.upload(screen.getByLabelText('Pujar el logo'), fitxer('logo.png', 'image/png'));
    expect(await within(grup()).findByRole('alert')).toHaveTextContent("No s'ha pogut pujar la imatge. Torna-ho a provar.");
    expect(onCanvia).not.toHaveBeenCalled();
    expect(screen.getByTestId('pujant')).toHaveTextContent('false');
  });

  it('un nou intent esborra l\'error anterior', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<Fitxa />);
    await user.upload(screen.getByLabelText('Pujar el logo'), fitxer('animat.gif', 'image/gif'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await user.upload(screen.getByLabelText('Pujar el logo'), fitxer('logo.png', 'image/png'));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('escriure el nom esborra l\'avís de «Escriu primer el nom»', async () => {
    const user = userEvent.setup();
    render(<Fitxa nom="" />);
    await user.upload(screen.getByLabelText('Pujar el logo'), fitxer('logo.png', 'image/png'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Escriu primer el nom per poder pujar el logo.');
    await user.type(screen.getByLabelText('Nom'), 'A');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(grup()).toHaveAttribute('aria-describedby', 'logo-ajuda');
  });

  it('treure el logo esborra l\'error de pujada', async () => {
    uploadBytes.mockRejectedValueOnce(new Error('xarxa'));
    const user = userEvent.setup();
    render(<Fitxa inicial="https://logos.test/a.png" />);
    await user.upload(screen.getByLabelText('Canviar el logo'), fitxer('logo.png', 'image/png'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Treure el logo' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('descartar (el logo torna al desat) esborra l\'error', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<Fitxa inicial="https://logos.test/a.png" />);
    await user.click(screen.getByRole('button', { name: 'Treure el logo' }));
    await user.upload(screen.getByLabelText('Pujar el logo'), fitxer('animat.gif', 'image/gif'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Descartar canvis' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
