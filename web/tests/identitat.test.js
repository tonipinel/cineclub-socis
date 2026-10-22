import { describe, it, expect } from 'vitest';
import {
  CLAU_IDENTITAT,
  llegirIdentitat,
  desarIdentitat,
  esborrarIdentitat,
} from '../src/lib/identitat.js';

function crearStorage(inicial = {}) {
  const dades = new Map(Object.entries(inicial));
  return {
    getItem: (k) => (dades.has(k) ? dades.get(k) : null),
    setItem: (k, v) => dades.set(k, String(v)),
    removeItem: (k) => dades.delete(k),
  };
}

const identitat = { numeroSoci: 42, nomPublic: 'Anna', token: 'abc123' };

describe('identitat del soci', () => {
  it('fa servir una clau fixa', () => {
    expect(CLAU_IDENTITAT).toBe('cineclub.identitat');
  });

  it('retorna null amb l\'storage buit', () => {
    expect(llegirIdentitat(crearStorage())).toBeNull();
  });

  it('retorna null amb JSON corrupte', () => {
    const storage = crearStorage({ [CLAU_IDENTITAT]: '{no és json' });
    expect(llegirIdentitat(storage)).toBeNull();
  });

  it.each(['numeroSoci', 'nomPublic', 'token'])('retorna null si falta %s', (camp) => {
    const incompleta = { ...identitat };
    delete incompleta[camp];
    const storage = crearStorage({ [CLAU_IDENTITAT]: JSON.stringify(incompleta) });
    expect(llegirIdentitat(storage)).toBeNull();
  });

  it('retorna null si el número de soci no és un número', () => {
    const storage = crearStorage({
      [CLAU_IDENTITAT]: JSON.stringify({ ...identitat, numeroSoci: '42' }),
    });
    expect(llegirIdentitat(storage)).toBeNull();
  });

  it('desa i llegeix la identitat (round-trip)', () => {
    const storage = crearStorage();
    desarIdentitat(identitat, storage);
    expect(llegirIdentitat(storage)).toEqual(identitat);
  });

  it('esborra la identitat', () => {
    const storage = crearStorage();
    desarIdentitat(identitat, storage);
    esborrarIdentitat(storage);
    expect(llegirIdentitat(storage)).toBeNull();
  });

  it('no peta si no hi ha storage disponible', () => {
    expect(llegirIdentitat(null)).toBeNull();
    expect(() => desarIdentitat(identitat, null)).not.toThrow();
    expect(() => esborrarIdentitat(null)).not.toThrow();
  });

  it('desarIdentitat no peta si setItem llança (quota, mode privat)', () => {
    const storage = { ...crearStorage(), setItem: () => { throw new Error('QuotaExceededError'); } };
    expect(() => desarIdentitat(identitat, storage)).not.toThrow();
  });

  it('esborrarIdentitat no peta si removeItem llança', () => {
    const storage = { ...crearStorage(), removeItem: () => { throw new Error('bloquejat'); } };
    expect(() => esborrarIdentitat(storage)).not.toThrow();
  });

  it.each(['nomPublic', 'token'])('retorna null si %s no és text', (camp) => {
    for (const valor of [42, true, {}, ['Anna'], null, '', '   ']) {
      const storage = crearStorage({ [CLAU_IDENTITAT]: JSON.stringify({ ...identitat, [camp]: valor }) });
      expect(llegirIdentitat(storage), JSON.stringify(valor)).toBeNull();
    }
  });

  it('retalla els espais de nomPublic i token', () => {
    const storage = crearStorage({ [CLAU_IDENTITAT]: JSON.stringify({ ...identitat, nomPublic: '  Anna ', token: ' abc123\n' }) });
    expect(llegirIdentitat(storage)).toEqual(identitat);
  });

  it('respecta els límits de longitud (100 el nom, 200 el token) i rebutja el que els passa', () => {
    const llegeix = (canvi) => llegirIdentitat(crearStorage({ [CLAU_IDENTITAT]: JSON.stringify({ ...identitat, ...canvi }) }));
    expect(llegeix({ nomPublic: 'a'.repeat(100) })).not.toBeNull();
    expect(llegeix({ nomPublic: 'a'.repeat(101) })).toBeNull();
    expect(llegeix({ token: 'a'.repeat(200) })).not.toBeNull();
    expect(llegeix({ token: 'a'.repeat(201) })).toBeNull();
  });

  it('retorna null si el JSON és null o no és un objecte', () => {
    for (const brut of ['null', '"text"', '42', '[]']) {
      expect(llegirIdentitat(crearStorage({ [CLAU_IDENTITAT]: brut })), brut).toBeNull();
    }
  });
});
