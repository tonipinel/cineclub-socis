import { describe, it, expect } from 'vitest';
import {
  maximNumeroSoci, reservarNumeroSoci, ErrorComptadorSocis, MISSATGE_COMPTADOR_ABSENT, MISSATGE_COMPTADOR_INVALID,
} from './numeroSoci';

// Abans `properNumeroSoci(numeros)` retornava max+1 i era tota l'assignació. Ara el número surt del comptador
// transaccional (`reservarNumeroSoci`) i el màxim llegit dels socis només és una guarda contra un comptador endarrerit;
// les mateixes proves, amb el resultat (max, no max+1), queden aquí.
describe('maximNumeroSoci', () => {
  it('retorna 0 quan no hi ha cap soci', () => {
    expect(maximNumeroSoci([])).toBe(0);
  });

  it('retorna el número més alt', () => {
    expect(maximNumeroSoci([1, 2, 5])).toBe(5);
  });

  it('ignora valors buits o no numèrics (socis sense número assignat)', () => {
    expect(maximNumeroSoci([1, '', 3, undefined, 'abc'])).toBe(3);
  });

  it('funciona amb números guardats com a string', () => {
    expect(maximNumeroSoci(['1', '2', '10'])).toBe(10);
  });

  it('ignora números no enters (p. ex. 1061.5 o «1061.5»), perquè no enverinin el comptador', () => {
    expect(maximNumeroSoci([12, 1061.5, '1061.5', '41'])).toBe(41);
  });
});

// Firestore fals en memòria amb la semàntica de les transaccions del client: cada intent llegeix i acumula les
// escriptures; en confirmar, si algun document llegit ha canviat des de la lectura (o ha aparegut), es descarta tot i
// es torna a començar des de zero. Si la funció llança, no s'escriu res.
function firestoreFals(inicial = {}) {
  const docs = new Map(Object.entries(inicial).map(([ref, dades]) => [ref, { dades, versio: 1 }]));
  const estat = { intents: 0 };
  const versio = (ref) => docs.get(ref)?.versio ?? 0;

  async function runTransaction(fn) {
    for (let intent = 0; intent < 5; intent += 1) {
      estat.intents += 1;
      const llegits = new Map();
      const escrits = [];
      const tx = {
        get: async (ref) => {
          llegits.set(ref, versio(ref));
          const d = docs.get(ref);
          return { exists: () => Boolean(d), data: () => (d ? { ...d.dades } : undefined) };
        },
        set: (ref, dades) => { escrits.push([ref, dades, false]); return tx; },
        update: (ref, dades) => {
          if (!docs.has(ref)) throw new Error(`update d'un document inexistent: ${ref}`);
          escrits.push([ref, dades, true]);
          return tx;
        },
      };
      const resultat = await fn(tx);
      // Deixa córrer les altres transaccions pendents abans de confirmar, com passa amb la xarxa.
      await new Promise((resol) => { setTimeout(resol, 0); });
      if ([...llegits].some(([ref, v]) => versio(ref) !== v)) continue;
      for (const [ref, dades, fusiona] of escrits) {
        docs.set(ref, { dades: fusiona ? { ...docs.get(ref).dades, ...dades } : dades, versio: versio(ref) + 1 });
      }
      return resultat;
    }
    throw new Error('massa intents');
  }

  return { docs, estat, runTransaction, dades: (ref) => docs.get(ref)?.dades };
}

const COMPTADOR = 'configuracio/socis';

describe('reservarNumeroSoci', () => {
  it('avança el comptador i retorna el número reservat', async () => {
    const db = firestoreFals({ [COMPTADOR]: { ultimNumeroSoci: 41 } });
    const numero = await db.runTransaction((tx) => reservarNumeroSoci(tx, COMPTADOR, 41));
    expect(numero).toBe(42);
    expect(db.dades(COMPTADOR)).toEqual({ ultimNumeroSoci: 42 });
  });

  it('si el comptador va endarrerit respecte dels socis que ja hi ha (números manuals o importats), salta per sobre del màxim', async () => {
    const db = firestoreFals({ [COMPTADOR]: { ultimNumeroSoci: 10 } });
    const numero = await db.runTransaction((tx) => reservarNumeroSoci(tx, COMPTADOR, 41));
    expect(numero).toBe(42);
    expect(db.dades(COMPTADOR)).toEqual({ ultimNumeroSoci: 42 });
  });

  it("no reutilitza el número d'un soci esborrat (el comptador no baixa encara que el màxim actual sigui menor)", async () => {
    const db = firestoreFals({ [COMPTADOR]: { ultimNumeroSoci: 42 } });
    expect(await db.runTransaction((tx) => reservarNumeroSoci(tx, COMPTADOR, 41))).toBe(43);
  });

  it('dues reserves simultànies amb el mateix màxim (obsolet) donen números diferents: la segona es reintenta', async () => {
    const db = firestoreFals({ [COMPTADOR]: { ultimNumeroSoci: 41 } });
    const numeros = await Promise.all([
      db.runTransaction((tx) => reservarNumeroSoci(tx, COMPTADOR, 41)),
      db.runTransaction((tx) => reservarNumeroSoci(tx, COMPTADOR, 41)),
    ]);
    expect([...numeros].sort()).toEqual([42, 43]);
    expect(db.dades(COMPTADOR)).toEqual({ ultimNumeroSoci: 43 });
    expect(db.estat.intents).toBe(3);
  });

  it('cinc reserves simultànies, també amb el comptador endarrerit, donen cinc números diferents i consecutius', async () => {
    const db = firestoreFals({ [COMPTADOR]: { ultimNumeroSoci: 3 } });
    const numeros = await Promise.all(Array.from({ length: 5 }, () => (
      db.runTransaction((tx) => reservarNumeroSoci(tx, COMPTADOR, 41))
    )));
    expect([...numeros].sort()).toEqual([42, 43, 44, 45, 46]);
  });

  it('sense comptador, llança un error clar i no escriu res', async () => {
    const db = firestoreFals({});
    const promesa = db.runTransaction((tx) => reservarNumeroSoci(tx, COMPTADOR, 41));
    await expect(promesa).rejects.toBeInstanceOf(ErrorComptadorSocis);
    await expect(promesa).rejects.toThrow(MISSATGE_COMPTADOR_ABSENT);
    expect(db.docs.size).toBe(0);
  });

  it.each([
    ['sense el camp', {}],
    ['negatiu', { ultimNumeroSoci: -1 }],
    ['decimal', { ultimNumeroSoci: 4.5 }],
    ['text', { ultimNumeroSoci: '41' }],
  ])('amb un comptador no vàlid (%s), llança un error clar i no el toca', async (_nom, dades) => {
    const db = firestoreFals({ [COMPTADOR]: dades });
    const promesa = db.runTransaction((tx) => reservarNumeroSoci(tx, COMPTADOR, 41));
    await expect(promesa).rejects.toBeInstanceOf(ErrorComptadorSocis);
    await expect(promesa).rejects.toThrow(MISSATGE_COMPTADOR_INVALID);
    expect(db.dades(COMPTADOR)).toEqual(dades);
  });

  it('amb un soci amb número no enter, el comptador continua sent enter', async () => {
    const db = firestoreFals({ [COMPTADOR]: { ultimNumeroSoci: 41 } });
    const numero = await db.runTransaction((tx) => reservarNumeroSoci(tx, COMPTADOR, maximNumeroSoci([41, 1061.5, '1061.5'])));
    expect(numero).toBe(42);
    expect(db.dades(COMPTADOR)).toEqual({ ultimNumeroSoci: 42 });
  });

  it.each([
    ['decimal', 1061.5],
    ['no numèric', Number.NaN],
    ['infinit', Infinity],
  ])('si el màxim rebut és %s, llança un error clar sense escriure res', async (_nom, maxim) => {
    const db = firestoreFals({ [COMPTADOR]: { ultimNumeroSoci: 41 } });
    const promesa = db.runTransaction((tx) => reservarNumeroSoci(tx, COMPTADOR, maxim));
    await expect(promesa).rejects.toBeInstanceOf(ErrorComptadorSocis);
    expect(db.dades(COMPTADOR)).toEqual({ ultimNumeroSoci: 41 });
  });

  it('els missatges en català expliquen què cal fer', () => {
    expect(MISSATGE_COMPTADOR_ABSENT).toMatch(/comptador de números de soci/);
    expect(MISSATGE_COMPTADOR_ABSENT).toMatch(/inicialitza-comptador-socis/);
    expect(MISSATGE_COMPTADOR_INVALID).toMatch(/inicialitza-comptador-socis/);
  });
});
