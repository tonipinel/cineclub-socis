import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../lib/pellicules', () => ({ cercarPellicules: vi.fn(), assignarPellicula: vi.fn() }));

import { fitxaAFormulari } from '../../../lib/fitxaProposta';
import PelliculaProposta from './PelliculaProposta';

const PROPOSTA = {
  titol: 'La Haine',
  titolLocal: 'El odio',
  any: 1995,
  durada: 98,
  directors: ['Mathieu Kassovitz'],
  guionistes: ['Mathieu Kassovitz'],
  fotografia: ['Pierre Aïm'],
  muntatge: ['Mathieu Kassovitz', 'Scott Stevenson'],
  musica: [],
  produccio: ['Lazennec Productions', 'Canal+'],
  paisos: ['França'],
  idiomes: ['Francès'],
  generes: ['Drama', 'Crim'],
  repartiment: [{ nom: 'Vincent Cassel', personatge: 'Vinz' }, { nom: 'Hubert Koundé', personatge: '' }],
  lema: 'Fins ara tot va bé',
  sinopsi: 'Tres joves…',
  sinopsiIdioma: 'ca',
  trailerUrl: 'https://youtube.test/v',
  imatgeUrl: 'https://storage.test/haine.jpg',
  tmdbId: 5,
  tmdbUrl: 'https://www.themoviedb.org/movie/5',
  valoracio: 7.8,
  campsEditats: ['directors'],
};

function pinta({ proposta = PROPOSTA, ...props } = {}) {
  const canvia = vi.fn();
  const onActualitzar = vi.fn();
  const onTriar = vi.fn();
  render(
    <PelliculaProposta
      proposta={proposta}
      valors={fitxaAFormulari(proposta)}
      canvia={canvia}
      errors={{}}
      ambCanvisPendents={false}
      actualitzant={false}
      onTriar={onTriar}
      onActualitzar={onActualitzar}
      errorTmdb={null}
      {...props}
    />,
  );
  return { canvia, onActualitzar, onTriar };
}

const descripcio = (element) => (element.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean)
  .map((id) => document.getElementById(id)?.textContent);

describe('PelliculaProposta', () => {
  it('mostra els camps editables amb els valors de la proposta (sense el cartell ni el tràiler)', () => {
    pinta();
    expect(screen.getByLabelText('Títol')).toHaveValue('La Haine');
    expect(screen.getByLabelText('Títol a Espanya')).toHaveValue('El odio');
    expect(screen.getByLabelText('Any')).toHaveValue('1995');
    expect(screen.getByLabelText('Durada (minuts)')).toHaveValue('98');
    expect(screen.getByLabelText('Direcció')).toHaveValue('Mathieu Kassovitz');
    expect(screen.getByLabelText('Gèneres')).toHaveValue('Drama, Crim');
    expect(screen.getByLabelText('Fotografia')).toHaveValue('Pierre Aïm');
    expect(screen.getByLabelText('Muntatge')).toHaveValue('Mathieu Kassovitz, Scott Stevenson');
    expect(screen.getByLabelText('Música')).toHaveValue('');
    expect(screen.getByLabelText('Producció')).toHaveValue('Lazennec Productions, Canal+');
    expect(screen.getByLabelText('Repartiment')).toHaveValue('Vincent Cassel (Vinz)\nHubert Koundé');
    expect(screen.getByLabelText('Lema')).toHaveValue('Fins ara tot va bé');
    expect(screen.getByLabelText('Sinopsi')).toHaveValue('Tres joves…');
    expect(screen.getByLabelText('Repartiment')).toHaveClass('textarea-automatic');
    expect(screen.getByLabelText('Sinopsi')).toHaveClass('textarea-automatic');
    expect(screen.queryByLabelText('URL del tràiler')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('URL del cartell')).not.toBeInTheDocument();
    // L'id de cada camp és el seu nom (el focus en un error de validació hi compta).
    for (const camp of ['titol', 'titolLocal', 'any', 'durada', 'directors', 'guionistes', 'fotografia', 'muntatge', 'musica', 'produccio', 'paisos', 'idiomes', 'generes', 'repartiment', 'lema', 'sinopsi']) {
      expect(document.getElementById(camp)).not.toBeNull();
    }
  });

  it('les llistes i el repartiment tenen l\'ajuda de format, lligada al camp', () => {
    pinta();
    for (const etiqueta of ['Direcció', 'Guió', 'Fotografia', 'Muntatge', 'Música', 'Producció', 'Països', 'Idiomes', 'Gèneres']) {
      expect(descripcio(screen.getByLabelText(etiqueta))).toContain('Separats per comes');
    }
    expect(descripcio(screen.getByLabelText('Repartiment'))).toContain('Un actor per línia: Nom (Personatge)');
  });

  it('marca «Editat a mà» els camps de campsEditats i la sinopsi catalana, i cap altre', () => {
    pinta();
    expect(screen.getAllByText('Editat a mà')).toHaveLength(2);
    expect(descripcio(screen.getByLabelText('Direcció'))).toContain('Editat a mà');
    expect(descripcio(screen.getByLabelText('Sinopsi'))).toContain('Editat a mà');
    expect(descripcio(screen.getByLabelText('Títol'))).not.toContain('Editat a mà');
  });

  it('sense camps editats ni sinopsi catalana, cap insígnia', () => {
    pinta({ proposta: { ...PROPOSTA, campsEditats: [], sinopsiIdioma: 'es' } });
    expect(screen.queryByText('Editat a mà')).not.toBeInTheDocument();
  });

  it.each([['es', 'castellà'], ['en', 'anglès']])('avisa que la sinopsi és en %s', (idioma, nom) => {
    pinta({ proposta: { ...PROPOSTA, sinopsiIdioma: idioma } });
    expect(screen.getByText(`Aquesta sinopsi és en ${nom}: tradueix-la aquí.`)).toBeInTheDocument();
  });

  it('mostra la valoració de TMDB i l\'enllaç, només de lectura', () => {
    pinta();
    expect(screen.getByText('★ 7,8 / 10')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Valoració/)).not.toBeInTheDocument();
    const enllac = screen.getByRole('link', { name: 'Veure a TMDB' });
    expect(enllac).toHaveAttribute('href', 'https://www.themoviedb.org/movie/5');
    expect(enllac).toHaveAttribute('target', '_blank');
  });

  it('cada camp avisa del canvi amb el seu nom', async () => {
    const user = userEvent.setup();
    const { canvia } = pinta();
    await user.type(screen.getByLabelText('Direcció'), 'x');
    expect(canvia).toHaveBeenLastCalledWith('directors', 'Mathieu Kassovitzx');
    await user.type(screen.getByLabelText('Música'), 'z');
    expect(canvia).toHaveBeenLastCalledWith('musica', 'z');
    await user.type(screen.getByLabelText('Repartiment'), 'y');
    expect(canvia).toHaveBeenLastCalledWith('repartiment', 'Vincent Cassel (Vinz)\nHubert Koundéy');
  });

  it('mostra els errors de validació sota el camp, lligats i amb role="alert"', () => {
    pinta({ errors: { any: "L'any ha de tenir 4 xifres.", durada: 'La durada ha de ser un nombre enter de minuts.' } });
    const any = screen.getByLabelText('Any');
    expect(any).toHaveAttribute('aria-invalid', 'true');
    expect(descripcio(any)).toContain("L'any ha de tenir 4 xifres.");
    expect(screen.getAllByRole('alert').map((a) => a.textContent))
      .toEqual(["L'any ha de tenir 4 xifres.", 'La durada ha de ser un nombre enter de minuts.']);
    expect(screen.getByLabelText('Títol')).toHaveAttribute('aria-invalid', 'false');
  });

  it('mentre es puja el cartell, «Actualitzar des de TMDB» i el cercador queden deshabilitats amb una nota', () => {
    pinta({ pujant: true });
    expect(screen.getByRole('button', { name: 'Actualitzar des de TMDB' })).toBeDisabled();
    expect(screen.getByText("S'està pujant el cartell…")).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Cerca i tria la pel·lícula' }).querySelector('fieldset')).toBeDisabled();
  });

  it('«Actualitzar des de TMDB» crida onActualitzar', async () => {
    const user = userEvent.setup();
    const { onActualitzar } = pinta();
    await user.click(screen.getByRole('button', { name: 'Actualitzar des de TMDB' }));
    expect(onActualitzar).toHaveBeenCalledTimes(1);
  });

  it('amb canvis pendents, actualitzar i canviar de pel·lícula queden deshabilitats amb la nota', () => {
    pinta({ ambCanvisPendents: true });
    const actualitzar = screen.getByRole('button', { name: 'Actualitzar des de TMDB' });
    expect(actualitzar).toBeDisabled();
    expect(descripcio(actualitzar)).toEqual(["Desa o descarta els canvis abans d'actualitzar."]);
    expect(screen.getByRole('button', { name: 'Canviar' })).toBeDisabled();
    expect(screen.getByText('Desa o descarta els canvis abans de canviar de pel·lícula.')).toBeInTheDocument();
    // Els camps continuen editables.
    expect(screen.getByLabelText('Direcció')).toBeEnabled();
  });

  it('sense canvis pendents no hi ha cap nota i tot és actiu', () => {
    pinta();
    expect(screen.getByRole('button', { name: 'Actualitzar des de TMDB' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Canviar' })).toBeEnabled();
    expect(screen.queryByText(/Desa o descarta/)).not.toBeInTheDocument();
  });

  it('mentre s\'actualitza, els camps i els botons queden deshabilitats', () => {
    pinta({ actualitzant: true });
    expect(screen.getByRole('button', { name: /Actualitzant/ })).toBeDisabled();
    expect(screen.getByLabelText('Direcció')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Canviar' })).toBeDisabled();
  });

  it('amb tmdbId, la pel·lícula triada surt fixa al cercador', () => {
    pinta();
    const cerca = screen.getByRole('region', { name: 'Cerca i tria la pel·lícula' });
    expect(within(cerca).getByText('La Haine (1995)')).toBeInTheDocument();
    expect(within(cerca).queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('sense tmdbId: cercador amb el títol, sense botó d\'actualitzar, i els camps editables', () => {
    pinta({ proposta: { titol: 'Feta a mà', estat: 'aprovada' } });
    expect(screen.getByRole('combobox', { name: 'Pel·lícula' })).toHaveValue('Feta a mà');
    expect(screen.queryByRole('button', { name: /Actualitzar des de TMDB/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Veure a TMDB' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Títol')).toHaveValue('Feta a mà');
    expect(screen.getByLabelText('Direcció')).toBeEnabled();
  });

  it('mostra l\'error de TMDB com a alerta', () => {
    pinta({ errorTmdb: "No s'ha pogut actualitzar la fitxa des de TMDB. Torna-ho a provar." });
    expect(screen.getByRole('alert')).toHaveTextContent("No s'ha pogut actualitzar la fitxa des de TMDB. Torna-ho a provar.");
  });
});
