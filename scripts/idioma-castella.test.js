// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { llegirOpcions, castella, ocurrencies, planificar, executar, desfer } from './idioma-castella.mjs';

const AVUI = new Date('2026-11-04T10:00:00Z');
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
  p1: { titol: 'Los domingos', idiomes: ['Espanyol', 'Anglès'], sinopsi: 'Un drama del cinema espanyol.' },
  p2: { titol: 'Ja bé', idiomes: ['Castellà'] },
  p3: { titol: 'Sense idiomes' },
};

const SESSIONS = {
  s1: { titol: 'Los domingos', publicada: true, publica: { idioma: 'Català, Espanyol', actualitzatEl: '2026-09-01', cos: 'Cinema espanyol recent.' } },
  s2: { titol: 'VOSE', publicada: false, publica: { versioIdiomatica: 'Versió Original Subtitulada Espanyol' } },
  s3: { titol: 'Res', publicada: true, publica: { idioma: 'Castellà', queInclou: 'Agència Espanyola' } },
};

const ambCopia = () => {
  const dir = mkdtempSync(join(tmpdir(), 'castella-'));
  mkdirSync(join(dir, '2026-11-04'), { recursive: true });
  writeFileSync(join(dir, '2026-11-04', 'manifest.json'), '{}');
  return dir;
};

describe('llegirOpcions', () => {
  it('llegeix les opcions i rebutja combinacions no vàlides', () => {
    expect(llegirOpcions([])).toEqual({ apply: false, desfer: null });
    expect(llegirOpcions(['--apply'])).toEqual({ apply: true, desfer: null });
    expect(llegirOpcions(['--desfer', 'f'])).toEqual({ apply: false, desfer: 'f' });
    expect(() => llegirOpcions(['--apply', '--desfer', 'f'])).toThrow('no es poden combinar');
    expect(() => llegirOpcions(['--res'])).toThrow('desconeguda');
  });
});

describe('castella', () => {
  it('canvia la paraula sencera «Espanyol»/«espanyol» per «Castellà»/«castellà»', () => {
    expect(castella('Espanyol')).toBe('Castellà');
    expect(castella('Català, Espanyol')).toBe('Català, Castellà');
    expect(castella('Versió Original Subtitulada Espanyol')).toBe('Versió Original Subtitulada Castellà');
    expect(castella('anglès i espanyol')).toBe('anglès i castellà');
  });

  it('no toca «espanyola», «Espanya» ni altres paraules', () => {
    for (const t of ['Agència Espanyola', 'Espanya', 'espanyols', 'hispanoespanyol', 'Castellà', '']) expect(castella(t)).toBe(t);
  });
});

describe('planificar i ocurrencies', () => {
  it('només planifica idiomes de propostes i idioma/versioIdiomatica de sessions; actualitzatEl si és publicada', () => {
    const propostes = Object.entries(PROPOSTES).map(([id, dades]) => ({ id, dades }));
    const sessions = Object.entries(SESSIONS).map(([id, dades]) => ({ id, dades }));
    expect(planificar({ propostes, sessions, avui: AVUI }).map((e) => [`${e.tipus}/${e.id}`, e.escrit])).toEqual([
      ['proposta/p1', { idiomes: ['Castellà', 'Anglès'] }],
      ['sessio/s1', { 'publica.idioma': 'Català, Castellà', 'publica.actualitzatEl': '2026-11-04' }],
      ['sessio/s2', { 'publica.versioIdiomatica': 'Versió Original Subtitulada Castellà' }],
    ]);
  });

  it('llista (sense canviar) «espanyol» als altres camps de text', () => {
    const docs = [{ col: 'propostes', id: 'p1', dades: PROPOSTES.p1 }, { col: 'sessions', id: 's1', dades: SESSIONS.s1 }, { col: 'sessions', id: 's3', dades: SESSIONS.s3 }];
    expect(ocurrencies(docs).map(({ doc, cami }) => `${doc} ${cami}`)).toEqual(['propostes/p1 sinopsi', 'sessions/s1 publica.cos']);
    expect(ocurrencies(docs)[0].fragment).toContain('cinema espanyol');
  });
});

describe('executar', () => {
  it('en mode informe no escriu res i llista les ocurrències de text lliure', async () => {
    const { db, estat } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    const log = vi.fn();
    const { pla } = await executar({ db, avui: AVUI, log });
    expect(pla).toHaveLength(3);
    expect(estat.escriptures).toEqual([]);
    const text = log.mock.calls.flat().join('\n');
    expect(text).toContain('propostes/p1 (Los domingos): idiomes ["Espanyol","Anglès"] -> ["Castellà","Anglès"]');
    expect(text).toContain('sessions/s1 publica.cos');
    expect(text).toContain("Amb --apply es canviarien 3 documents.");
  });

  it('sense la còpia d\'avui no escriu res', async () => {
    const { db, estat } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    await expect(executar({ db, apply: true, dirBackups: mkdtempSync(join(tmpdir(), 'castella-')), avui: AVUI, log: () => {} }))
      .rejects.toThrow("No hi ha cap còpia de seguretat d'avui");
    expect(estat.escriptures).toEqual([]);
  });

  it('canvia els camps, deixa el text lliure, és idempotent i es pot desfer', async () => {
    const { db, estat } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    const dir = ambCopia();
    const { resultats } = await executar({ db, apply: true, dirBackups: dir, avui: AVUI, log: () => {} });
    expect(resultats.map((r) => r.estat)).toEqual(['canviat', 'canviat', 'canviat']);
    expect(estat.propostes.p1).toEqual({ ...PROPOSTES.p1, idiomes: ['Castellà', 'Anglès'] });
    expect(estat.sessions.s1.publica).toEqual({ idioma: 'Català, Castellà', actualitzatEl: '2026-11-04', cos: 'Cinema espanyol recent.' });
    expect(estat.sessions.s2.publica).toEqual({ versioIdiomatica: 'Versió Original Subtitulada Castellà' });
    expect(estat.sessions.s3).toEqual(SESSIONS.s3);

    const fitxer = join(dir, '2026-11-04', 'idioma-castella.json');
    const registre = JSON.parse(readFileSync(fitxer, 'utf8'));
    expect(registre.execucions[0].documents[0].abans).toEqual({ idiomes: { existia: true, valor: ['Espanyol', 'Anglès'] } });

    const n = estat.escriptures.length;
    expect((await executar({ db, apply: true, dirBackups: dir, avui: AVUI, log: () => {} })).pla).toEqual([]);
    expect(estat.escriptures).toHaveLength(n);

    // L'admin canvia l'idioma de s1: no es desfà (ni el seu actualitzatEl).
    estat.sessions.s1.publica.idioma = 'Català';
    const { desfets, saltats } = await desfer({ fitxer, db, esborraCamp: () => ESBORRA, dirBackups: dir, avui: AVUI, log: () => {} });
    expect([desfets, saltats]).toEqual([2, 1]);
    expect(estat.propostes).toEqual(PROPOSTES);
    expect(estat.sessions.s2).toEqual(SESSIONS.s2);
    expect(estat.sessions.s1.publica).toEqual({ idioma: 'Català', actualitzatEl: '2026-11-04', cos: 'Cinema espanyol recent.' });
  });

  it('dins la transacció torna a mirar el camp: si ja no diu «Espanyol», no l\'escriu', async () => {
    const { db, estat } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    const original = db.runTransaction;
    let primer = true;
    db.runTransaction = async (fn) => {
      if (primer) { estat.propostes.p1.idiomes = ['Francès']; primer = false; }
      return original(fn);
    };
    const { resultats } = await executar({ db, apply: true, dirBackups: ambCopia(), avui: AVUI, log: () => {} });
    expect(resultats[0].estat).toBe('sense canvis');
    expect(estat.propostes.p1.idiomes).toEqual(['Francès']);
  });

  it('no mou actualitzatEl d\'una sessió que s\'ha despublicat entre l\'informe i l\'escriptura', async () => {
    const { db, estat } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    const original = db.runTransaction;
    let primer = true;
    db.runTransaction = async (fn) => {
      if (primer) { estat.sessions.s1.publicada = false; primer = false; }
      return original(fn);
    };
    await executar({ db, apply: true, dirBackups: ambCopia(), avui: AVUI, log: () => {} });
    expect(estat.sessions.s1.publica.actualitzatEl).toBe('2026-09-01');
    expect(estat.sessions.s1.publica.idioma).toBe('Català, Castellà');
  });
});
