import { describe, it, expect, vi } from 'vitest';
import fitxa from './fitxa-proposta.js';

const { CAMPS_EDITABLES, campsProtegits, filtrarCanvis, buidarEditats, desarFitxaAmbDependencies } = fitxa;

const ordenat = (conjunt) => [...conjunt].sort();

describe('CAMPS_EDITABLES', () => {
  it('llista els camps de la pel·lícula que l\'admin pot editar', () => {
    expect(CAMPS_EDITABLES).toEqual(['titol', 'titolLocal', 'any', 'durada', 'directors', 'guionistes', 'paisos',
      'idiomes', 'generes', 'repartiment', 'lema', 'sinopsi', 'trailerUrl', 'imatgeUrl']);
  });
});

describe('campsProtegits', () => {
  it('és buit sense campsEditats ni sinopsi catalana', () => {
    expect(ordenat(campsProtegits({ tmdbId: 10, sinopsi: 'Hola', sinopsiIdioma: 'es' }, 10))).toEqual([]);
  });

  it('retorna els campsEditats', () => {
    expect(ordenat(campsProtegits({ tmdbId: 10, campsEditats: ['directors', 'repartiment'] }, 10)))
      .toEqual(['directors', 'repartiment']);
  });

  it('ignora noms desconeguts i campsEditats que no són una llista', () => {
    expect(ordenat(campsProtegits({ tmdbId: 10, campsEditats: ['directors', 'tmdbId', 'cartellPath', 'res'] }, 10)))
      .toEqual(['directors']);
    expect(ordenat(campsProtegits({ tmdbId: 10, campsEditats: 'directors' }, 10))).toEqual([]);
    expect(ordenat(campsProtegits({ tmdbId: 10, campsEditats: { directors: true } }, 10))).toEqual([]);
  });

  it('protegeix la sinopsi si ja està en català', () => {
    expect(ordenat(campsProtegits({ tmdbId: 10, sinopsi: 'Una història.', sinopsiIdioma: 'ca', campsEditats: ['lema'] }, 10)))
      .toEqual(['lema', 'sinopsi']);
  });

  it('no protegeix la sinopsi catalana si és buida', () => {
    expect(ordenat(campsProtegits({ tmdbId: 10, sinopsi: '', sinopsiIdioma: 'ca' }, 10))).toEqual([]);
  });

  it('és buit si es tria una pel·lícula diferent', () => {
    expect(ordenat(campsProtegits({ tmdbId: 10, sinopsi: 'Hola', sinopsiIdioma: 'ca', campsEditats: ['directors'] }, 11)))
      .toEqual([]);
  });

  it('és buit si es demana sobreescriure', () => {
    expect(ordenat(campsProtegits(
      { tmdbId: 10, sinopsi: 'Hola', sinopsiIdioma: 'ca', campsEditats: ['directors'] }, 10, { sobreescriure: true },
    ))).toEqual([]);
  });

  it('protegeix els campsEditats d\'una proposta sense tmdbId', () => {
    expect(ordenat(campsProtegits({ campsEditats: ['titol'] }, 10))).toEqual(['titol']);
  });
});

describe('filtrarCanvis', () => {
  const canvis = {
    tmdbId: 10, titol: 'Film', directors: ['A'], sinopsi: 'Overview', sinopsiIdioma: 'en',
    imatgeUrl: 'https://nou', cartellPath: 'carteils/p-1.jpg',
  };

  it('treu els camps protegits, sinopsiIdioma amb la sinopsi i cartellPath amb imatgeUrl, sense mutar l\'entrada', () => {
    const copia = JSON.parse(JSON.stringify(canvis));
    expect(filtrarCanvis(canvis, new Set(['directors', 'sinopsi', 'imatgeUrl']))).toEqual({ tmdbId: 10, titol: 'Film' });
    expect(canvis).toEqual(copia);
  });

  it('sense camps protegits retorna una còpia igual', () => {
    const resultat = filtrarCanvis(canvis, new Set());
    expect(resultat).toEqual(canvis);
    expect(resultat).not.toBe(canvis);
  });
});

describe('buidarEditats', () => {
  it('és cert si es demana sobreescriure', () => {
    expect(buidarEditats({ tmdbId: 10, campsEditats: ['titol'] }, 10, { sobreescriure: true })).toBe(true);
  });

  it('és cert si canvia la pel·lícula', () => {
    expect(buidarEditats({ tmdbId: 10, campsEditats: ['titol'] }, 11, { sobreescriure: false })).toBe(true);
  });

  it('és fals en una actualització normal', () => {
    expect(buidarEditats({ tmdbId: 10, campsEditats: ['titol'] }, 10, { sobreescriure: false })).toBe(false);
    expect(buidarEditats({ tmdbId: 10 }, 10, {})).toBe(false);
  });
});

describe('desarFitxaAmbDependencies', () => {
  const ESBORRAR = { esborrar: true };
  const pellicula = (extra = {}) => ({
    tmdbId: 10, titol: 'Film', titolLocal: 'Peli', any: 2020, sinopsi: 'Overview', sinopsiIdioma: 'en',
    durada: 100, directors: ['Dir'], generes: ['Drama'], escenes: ['/e.jpg'], guionistes: ['Guio'],
    repartiment: [{ nom: 'Actor', personatge: 'Paper' }], lema: 'Lema', paisos: ['França'], idiomes: ['Francès'],
    valoracio: 7.5, tmdbUrl: 'https://www.themoviedb.org/movie/10', trailerUrl: 'https://youtu.be/x',
    posterPath: '/p.jpg', ...extra,
  });
  const CANVIS_TMDB = {
    tmdbId: 10, titol: 'Film', titolLocal: 'Peli', any: 2020, sinopsi: 'Overview', sinopsiIdioma: 'en',
    durada: 100, directors: ['Dir'], generes: ['Drama'], imatges: ['/e.jpg'], guionistes: ['Guio'],
    repartiment: [{ nom: 'Actor', personatge: 'Paper' }], lema: 'Lema', paisos: ['França'], idiomes: ['Francès'],
    valoracio: 7.5, tmdbUrl: 'https://www.themoviedb.org/movie/10', trailerUrl: 'https://youtu.be/x',
  };
  const RUTA = 'carteils/p1-1000.jpg';
  const URL = `https://firebasestorage.googleapis.com/v0/b/bucket-prova/o/${encodeURIComponent(RUTA)}?alt=media`;

  function dobles(actual, dadesPellicula = pellicula()) {
    const update = vi.fn(async () => {});
    const doc = vi.fn(() => ({ get: async () => ({ exists: actual !== undefined, data: () => actual }), update }));
    const save = vi.fn(async () => {});
    const del = vi.fn(async () => {});
    const file = vi.fn(() => ({ save, delete: del }));
    const deps = {
      db: { doc },
      bucket: { name: 'bucket-prova', file },
      detallPellicula: vi.fn(async () => dadesPellicula),
      descarregarCartell: vi.fn(async () => ({ contingut: 'bytes', contentType: 'image/jpeg' })),
      FieldValue: { delete: () => ESBORRAR },
      ara: () => 1000,
    };
    return { deps, update, doc, save, del, file };
  }

  it('sense camps editats desa tota la fitxa amb el cartell nou i esborra els anteriors', async () => {
    const { deps, update, doc, save, del, file } = dobles({ tmdbId: 10, cartellPath: 'carteils/p1-1.jpg' });
    const resultat = await desarFitxaAmbDependencies(deps, 'p1', 10);
    expect(doc).toHaveBeenCalledWith('propostes/p1');
    expect(deps.detallPellicula).toHaveBeenCalledWith(10);
    expect(deps.descarregarCartell).toHaveBeenCalledWith('/p.jpg');
    expect(save).toHaveBeenCalledWith('bytes', { contentType: 'image/jpeg', metadata: { cacheControl: 'public, max-age=31536000' } });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ ...CANVIS_TMDB, cartellPath: RUTA, imatgeUrl: URL });
    expect(file.mock.calls.map(([ruta]) => ruta)).toEqual([RUTA, 'carteils/p1-1.jpg', 'carteils/p1.jpg']);
    expect(del).toHaveBeenCalledTimes(2);
    expect(resultat).toEqual({ ...CANVIS_TMDB, cartellPath: RUTA, imatgeUrl: URL });
    expect(resultat).not.toHaveProperty('campsEditats');
  });

  it('amb imatgeUrl protegit no descarrega ni desa ni esborra cap cartell', async () => {
    const actual = { tmdbId: 10, imatgeUrl: 'https://meu', cartellPath: 'carteils/p1-1.jpg', campsEditats: ['imatgeUrl'] };
    const { deps, update, file } = dobles(actual);
    const resultat = await desarFitxaAmbDependencies(deps, 'p1', 10);
    expect(deps.descarregarCartell).not.toHaveBeenCalled();
    expect(file).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(CANVIS_TMDB);
    expect(resultat).toEqual({ ...CANVIS_TMDB, imatgeUrl: 'https://meu' });
  });

  it('no escriu els camps protegits i retorna els valors conservats', async () => {
    const actual = {
      tmdbId: 10, directors: ['Meu'], sinopsi: 'Una història.', sinopsiIdioma: 'ca', campsEditats: ['directors'],
    };
    const { deps, update } = dobles(actual, pellicula({ posterPath: null, trailerUrl: null }));
    const resultat = await desarFitxaAmbDependencies(deps, 'p1', 10);
    const esperat = { ...CANVIS_TMDB };
    for (const camp of ['directors', 'sinopsi', 'sinopsiIdioma', 'trailerUrl']) delete esperat[camp];
    expect(update).toHaveBeenCalledWith(esperat);
    expect(resultat).toEqual({ ...esperat, directors: ['Meu'], sinopsi: 'Una història.', sinopsiIdioma: 'ca' });
    expect(resultat).not.toHaveProperty('campsEditats');
  });

  it('amb sobreescriure ho escriu tot i marca campsEditats per esborrar', async () => {
    const actual = {
      tmdbId: 10, directors: ['Meu'], sinopsi: 'Una història.', sinopsiIdioma: 'ca',
      campsEditats: ['directors', 'imatgeUrl'], imatgeUrl: 'https://meu',
    };
    const { deps, update, save } = dobles(actual);
    const resultat = await desarFitxaAmbDependencies(deps, 'p1', 10, { sobreescriure: true });
    expect(save).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ ...CANVIS_TMDB, cartellPath: RUTA, imatgeUrl: URL, campsEditats: ESBORRAR });
    expect(resultat).toEqual({ ...CANVIS_TMDB, cartellPath: RUTA, imatgeUrl: URL, campsEditats: [] });
  });

  it('amb una pel·lícula diferent ho escriu tot i marca campsEditats per esborrar', async () => {
    const actual = { tmdbId: 9, directors: ['Meu'], sinopsi: 'Una història.', sinopsiIdioma: 'ca', campsEditats: ['directors'] };
    const { deps, update } = dobles(actual, pellicula({ posterPath: null }));
    const resultat = await desarFitxaAmbDependencies(deps, 'p1', 10);
    expect(update).toHaveBeenCalledWith({ ...CANVIS_TMDB, campsEditats: ESBORRAR });
    expect(resultat).toEqual({ ...CANVIS_TMDB, campsEditats: [] });
  });

  it('si la proposta no existeix falla abans de consultar TMDB i no desa res', async () => {
    const { deps, update, file } = dobles(undefined);
    await expect(desarFitxaAmbDependencies(deps, 'p1', 10))
      .rejects.toMatchObject({ codi: 'not-found', message: 'La proposta no existeix.' });
    expect(deps.detallPellicula).not.toHaveBeenCalled();
    expect(deps.descarregarCartell).not.toHaveBeenCalled();
    expect(file).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
