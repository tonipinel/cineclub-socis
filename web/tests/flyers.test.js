import { describe, it, expect, vi } from 'vitest';
import {
  etiquetaVersio, peliculaFlyer, preuFlyer, flyerPerId, sessionsDelFlyer, darrerFlyerPublicat, flyerActiu, teClau,
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
  it('amb traducció i cartell', () => {
    const s = sessio('anatomie', '2026-11-05', '19:00', {
      titol: 'Anatomie', titolTraduit: 'Anatomia', cartell: '/c.jpg', versioTipus: 'vose', idioma: 'Alemany',
    });
    expect(peliculaFlyer(s)).toEqual({
      id: 'anatomie', titol: 'Anatomie', titolTraduit: 'Anatomia', dataText: 'Dj 5 nov', hora: '19:00', seccio: 'cartellera', imatge: '/c.jpg',
      versio: 'VOSE', idioma: 'Alemany',
    });
  });
  it('sense traducció ni cartell', () => {
    const p = peliculaFlyer(sessio('x', '2026-12-03', '19:00', { titol: 'X', titolTraduit: 'x' }));
    expect(p).toMatchObject({ titolTraduit: '', imatge: '', versio: '', dataText: 'Dj 3 des' });
  });
});

describe('preuFlyer', () => {
  const p = (...preus) => preus.map((preu) => ({ publica: { preu } }));
  it('mateix preu a totes: «X € per sessió»', () => {
    expect(preuFlyer(p(5, 5, 5))).toEqual({ text: '5 € per sessió' });
    expect(preuFlyer(p(3.5))).toEqual({ text: '3,5 € per sessió' });
  });
  it('preus diferents: rang', () => {
    expect(preuFlyer(p(5, 3, 4))).toEqual({ text: 'de 3 a 5 € per sessió' });
  });
  it('una sessió gratuïta barrejada: «gratis o ...»; totes gratuïtes: gratis', () => {
    expect(preuFlyer(p(0, 5, 5))).toEqual({ text: 'gratis o 5 € segons la sessió' });
    expect(preuFlyer(p(0, 3, 5))).toEqual({ text: 'gratis o de 3 a 5 € segons la sessió' });
    expect(preuFlyer(p(0, 0))).toEqual({ text: 'gratis' });
  });
  it('si el preu d\'alguna sessió es desconeix (falta o no és un nombre vàlid), null: mai no s\'afirma «gratis» ni un import', () => {
    expect(preuFlyer([])).toBeNull();
    expect(preuFlyer(p(undefined, null, '5', NaN, -1))).toBeNull();
    expect(preuFlyer([{}, { publica: null }])).toBeNull();
    expect(preuFlyer(p(0, 0, undefined))).toBeNull();
    expect(preuFlyer(p(5, 5, null))).toBeNull();
    expect(preuFlyer(p('3', 4, 5))).toBeNull();
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
  it('amb `totes` també hi surten les no publicades (i una sense slug), ordenades; amb data invàlida, no', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = dbFals({ sessions: [
      sessio('b', '2026-12-03', '19:00'),
      sessio('np', '2026-11-05', '21:00', {}, { publicada: false }),
      sessio('sense-slug', '2026-11-05', '19:00', {}, { publicada: false, slug: undefined }),
      sessio('mala', '2026-02-31', '19:00', {}, { publicada: false }),
    ] });
    const flyer = { sessionsIds: ['b', 'np', 'sense-slug', 'mala', 'no-existeix'] };
    expect((await sessionsDelFlyer(flyer, db, { totes: true })).map((s) => s.id)).toEqual(['sense-slug', 'np', 'b']);
    expect((await sessionsDelFlyer(flyer, db)).map((s) => s.id)).toEqual(['b']);
    expect((await sessionsDelFlyer(flyer, db, { totes: false })).map((s) => s.id)).toEqual(['b']);
    const [senseSlug] = await sessionsDelFlyer(flyer, db, { totes: true });
    expect(peliculaFlyer(senseSlug)).toMatchObject({ id: 'sense-slug' });
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

describe('flyerActiu', () => {
  const db = dbFals({ sessions: [sessio('a', '2026-11-05', '19:00'), sessio('np', '2026-11-06', '19:00', {}, { publicada: false })] });
  it('publicat i amb totes les sessions existents i publicades', async () => {
    expect(await flyerActiu({ estat: 'publicat', sessionsIds: ['a'] }, db)).toBe(true);
  });
  it('un esborrany no és actiu', async () => {
    expect(await flyerActiu({ estat: 'esborrany', sessionsIds: ['a'] }, db)).toBe(false);
  });
  it('una sessió sense publicar o esborrada el fa no actiu', async () => {
    expect(await flyerActiu({ estat: 'publicat', sessionsIds: ['a', 'np'] }, db)).toBe(false);
    expect(await flyerActiu({ estat: 'publicat', sessionsIds: ['a', 'zz'] }, db)).toBe(false);
  });
  it('un publicat sense sessions no és actiu', async () => {
    expect(await flyerActiu({ estat: 'publicat', sessionsIds: [] }, db)).toBe(false);
    expect(await flyerActiu({ estat: 'publicat' }, db)).toBe(false);
  });
});

describe('darrerFlyerPublicat', () => {
  const ara = new Date('2026-11-04T12:00:00Z');
  const sessions = [sessio('a', '2026-11-05', '19:00'), sessio('np', '2026-11-06', '19:00', {}, { publicada: false })];
  it('ignora esborranys i tria el publicatEl més nou', async () => {
    const db = dbFals({ sessions, flyers: [
      { id: 'vell', estat: 'publicat', publicatEl: ts(1000), actualitzatEl: ts(9000), sessionsIds: ['a'] },
      { id: 'nou', estat: 'publicat', publicatEl: ts(2000), actualitzatEl: ts(2000), sessionsIds: ['a'] },
      { id: 'esb', estat: 'esborrany', publicatEl: ts(5000), sessionsIds: ['a'] },
    ] });
    expect((await darrerFlyerPublicat(db, ara)).id).toBe('nou');
  });
  it('salta els no actius i els caducats i tria el següent actiu i vigent', async () => {
    const db = dbFals({ sessions, flyers: [
      { id: 'actiu', estat: 'publicat', publicatEl: ts(1000), sessionsIds: ['a'], fins: '2026-11-30' },
      { id: 'caducat', estat: 'publicat', publicatEl: ts(2000), sessionsIds: ['a'], fins: '2026-11-03' },
      { id: 'pendent', estat: 'publicat', publicatEl: ts(3000), sessionsIds: ['a', 'np'], fins: '2026-11-30' },
      { id: 'esborrada', estat: 'publicat', publicatEl: ts(4000), sessionsIds: ['a', 'zz'], fins: '2026-11-30' },
    ] });
    expect((await darrerFlyerPublicat(db, ara)).id).toBe('actiu');
  });
  it('sense cap actiu i vigent, null', async () => {
    expect(await darrerFlyerPublicat(dbFals({ flyers: [{ id: 'e', estat: 'esborrany' }] }), ara)).toBeNull();
    expect(await darrerFlyerPublicat(dbFals({ sessions, flyers: [{ id: 'p', estat: 'publicat', sessionsIds: ['np'] }] }), ara)).toBeNull();
  });
});

describe('teClau', () => {
  it('només amb la clau correcta i no buida', () => {
    expect(teClau({ clauPrevia: 'k' }, 'k')).toBe(true);
    expect(teClau({ clauPrevia: 'k' }, 'altra')).toBe(false);
    expect(teClau({ clauPrevia: 'k' }, undefined)).toBe(false);
    expect(teClau({ clauPrevia: '' }, '')).toBe(false);
    expect(teClau({}, '')).toBe(false);
  });
});
