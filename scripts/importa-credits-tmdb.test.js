// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  llegirOpcions, esBuit, executar, desfer,
} from './importa-credits-tmdb.mjs';

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

const CREDITS = {
  fotografia: ['Foto A'], muntatge: ['Munt A'], musica: ['Mus A', 'Mus B'], produccio: ['Prod A'],
};

const PROPOSTES = {
  Xo6: { titol: 'Misterioso asesinato en la montaña', tmdbId: 1210732, directors: ['D'] },
  editada: { titol: 'Editada', tmdbId: 7, musica: [], campsEditats: ['musica'], fotografia: ['Meva'] },
  plena: { titol: 'Plena', tmdbId: 8, ...CREDITS },
  senseTmdb: { titol: 'Sense TMDB' },
};

const SESSIONS = {
  'proposta-Xo6': { titol: 'Misterioso', propostaId: 'Xo6', publicada: false, publica: { titol: 'Misterioso', actualitzatEl: '2026-10-01' } },
  publicada: { titol: 'Editada', propostaId: 'editada', publicada: true, publica: { muntatge: 'Escrit per l\'admin', actualitzatEl: '2026-09-01' } },
  plena: { titol: 'Plena', propostaId: 'plena', publicada: false, publica: { fotografia: 'X', muntatge: 'Y', musica: 'Z', produccio: 'W' } },
  senseProposta: { titol: 'Lliure', publica: {} },
};

const ambCopia = () => {
  const dir = mkdtempSync(join(tmpdir(), 'credits-'));
  mkdirSync(join(dir, '2026-10-27'), { recursive: true });
  writeFileSync(join(dir, '2026-10-27', 'manifest.json'), '{}');
  return dir;
};

const credits = () => vi.fn(async () => structuredClone(CREDITS));

describe('llegirOpcions', () => {
  it('llegeix les opcions i rebutja combinacions no vàlides', () => {
    expect(llegirOpcions([])).toEqual({ apply: false, desfer: null, sessio: null });
    expect(llegirOpcions(['--apply', '--sessio', 's1'])).toEqual({ apply: true, desfer: null, sessio: 's1' });
    expect(() => llegirOpcions(['--apply', '--desfer', 'f'])).toThrow('no es poden combinar');
    expect(() => llegirOpcions(['--res'])).toThrow('desconeguda');
    expect(() => llegirOpcions(['--sessio', '--apply'])).toThrow('incompleta: --sessio');
    expect(() => llegirOpcions(['--sessio'])).toThrow('incompleta: --sessio');
    expect(() => llegirOpcions(['--desfer', '--apply'])).toThrow('incompleta: --desfer');
  });
});

describe('esBuit', () => {
  it.each([[undefined, true], [null, true], ['', true], ['  ', true], [[], true], [[' '], true], ['x', false], [['x'], false]])(
    '%j → %s', (valor, esperat) => expect(esBuit(valor)).toBe(esperat),
  );
});

describe('executar (informe)', () => {
  it('no escriu res i només consulta TMDB per a propostes amb tmdbId i camps buits no editats', async () => {
    const { db, estat } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    const fn = credits();
    const log = vi.fn();
    const { pla } = await executar({ db, credits: fn, avui: AVUI, log });
    expect(estat.escriptures).toEqual([]);
    expect(fn.mock.calls.map(([id]) => id).sort()).toEqual([1210732, 7]);
    const perId = Object.fromEntries(pla.map((e) => [`${e.tipus}/${e.id}`, e.escrit]));
    expect(perId).toEqual({
      'proposta/Xo6': CREDITS,
      // La música editada (buida) i la fotografia de l'admin no es toquen.
      'proposta/editada': { muntatge: ['Munt A'], produccio: ['Prod A'] },
      'sessio/proposta-Xo6': {
        'publica.fotografia': 'Foto A', 'publica.muntatge': 'Munt A', 'publica.musica': 'Mus A, Mus B', 'publica.produccio': 'Prod A',
      },
      // Publicada: la fotografia surt de la proposta (de l'admin) i el muntatge de la sessió no es toca.
      'sessio/publicada': { 'publica.fotografia': 'Meva', 'publica.produccio': 'Prod A', 'publica.actualitzatEl': '2026-10-27' },
    });
    expect(log.mock.calls.flat().join('\n')).toContain("Amb --apply s'omplirien 4 documents.");
  });

  it('--sessio ho limita a la sessió i a la seva proposta', async () => {
    const { db } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    const fn = credits();
    const { pla } = await executar({ db, credits: fn, sessio: 'proposta-Xo6', avui: AVUI, log: () => {} });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(pla.map((e) => `${e.tipus}/${e.id}`)).toEqual(['proposta/Xo6', 'sessio/proposta-Xo6']);
    await expect(executar({ db, credits: fn, sessio: 'senseProposta', log: () => {} })).rejects.toThrow('cap proposta');
    await expect(executar({ db, credits: fn, sessio: 'no-hi-es', log: () => {} })).rejects.toThrow('No existeix');
  });

  it('sense clau llista les candidates sense valors i --apply s\'atura abans d\'escriure', async () => {
    const { db, estat } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    const log = vi.fn();
    const { pla } = await executar({ db, avui: AVUI, log });
    const text = log.mock.calls.flat().join('\n');
    expect(text).toContain('Sense TMDB_API_KEY: 2 propostes');
    expect(text).toContain('propostes/Xo6');
    // La sessió de la proposta editada encara es pot omplir amb el que ja té la proposta.
    expect(pla.map((e) => `${e.tipus}/${e.id}`)).toEqual(['sessio/publicada']);
    await expect(executar({ db, apply: true, dirBackups: ambCopia(), avui: AVUI, log })).rejects.toThrow('TMDB_API_KEY');
    expect(estat.escriptures).toEqual([]);
  });

  it('una fallada de TMDB no atura la resta', async () => {
    const { db } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    const fn = vi.fn(async (id) => { if (id === 7) throw new Error('TMDB ha respost 404'); return structuredClone(CREDITS); });
    const { pla } = await executar({ db, credits: fn, avui: AVUI, log: () => {} });
    expect(pla.some((e) => e.id === 'Xo6')).toBe(true);
    expect(pla.some((e) => e.id === 'editada')).toBe(false);
  });
});

describe('executar --apply i desfer', () => {
  it('sense la còpia d\'avui no escriu res', async () => {
    const { db, estat } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    const dir = mkdtempSync(join(tmpdir(), 'credits-'));
    await expect(executar({ db, apply: true, credits: credits(), dirBackups: dir, avui: AVUI, log: () => {} }))
      .rejects.toThrow("No hi ha cap còpia de seguretat d'avui");
    expect(estat.escriptures).toEqual([]);
  });

  it('omple només els camps buits, és idempotent i es pot desfer', async () => {
    const { db, estat } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    const dir = ambCopia();
    const abans = structuredClone(estat);
    const { resultats } = await executar({ db, apply: true, credits: credits(), dirBackups: dir, avui: AVUI, log: () => {} });
    expect(resultats.map((r) => r.estat)).toEqual(['omplert', 'omplert', 'omplert', 'omplert']);
    expect(estat.propostes.Xo6).toMatchObject({ ...CREDITS, directors: ['D'] });
    expect(estat.propostes.editada).toMatchObject({ musica: [], fotografia: ['Meva'], muntatge: ['Munt A'] });
    // No publicada: no es mou actualitzatEl.
    expect(estat.sessions['proposta-Xo6'].publica).toEqual({
      titol: 'Misterioso', actualitzatEl: '2026-10-01', fotografia: 'Foto A', muntatge: 'Munt A', musica: 'Mus A, Mus B', produccio: 'Prod A',
    });
    expect(estat.sessions.publicada.publica).toEqual({
      muntatge: 'Escrit per l\'admin', fotografia: 'Meva', produccio: 'Prod A', actualitzatEl: '2026-10-27',
    });
    expect(estat.sessions.plena).toEqual(SESSIONS.plena);

    const fitxer = join(dir, '2026-10-27', 'credits-tmdb.json');
    const registre = JSON.parse(readFileSync(fitxer, 'utf8'));
    expect(registre.execucions).toHaveLength(1);
    expect(registre.execucions[0].documents.find((d) => d.id === 'publicada').abans['publica.actualitzatEl'])
      .toEqual({ existia: true, valor: '2026-09-01' });

    const n = estat.escriptures.length;
    const segona = await executar({ db, apply: true, credits: credits(), dirBackups: dir, avui: AVUI, log: () => {} });
    expect(segona.pla).toEqual([]);
    expect(estat.escriptures).toHaveLength(n);

    // L'admin canvia la música de la sessió: aquest camp no es desfà.
    estat.sessions['proposta-Xo6'].publica.musica = 'Una altra';
    const { desfets, saltats } = await desfer({ fitxer, db, esborraCamp: () => ESBORRA, dirBackups: dir, avui: AVUI, log: () => {} });
    expect(desfets).toBe(4);
    expect(saltats).toBe(1);
    expect(estat.propostes).toEqual(abans.propostes);
    expect(estat.sessions.publicada).toEqual(abans.sessions.publicada);
    expect(estat.sessions['proposta-Xo6'].publica).toEqual({ ...abans.sessions['proposta-Xo6'].publica, musica: 'Una altra' });
  });

  it('dins la transacció no sobreescriu un camp que algú ha omplert entre l\'informe i l\'escriptura', async () => {
    const { db, estat } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    const original = db.runTransaction;
    let primer = true;
    db.runTransaction = async (fn) => {
      if (primer) { estat.propostes.Xo6.fotografia = ['Admin']; primer = false; }
      return original(fn);
    };
    await executar({ db, apply: true, credits: credits(), sessio: 'proposta-Xo6', dirBackups: ambCopia(), avui: AVUI, log: () => {} });
    expect(estat.propostes.Xo6.fotografia).toEqual(['Admin']);
    expect(estat.propostes.Xo6.muntatge).toEqual(['Munt A']);
  });

  it('dins la transacció no omple un camp de la proposta que l\'admin ha marcat com a editat', async () => {
    const { db, estat } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    const original = db.runTransaction;
    let primer = true;
    db.runTransaction = async (fn) => {
      if (primer) { Object.assign(estat.propostes.Xo6, { musica: [], campsEditats: ['musica'] }); primer = false; }
      return original(fn);
    };
    await executar({ db, apply: true, credits: credits(), sessio: 'proposta-Xo6', dirBackups: ambCopia(), avui: AVUI, log: () => {} });
    expect(estat.propostes.Xo6.musica).toEqual([]);
    expect(estat.propostes.Xo6.fotografia).toEqual(['Foto A']);
  });

  it('--sessio amb --apply només escriu la sessió i la seva proposta', async () => {
    const { db, estat } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    await executar({ db, apply: true, credits: credits(), sessio: 'proposta-Xo6', dirBackups: ambCopia(), avui: AVUI, log: () => {} });
    expect(estat.escriptures.map((e) => e.doc)).toEqual(['propostes/Xo6', 'sessions/proposta-Xo6']);
    expect(estat.sessions['proposta-Xo6'].publica.produccio).toBe('Prod A');
  });

  it('--apply amb TMDB fallant: la proposta no es toca i la sessió s\'omple amb el que la proposta ja té', async () => {
    const { db, estat } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    const fn = vi.fn(async (id) => { if (id === 7) throw new Error('TMDB ha respost 429'); return structuredClone(CREDITS); });
    const { resultats } = await executar({ db, apply: true, credits: fn, dirBackups: ambCopia(), avui: AVUI, log: () => {} });
    expect(resultats.map((r) => `${r.tipus}/${r.id}`)).toEqual(['proposta/Xo6', 'sessio/proposta-Xo6', 'sessio/publicada']);
    expect(estat.propostes.editada).toEqual(PROPOSTES.editada);
    expect(estat.sessions.publicada.publica).toEqual({
      muntatge: 'Escrit per l\'admin', fotografia: 'Meva', actualitzatEl: '2026-10-27',
    });
  });

  it('desfer no fa enrere actualitzatEl si l\'admin ha canviat algun camp escrit el mateix dia', async () => {
    const { db, estat } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    const dir = ambCopia();
    await executar({ db, apply: true, credits: credits(), dirBackups: dir, avui: AVUI, log: () => {} });
    estat.sessions.publicada.publica.produccio = 'Corregida per l\'admin';
    const fitxer = join(dir, '2026-10-27', 'credits-tmdb.json');
    await desfer({ fitxer, db, esborraCamp: () => ESBORRA, dirBackups: dir, avui: AVUI, log: () => {} });
    expect(estat.sessions.publicada.publica).toEqual({
      muntatge: 'Escrit per l\'admin', produccio: 'Corregida per l\'admin', actualitzatEl: '2026-10-27',
    });
  });

  it('desfer amb --sessio només toca la sessió i la seva proposta', async () => {
    const { db, estat } = entorn({ sessions: SESSIONS, propostes: PROPOSTES });
    const dir = ambCopia();
    await executar({ db, apply: true, credits: credits(), dirBackups: dir, avui: AVUI, log: () => {} });
    const fitxer = join(dir, '2026-10-27', 'credits-tmdb.json');
    await desfer({ fitxer, db, sessio: 'proposta-Xo6', esborraCamp: () => ESBORRA, dirBackups: dir, avui: AVUI, log: () => {} });
    expect(estat.propostes.Xo6).toEqual(PROPOSTES.Xo6);
    expect(estat.sessions['proposta-Xo6']).toEqual(SESSIONS['proposta-Xo6']);
    expect(estat.propostes.editada.muntatge).toEqual(['Munt A']);
  });
});
