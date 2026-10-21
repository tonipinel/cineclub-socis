import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Timestamp } from 'firebase-admin/firestore';
import { exportCollection, backupFirestore } from './backup-firestore.mjs';

function fakeDoc(id, data, subcols = {}) {
  return {
    id,
    get: async () => ({ exists: data !== null, data: () => data }),
    listCollections: async () =>
      Object.entries(subcols).map(([name, docs]) => fakeCollection(name, docs)),
  };
}

function fakeCollection(id, docs) {
  return { id, listDocuments: async () => docs };
}

function fakeDb(collections) {
  return {
    listCollections: async () =>
      Object.entries(collections).map(([name, docs]) => fakeCollection(name, docs)),
    collection: (name) => fakeCollection(name, collections[name]),
  };
}

describe('backup de Firestore', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'backup-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const dades = () => ({
    propostes: [
      fakeDoc('p1', { titol: 'A', creat: Timestamp.fromDate(new Date('2026-01-02T03:04:05.000Z')) }, {
        vots: [fakeDoc('v1', { soci: 's1' })],
      }),
      fakeDoc('p2', { titol: 'B' }),
    ],
  });

  it('exportCollection escriu tots els documents i les seves subcol·leccions', async () => {
    const n = await exportCollection(fakeDb(dades()), 'propostes', dir);
    expect(n).toBe(2);
    const json = JSON.parse(readFileSync(join(dir, 'propostes.json'), 'utf8'));
    expect(json).toEqual([
      {
        id: 'p1',
        data: { titol: 'A', creat: { __timestamp: '2026-01-02T03:04:05.000Z' } },
        subcolleccions: { vots: [{ id: 'v1', data: { soci: 's1' }, subcolleccions: {} }] },
      },
      { id: 'p2', data: { titol: 'B' }, subcolleccions: {} },
    ]);
  });

  it('backupFirestore escriu un manifest amb el recompte de documents arrel', async () => {
    const manifest = await backupFirestore(fakeDb(dades()), dir);
    expect(manifest).toEqual({ propostes: 2 });
    expect(JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))).toEqual({ propostes: 2 });
  });
});
