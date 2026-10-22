// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  llegirOpcions, votsAntics, resum, comprovarCopia, esborrar, executar,
} from './esborra-vots-antics.mjs';

const AVUI = new Date('2026-10-22T10:00:00Z');

// Firestore fals en memòria: el grup de col·leccions `vots` pot incloure altres rutes.
function firestoreFals(rutes) {
  const existents = new Set(rutes);
  const esborrats = [];
  return {
    esborrats,
    existents,
    collectionGroup: (nom) => ({
      get: async () => ({
        docs: [...existents].filter((r) => r.split('/').at(-2) === nom).map((path) => ({ ref: { path } })),
      }),
    }),
    batch: () => {
      const pendents = [];
      return {
        delete: (ref) => pendents.push(ref.path),
        commit: async () => pendents.forEach((p) => { existents.delete(p); esborrats.push(p); }),
      };
    },
  };
}

const RUTES = ['propostes/a/vots/1', 'propostes/a/vots/2', 'propostes/b/vots/3', 'tandes/t1/vots/9', 'propostes/a'];

function copiaDAvui() {
  const dir = mkdtempSync(join(tmpdir(), 'backups-'));
  mkdirSync(join(dir, '2026-10-22'));
  writeFileSync(join(dir, '2026-10-22', 'manifest.json'), '{}');
  return dir;
}

describe('llegirOpcions', () => {
  it('per defecte és informe', () => expect(llegirOpcions([])).toEqual({ apply: false }));
  it('--apply l\'activa', () => expect(llegirOpcions(['--apply'])).toEqual({ apply: true }));
  it('rebutja opcions desconegudes', () => expect(() => llegirOpcions(['--aplica'])).toThrow(/desconeguda/));
});

describe('votsAntics i resum', () => {
  const docs = RUTES.filter((r) => r.includes('/vots/')).map((path) => ({ ref: { path } }));

  it('només queden els propostes/*/vots/*', () => {
    expect(votsAntics(docs).map((d) => d.ref.path)).toEqual(['propostes/a/vots/1', 'propostes/a/vots/2', 'propostes/b/vots/3']);
  });

  it('compta documents i propostes afectades', () => {
    expect(resum(votsAntics(docs))).toEqual({ documents: 3, propostes: 2 });
  });
});

describe('comprovarCopia', () => {
  it('falla sense manifest d\'avui', () => {
    expect(() => comprovarCopia(mkdtempSync(join(tmpdir(), 'backups-')), AVUI)).toThrow(/còpia de seguretat/);
  });
  it('accepta el manifest d\'avui', () => {
    expect(() => comprovarCopia(copiaDAvui(), AVUI)).not.toThrow();
  });
});

describe('esborrar', () => {
  it('esborra en lots de 400', async () => {
    const rutes = Array.from({ length: 900 }, (_, i) => `propostes/p/vots/${i}`);
    const db = firestoreFals(rutes);
    let lots = 0;
    const batch = db.batch;
    db.batch = () => { lots += 1; return batch(); };
    await esborrar(rutes.map((path) => ({ ref: { path } })), db);
    expect(lots).toBe(3);
    expect(db.existents.size).toBe(0);
  });
});

describe('executar', () => {
  it('l\'informe no esborra res ni exigeix còpia', async () => {
    const db = firestoreFals(RUTES);
    const linies = [];
    const r = await executar({ db, dirBackups: mkdtempSync(join(tmpdir(), 'backups-')), avui: AVUI, log: (l) => linies.push(l) });
    expect(r).toEqual({ documents: 3, propostes: 2 });
    expect(db.esborrats).toEqual([]);
    expect(linies.join('\n')).toMatch(/3 \(de 2 propostes\)/);
  });

  it('--apply sense còpia d\'avui no esborra res', async () => {
    const db = firestoreFals(RUTES);
    await expect(executar({ apply: true, db, dirBackups: mkdtempSync(join(tmpdir(), 'backups-')), avui: AVUI, log: () => {} }))
      .rejects.toThrow(/còpia de seguretat/);
    expect(db.esborrats).toEqual([]);
  });

  it('--apply esborra només els vots antics i és idempotent', async () => {
    const db = firestoreFals(RUTES);
    const dirBackups = copiaDAvui();
    await executar({ apply: true, db, dirBackups, avui: AVUI, log: () => {} });
    expect(db.esborrats.sort()).toEqual(['propostes/a/vots/1', 'propostes/a/vots/2', 'propostes/b/vots/3']);
    expect([...db.existents].sort()).toEqual(['propostes/a', 'tandes/t1/vots/9']);
    const segona = await executar({ apply: true, db, dirBackups, avui: AVUI, log: () => {} });
    expect(segona).toEqual({ documents: 0, propostes: 0 });
    expect(db.esborrats).toHaveLength(3);
  });
});
