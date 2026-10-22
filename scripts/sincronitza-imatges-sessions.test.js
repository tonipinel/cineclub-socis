// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  llegirOpcions, canvisImatges, comprovarCopia, executar,
} from './sincronitza-imatges-sessions.mjs';

const AVUI = new Date('2026-10-22T10:00:00Z');
const cartell = (slug) => `https://firebasestorage.googleapis.com/v0/b/b/o/web%2Fsessions%2F${slug}%2Fposter.jpg?alt=media`;

// Firestore fals en memòria: guarda els `update` (camps) per document i quants lots s'han fet.
function firestoreFals(sessions) {
  const docs = new Map(Object.entries(structuredClone(sessions)));
  const updates = [];
  let lots = 0;
  return {
    docs,
    updates,
    get lots() { return lots; },
    collection: (nom) => ({
      doc: (id) => ({ id }),
      get: async () => ({
        docs: nom === 'sessions'
          ? [...docs].map(([id, dades]) => ({ id, ref: { id }, data: () => structuredClone(dades) }))
          : [],
      }),
    }),
    batch: () => {
      const pendents = [];
      return {
        update: (ref, camps) => pendents.push([ref.id, camps]),
        commit: async () => {
          lots++;
          for (const [id, camps] of pendents) {
            updates.push([id, camps]);
            docs.set(id, { ...docs.get(id), ...camps });
          }
        },
      };
    },
  };
}

const SESSIONS = {
  pig: { titol: 'Pig', imatgeUrl: 'https://cineclubrodadebera.cat/programacio/2026/pig/poster_hu1.jpg', publica: { cartell: cartell('pig'), titol: 'Pig' } },
  jane: { titol: 'Jane Eyre', imatgeUrl: '', publica: { cartell: cartell('jane') } },
  sense: { titol: 'Sense camp', publica: { cartell: cartell('sense') } },
  igual: { titol: 'Igual', imatgeUrl: cartell('igual'), publica: { cartell: cartell('igual') } },
  noPublica: { titol: 'Esborrany', imatgeUrl: 'https://exemple.cat/a.jpg' },
  cartellBuit: { titol: 'Cartell buit', imatgeUrl: 'https://exemple.cat/b.jpg', publica: { cartell: '' } },
  cartellNoUrl: { titol: 'Cartell no URL', imatgeUrl: 'https://exemple.cat/c.jpg', publica: { cartell: 'poster.jpg' } },
};

const backups = (ambCopia = true) => {
  const dir = mkdtempSync(join(tmpdir(), 'backups-'));
  if (ambCopia) {
    mkdirSync(join(dir, '2026-10-22'));
    writeFileSync(join(dir, '2026-10-22', 'manifest.json'), '{}');
  }
  return dir;
};
const silenci = () => {};

describe('llegirOpcions', () => {
  it('per defecte és informe', () => expect(llegirOpcions([])).toEqual({ apply: false, desfer: null }));
  it('--apply l\'activa', () => expect(llegirOpcions(['--apply'])).toEqual({ apply: true, desfer: null }));
  it('--desfer <fitxer>', () => expect(llegirOpcions(['--desfer', 'f.json'])).toEqual({ apply: false, desfer: 'f.json' }));
  it('--desfer sense fitxer o amb --apply és un error', () => {
    expect(() => llegirOpcions(['--desfer'])).toThrow();
    expect(() => llegirOpcions(['--apply', '--desfer', 'f.json'])).toThrow();
  });
  it('rebutja opcions desconegudes', () => expect(() => llegirOpcions(['--aplica'])).toThrow(/desconeguda/));
});

describe('canvisImatges', () => {
  it('només les sessions amb publica.cartell (URL http/https) i imatgeUrl diferent, buida o absent', () => {
    const docs = Object.entries(SESSIONS).map(([id, d]) => ({ id, data: () => d }));
    expect(canvisImatges(docs)).toEqual([
      { id: 'pig', titol: 'Pig', abans: SESSIONS.pig.imatgeUrl, despres: cartell('pig') },
      { id: 'jane', titol: 'Jane Eyre', abans: '', despres: cartell('jane') },
      { id: 'sense', titol: 'Sense camp', abans: null, absent: true, despres: cartell('sense') },
    ]);
  });
});

describe('comprovarCopia', () => {
  it('falla sense la còpia d\'avui', () => expect(() => comprovarCopia(backups(false), AVUI)).toThrow(/còpia de seguretat/));
  it('passa amb la còpia d\'avui', () => expect(() => comprovarCopia(backups(), AVUI)).not.toThrow());
});

describe('executar', () => {
  it('en mode informe no escriu res ni crea el fitxer de desfer', async () => {
    const db = firestoreFals(SESSIONS);
    const dir = backups();
    const linies = [];
    const res = await executar({ db, dirBackups: dir, avui: AVUI, log: (l) => linies.push(l) });
    expect(res.canvis).toHaveLength(3);
    expect(db.updates).toEqual([]);
    expect(existsSync(join(dir, '2026-10-22', 'imatges-sessions-abans.json'))).toBe(false);
    expect(linies.join('\n')).toMatch(/MODE INFORME/);
    expect(linies.join('\n')).toContain('poster_hu1.jpg');
  });

  it('amb --apply sense còpia d\'avui no escriu res', async () => {
    const db = firestoreFals(SESSIONS);
    await expect(executar({ apply: true, db, dirBackups: backups(false), avui: AVUI, log: silenci })).rejects.toThrow(/còpia/);
    expect(db.updates).toEqual([]);
  });

  it('amb --apply posa imatgeUrl = publica.cartell i no toca cap altre camp', async () => {
    const db = firestoreFals(SESSIONS);
    await executar({ apply: true, db, dirBackups: backups(), avui: AVUI, log: silenci });
    expect(db.updates).toEqual([
      ['pig', { imatgeUrl: cartell('pig') }],
      ['jane', { imatgeUrl: cartell('jane') }],
      ['sense', { imatgeUrl: cartell('sense') }],
    ]);
    expect(db.docs.get('pig')).toEqual({ ...SESSIONS.pig, imatgeUrl: cartell('pig') });
    expect(db.docs.get('noPublica')).toEqual(SESSIONS.noPublica);
    expect(db.docs.get('cartellBuit')).toEqual(SESSIONS.cartellBuit);
  });

  it('guarda els valors anteriors al fitxer de desfer abans d\'escriure', async () => {
    const db = firestoreFals(SESSIONS);
    const dir = backups();
    await executar({ apply: true, db, dirBackups: dir, avui: AVUI, log: silenci });
    const desfer = JSON.parse(readFileSync(join(dir, '2026-10-22', 'imatges-sessions-abans.json'), 'utf8'));
    expect(desfer.sessions).toEqual({
      pig: { titol: 'Pig', imatgeUrl: SESSIONS.pig.imatgeUrl },
      jane: { titol: 'Jane Eyre', imatgeUrl: '' },
      sense: { titol: 'Sense camp', imatgeUrl: null, absent: true },
    });
  });

  it('és idempotent: la segona execució no escriu res i conserva el fitxer de desfer', async () => {
    const db = firestoreFals(SESSIONS);
    const dir = backups();
    await executar({ apply: true, db, dirBackups: dir, avui: AVUI, log: silenci });
    const fitxer = join(dir, '2026-10-22', 'imatges-sessions-abans.json');
    const primer = readFileSync(fitxer, 'utf8');
    const res = await executar({ apply: true, db, dirBackups: dir, avui: AVUI, log: silenci });
    expect(res.canvis).toEqual([]);
    expect(db.updates).toHaveLength(3);
    expect(readFileSync(fitxer, 'utf8')).toBe(primer);
  });

  it('una execució posterior afegeix sessions noves al fitxer de desfer sense trepitjar les anteriors', async () => {
    const db = firestoreFals(SESSIONS);
    const dir = backups();
    await executar({ apply: true, db, dirBackups: dir, avui: AVUI, log: silenci });
    db.docs.set('pig', { ...db.docs.get('pig'), imatgeUrl: 'https://altra.cat/x.jpg' });
    db.docs.set('nova', { titol: 'Nova', imatgeUrl: 'https://vell.cat/n.jpg', publica: { cartell: cartell('nova') } });
    await executar({ apply: true, db, dirBackups: dir, avui: AVUI, log: silenci });
    const desfer = JSON.parse(readFileSync(join(dir, '2026-10-22', 'imatges-sessions-abans.json'), 'utf8'));
    expect(desfer.sessions.pig.imatgeUrl).toBe(SESSIONS.pig.imatgeUrl);
    expect(desfer.sessions.nova).toEqual({ titol: 'Nova', imatgeUrl: 'https://vell.cat/n.jpg' });
  });

  it('escriu en lots de 400 com a màxim', async () => {
    const moltes = Object.fromEntries(Array.from({ length: 401 }, (_, i) => [`s${i}`, { titol: `S${i}`, publica: { cartell: cartell(`s${i}`) } }]));
    const db = firestoreFals(moltes);
    await executar({ apply: true, db, dirBackups: backups(), avui: AVUI, log: silenci });
    expect(db.updates).toHaveLength(401);
    expect(db.lots).toBe(2);
  });

  it('--desfer restableix els valors anteriors i esborra el camp si era absent', async () => {
    const db = firestoreFals(SESSIONS);
    const dir = backups();
    await executar({ apply: true, db, dirBackups: dir, avui: AVUI, log: silenci });
    const ESBORRA = Symbol('delete');
    await executar({ desfer: join(dir, '2026-10-22', 'imatges-sessions-abans.json'), db, dirBackups: dir, avui: AVUI, log: silenci, esborraCamp: () => ESBORRA });
    expect(db.updates.slice(3)).toEqual([
      ['pig', { imatgeUrl: SESSIONS.pig.imatgeUrl }],
      ['jane', { imatgeUrl: '' }],
      ['sense', { imatgeUrl: ESBORRA }],
    ]);
  });

  it('--desfer sense còpia d\'avui no escriu res', async () => {
    const db = firestoreFals(SESSIONS);
    const dir = backups(false);
    mkdirSync(join(dir, 'x'));
    const fitxer = join(dir, 'x', 'desfer.json');
    writeFileSync(fitxer, JSON.stringify({ sessions: { pig: { imatgeUrl: 'a' } } }));
    await expect(executar({ desfer: fitxer, db, dirBackups: dir, avui: AVUI, log: silenci, esborraCamp: () => null })).rejects.toThrow(/còpia/);
    expect(db.updates).toEqual([]);
  });
});
