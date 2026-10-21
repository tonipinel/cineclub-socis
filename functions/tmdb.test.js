import { describe, it, expect, vi } from 'vitest';
import tmdb from './tmdb.js';

const { cercarPellicules, detallPellicula, descarregarCartell } = tmdb;

const resposta = (dades, ok = true) => ({ ok, status: ok ? 200 : 401, json: async () => dades });

// Respon segons la ruta i el paràmetre `language` de la URL.
const servidor = ({ cerca = {}, detall = {}, imatges = { posters: [] } }) => vi.fn(async (url) => {
  const adreca = new URL(url);
  const idioma = adreca.searchParams.get('language');
  if (adreca.pathname.endsWith('/search/movie')) return resposta({ results: cerca[idioma] ?? [] });
  if (adreca.pathname.endsWith('/images')) return resposta(imatges);
  return resposta(detall[idioma] ?? {});
});

describe('cercarPellicules', () => {
  it('normalitza els resultats i els limita a 8', async () => {
    const resultats = Array.from({ length: 12 }, (_, i) => ({
      id: i, title: `Peli ${i}`, original_title: `Peli ${i}`, original_language: 'es', release_date: '1995-05-30', poster_path: `/p${i}.jpg`,
    }));
    const fetchFn = servidor({ cerca: { 'es-ES': resultats, 'en-US': resultats } });
    const trobades = await cercarPellicules('peli', 'clau-curta', fetchFn);
    expect(trobades).toHaveLength(8);
    expect(trobades[0]).toEqual({
      tmdbId: 0, titol: 'Peli 0', titolLocal: null, any: '1995', posterUrl: 'https://image.tmdb.org/t/p/w154/p0.jpg',
    });
  });

  it('tolera pel·lícules sense data ni cartell', async () => {
    const peli = [{ id: 1, title: 'Sense dades', original_title: 'Sense dades', original_language: 'ca' }];
    const fetchFn = servidor({ cerca: { 'es-ES': peli, 'en-US': peli } });
    expect(await cercarPellicules('x', 'clau', fetchFn)).toEqual([
      { tmdbId: 1, titol: 'Sense dades', titolLocal: null, any: '', posterUrl: null },
    ]);
  });

  it('si l\'idioma original és un dels propis (en, es, ca, gl, eu, fr), mostra el títol original', async () => {
    const es = [{ id: 5, title: 'Los domingos', original_title: 'Los domingos', original_language: 'es', release_date: '2025-01-01' }];
    const en = [{ id: 5, title: 'Sundays', original_title: 'Los domingos', original_language: 'es' }];
    const fetchFn = servidor({ cerca: { 'es-ES': es, 'en-US': en } });
    expect((await cercarPellicules('domingos', 'clau', fetchFn))[0]).toMatchObject({ titol: 'Los domingos', titolLocal: null });
  });

  it('si l\'idioma original és un altre, mostra el títol en anglès i guarda el local a part', async () => {
    const es = [{ id: 5, title: 'Los siete samuráis', original_title: '七人の侍', original_language: 'ja', release_date: '1954-04-26' }];
    const en = [{ id: 5, title: 'Seven Samurai', original_title: '七人の侍', original_language: 'ja' }];
    const fetchFn = servidor({ cerca: { 'es-ES': es, 'en-US': en } });
    expect((await cercarPellicules('samuráis', 'clau', fetchFn))[0]).toMatchObject({ titol: 'Seven Samurai', titolLocal: 'Los siete samuráis' });
  });

  it('si l\'original és en castellà o català, no guarda el títol local (seria redundant)', async () => {
    const es = [{ id: 7, title: 'Pan negro', original_title: 'Pa negre', original_language: 'ca', release_date: '2010-01-01' }];
    const fetchFn = servidor({ cerca: { 'es-ES': es, 'en-US': es } });
    expect((await cercarPellicules('pa negre', 'clau', fetchFn))[0]).toMatchObject({ titol: 'Pa negre', titolLocal: null });
  });

  it('el francès també es considera idioma propi: es manté el títol original', async () => {
    const es = [{ id: 5, title: 'El odio', original_title: 'La Haine', original_language: 'fr', release_date: '1995-05-31' }];
    const en = [{ id: 5, title: 'Hate', original_title: 'La Haine', original_language: 'fr' }];
    const fetchFn = servidor({ cerca: { 'es-ES': es, 'en-US': en } });
    expect((await cercarPellicules('el odio', 'clau', fetchFn))[0]).toMatchObject({ titol: 'La Haine', titolLocal: 'El odio' });
  });

  it('envia l\'API key com a paràmetre quan és una clau curta', async () => {
    const fetchFn = servidor({});
    await cercarPellicules('la haine', 'abc123', fetchFn);
    const [url, opcions] = fetchFn.mock.calls[0];
    expect(url).toContain('api_key=abc123');
    expect(url).toContain('query=la+haine');
    expect(opcions.headers.authorization).toBeUndefined();
  });

  it('envia el token de lectura (eyJ…) a la capçalera Authorization', async () => {
    const fetchFn = servidor({});
    await cercarPellicules('la haine', 'eyJabc', fetchFn);
    const [url, opcions] = fetchFn.mock.calls[0];
    expect(url).not.toContain('api_key');
    expect(opcions.headers.authorization).toBe('Bearer eyJabc');
  });

  it('llança un error si TMDB rebutja la petició', async () => {
    const fetchFn = vi.fn().mockResolvedValue(resposta({}, false));
    await expect(cercarPellicules('x', 'clau', fetchFn)).rejects.toThrow('TMDB ha respost 401');
  });
});

describe('detallPellicula', () => {
  const BASE = {
    id: 5, title: 'Los domingos', original_title: 'Los domingos', original_language: 'es', release_date: '2025-05-31', poster_path: '/per-defecte.jpg',
  };
  const detall = (extra = {}) => ({
    'ca-ES': { ...BASE, ...extra.ca },
    'es-ES': { ...BASE, ...extra.es },
    'en-US': { ...BASE, title: 'Sundays', ...extra.en },
  });

  it('retorna la fitxa completa amb la sinopsi en català', async () => {
    const fetchFn = servidor({
      detall: detall({
        ca: {
          overview: 'Tres joves…',
          tagline: 'Fins ara tot va bé',
          runtime: 98,
          genres: [{ id: 18, name: 'Drama' }, { id: 80, name: 'Crime' }],
          vote_average: 8.1234,
          vote_count: 100,
          production_countries: [{ iso_3166_1: 'ES', name: 'Spain' }],
          spoken_languages: [{ iso_639_1: 'es', name: 'Español' }, { iso_639_1: 'en', english_name: 'English' }],
          credits: {
            crew: [
              { job: 'Director', name: 'Alauda Ruiz de Azúa' },
              { job: 'Screenplay', name: 'Alauda Ruiz de Azúa' },
              { job: 'Editor', name: 'Altre' },
            ],
            cast: [{ name: 'Patricia López Arnaiz', character: 'Maite' }],
          },
          videos: { results: [
            { site: 'Vimeo', type: 'Trailer', key: 'no' },
            { site: 'YouTube', type: 'Trailer', official: false, key: 'copia' },
            { site: 'YouTube', type: 'Trailer', official: true, key: 'oficial' },
          ] },
        },
        es: { title: 'Los domingos' },
      }),
    });
    expect(await detallPellicula(5, 'clau', fetchFn)).toMatchObject({
      tmdbId: 5,
      titol: 'Los domingos',
      titolLocal: null,
      any: '2025',
      sinopsi: 'Tres joves…',
      sinopsiIdioma: 'ca',
      posterPath: '/per-defecte.jpg',
      durada: 98,
      generes: ['Drama', 'Crim'],
      directors: ['Alauda Ruiz de Azúa'],
      guionistes: ['Alauda Ruiz de Azúa'],
      repartiment: [{ nom: 'Patricia López Arnaiz', personatge: 'Maite' }],
      lema: 'Fins ara tot va bé',
      paisos: ['Espanya'],
      idiomes: ['Espanyol', 'Anglès'],
      valoracio: 8.1,
      trailerUrl: 'https://www.youtube.com/watch?v=oficial',
      tmdbUrl: 'https://www.themoviedb.org/movie/5',
    });
    expect(fetchFn.mock.calls[0][0]).toContain('append_to_response=credits%2Cvideos');
  });

  it('tradueix al català els gèneres, els països i els idiomes que TMDB dona en anglès o en l\'idioma original', async () => {
    const fetchFn = servidor({
      detall: detall({
        ca: {
          overview: 'x',
          genres: [{ id: 10749, name: 'Romance' }, { id: 878, name: 'Science Fiction' }, { id: 18, name: 'Drama' }],
          production_countries: [{ iso_3166_1: 'US', name: 'United States of America' }, { iso_3166_1: 'GB', name: 'United Kingdom' }],
          spoken_languages: [{ iso_639_1: 'ar', name: 'العربية' }, { iso_639_1: 'fr', name: 'Français' }],
        },
      }),
    });
    expect(await detallPellicula(5, 'clau', fetchFn)).toMatchObject({
      generes: ['Romanç', 'Ciència-ficció', 'Drama'],
      paisos: ['Estats Units', 'Regne Unit'],
      idiomes: ['Àrab', 'Francès'],
    });
  });

  it('si un gènere, país o idioma no es reconeix, deixa el nom de TMDB', async () => {
    const fetchFn = servidor({
      detall: detall({
        ca: {
          overview: 'x',
          genres: [{ id: 99999, name: 'Nou gènere' }],
          production_countries: [{ iso_3166_1: '??', name: 'País estrany' }],
          spoken_languages: [{ iso_639_1: 'xx', name: 'Llengua rara' }],
        },
      }),
    });
    expect(await detallPellicula(5, 'clau', fetchFn)).toMatchObject({
      generes: ['Nou gènere'], paisos: ['País estrany'], idiomes: ['Llengua rara'],
    });
  });

  it('si no hi ha sinopsi en català, cau al castellà i ho indica', async () => {
    const fetchFn = servidor({ detall: detall({ ca: { overview: '' }, es: { overview: 'Tres jóvenes…' } }) });
    expect(await detallPellicula(5, 'clau', fetchFn)).toMatchObject({ sinopsi: 'Tres jóvenes…', sinopsiIdioma: 'es' });
  });

  it('si no n\'hi ha en castellà, cau a l\'anglès', async () => {
    const fetchFn = servidor({ detall: detall({ en: { overview: 'Three youths…' } }) });
    expect(await detallPellicula(5, 'clau', fetchFn)).toMatchObject({ sinopsi: 'Three youths…', sinopsiIdioma: 'en' });
  });

  it('si l\'idioma original és un dels propis, el títol és l\'original i el cartell, el d\'aquest idioma', async () => {
    const fetchFn = servidor({
      detall: detall({ ca: { overview: 'x' } }),
      imatges: { posters: [
        { iso_639_1: 'es', file_path: '/es-baix.jpg', vote_average: 3 },
        { iso_639_1: 'es', file_path: '/es-millor.jpg', vote_average: 7 },
        { iso_639_1: 'en', file_path: '/en.jpg', vote_average: 9 },
      ] },
    });
    const pellicula = await detallPellicula(5, 'clau', fetchFn);
    expect(pellicula).toMatchObject({ titol: 'Los domingos', posterPath: '/es-millor.jpg' });
    const crida = fetchFn.mock.calls.map(([u]) => new URL(u)).find((u) => u.pathname.endsWith('/images'));
    expect(crida.searchParams.get('include_image_language')).toBe('es,null');
  });

  it('si l\'idioma original no és un dels propis, el títol i el cartell són en anglès', async () => {
    const fetchFn = servidor({
      detall: {
        'ca-ES': { id: 5, title: 'Els set samurais', original_title: '七人の侍', original_language: 'ja', overview: 'x', poster_path: '/ja-defecte.jpg' },
        'es-ES': { id: 5, title: 'Los siete samuráis', original_title: '七人の侍', original_language: 'ja' },
        'en-US': { id: 5, title: 'Seven Samurai', original_title: '七人の侍', original_language: 'ja' },
      },
      imatges: { posters: [
        { iso_639_1: 'ja', file_path: '/ja.jpg', vote_average: 9 },
        { iso_639_1: 'en', file_path: '/en.jpg', vote_average: 5 },
      ] },
    });
    expect(await detallPellicula(5, 'clau', fetchFn)).toMatchObject({
      titol: 'Seven Samurai', titolLocal: 'Los siete samuráis', posterPath: '/en.jpg',
    });
  });

  it('tria les escenes més ben valorades sense text (màxim 4)', async () => {
    const escenes = Array.from({ length: 6 }, (_, i) => ({ iso_639_1: null, file_path: `/escena-${i}.jpg`, vote_average: i }));
    const fetchFn = servidor({
      detall: detall({ ca: { overview: 'x' } }),
      imatges: {
        posters: [],
        backdrops: [{ iso_639_1: 'en', file_path: '/amb-text.jpg', vote_average: 99 }, ...escenes],
      },
    });
    expect((await detallPellicula(5, 'clau', fetchFn)).escenes).toEqual([
      '/escena-5.jpg', '/escena-4.jpg', '/escena-3.jpg', '/escena-2.jpg',
    ]);
  });

  it('si no hi ha escenes, torna una llista buida', async () => {
    const fetchFn = servidor({ detall: detall({ ca: { overview: 'x' } }) });
    expect((await detallPellicula(5, 'clau', fetchFn)).escenes).toEqual([]);
  });

  it('si no hi ha cap cartell en l\'idioma de visualització, fa servir el per defecte', async () => {
    const fetchFn = servidor({
      detall: detall({ ca: { overview: 'x' } }),
      imatges: { posters: [{ iso_639_1: 'en', file_path: '/en.jpg', vote_average: 9 }] },
    });
    expect((await detallPellicula(5, 'clau', fetchFn)).posterPath).toBe('/per-defecte.jpg');
  });

  it('tolera pel·lícules sense durada, gèneres ni crèdits', async () => {
    const fetchFn = servidor({ detall: detall({ ca: { runtime: 0, overview: 'x' } }) });
    expect(await detallPellicula(6, 'clau', fetchFn)).toMatchObject({
      durada: null, generes: [], directors: [], repartiment: [], lema: null, valoracio: null, trailerUrl: null,
    });
  });
});

describe('descarregarCartell', () => {
  it('descarrega la imatge i en retorna el contingut i el tipus', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer, headers: { get: () => 'image/jpeg' },
    });
    const { contingut, contentType } = await descarregarCartell('/odio.jpg', fetchFn);
    expect(fetchFn).toHaveBeenCalledWith('https://image.tmdb.org/t/p/w500/odio.jpg');
    expect(contentType).toBe('image/jpeg');
    expect([...contingut]).toEqual([1, 2, 3]);
  });

  it('llança un error si no es pot descarregar', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(descarregarCartell('/x.jpg', fetchFn)).rejects.toThrow('404');
  });
});
