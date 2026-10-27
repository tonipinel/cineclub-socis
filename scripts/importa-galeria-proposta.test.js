// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  llegirOpcions, candidates, comprovarCopia, executar, desfer,
} from './importa-galeria-proposta.mjs';

const AVUI = new Date('2026-10-27T10:00:00Z');
const BUCKET = 'cinema.test';
const ESBORRA = Symbol('esborra');
const url = (cami) => `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(cami)}?alt=media`;

// Firestore i bucket falsos amb la forma de l'Admin SDK (`snap.exists` és un booleà; `update` amb camins amb punt).
function entorn({ sessions = {}, propostes = {} } = {}) {
  const estat = { sessions: structuredClone(sessions), propostes: structuredClone(propostes), escriptures: 0 };
  const snap = (col, id) => ({ exists: id in estat[col], data: () => structuredClone(estat[col][id]) });
  const ref = (col, id) => ({ col, id, get: async () => snap(col, id) });
  const db = {
    estat,
    collection: (col) => ({
      get: async () => ({ docs: Object.keys(estat[col]).map((id) => ({ id, data: () => structuredClone(estat[col][id]) })) }),
      doc: (id) => ref(col, id),
    }),
    runTransaction: async (fn) => fn({
      get: async (r) => snap(r.col, r.id),
      update: (r, camps) => {
        estat.escriptures += 1;
        for (const [camp, valor] of Object.entries(camps)) {
          const [a, b] = camp.split('.');
          estat[r.col][r.id][a] ??= {};
          if (valor === ESBORRA) delete estat[r.col][r.id][a][b];
          else estat[r.col][r.id][a][b] = valor;
        }
      },
    }),
  };
  const fitxers = {};
  const bucket = {
    name: BUCKET,
    fitxers,
    file: (cami) => ({
      save: async (contingut) => { fitxers[cami] = contingut.length; },
      delete: vi.fn(async () => { delete fitxers[cami]; }),
    }),
  };
  return { db, bucket, estat };
}

const fetchFn = vi.fn(async (u) => {
  const png = u.endsWith('.png');
  return {
    ok: true,
    headers: { get: (n) => ({ 'content-type': png ? 'image/png' : 'image/jpeg', 'content-length': '4' })[n] ?? null },
    body: (async function* cos() { yield new Uint8Array(png ? [0x89, 0x50, 0x4e, 0x47] : [0xff, 0xd8, 0xff, 0xe0]); }()),
  };
});

const SESSIONS = {
  nova: { titol: 'Nova', propostaId: 'p1', publicada: false, publica: { titol: 'Nova', cartell: 'https://c' } },
  publicada: { titol: 'Publicada', propostaId: 'p2', publicada: true, publica: { galeria: [], actualitzatEl: '2026-01-01' } },
  ambGaleria: { titol: 'Amb', propostaId: 'p1', publica: { galeria: ['https://meva'] } },
  senseImatges: { titol: 'Sense', propostaId: 'p3', publica: {} },
  hugo: { titol: 'Hugo', publica: {} },
  galeriaText: { titol: 'Text', propostaId: 'p1', publica: { galeria: 'https://meva' } },
};
const PROPOSTES = {
  p1: { imatges: ['/a.jpg', '/b.jpg', '../x.jpg'] },
  p2: { imatges: ['/c.png'] },
  p3: { imatges: [] },
};

function copiaDAvui() {
  const dir = mkdtempSync(join(tmpdir(), 'backups-'));
  mkdirSync(join(dir, '2026-10-27'));
  writeFileSync(join(dir, '2026-10-27', 'manifest.json'), '{}');
  return dir;
}

const registreDe = (dir) => join(dir, '2026-10-27', 'galeria-proposta.json');
const silenci = () => {};

describe('llegirOpcions', () => {
  it('per defecte és informe', () => expect(llegirOpcions([])).toEqual({ apply: false, desfer: null, sessio: null }));
  it('--apply --sessio <id>', () => expect(llegirOpcions(['--apply', '--sessio', 's1'])).toEqual({ apply: true, desfer: null, sessio: 's1' }));
  it('--desfer <fitxer>', () => expect(llegirOpcions(['--desfer', 'f.json'])).toEqual({ apply: false, desfer: 'f.json', sessio: null }));
  it('rebutja opcions desconegudes, incompletes o combinades', () => {
    expect(() => llegirOpcions(['--x'])).toThrow();
    expect(() => llegirOpcions(['--sessio'])).toThrow();
    expect(() => llegirOpcions(['--apply', '--desfer', 'f'])).toThrow();
  });
});

describe('candidates', () => {
  const docs = Object.entries(SESSIONS).map(([id, d]) => ({ id, data: () => d }));
  const propostes = new Map(Object.entries(PROPOSTES));

  it('només les sessions amb proposta, sense galeria i amb imatges a la proposta', () => {
    const llista = candidates(docs, propostes, BUCKET);
    expect(llista.map((c) => [c.id, c.imatges, c.rebutjats])).toEqual([['nova', 2, 1], ['publicada', 1, 0]]);
    expect(llista[0].abans).toEqual({ galeria: null, actualitzatEl: null, publicada: false });
    expect(llista[0].previstos[0]).toEqual({ cami: 'web/sessions/nova/gallery-1-a.jpg', url: url('web/sessions/nova/gallery-1-a.jpg') });
  });

  it('--sessio la limita', () => {
    expect(candidates(docs, propostes, BUCKET, 'publicada').map((c) => c.id)).toEqual(['publicada']);
  });
});

describe('comprovarCopia', () => {
  it('falla sense la còpia d\'avui', () => {
    expect(() => comprovarCopia(mkdtempSync(join(tmpdir(), 'buit-')), AVUI)).toThrow(/còpia de seguretat d'avui/);
  });
});

describe('executar', () => {
  it('l\'informe no escriu res ni baixa res', async () => {
    const { db, bucket, estat } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    const log = vi.fn();
    fetchFn.mockClear();
    const { candidates: llista } = await executar({ db, bucket, fetchFn, avui: AVUI, log, dirBackups: mkdtempSync(join(tmpdir(), 'b-')) });
    expect(llista).toHaveLength(2);
    expect(estat.escriptures).toBe(0);
    expect(bucket.fitxers).toEqual({});
    expect(fetchFn).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join('\n')).toMatch(/sessions\/nova \(Nova\) ← propostes\/p1: 2 imatges, 1 paths invàlids/);
  });

  it('--apply sense la còpia d\'avui no escriu res', async () => {
    const { db, bucket, estat } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    const dir = mkdtempSync(join(tmpdir(), 'b-'));
    await expect(executar({ db, bucket, fetchFn, apply: true, avui: AVUI, log: silenci, dirBackups: dir })).rejects.toThrow(/còpia/);
    expect(estat.escriptures).toBe(0);
    expect(existsSync(registreDe(dir))).toBe(false);
  });

  it('--apply importa, registra abans i després, i és idempotent', async () => {
    const { db, bucket, estat } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    const dir = copiaDAvui();
    const { resultats } = await executar({ db, bucket, fetchFn, apply: true, avui: AVUI, log: silenci, dirBackups: dir });
    expect(resultats.map((r) => [r.id, r.estat, r.galeria.length])).toEqual([['nova', 'importada', 2], ['publicada', 'importada', 1]]);
    expect(estat.sessions.nova.publica.galeria).toEqual([url('web/sessions/nova/gallery-1-a.jpg'), url('web/sessions/nova/gallery-2-b.jpg')]);
    expect(estat.sessions.nova.publica.cartell).toBe('https://c');
    expect(estat.sessions.galeriaText.publica.galeria).toBe('https://meva');
    expect(estat.sessions.publicada.publica.actualitzatEl).toBe('2026-10-27');
    expect(estat.sessions.ambGaleria.publica.galeria).toEqual(['https://meva']);
    const registre = JSON.parse(readFileSync(registreDe(dir), 'utf8'));
    expect(registre.execucions).toHaveLength(1);
    expect(registre.execucions[0].sessions[0]).toMatchObject({
      id: 'nova', abans: { galeria: null }, previstos: [{ cami: 'web/sessions/nova/gallery-1-a.jpg' }, { cami: 'web/sessions/nova/gallery-2-b.jpg' }],
      resultat: { estat: 'importada', fallades: 1, actualitzatEl: '2026-10-27' },
    });

    const escriptures = estat.escriptures;
    const segona = await executar({ db, bucket, fetchFn, apply: true, avui: AVUI, log: silenci, dirBackups: dir });
    expect(segona.candidates).toEqual([]);
    expect(estat.escriptures).toBe(escriptures);
  });

  it('--sessio només toca aquella sessió', async () => {
    const { db, bucket, estat } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    await executar({ db, bucket, fetchFn, apply: true, sessio: 'publicada', avui: AVUI, log: silenci, dirBackups: copiaDAvui() });
    expect(estat.sessions.publicada.publica.galeria).toHaveLength(1);
    expect(estat.sessions.nova.publica.galeria).toBeUndefined();
  });
});

describe('desfer', () => {
  async function aplicat() {
    const e = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    const dir = copiaDAvui();
    await executar({ ...e, fetchFn, apply: true, avui: AVUI, log: silenci, dirBackups: dir });
    return { ...e, dir };
  }

  it('torna la galeria i l\'actualitzatEl d\'abans i esborra els fitxers creats', async () => {
    const { db, bucket, estat, dir } = await aplicat();
    expect(Object.keys(bucket.fitxers)).toHaveLength(3);
    const r = await desfer({ fitxer: registreDe(dir), db, bucket, esborraCamp: () => ESBORRA, avui: AVUI, log: silenci, dirBackups: dir });
    expect(r).toEqual({ desfets: 2, saltats: 0 });
    expect(estat.sessions.nova).toEqual(SESSIONS.nova);
    expect(estat.sessions.publicada).toEqual(SESSIONS.publicada);
    expect(bucket.fitxers).toEqual({});
  });

  it('no toca una galeria que l\'admin ha canviat (ni n\'esborra els fitxers)', async () => {
    const { db, bucket, estat, dir } = await aplicat();
    estat.sessions.nova.publica.galeria = [...estat.sessions.nova.publica.galeria, 'https://meva'];
    const r = await desfer({ fitxer: registreDe(dir), db, bucket, esborraCamp: () => ESBORRA, avui: AVUI, log: silenci, dirBackups: dir });
    expect(r).toEqual({ desfets: 1, saltats: 1 });
    expect(estat.sessions.nova.publica.galeria).toContain('https://meva');
    expect(Object.keys(bucket.fitxers)).toEqual(['web/sessions/nova/gallery-1-a.jpg', 'web/sessions/nova/gallery-2-b.jpg']);
  });

  it('no desfà les entrades que no es van importar (ja-tenia, error) ni n\'esborra res', async () => {
    const cami = 'web/sessions/nova/gallery-1-a.jpg';
    const galeriaCallable = [url(cami)];
    const { db, bucket, estat } = entorn({ sessions: { nova: { ...SESSIONS.nova, publica: { galeria: galeriaCallable } } } });
    bucket.fitxers[cami] = 4;
    const dir = copiaDAvui();
    writeFileSync(registreDe(dir), JSON.stringify({
      execucions: [{
        sessions: [
          { id: 'nova', abans: { galeria: null }, previstos: [{ cami, url: url(cami) }], resultat: { estat: 'ja-tenia', galeria: galeriaCallable } },
          { id: 'nova', abans: { galeria: null }, previstos: [{ cami, url: url(cami) }], resultat: { estat: 'error', galeria: [], fallades: 1 } },
          { id: 'nova', abans: { galeria: null }, previstos: [{ cami, url: url(cami) }] },
        ],
      }],
    }));
    const r = await desfer({ fitxer: registreDe(dir), db, bucket, esborraCamp: () => ESBORRA, avui: AVUI, log: silenci, dirBackups: dir });
    expect(r).toEqual({ desfets: 0, saltats: 0 });
    expect(estat.escriptures).toBe(0);
    expect(estat.sessions.nova.publica.galeria).toEqual(galeriaCallable);
    expect(bucket.fitxers).toEqual({ [cami]: 4 });
  });

  it('desfà un registre antic (noms gallery-N, sense actualitzatEl al resultat) sense tocar l\'actualitzatEl', async () => {
    const camins = ['web/sessions/s/gallery-1.jpg', 'web/sessions/s/gallery-2.jpg'];
    const { db, bucket, estat } = entorn({
      sessions: { s: { titol: 'S', propostaId: 'p1', publica: { titol: 'S', galeria: camins.map(url), actualitzatEl: '2026-10-27' } } },
    });
    camins.forEach((c) => { bucket.fitxers[c] = 4; });
    const dir = copiaDAvui();
    writeFileSync(registreDe(dir), JSON.stringify({
      execucions: [{
        sessions: [{
          id: 's',
          abans: { galeria: null, actualitzatEl: '2026-10-20', publicada: false },
          previstos: camins.map((c) => ({ cami: c, url: url(c) })),
          resultat: { estat: 'importada', galeria: camins.map(url), fallades: 0 },
        }],
      }],
    }));
    const r = await desfer({ fitxer: registreDe(dir), db, bucket, esborraCamp: () => ESBORRA, avui: AVUI, log: silenci, dirBackups: dir });
    expect(r).toEqual({ desfets: 1, saltats: 0 });
    expect(estat.sessions.s.publica).toEqual({ titol: 'S', actualitzatEl: '2026-10-27' });
    expect(bucket.fitxers).toEqual({});
  });

  it('no torna enrere un actualitzatEl que s\'ha mogut després', async () => {
    const { db, bucket, estat, dir } = await aplicat();
    estat.sessions.nova.publica.actualitzatEl = '2026-11-01';
    await desfer({ fitxer: registreDe(dir), db, bucket, esborraCamp: () => ESBORRA, avui: AVUI, log: silenci, dirBackups: dir });
    expect(estat.sessions.nova.publica.galeria).toBeUndefined();
    expect(estat.sessions.nova.publica.actualitzatEl).toBe('2026-11-01');
  });

  it('sense la còpia d\'avui no desfà res', async () => {
    const { db, bucket, estat, dir } = await aplicat();
    const escriptures = estat.escriptures;
    await expect(desfer({
      fitxer: registreDe(dir), db, bucket, esborraCamp: () => ESBORRA, avui: new Date('2026-10-28T10:00:00Z'), log: silenci, dirBackups: dir,
    })).rejects.toThrow(/còpia/);
    expect(estat.escriptures).toBe(escriptures);
  });
});
