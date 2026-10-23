import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  entitatPerNom, distribuidoraPerNom, carregaEntitats, fixaEntitatsDeProva, entitatsCarregades,
  ESPERA_REINTENT_MS, TIMEOUT_ENTITATS_MS,
} from '../src/lib/entitats.js';
import { reiniciaMemos } from '../src/lib/memo.js';

// Firestore simulat: `entitats` retorna els documents de `docs` (o rebutja si `docs` és un Error).
const dbFals = (docs) => {
  const db = {
    lectures: 0,
    collection: (nom) => ({
      get: async () => {
        db.lectures += 1;
        if (nom !== 'entitats') throw new Error(`col·lecció inesperada: ${nom}`);
        if (docs instanceof Error) throw docs;
        return { docs: docs.map((dades, i) => ({ id: `id-${i}`, data: () => dades })) };
      },
    }),
  };
  return db;
};

describe('distribuïdores', () => {
  it('troba una distribuïdora pel nom i retorna null si no existeix', () => {
    expect(distribuidoraPerNom('BTeam Pictures')).toEqual({
      logo: '/images/distribuidors/bteam-pictures.png',
      url: 'https://bteampictures.es/',
    });
    expect(distribuidoraPerNom('Ningú')).toBeNull();
  });
});

describe('entitats (catàleg de Firestore)', () => {
  // Rellotge controlat per a l'espera de reintent.
  let instant;
  beforeEach(() => {
    instant = 1000;
    fixaEntitatsDeProva({}, { ara: () => instant });
    reiniciaMemos();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('després de carregar, troba una entitat pel nom; un nom desconegut és null', async () => {
    await carregaEntitats(dbFals([{ nom: 'X', logo: '/l.png', url: 'https://x' }]));
    expect(entitatPerNom('X')).toEqual({ logo: '/l.png', url: 'https://x' });
    expect(entitatPerNom('Y')).toBeNull();
    expect(entitatPerNom(undefined)).toBeNull();
    expect(entitatPerNom('constructor')).toBeNull();
    expect(entitatPerNom('__proto__')).toBeNull();
    expect(entitatPerNom('BTeam Pictures')).toBeNull();
  });

  it('abans de la primera càrrega el catàleg és buit', () => {
    expect(entitatPerNom('X')).toBeNull();
  });

  it('un logo o una URL buits o absents es tracten com a absents', async () => {
    await carregaEntitats(dbFals([
      { nom: 'Sense res' },
      { nom: 'Buida', logo: '', url: '' },
      { nom: 'Només URL', logo: '', url: 'https://u' },
      { nom: 'Només logo', logo: '/n.png' },
    ]));
    expect(entitatPerNom('Sense res')).toEqual({});
    expect(entitatPerNom('Buida')).toEqual({});
    expect(entitatPerNom('Només URL')).toEqual({ url: 'https://u' });
    expect(entitatPerNom('Només logo')).toEqual({ logo: '/n.png' });
    expect(entitatPerNom('Buida')?.logo).toBeUndefined();
  });

  it('una lectura posterior que falla manté el catàleg anterior i no llança', async () => {
    await carregaEntitats(dbFals([{ nom: 'X', logo: '/l.png', url: 'https://x' }]));
    reiniciaMemos();
    await expect(carregaEntitats(dbFals(new Error('caiguda')))).resolves.toBeUndefined();
    expect(entitatPerNom('X')).toEqual({ logo: '/l.png', url: 'https://x' });
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('una fallada a la primera càrrega deixa el catàleg buit', async () => {
    await carregaEntitats(dbFals(new Error('caiguda')));
    expect(entitatPerNom('X')).toBeNull();
  });

  it('una fallada no queda memoritzada: passada l\'espera de reintent, la crida següent torna a llegir', async () => {
    const db = dbFals(new Error('caiguda'));
    await carregaEntitats(db);
    expect(db.lectures).toBe(1);
    instant += ESPERA_REINTENT_MS - 1;
    await carregaEntitats(db);
    expect(db.lectures).toBe(1);
    instant += 1;
    await carregaEntitats(db);
    expect(db.lectures).toBe(2);
    expect(console.error).toHaveBeenCalledTimes(2);
  });

  it('durant l\'espera de reintent resol de seguida sense llegir, sense registrar i amb el catàleg anterior', async () => {
    await carregaEntitats(dbFals([{ nom: 'X', logo: '/l.png' }]));
    reiniciaMemos();
    await carregaEntitats(dbFals(new Error('caiguda')));
    // Una lectura que no acabaria mai: si es fes, la crida no resoldria.
    const penjada = { lectures: 0, collection: () => ({ get: () => { penjada.lectures += 1; return new Promise(() => {}); } }) };
    const resultat = await Promise.race([carregaEntitats(penjada).then(() => 'resolta'), new Promise((r) => setTimeout(() => r('esperant'), 50))]);
    expect(resultat).toBe('resolta');
    expect(penjada.lectures).toBe(0);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(entitatPerNom('X')).toEqual({ logo: '/l.png' });
  });

  it('una lectura correcta passada l\'espera refresca el catàleg', async () => {
    await carregaEntitats(dbFals(new Error('caiguda')));
    expect(entitatPerNom('X')).toBeNull();
    instant += ESPERA_REINTENT_MS;
    await carregaEntitats(dbFals([{ nom: 'X', url: 'https://x' }]));
    expect(entitatPerNom('X')).toEqual({ url: 'https://x' });
  });

  it('dues crides simultànies que fallen registren un sol error', async () => {
    const db = dbFals(new Error('caiguda'));
    await Promise.all([carregaEntitats(db), carregaEntitats(db)]);
    expect(db.lectures).toBe(1);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('la lectura té un temps màxim curt (3 s)', async () => {
    expect(TIMEOUT_ENTITATS_MS).toBe(3000);
    vi.useFakeTimers();
    try {
      fixaEntitatsDeProva({ X: { logo: '/l.png' } }, { ara: () => instant });
      const penjada = { collection: () => ({ get: () => new Promise(() => {}) }) };
      const promesa = carregaEntitats(penjada);
      await vi.advanceTimersByTimeAsync(TIMEOUT_ENTITATS_MS);
      await promesa;
      expect(console.error).toHaveBeenCalledTimes(1);
      expect(entitatPerNom('X')).toEqual({ logo: '/l.png' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('entitatsCarregades: fals fins a la primera lectura correcta, i ho continua sent si falla', async () => {
    expect(entitatsCarregades()).toBe(false);
    await carregaEntitats(dbFals(new Error('caiguda')));
    expect(entitatsCarregades()).toBe(false);
    instant += ESPERA_REINTENT_MS;
    await carregaEntitats(dbFals([{ nom: 'X' }]));
    expect(entitatsCarregades()).toBe(true);
    reiniciaMemos();
    instant += ESPERA_REINTENT_MS;
    await carregaEntitats(dbFals(new Error('caiguda')));
    expect(entitatsCarregades()).toBe(true);
  });

  it('un catàleg buit no compta com a carregat; una lectura posterior amb entitats sí, i després una fallida ho manté', async () => {
    await carregaEntitats(dbFals([]));
    expect(entitatsCarregades()).toBe(false);
    reiniciaMemos();
    await carregaEntitats(dbFals([{ nom: 'X', logo: '/l.png' }]));
    expect(entitatsCarregades()).toBe(true);
    expect(entitatPerNom('X')).toEqual({ logo: '/l.png' });
    reiniciaMemos();
    await carregaEntitats(dbFals([]));
    expect(entitatsCarregades()).toBe(true);
  });

  it('ignora els documents amb un nom que no és un text no buit', async () => {
    await carregaEntitats(dbFals([{ nom: 42, logo: '/n.png' }, { nom: { a: 1 }, logo: '/o.png' }, { nom: '  ', logo: '/b.png' }, { logo: '/s.png' }, { nom: 'Bona', logo: '/b.png' }]));
    expect(entitatPerNom('42')).toBeNull();
    expect(entitatPerNom('[object Object]')).toBeNull();
    expect(entitatPerNom('  ')).toBeNull();
    expect(entitatPerNom('undefined')).toBeNull();
    expect(entitatPerNom('Bona')).toEqual({ logo: '/b.png' });
  });

  it('una lectura correcta es memoritza i les crides simultànies en comparteixen una', async () => {
    const db = dbFals([{ nom: 'X', logo: '/l.png' }]);
    await Promise.all([carregaEntitats(db), carregaEntitats(db)]);
    await carregaEntitats(db);
    expect(db.lectures).toBe(1);
    expect(entitatPerNom('X')).toEqual({ logo: '/l.png' });
  });

  it('una càrrega correcta substitueix el catàleg sencer', async () => {
    await carregaEntitats(dbFals([{ nom: 'X', logo: '/l.png' }]));
    reiniciaMemos();
    await carregaEntitats(dbFals([{ nom: 'Z', url: 'https://z' }]));
    expect(entitatPerNom('X')).toBeNull();
    expect(entitatPerNom('Z')).toEqual({ url: 'https://z' });
  });

  it('fixaEntitatsDeProva injecta un catàleg i també normalitza els camps buits', () => {
    fixaEntitatsDeProva({ A: { logo: '/a.png', url: '' } });
    expect(entitatPerNom('A')).toEqual({ logo: '/a.png' });
  });
});
