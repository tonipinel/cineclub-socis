import { describe, it, expect, vi } from 'vitest';
import { useEffect, useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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

const ENTITATS = [
  { id: 'a', nom: "L'Ateneu Rodenc" },
  { id: 'b', nom: 'Cineclub Roda de Berà' },
  { id: 'c', nom: 'Ajuntament de Roda de Berà' },
];

function Arnes({
  publica, sessio = {}, altresSessions = [], urlPagina = '', errors = {}, entitats = ENTITATS, onCanviForm, organitzaDesat,
}) {
  const [form, setForm] = useState(publicaAFormulari(publica));
  const [dades, setDades] = useState({ titol: 'Pig', data: '2026-10-08', hora: '19:00', slug: '', publicada: false, ...sessio });
  useEffect(() => {
    canvis.form = form;
    canvis.dades = dades;
  }, [form, dades]);
  return (
    <MemoryRouter>
      <DadesSessio
        dades={{ id: '1', ...dades }}
        onCanviDades={(camp, valor) => setDades((d) => ({ ...d, [camp]: valor }))}
        form={form}
        onCanviForm={(camp, valor) => {
          onCanviForm?.(camp, valor);
          setForm((f) => ({ ...f, [camp]: valor }));
        }}
        errors={errors}
        altresSessions={altresSessions}
        original={{}}
        urlPagina={urlPagina}
        entitats={entitats}
        organitzaDesat={organitzaDesat ?? publicaAFormulari(publica).organitza}
      />
    </MemoryRouter>
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
    // Migrada: ara sempre hi ha l'enllaç «Gestionar entitats»; només aquest.
    expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual(['Gestionar entitats']);
    unmount();
    render(<Arnes sessio={{ slug: 'pig', publicada: true }} urlPagina="https://cineclubrodadebera.cat/programacio/2026/pig/" />);
    const enllac = screen.getByRole('link', { name: 'https://cineclubrodadebera.cat/programacio/2026/pig/' });
    expect(enllac).toHaveAttribute('href', 'https://cineclubrodadebera.cat/programacio/2026/pig/');
    expect(enllac).toHaveAttribute('target', '_blank');
  });

  // Migrada: «cineclub» ara equival a «Cineclub Roda de Berà» quan és al catàleg; el valor fora del catàleg és un altre.
  it('«Organitza» és un desplegable del catàleg que conserva un valor que no hi és', async () => {
    const onCanviForm = vi.fn();
    const user = userEvent.setup();
    render(<Arnes publica={{ organitza: 'Entitat Antiga' }} onCanviForm={onCanviForm} />);
    const select = screen.getByLabelText('Organitza');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      '—', 'Entitat Antiga (no és al catàleg)', "L'Ateneu Rodenc", 'Cineclub Roda de Berà', 'Ajuntament de Roda de Berà',
    ]);
    expect(select).toHaveValue('Entitat Antiga');
    expect(screen.getByRole('option', { name: 'Entitat Antiga (no és al catàleg)' }).selected).toBe(true);
    expect(onCanviForm).not.toHaveBeenCalled();
    await user.selectOptions(select, "L'Ateneu Rodenc");
    expect(onCanviForm).toHaveBeenCalledWith('organitza', "L'Ateneu Rodenc");
    expect(canvis.form.organitza).toBe("L'Ateneu Rodenc");
    // El valor desat continua disponible per tornar-hi sense descartar els canvis.
    expect(screen.getByRole('option', { name: 'Entitat Antiga (no és al catàleg)' })).toBeInTheDocument();
    await user.selectOptions(select, 'Entitat Antiga (no és al catàleg)');
    expect(onCanviForm).toHaveBeenLastCalledWith('organitza', 'Entitat Antiga');
    await user.selectOptions(select, '—');
    expect(onCanviForm).toHaveBeenLastCalledWith('organitza', '');
  });

  it('«Organitza» = «cineclub» es mostra com «Cineclub Roda de Berà» del catàleg sense reescriure el valor', () => {
    const onCanviForm = vi.fn();
    render(<Arnes publica={{ organitza: 'cineclub' }} onCanviForm={onCanviForm} />);
    const select = screen.getByLabelText('Organitza');
    expect(within(select).getAllByRole('option').map((o) => [o.value, o.textContent])).toEqual([
      ['', '—'], ["L'Ateneu Rodenc", "L'Ateneu Rodenc"], ['cineclub', 'Cineclub Roda de Berà'],
      ['Ajuntament de Roda de Berà', 'Ajuntament de Roda de Berà'],
    ]);
    expect(select).toHaveValue('cineclub');
    expect(screen.queryByText(/no és al catàleg/)).not.toBeInTheDocument();
    expect(onCanviForm).not.toHaveBeenCalled();
  });

  it('«Organitza» = «cineclub» sense «Cineclub Roda de Berà» al catàleg avisa que no hi és', () => {
    render(<Arnes publica={{ organitza: 'cineclub' }} entitats={ENTITATS.filter((e) => e.id !== 'b')} />);
    expect(screen.getByLabelText('Organitza')).toHaveValue('cineclub');
    expect(screen.getByRole('option', { name: 'cineclub (no és al catàleg)' }).selected).toBe(true);
  });

  it('«Organitza» amb un valor del catàleg no afegeix cap opció «no és al catàleg»', () => {
    render(<Arnes publica={{ organitza: 'Cineclub Roda de Berà' }} />);
    expect(screen.getByLabelText('Organitza')).toHaveValue('Cineclub Roda de Berà');
    expect(screen.queryByRole('option', { name: /no és al catàleg/ })).not.toBeInTheDocument();
  });

  it('«Participen» i «Col·laboren» escriuen el text separat per comes', async () => {
    const onCanviForm = vi.fn();
    const user = userEvent.setup();
    render(<Arnes publica={{ participa: ["L'Ateneu Rodenc"] }} onCanviForm={onCanviForm} />);
    const participen = screen.getByRole('group', { name: 'Participen' });
    await user.selectOptions(within(participen).getByLabelText('Participen'), 'Cineclub Roda de Berà');
    await user.click(within(participen).getByRole('button', { name: 'Afegir' }));
    expect(onCanviForm).toHaveBeenLastCalledWith('participa', "L'Ateneu Rodenc, Cineclub Roda de Berà");
    expect(canvis.form.participa).toBe("L'Ateneu Rodenc, Cineclub Roda de Berà");

    const collaboren = screen.getByRole('group', { name: 'Col·laboren' });
    await user.selectOptions(within(collaboren).getByLabelText('Col·laboren'), 'Ajuntament de Roda de Berà');
    await user.click(within(collaboren).getByRole('button', { name: 'Afegir' }));
    expect(onCanviForm).toHaveBeenLastCalledWith('collabora', 'Ajuntament de Roda de Berà');

    await user.click(within(participen).getByRole('button', { name: "Treure L'Ateneu Rodenc" }));
    expect(onCanviForm).toHaveBeenLastCalledWith('participa', 'Cineclub Roda de Berà');
    expect(canvis.form.participa).toBe('Cineclub Roda de Berà');
  });

  it('un nom antic de «Participen» que no és al catàleg es mostra amb l\'avís', () => {
    render(<Arnes publica={{ participa: ['Entitat Vella'] }} />);
    const participen = screen.getByRole('group', { name: 'Participen' });
    expect(within(participen).getByRole('listitem')).toHaveTextContent('Entitat Vella — no és al catàleg');
  });

  it('enllaça a «Gestionar entitats»', () => {
    render(<Arnes />);
    expect(screen.getByRole('link', { name: 'Gestionar entitats' })).toHaveAttribute('href', '/entitats');
  });
});
