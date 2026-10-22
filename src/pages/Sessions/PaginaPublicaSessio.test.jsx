import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect, useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../firebase/firebase', () => ({ storage: { app: { options: { storageBucket: 'bucket-prova' } } } }));
vi.mock('firebase/storage', () => ({
  ref: vi.fn((_storage, cami) => ({ cami })),
  uploadBytes: vi.fn().mockResolvedValue({}),
}));

import { ref, uploadBytes } from 'firebase/storage';
import { publicaAFormulari } from '../../lib/sessioPublica';
import PaginaPublicaSessio from './PaginaPublicaSessio';

const ETIQUETES = [
  'Títol públic', 'Títol original', 'Títol traduït', 'Títol a Espanya', 'Sinopsi del cartell', 'Direcció', 'Guió', 'País',
  'Any', 'Durada (minuts)', 'Idioma', 'Versió idiomàtica', 'Gèneres', 'Fotografia', 'Muntatge', 'Música', 'Producció',
  'Intèrprets', 'Premis destacats', 'Versió', "Preu d'entrada (€)", 'Què inclou', 'Edat mínima recomanada',
  'Suport de distribució', 'Secció', 'Organitza', 'Participen', 'Col·laboren', 'Descripció (SEO)', 'Ganxo',
  'Tràiler de YouTube (URL o id)', 'Textos editorials (Markdown)', 'Slug',
];

const canvis = {};

function Arnes({ publica, sessio = {}, altresSessions = [], urlPagina = '' }) {
  const [form, setForm] = useState(publicaAFormulari(publica));
  const [dades, setDades] = useState({ titol: 'Pig', data: '2026-10-08', slug: '', publicada: false, ...sessio });
  useEffect(() => {
    canvis.form = form;
    canvis.dades = dades;
  }, [form, dades]);
  return (
    <PaginaPublicaSessio
      obert
      onToggle={() => {}}
      form={form}
      onCanvi={(camp, valor) => setForm((f) => ({ ...f, [camp]: valor }))}
      sessio={{ id: '1', ...dades }}
      onCanviSessio={(camp, valor) => setDades((d) => ({ ...d, [camp]: valor }))}
      altresSessions={altresSessions}
      errors={{}}
      urlPagina={urlPagina}
    />
  );
}

const fitxer = (nom, tipus, mida = 1000) => {
  const f = new File(['x'], nom, { type: tipus });
  Object.defineProperty(f, 'size', { value: mida });
  return f;
};

describe('PaginaPublicaSessio', () => {
  beforeEach(() => {
    uploadBytes.mockClear();
    ref.mockClear();
  });

  it('es pot plegar i desplegar amb un botó accessible', async () => {
    const onToggle = vi.fn();
    const props = {
      onToggle, form: publicaAFormulari({}), onCanvi: () => {}, sessio: {}, onCanviSessio: () => {}, altresSessions: [], errors: {},
    };
    const { rerender } = render(<PaginaPublicaSessio obert={false} {...props} />);
    const boto = screen.getByRole('button', { name: 'Pàgina pública' });
    expect(boto).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Slug')).not.toBeInTheDocument();
    await userEvent.click(boto);
    expect(onToggle).toHaveBeenCalled();
    rerender(<PaginaPublicaSessio obert {...props} />);
    expect(screen.getByRole('button', { name: 'Pàgina pública' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('mostra tots els camps de la fitxa, l\'interruptor «Publicada» i els aliases només de lectura', () => {
    render(<Arnes publica={{ aliases: ['/programacio/25-de-juny-pig/'] }} />);
    for (const etiqueta of ETIQUETES) expect(screen.getByLabelText(etiqueta)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Publicada' })).toBeInTheDocument();
    expect(screen.getByText('/programacio/25-de-juny-pig/')).toBeInTheDocument();
    expect(screen.getByLabelText('Secció')).toHaveDisplayValue('Cartellera (per defecte)');
  });

  it('suggereix el slug a partir del títol sense desar-lo fins que es fa servir', async () => {
    const user = userEvent.setup();
    render(<Arnes sessio={{ titol: 'El 47' }} />);
    expect(screen.getByLabelText('Slug')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Fer servir «el-47»' }));
    expect(canvis.dades.slug).toBe('el-47');
  });

  it('avisa si el slug ja el fa servir una altra sessió del mateix any', () => {
    render(<Arnes sessio={{ slug: 'pig' }} altresSessions={[{ id: '2', slug: 'pig', data: '2026-01-01' }]} />);
    expect(screen.getByText('Ja hi ha una altra sessió amb aquest slug el 2026.')).toBeInTheDocument();
  });

  it('insereix l\'esquelet dels textos editorials si el camp és buit', async () => {
    const user = userEvent.setup();
    render(<Arnes />);
    await user.click(screen.getByRole('button', { name: "Inserir l'esquelet" }));
    expect(canvis.form.cos).toBe('## Sinopsi\n\n\n\n## Context\n\n\n\n## Curiositats\n\n\n\n## Per què l\'hem programat?\n\n');
    expect(screen.queryByRole('button', { name: "Inserir l'esquelet" })).not.toBeInTheDocument();
  });

  it('avisa (sense bloquejar) si es publica sense cartell', () => {
    render(<Arnes sessio={{ publicada: true }} />);
    expect(screen.getByText(/La sessió no té cartell/)).toBeInTheDocument();
  });

  it('desactiva la pujada d\'imatges si no hi ha slug', () => {
    render(<Arnes />);
    expect(screen.getByLabelText('Pujar cartell')).toBeDisabled();
    expect(screen.getByLabelText("Afegir imatges a la galeria")).toBeDisabled();
    expect(screen.getAllByText("Cal un slug per poder pujar imatges.").length).toBeGreaterThan(0);
  });

  it('rebutja imatges d\'un tipus o una mida no permesos sense pujar-les', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<Arnes sessio={{ slug: 'pig' }} />);
    await user.upload(screen.getByLabelText('Pujar cartell'), fitxer('a.gif', 'image/gif'));
    expect(await screen.findByRole('alert')).toHaveTextContent('La imatge ha de ser JPG, PNG o WebP.');
    await user.upload(screen.getByLabelText('Pujar cartell'), fitxer('a.jpg', 'image/jpeg', 11 * 1024 * 1024));
    expect(await screen.findByRole('alert')).toHaveTextContent('La imatge no pot ocupar més de 10 MB.');
    expect(uploadBytes).not.toHaveBeenCalled();
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
    await vi.waitFor(() => expect(canvis.form.cartell).toBe(
      'https://firebasestorage.googleapis.com/v0/b/bucket-prova/o/web%2Fsessions%2Fpig%2Fposter-1700000000000.png?alt=media',
    ));
    Date.now.mockRestore();
  });

  it('afegeix imatges a la galeria, les reordena i les treu de la llista', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(5);
    const user = userEvent.setup();
    render(<Arnes sessio={{ slug: 'pig' }} publica={{ galeria: ['https://x/a.jpg'] }} />);
    await user.upload(screen.getByLabelText('Afegir imatges a la galeria'), [fitxer('b.jpg', 'image/jpeg'), fitxer('c.webp', 'image/webp')]);
    await vi.waitFor(() => expect(canvis.form.galeria).toHaveLength(3));
    expect(ref).toHaveBeenCalledWith(expect.anything(), 'web/sessions/pig/gallery-5-1.jpg');
    expect(ref).toHaveBeenCalledWith(expect.anything(), 'web/sessions/pig/gallery-5-2.webp');
    const b = canvis.form.galeria[1];
    const c = canvis.form.galeria[2];

    const galeria = within(screen.getByRole('list', { name: 'Galeria' }));
    await user.click(galeria.getByRole('button', { name: 'Moure amunt la imatge 3' }));
    expect(canvis.form.galeria).toEqual(['https://x/a.jpg', c, b]);
    await user.click(galeria.getByRole('button', { name: 'Moure avall la imatge 1' }));
    expect(canvis.form.galeria).toEqual([c, 'https://x/a.jpg', b]);
    await user.click(galeria.getByRole('button', { name: 'Treure la imatge 2' }));
    expect(canvis.form.galeria).toEqual([c, b]);
    Date.now.mockRestore();
  });

  it('enllaça a la pàgina pública desada si n\'hi ha', () => {
    const { unmount } = render(<Arnes sessio={{ slug: 'pig' }} />);
    expect(screen.queryByRole('link', { name: /Veure la pàgina pública/ })).not.toBeInTheDocument();
    unmount();
    render(<Arnes sessio={{ slug: 'pig', publicada: true }} urlPagina="https://cineclubrodadebera.cat/programacio/2026/pig/" />);
    const enllac = screen.getByRole('link', { name: /Veure la pàgina pública/ });
    expect(enllac).toHaveAttribute('href', 'https://cineclubrodadebera.cat/programacio/2026/pig/');
    expect(enllac).toHaveAttribute('target', '_blank');
  });
});
