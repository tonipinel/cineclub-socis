import { describe, it, expect } from 'vitest';
import { useEffect, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { publicaAFormulari } from '../../../lib/sessioPublica';
import DadesSessio from './DadesSessio';

// Migrades de PaginaPublicaSessio.test.jsx: camps, slug (suggeriment i repetit), aliases i avís de cartell.
const ETIQUETES = [
  'Títol', 'Data', "Hora d'inici", 'Slug',
  'Títol públic', 'Títol original', 'Títol traduït', 'Títol a Espanya', 'Direcció', 'Guió', 'País',
  'Any', 'Durada (minuts)', 'Idioma', 'Versió idiomàtica', 'Gèneres', 'Fotografia', 'Muntatge', 'Música', 'Producció',
  'Intèrprets', 'Premis destacats', 'Versió', "Preu d'entrada (€)", 'Què inclou', 'Edat mínima recomanada',
  'Suport de distribució', 'Secció', 'Organitza', 'Participen', 'Col·laboren',
  'URL de programació', 'URL de la imatge de reserva (si no hi ha cartell públic)',
];

const canvis = {};

function Arnes({ publica, sessio = {}, altresSessions = [], urlPagina = '', errors = {} }) {
  const [form, setForm] = useState(publicaAFormulari(publica));
  const [dades, setDades] = useState({ titol: 'Pig', data: '2026-10-08', hora: '19:00', slug: '', publicada: false, ...sessio });
  useEffect(() => {
    canvis.form = form;
    canvis.dades = dades;
  }, [form, dades]);
  return (
    <DadesSessio
      dades={{ id: '1', ...dades }}
      onCanviDades={(camp, valor) => setDades((d) => ({ ...d, [camp]: valor }))}
      form={form}
      onCanviForm={(camp, valor) => setForm((f) => ({ ...f, [camp]: valor }))}
      errors={errors}
      altresSessions={altresSessions}
      original={{}}
      urlPagina={urlPagina}
    />
  );
}

describe('DadesSessio', () => {
  it('mostra tots els camps en targetes, l\'interruptor «Publicada» i els aliases només de lectura', () => {
    render(<Arnes publica={{ aliases: ['/programacio/25-de-juny-pig/'] }} />);
    for (const etiqueta of ETIQUETES) expect(screen.getByLabelText(etiqueta)).toBeInTheDocument();
    for (const titol of ['Sessió', 'Publicació', 'Pel·lícula', 'Entrada i organització', 'Avançat']) {
      expect(screen.getByRole('heading', { level: 2, name: titol })).toBeInTheDocument();
    }
    expect(screen.getByRole('checkbox', { name: 'Publicada' })).toBeInTheDocument();
    expect(screen.getByText('/programacio/25-de-juny-pig/')).toBeInTheDocument();
    expect(screen.getByLabelText('Secció')).toHaveDisplayValue('Cartellera (per defecte)');
    expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeInTheDocument();
  });

  it('els camps de gestió i de la fitxa criden el seu canvi', async () => {
    const user = userEvent.setup();
    render(<Arnes />);
    await user.clear(screen.getByLabelText('Títol'));
    await user.type(screen.getByLabelText('Títol'), 'Pig 2');
    await user.type(screen.getByLabelText('Guió'), 'Sarnoski');
    expect(canvis.dades.titol).toBe('Pig 2');
    expect(canvis.form.guio).toBe('Sarnoski');
  });

  it('suggereix el slug a partir del títol sense desar-lo fins que es fa servir', async () => {
    const user = userEvent.setup();
    render(<Arnes sessio={{ titol: 'El 47' }} />);
    expect(screen.getByLabelText('Slug')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Fer servir «el-47»' }));
    expect(canvis.dades.slug).toBe('el-47');
    expect(screen.getByText('URL: /programacio/2026/el-47/')).toBeInTheDocument();
  });

  it('avisa si el slug ja el fa servir una altra sessió del mateix any', () => {
    render(<Arnes sessio={{ slug: 'pig' }} altresSessions={[{ id: '2', slug: 'pig', data: '2026-01-01' }]} />);
    expect(screen.getByText('Ja hi ha una altra sessió amb aquest slug el 2026.')).toBeInTheDocument();
  });

  it('avisa (sense bloquejar) si es publica sense cartell', () => {
    render(<Arnes sessio={{ publicada: true }} />);
    expect(screen.getByText(/La sessió no té cartell/)).toBeInTheDocument();
  });

  it('mostra el resum «No es pot publicar» amb els errors de publicació', () => {
    render(<Arnes errors={{ publicar: { slug: 'Cal un slug.', data: 'Cal una data vàlida.' } }} />);
    const alerta = screen.getByRole('alert', { name: 'No es pot publicar' });
    expect(alerta).toHaveTextContent('Cal un slug.');
    expect(alerta).toHaveTextContent('Cal una data vàlida.');
  });

  it('enllaça a la URL de la pàgina pública desada si n\'hi ha', () => {
    const { unmount } = render(<Arnes sessio={{ slug: 'pig' }} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    unmount();
    render(<Arnes sessio={{ slug: 'pig', publicada: true }} urlPagina="https://cineclubrodadebera.cat/programacio/2026/pig/" />);
    const enllac = screen.getByRole('link', { name: 'https://cineclubrodadebera.cat/programacio/2026/pig/' });
    expect(enllac).toHaveAttribute('href', 'https://cineclubrodadebera.cat/programacio/2026/pig/');
    expect(enllac).toHaveAttribute('target', '_blank');
  });
});
