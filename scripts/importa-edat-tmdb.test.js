// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { llegirOpcions, executar, desfer } from './importa-edat-tmdb.mjs';

const AVUI = new Date('2026-10-27T10:00:00Z');
const ESBORRA = Symbol('esborra');

// Firestore fals amb la forma de l'Admin SDK (`update` amb camins amb punt).
function entorn({ sessions = {}, propostes = {} } = {}) {
  const estat = { sessions: structuredClone(sessions), propostes: structuredClone(propostes), escriptures: [] };
  const snap = (col, id) => ({ exists: id in estat[col], data: () => structuredClone(estat[col][id]) });
  const db = {
    collection: (col) => ({
      get: async () => ({ docs: Object.keys(estat[col]).map((id) => ({ id, data: () => structuredClone(estat[col][id]) })) }),
      doc: (id) => ({ col, id }),
    }),
    runTransaction: async (fn) => fn({
      get: async (r) => snap(r.col, r.id),
      update: (r, camps) => {
        estat.escriptures.push({ doc: `${r.col}/${r.id}`, camps });
        for (const [cami, valor] of Object.entries(camps)) {
          const parts = cami.split('.');
          let o = estat[r.col][r.id];
          for (const p of parts.slice(0, -1)) o = (o[p] ??= {});
          if (valor === ESBORRA) delete o[parts.at(-1)];
          else o[parts.at(-1)] = valor;
        }
      },
    }),
  };
  return { db, estat };
}

const PROPOSTES = {
  nova: { titol: 'Nova', tmdbId: 1 },
  nul: { titol: 'Amb nul', tmdbId: 2, edatMinima: null },
  zero: { titol: 'Tots els públics', tmdbId: 3, edatMinima: 0 },
  mana: { titol: 'A mà', tmdbId: 4, edatMinima: 16 },
  editada: { titol: 'Editada', tmdbId: 5, campsEditats: ['edatMinima'] },
  desconeguda: { titol: 'Sense edat a TMDB', tmdbId: 6 },
  senseTmdb: { titol: 'Sense TMDB' },
};

const SESSIONS = {
  s1: { titol: 'Nova', propostaId: 'nova', publicada: true, publica: { titol: 'Nova', actualitzatEl: '2026-09-01' } },
  s2: { titol: 'Nova (2)', propostaId: 'nova', publicada: false, publica: { edatMinimaRecomanada: 0 } },
  s3: { titol: 'Amb nul', propostaId: 'nul' },
  s4: { titol: 'Tots', propostaId: 'zero', publica: {} },
  s5: { titol: 'A mà publicada', propostaId: 'mana', publicada: true, publica: { actualitzatEl: '2026-08-01' } },
  s6: { titol: 'A mà amb edat', propostaId: 'mana', publicada: true, publica: { edatMinimaRecomanada: 12, actualitzatEl: '2026-08-01' } },
  senseProposta: { titol: 'Lliure', publica: {} },
};

const EDATS = { 1: 12, 2: 7, 3: 18, 4: 18, 5: 18, 6: null };
const edat = () => vi.fn(async (id) => EDATS[id]);

const ambCopia = () => {
  const dir = mkdtempSync(join(tmpdir(), 'edat-'));
  mkdirSync(join(dir, '2026-10-27'), { recursive: true });
  writeFileSync(join(dir, '2026-10-27', 'manifest.json'), '{}');
  return dir;
};

describe('llegirOpcions', () => {
  it('llegeix les opcions i rebutja combinacions no vàlides', () => {
    expect(llegirOpcions([])).toEqual({ apply: false, desfer: null });
    expect(llegirOpcions(['--apply'])).toEqual({ apply: true, desfer: null });
    expect(llegirOpcions(['--desfer', 'f'])).toEqual({ apply: false, desfer: 'f' });
    expect(() => llegirOpcions(['--apply', '--desfer', 'f'])).toThrow('no es poden combinar');
    expect(() => llegirOpcions(['--res'])).toThrow('desconeguda');
    expect(() => llegirOpcions(['--desfer', '--apply'])).toThrow('incompleta: --desfer');
  });
});

describe('executar (informe)', () => {
  it('no escriu res i només consulta les propostes amb tmdbId i sense edat ni edició a mà', async () => {
    const { db, estat } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    const fn = edat();
    const log = vi.fn();
    const { pla } = await executar({ db, edat: fn, avui: AVUI, log });
    expect(estat.escriptures).toEqual([]);
    expect(fn.mock.calls.map(([id]) => id).sort()).toEqual([1, 2, 6]);
    // Un 0 de la sessió (s2) o un 12 (s6) són valors posats; la proposta amb 0 o 16 i la editada no es toquen;
    // la de TMDB sense edat queda fora. Les sessions de propostes que ja tenen edat (0 a zero, 16 a mana) s'omplen amb la de la proposta.
    expect(pla.map((e) => [`${e.tipus}/${e.id}`, e.escrit])).toEqual([
      ['proposta/nova', { edatMinima: 12 }],
      ['sessio/s1', { 'publica.edatMinimaRecomanada': 12, 'publica.actualitzatEl': '2026-10-27' }],
      ['proposta/nul', { edatMinima: 7 }],
      ['sessio/s3', { 'publica.edatMinimaRecomanada': 7 }],
      ['sessio/s4', { 'publica.edatMinimaRecomanada': 0 }],
      ['sessio/s5', { 'publica.edatMinimaRecomanada': 16, 'publica.actualitzatEl': '2026-10-27' }],
    ]);
    const text = log.mock.calls.flat().join('\n');
    expect(text).toContain('sense edat a TMDB: 1');
    expect(text).toContain('desconeguda (Sense edat a TMDB)');
    expect(text).toContain('propostes/nova (Nova): edatMinima buit -> 12');
    expect(text).toContain("Sessions amb l'edat ja a la proposta:");
    expect(text).toContain('sessions/s4 (Tots, proposta zero, no publicada): publica.edatMinimaRecomanada buit -> 0');
    expect(text).toContain("sessions amb l'edat ja a la proposta: 2");
    expect(text).toContain("Amb --apply s'omplirien 6 documents.");
  });

  it('sense clau llista les candidates i --apply s\'atura abans d\'escriure', async () => {
    const { db, estat } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    const log = vi.fn();
    const { pla } = await executar({ db, avui: AVUI, log });
    // Les sessions de propostes que ja tenen edat no necessiten TMDB.
    expect(pla.map((e) => `${e.tipus}/${e.id}`)).toEqual(['sessio/s4', 'sessio/s5']);
    expect(log.mock.calls.flat().join('\n')).toContain('Sense TMDB_API_KEY: 3 propostes');
    await expect(executar({ db, apply: true, dirBackups: ambCopia(), avui: AVUI, log })).rejects.toThrow('TMDB_API_KEY');
    expect(estat.escriptures).toEqual([]);
  });

  it('una fallada de TMDB no atura la resta', async () => {
    const { db } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    const fn = vi.fn(async (id) => { if (id === 1) throw new Error('TMDB ha respost 404'); return EDATS[id]; });
    const { pla } = await executar({ db, edat: fn, avui: AVUI, log: () => {} });
    expect(pla.some((e) => e.id === 'nova')).toBe(false);
    expect(pla.some((e) => e.id === 'nul')).toBe(true);
  });
});

describe('executar --apply i desfer', () => {
  it('sense la còpia d\'avui no escriu res', async () => {
    const { db, estat } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    const dir = mkdtempSync(join(tmpdir(), 'edat-'));
    await expect(executar({ db, apply: true, edat: edat(), dirBackups: dir, avui: AVUI, log: () => {} }))
      .rejects.toThrow("No hi ha cap còpia de seguretat d'avui");
    expect(estat.escriptures).toEqual([]);
  });

  it('omple només els camps buits, és idempotent i es pot desfer', async () => {
    const { db, estat } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    const dir = ambCopia();
    const abans = structuredClone(estat);
    const { resultats } = await executar({ db, apply: true, edat: edat(), dirBackups: dir, avui: AVUI, log: () => {} });
    expect(resultats.map((r) => r.estat)).toEqual(Array(6).fill('omplert'));
    expect(estat.propostes.nova.edatMinima).toBe(12);
    expect(estat.propostes.nul.edatMinima).toBe(7);
    expect(estat.propostes.zero.edatMinima).toBe(0);
    expect(estat.propostes.mana.edatMinima).toBe(16);
    expect(estat.propostes.editada).toEqual(PROPOSTES.editada);
    // Sessió publicada: es mou actualitzatEl (lastmod del sitemap); no publicada: no.
    expect(estat.sessions.s1.publica).toEqual({ titol: 'Nova', actualitzatEl: '2026-10-27', edatMinimaRecomanada: 12 });
    expect(estat.sessions.s2).toEqual(SESSIONS.s2);
    expect(estat.sessions.s3.publica).toEqual({ edatMinimaRecomanada: 7 });
    // Proposta amb edat 0 i sessió buida: s'omple amb 0. Sessió amb edat ja posada: no es toca.
    expect(estat.sessions.s4.publica).toEqual({ edatMinimaRecomanada: 0 });
    expect(estat.sessions.s5.publica).toEqual({ actualitzatEl: '2026-10-27', edatMinimaRecomanada: 16 });
    expect(estat.sessions.s6).toEqual(SESSIONS.s6);

    const fitxer = join(dir, '2026-10-27', 'edat-tmdb.json');
    const registre = JSON.parse(readFileSync(fitxer, 'utf8'));
    expect(registre.execucions[0].documents.find((d) => d.id === 'nul').abans).toEqual({ edatMinima: { existia: true, valor: null } });

    const n = estat.escriptures.length;
    const segona = await executar({ db, apply: true, edat: edat(), dirBackups: dir, avui: AVUI, log: () => {} });
    expect(segona.pla).toEqual([]);
    expect(estat.escriptures).toHaveLength(n);

    // L'admin canvia l'edat de la sessió s1: aquest camp no es desfà.
    estat.sessions.s1.publica.edatMinimaRecomanada = 16;
    const { desfets, saltats } = await desfer({ fitxer, db, esborraCamp: () => ESBORRA, dirBackups: dir, avui: AVUI, log: () => {} });
    expect(desfets).toBe(5);
    expect(saltats).toBe(1);
    expect(estat.propostes).toEqual(abans.propostes);
    // El mapa `publica` creat en omplir queda buit (com a Firestore); el camp ja no hi és.
    expect(estat.sessions.s3).toEqual({ ...abans.sessions.s3, publica: {} });
    // s1: l'admin ha canviat l'edat, així que actualitzatEl tampoc torna enrere.
    expect(estat.sessions.s1.publica).toEqual({ ...abans.sessions.s1.publica, actualitzatEl: '2026-10-27', edatMinimaRecomanada: 16 });
    expect(estat.sessions.s4).toEqual({ ...abans.sessions.s4, publica: {} });
    expect(estat.sessions.s5).toEqual(abans.sessions.s5);
  });

  it('dins la transacció no sobreescriu una edat que algú ha posat entre l\'informe i l\'escriptura', async () => {
    const { db, estat } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    const original = db.runTransaction;
    let primer = true;
    db.runTransaction = async (fn) => {
      if (primer) { estat.propostes.nova.edatMinima = 0; primer = false; }
      return original(fn);
    };
    await executar({ db, apply: true, edat: edat(), dirBackups: ambCopia(), avui: AVUI, log: () => {} });
    expect(estat.propostes.nova.edatMinima).toBe(0);
    expect(estat.sessions.s1.publica.edatMinimaRecomanada).toBe(12);
  });

  it('dins la transacció no omple una sessió que ja té edat (0 inclòs) entre l\'informe i l\'escriptura', async () => {
    const { db, estat } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    const original = db.runTransaction;
    let n = 0;
    db.runTransaction = async (fn) => {
      if (++n === 6) estat.sessions.s5.publica.edatMinimaRecomanada = 0;
      return original(fn);
    };
    const { resultats } = await executar({ db, apply: true, edat: edat(), dirBackups: ambCopia(), avui: AVUI, log: () => {} });
    expect(resultats.at(-1).estat).toBe('sense canvis');
    expect(estat.sessions.s5.publica).toEqual({ actualitzatEl: '2026-08-01', edatMinimaRecomanada: 0 });
  });

  it('dins la transacció no omple una proposta que l\'admin ha marcat com a editada', async () => {
    const { db, estat } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    const original = db.runTransaction;
    let primer = true;
    db.runTransaction = async (fn) => {
      if (primer) { estat.propostes.nova.campsEditats = ['edatMinima']; primer = false; }
      return original(fn);
    };
    await executar({ db, apply: true, edat: edat(), dirBackups: ambCopia(), avui: AVUI, log: () => {} });
    expect(estat.propostes.nova.edatMinima).toBeUndefined();
  });

  it('desfer esborra el camp que no existia abans', async () => {
    const { db, estat } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    const dir = ambCopia();
    await executar({ db, apply: true, edat: edat(), dirBackups: dir, avui: AVUI, log: () => {} });
    expect(estat.propostes.nova.edatMinima).toBe(12);
    await desfer({ fitxer: join(dir, '2026-10-27', 'edat-tmdb.json'), db, esborraCamp: () => ESBORRA, dirBackups: dir, avui: AVUI, log: () => {} });
    expect(estat.propostes.nova).toEqual(PROPOSTES.nova);
    expect(estat.sessions.s1).toEqual(SESSIONS.s1);
    expect(estat.sessions.s5).toEqual(SESSIONS.s5);
  });
});
