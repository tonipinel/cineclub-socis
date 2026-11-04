import { describe, it, expect, vi } from 'vitest';
import {
  etiquetaVersio, peliculaFlyer, flyerPerId, sessionsDelFlyer, darrerFlyerPublicat, potVeure,
} from '../src/lib/flyers.js';
import { conWhere } from './helpers/firestore.js';

const sessio = (id, data, hora, publica = {}, extra = {}) => ({
  id, titol: id, slug: id, publicada: true, data, hora, publica, ...extra,
});
const ts = (ms) => ({ toMillis: () => ms });

// Db fals amb les col·leccions `sessions` i `flyers` (`doc(id).get()`, `getAll`, `where().get()`).
function dbFals({ sessions = [], flyers = [] }) {
  const doc = (id, dades) => ({ id, exists: Boolean(dades), data: () => dades });
  const perNom = { sessions, flyers };
  return {
    collection: (nom) => {
      const docs = perNom[nom];
      return conWhere({
        doc: (id) => ({ id, get: async () => doc(id, docs.find((d) => d.id === id)) }),
        get: async () => ({ docs: docs.map(({ id, ...dades }) => doc(id, dades)) }),
      });
    },
    getAll: async (...refs) => Promise.all(refs.map((r) => r.get())),
  };
}

describe('etiquetaVersio', () => {
  it.each([
    ['vose', 'VOSE'], ['vosc', 'VOSC'], ['vo', 'VO'], ['doblada-cat', 'En català'], ['doblada-cast', 'En castellà'],
  ])('%s -> %s', (versioTipus, text) => {
    expect(etiquetaVersio({ publica: { versioTipus, idioma: 'Anglès' } })).toEqual({ text, idioma: 'Anglès' });
  });
  it('sense versió deixa el text buit', () => {
    expect(etiquetaVersio({ publica: { idioma: 'Francès' } })).toEqual({ text: '', idioma: 'Francès' });
    expect(etiquetaVersio({ publica: {} })).toEqual({ text: '', idioma: '' });
  });
});

describe('peliculaFlyer', () => {
  it('amb traducció, gèneres i cartell', () => {
    const s = sessio('anatomie', '2026-11-05', '19:00', {
      titol: 'Anatomie', titolTraduit: 'Anatomia', cartell: '/c.jpg', generes: ['Drama', 'Thriller'], versioTipus: 'vose', idioma: 'Alemany',
    });
    expect(peliculaFlyer(s)).toEqual({
      id: 'anatomie', titol: 'Anatomie', titolTraduit: 'Anatomia', dataText: 'Dj 5 nov', imatge: '/c.jpg',
      generes: 'Drama · Thriller', versio: 'VOSE', idioma: 'Alemany', url: '/programacio/2026/anatomie/',
    });
  });
  it('sense traducció ni cartell ni gèneres', () => {
    const p = peliculaFlyer(sessio('x', '2026-12-03', '19:00', { titol: 'X', titolTraduit: 'x' }));
    expect(p).toMatchObject({ titolTraduit: '', imatge: '', generes: '', versio: '', dataText: 'Dj 3 des' });
  });
});

describe('sessionsDelFlyer', () => {
  it('descarta despublicades i inexistents, i ordena per data i hora', async () => {
    const db = dbFals({ sessions: [
      sessio('b', '2026-12-03', '19:00'),
      sessio('a', '2026-11-05', '21:00'),
      sessio('c', '2026-11-05', '19:00'),
      sessio('d', '2026-11-06', '19:00', {}, { publicada: false }),
    ] });
    const r = await sessionsDelFlyer({ sessionsIds: ['b', 'a', 'd', 'no-existeix', 'c'] }, db);
    expect(r.map((s) => s.id)).toEqual(['c', 'a', 'b']);
  });
  it('sense sessions no llegeix res', async () => {
    expect(await sessionsDelFlyer({ sessionsIds: [] }, {})).toEqual([]);
  });
  it('descarta una sessió amb data invàlida', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = dbFals({ sessions: [sessio('mala', '2026-02-31', '19:00')] });
    expect(await sessionsDelFlyer({ sessionsIds: ['mala'] }, db)).toEqual([]);
  });
});

describe('flyerPerId', () => {
  it('retorna el flyer amb id o null', async () => {
    const db = dbFals({ flyers: [{ id: 'f1', nom: 'Nov' }] });
    expect(await flyerPerId('f1', db)).toEqual({ id: 'f1', nom: 'Nov' });
    expect(await flyerPerId('zz', db)).toBeNull();
  });
});

describe('darrerFlyerPublicat', () => {
  it('ignora esborranys i tria el publicatEl més nou', async () => {
    const db = dbFals({ flyers: [
      { id: 'vell', estat: 'publicat', publicatEl: ts(1000), actualitzatEl: ts(9000) },
      { id: 'nou', estat: 'publicat', publicatEl: ts(2000), actualitzatEl: ts(2000) },
      { id: 'esb', estat: 'esborrany', publicatEl: ts(5000) },
    ] });
    expect((await darrerFlyerPublicat(db)).id).toBe('nou');
  });
  it('sense cap publicat, null', async () => {
    expect(await darrerFlyerPublicat(dbFals({ flyers: [{ id: 'e', estat: 'esborrany' }] }))).toBeNull();
  });
});

describe('potVeure', () => {
  it('publicat, o esborrany amb la clau correcta', () => {
    expect(potVeure({ estat: 'publicat', clauPrevia: 'k' }, undefined)).toBe(true);
    expect(potVeure({ estat: 'esborrany', clauPrevia: 'k' }, 'k')).toBe(true);
    expect(potVeure({ estat: 'esborrany', clauPrevia: 'k' }, 'altra')).toBe(false);
    expect(potVeure({ estat: 'esborrany', clauPrevia: 'k' }, undefined)).toBe(false);
  });
});
