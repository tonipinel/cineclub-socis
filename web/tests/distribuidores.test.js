import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  distribuidoraPerNom, distribuidoraPerId, carregaDistribuidores, fixaDistribuidoresDeProva, distribuidoresCarregades,
  ESPERA_REINTENT_MS, TIMEOUT_DISTRIBUIDORES_MS,
} from '../src/lib/distribuidores.js';
import { reiniciaMemos } from '../src/lib/memo.js';

// Firestore simulat: `distribuidores` retorna els documents de `docs` (o rebutja si `docs` és un Error).
const dbFals = (docs) => {
  const db = {
    lectures: 0,
    collection: (nom) => ({
      get: async () => {
        db.lectures += 1;
        if (nom !== 'distribuidores') throw new Error(`col·lecció inesperada: ${nom}`);
        if (docs instanceof Error) throw docs;
        return { docs: docs.map((dades, i) => ({ id: `id-${i}`, data: () => dades })) };
      },
    }),
  };
  return db;
};

const LOGO = 'https://firebasestorage.googleapis.com/v0/b/x/o/distribuidores%2Fl.png?alt=media';
const PRIVADES = ['preu', 'condicions', 'contacte', 'correu', 'web'];

describe('distribuïdores (catàleg de Firestore)', () => {
  let instant;
  beforeEach(() => {
    instant = 1000;
    fixaDistribuidoresDeProva({}, { ara: () => instant });
    reiniciaMemos();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('només projecta el logo i la URL pública: cap camp privat no arriba a la web', async () => {
    await carregaDistribuidores(dbFals([{
      nom: 'A Contracorriente', logo: LOGO, urlPublica: 'https://acontracorrientefilms.com/',
      preu: 12, condicions: 'secret', contacte: 'x', correu: 'y', web: 'z',
    }]));
    const d = distribuidoraPerNom('A Contracorriente');
    expect(d).toEqual({ logo: LOGO, url: 'https://acontracorrientefilms.com/' });
    expect(Object.keys(d).sort()).toEqual(['logo', 'url']);
    for (const clau of PRIVADES) expect(d).not.toHaveProperty(clau);
    expect(JSON.stringify(d)).not.toMatch(/secret|"x"|"y"|"z"|12/);
  });

  it('la URL de la fitxa és `urlPublica`, mai el camp intern `web`', async () => {
    await carregaDistribuidores(dbFals([{ nom: 'D', web: 'https://interna' }]));
    expect(distribuidoraPerNom('D')).toEqual({});
  });

  it('sense logo ni urlPublica (o buits) la distribuïdora és {}', async () => {
    await carregaDistribuidores(dbFals([
      { nom: 'Sense res' },
      { nom: 'Buida', logo: '', urlPublica: '' },
      { nom: 'Només URL', urlPublica: 'https://u' },
      { nom: 'Només logo', logo: LOGO },
    ]));
    expect(distribuidoraPerNom('Sense res')).toEqual({});
    expect(distribuidoraPerNom('Buida')).toEqual({});
    expect(distribuidoraPerNom('Només URL')).toEqual({ url: 'https://u' });
    expect(distribuidoraPerNom('Només logo')).toEqual({ logo: LOGO });
  });

  it('un nom desconegut o heretat és null', async () => {
    await carregaDistribuidores(dbFals([{ nom: 'X', logo: LOGO }]));
    expect(distribuidoraPerNom('Y')).toBeNull();
    expect(distribuidoraPerNom(undefined)).toBeNull();
    expect(distribuidoraPerNom('constructor')).toBeNull();
    expect(distribuidoraPerNom('__proto__')).toBeNull();
  });

  it('no llegeix el JSON antic: abans de carregar, les distribuïdores del JSON no existeixen', () => {
    expect(distribuidoraPerNom('BTeam Pictures')).toBeNull();
    expect(distribuidoraPerNom('A Contracorriente Films')).toBeNull();
  });

  it('cap fitxer de src/ no importa distribuidors.json', () => {
    const fitxers = (dir) => readdirSync(dir).flatMap((f) => {
      const cami = join(dir, f);
      return statSync(cami).isDirectory() ? fitxers(cami) : [cami];
    });
    const font = fitxers(new URL('../src', import.meta.url).pathname).filter((f) => /\.(?:js|mjs|ts|astro|jsx)$/.test(f));
    const qui = font.filter((f) => readFileSync(f, 'utf8').includes('distribuidors.json'));
    expect(qui).toEqual([]);
  });

  it('ignora els documents sense un nom de text no buit', async () => {
    await carregaDistribuidores(dbFals([{ logo: LOGO }, { nom: 42, logo: LOGO }, { nom: '  ', logo: LOGO }, { nom: 'Bona', logo: LOGO }]));
    expect(distribuidoraPerNom('undefined')).toBeNull();
    expect(distribuidoraPerNom('42')).toBeNull();
    expect(distribuidoraPerNom('  ')).toBeNull();
    expect(distribuidoraPerNom('Bona')).toEqual({ logo: LOGO });
  });

  it('una lectura posterior que falla manté el catàleg anterior i no llança', async () => {
    await carregaDistribuidores(dbFals([{ nom: 'X', logo: LOGO }]));
    reiniciaMemos();
    await expect(carregaDistribuidores(dbFals(new Error('caiguda')))).resolves.toBeUndefined();
    expect(distribuidoraPerNom('X')).toEqual({ logo: LOGO });
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('una fallada no queda memoritzada: passada l\'espera de reintent, torna a llegir', async () => {
    const db = dbFals(new Error('caiguda'));
    await carregaDistribuidores(db);
    instant += ESPERA_REINTENT_MS - 1;
    await carregaDistribuidores(db);
    expect(db.lectures).toBe(1);
    instant += 1;
    await carregaDistribuidores(db);
    expect(db.lectures).toBe(2);
    instant += ESPERA_REINTENT_MS;
    await carregaDistribuidores(dbFals([{ nom: 'X', urlPublica: 'https://x' }]));
    expect(distribuidoraPerNom('X')).toEqual({ url: 'https://x' });
  });

  it('una lectura correcta es memoritza i les crides simultànies en comparteixen una', async () => {
    const db = dbFals([{ nom: 'X', logo: LOGO }]);
    await Promise.all([carregaDistribuidores(db), carregaDistribuidores(db)]);
    await carregaDistribuidores(db);
    expect(db.lectures).toBe(1);
  });

  it('la lectura té un temps màxim curt (3 s)', async () => {
    expect(TIMEOUT_DISTRIBUIDORES_MS).toBe(3000);
    vi.useFakeTimers();
    try {
      fixaDistribuidoresDeProva({ X: { logo: LOGO } }, { ara: () => instant });
      const promesa = carregaDistribuidores({ collection: () => ({ get: () => new Promise(() => {}) }) });
      await vi.advanceTimersByTimeAsync(TIMEOUT_DISTRIBUIDORES_MS);
      await promesa;
      expect(console.error).toHaveBeenCalledTimes(1);
      expect(distribuidoraPerNom('X')).toEqual({ logo: LOGO });
    } finally {
      vi.useRealTimers();
    }
  });

  it('distribuidoresCarregades: un catàleg buit o una fallada no compten; un de ple sí i es manté', async () => {
    expect(distribuidoresCarregades()).toBe(false);
    await carregaDistribuidores(dbFals([]));
    expect(distribuidoresCarregades()).toBe(false);
    reiniciaMemos();
    await carregaDistribuidores(dbFals([{ nom: 'X' }]));
    expect(distribuidoresCarregades()).toBe(true);
    reiniciaMemos();
    instant += ESPERA_REINTENT_MS;
    await carregaDistribuidores(dbFals(new Error('caiguda')));
    expect(distribuidoresCarregades()).toBe(true);
  });

  it('fixaDistribuidoresDeProva injecta un catàleg públic i normalitza els camps buits', () => {
    fixaDistribuidoresDeProva({ A: { logo: LOGO, url: '' } });
    expect(distribuidoraPerNom('A')).toEqual({ logo: LOGO });
  });

  it('fixaDistribuidoresDeProva indexa també per id les entrades que en porten', () => {
    fixaDistribuidoresDeProva({ A: { id: 'd1', logo: LOGO, url: '' }, B: { url: 'https://b' } });
    expect(distribuidoraPerNom('A')).toEqual({ logo: LOGO });
    expect(distribuidoraPerId('d1')).toEqual({ nom: 'A', logo: LOGO });
    expect(distribuidoraPerId('B')).toBeNull();
  });
});

describe('distribuïdores per id', () => {
  let instant;
  beforeEach(() => {
    instant = 1000;
    fixaDistribuidoresDeProva({}, { ara: () => instant });
    reiniciaMemos();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('l\'id és el del document i només en projecta el nom, el logo i la URL pública', async () => {
    await carregaDistribuidores(dbFals([
      { nom: 'Una altra' },
      {
        id: 'fals', nom: 'A Contracorriente', logo: LOGO, urlPublica: 'https://acontracorrientefilms.com/',
        preu: 12, condicions: 'secret', contacte: 'x', correu: 'y', web: 'z',
      },
    ]));
    const d = distribuidoraPerId('id-1');
    expect(d).toEqual({ nom: 'A Contracorriente', logo: LOGO, url: 'https://acontracorrientefilms.com/' });
    expect(Object.keys(d).sort()).toEqual(['logo', 'nom', 'url']);
    expect(JSON.stringify(d)).not.toMatch(/secret|"x"|"y"|"z"|12|fals/);
    expect(distribuidoraPerId('id-0')).toEqual({ nom: 'Una altra' });
    expect(distribuidoraPerId('fals')).toBeNull();
    expect(distribuidoraPerNom('A Contracorriente')).toEqual({ logo: LOGO, url: 'https://acontracorrientefilms.com/' });
  });

  it('un id desconegut o heretat és null', async () => {
    await carregaDistribuidores(dbFals([{ nom: 'X', logo: LOGO }]));
    expect(distribuidoraPerId('id-9')).toBeNull();
    expect(distribuidoraPerId(undefined)).toBeNull();
    expect(distribuidoraPerId('constructor')).toBeNull();
    expect(distribuidoraPerId('__proto__')).toBeNull();
    expect(distribuidoraPerId('X')).toBeNull();
  });

  it('els documents sense un nom de text no buit tampoc no s\'indexen per id', async () => {
    await carregaDistribuidores(dbFals([{ logo: LOGO }, { nom: 42, logo: LOGO }, { nom: '  ', logo: LOGO }, { nom: 'Bona', logo: LOGO }]));
    expect(distribuidoraPerId('id-0')).toBeNull();
    expect(distribuidoraPerId('id-1')).toBeNull();
    expect(distribuidoraPerId('id-2')).toBeNull();
    expect(distribuidoraPerId('id-3')).toEqual({ nom: 'Bona', logo: LOGO });
  });

  it('una lectura posterior que falla manté també l\'índex per id', async () => {
    await carregaDistribuidores(dbFals([{ nom: 'X', logo: LOGO }]));
    reiniciaMemos();
    await expect(carregaDistribuidores(dbFals(new Error('caiguda')))).resolves.toBeUndefined();
    expect(distribuidoraPerId('id-0')).toEqual({ nom: 'X', logo: LOGO });
  });

  it('un catàleg nou substitueix l\'índex per id sencer', async () => {
    await carregaDistribuidores(dbFals([{ nom: 'X', logo: LOGO }, { nom: 'Y' }]));
    reiniciaMemos();
    await carregaDistribuidores(dbFals([{ nom: 'Z' }]));
    expect(distribuidoraPerId('id-0')).toEqual({ nom: 'Z' });
    expect(distribuidoraPerId('id-1')).toBeNull();
  });
});
