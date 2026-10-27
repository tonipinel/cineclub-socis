// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  llegirOpcions, planificar, comprovarCopia, executar, desfer,
} from './unifica-titols-sessions.mjs';

const AVUI = new Date('2026-10-27T10:00:00Z');
const ESBORRAR = Symbol('esborrar');

// Firestore fals amb la forma de l'Admin SDK per a `sessions`; `update` accepta camps amb punts.
function firestoreFals(sessions) {
  const estat = { sessions: structuredClone(sessions), escriptures: 0 };
  const col = () => ({
    get: async () => ({ docs: Object.entries(estat.sessions).map(([id, dades]) => ({ id, data: () => structuredClone(dades) })) }),
    doc: (id) => ({ id, get: async () => ({ exists: id in estat.sessions, data: () => structuredClone(estat.sessions[id]) }) }),
  });
  return {
    estat,
    collection: col,
    batch: () => {
      const ops = [];
      const b = {
        update: (r, canvis) => {
          ops.push(() => {
            for (const [cami, v] of Object.entries(canvis)) {
              const claus = cami.split('.');
              const pare = claus.slice(0, -1).reduce((obj, k) => obj[k], estat.sessions[r.id]);
              if (v === ESBORRAR) delete pare[claus.at(-1)];
              else pare[claus.at(-1)] = v;
            }
          });
          return b;
        },
        commit: async () => { ops.forEach((op) => { op(); estat.escriptures += 1; }); },
      };
      return b;
    },
  };
}

const SESSIONS = {
  // El títol de gestió en català; la web ja mostra l'original: només canvia `titol`.
  avi: {
    titol: "L'avi de 100 anys", data: '2026-04-02', slug: 'lavi-de-100-anys', publicada: true,
    publica: { titol: 'Hundraåringen', titolOriginal: 'Hundraåringen', titolTraduit: "L'avi de 100 anys", titolEspanya: 'El abuelo', aliases: [] },
  },
  // Programada des d'una proposta amb el títol a Espanya: tot passa a l'original; el d'Espanya ja hi és.
  ours: {
    titol: 'Misterioso asesinato', data: '2026-11-05', slug: 'misterioso-asesinato', publicada: false,
    publica: { titol: 'Misterioso asesinato', titolOriginal: 'Un ours dans le Jura', titolEspanya: 'Misterioso asesinato' },
  },
  // Publicada amb el títol d'Espanya i sense `titolEspanya`: es copia i es mou `actualitzatEl`.
  domingos: {
    titol: 'Los domingos', data: '2026-09-03', slug: 'los-domingos', publicada: true,
    publica: { titol: 'Los domingos', titolOriginal: 'Domingos', titolTraduit: 'Els diumenges', actualitzatEl: '2026-09-01' },
  },
  // Ja coherent: no es toca.
  pig: {
    titol: 'Pig', data: '2026-06-25', slug: 'pig', publicada: true,
    publica: { titol: 'Pig', titolOriginal: 'Pig', titolTraduit: 'Porc' },
  },
  // Sense títol original: no es toca i s'informa.
  gusen: { titol: 'Carretera a Gusen', data: '2026-05-09', slug: 'carretera-a-gusen', publicada: true, publica: { titol: 'Carretera a Gusen' } },
  // Sense publica.
  vella: { titol: 'Vella', data: '2025-01-01' },
};

const docs = (sessions) => Object.entries(sessions).map(([id, dades]) => ({ id, data: () => structuredClone(dades) }));

function dirBackupsAmbCopia() {
  const dir = mkdtempSync(join(tmpdir(), 'titols-'));
  mkdirSync(join(dir, '2026-10-27'), { recursive: true });
  writeFileSync(join(dir, '2026-10-27', 'manifest.json'), '{}');
  return dir;
}

describe('llegirOpcions', () => {
  it('informe per defecte, --apply i --desfer, que no es combinen', () => {
    expect(llegirOpcions([])).toEqual({ apply: false, desfer: null });
    expect(llegirOpcions(['--apply'])).toEqual({ apply: true, desfer: null });
    expect(llegirOpcions(['--desfer', 'f.json'])).toEqual({ apply: false, desfer: 'f.json' });
    expect(() => llegirOpcions(['--apply', '--desfer', 'f.json'])).toThrow(/no es poden combinar/);
    expect(() => llegirOpcions(['--desfer'])).toThrow(/Opció/);
  });
});

describe('planificar', () => {
  const pla = planificar(docs(SESSIONS), AVUI);
  const de = (id) => pla.canviar.find((c) => c.id === id);

  it('posa titol i publica.titol al títol original i no toca titolTraduit, slug, data ni aliases', () => {
    expect(pla.canviar.map((c) => c.id)).toEqual(['avi', 'domingos', 'ours']);
    expect(de('avi').escrit).toEqual({ titol: 'Hundraåringen', 'publica.titol': 'Hundraåringen' });
    expect(de('ours').escrit).toEqual({ titol: 'Un ours dans le Jura', 'publica.titol': 'Un ours dans le Jura' });
    for (const { escrit } of pla.canviar) {
      expect(Object.keys(escrit).every((cami) => ['titol', 'publica.titol', 'publica.titolEspanya', 'publica.actualitzatEl'].includes(cami))).toBe(true);
    }
  });

  it('copia el títol mostrat a titolEspanya si era buit i mou actualitzatEl de les publicades si canvia la web', () => {
    expect(de('domingos').escrit).toEqual({
      titol: 'Domingos', 'publica.titol': 'Domingos', 'publica.titolEspanya': 'Los domingos', 'publica.actualitzatEl': '2026-10-27',
    });
    expect(de('domingos').anterior).toEqual({
      titol: { valor: 'Los domingos' },
      'publica.titol': { valor: 'Los domingos' },
      'publica.titolEspanya': { absent: true },
      'publica.actualitzatEl': { valor: '2026-09-01' },
    });
  });

  it('no copia a titolEspanya el títol en català', () => {
    const r = planificar(docs({ x: { titol: 'Porc', publica: { titol: 'Porc', titolOriginal: 'Pig', titolTraduit: 'porc' } } }), AVUI);
    expect(r.canviar[0].escrit).toEqual({ titol: 'Pig', 'publica.titol': 'Pig' });
  });

  it('no mou actualitzatEl si la web ja mostrava l\'original (sense publica.titol)', () => {
    const r = planificar(docs({ x: { titol: 'Pig', publicada: true, publica: { titolOriginal: 'Pig' } } }), AVUI);
    expect(r.canviar[0].escrit).toEqual({ titol: 'Pig', 'publica.titol': 'Pig' });
  });

  it('llista les sessions sense títol original i no les toca', () => {
    expect(pla.senseOriginal.map((s) => [s.id, s.titol])).toEqual([['vella', 'Vella'], ['gusen', 'Carretera a Gusen']]);
  });
});

describe('executar', () => {
  it('l\'informe no escriu res', async () => {
    const db = firestoreFals(SESSIONS);
    const r = await executar({ db, avui: AVUI, log: () => {} });
    expect(r).toMatchObject({ canviar: 3, senseOriginal: 2, escrit: false });
    expect(db.estat.escriptures).toBe(0);
  });

  it('--apply sense la còpia d\'avui no escriu res', async () => {
    const db = firestoreFals(SESSIONS);
    const dir = mkdtempSync(join(tmpdir(), 'titols-'));
    await expect(executar({ db, apply: true, dirBackups: dir, avui: AVUI, log: () => {} })).rejects.toThrow(/còpia de seguretat/);
    expect(() => comprovarCopia(dir, AVUI)).toThrow();
    expect(db.estat.escriptures).toBe(0);
  });

  it('--apply escriu, deixa el registre previ i és idempotent; --desfer ho torna tot enrere', async () => {
    const db = firestoreFals(SESSIONS);
    const dir = dirBackupsAmbCopia();
    const r = await executar({ db, apply: true, dirBackups: dir, avui: AVUI, log: () => {} });
    expect(r.escrit).toBe(true);
    const fitxer = join(dir, '2026-10-27', 'unifica-titols-sessions.json');
    expect(existsSync(fitxer)).toBe(true);
    expect(JSON.parse(readFileSync(fitxer, 'utf8')).execucions).toHaveLength(1);
    const s = db.estat.sessions;
    expect(s.ours).toMatchObject({ titol: 'Un ours dans le Jura', slug: 'misterioso-asesinato', data: '2026-11-05' });
    expect(s.ours.publica).toEqual({ ...SESSIONS.ours.publica, titol: 'Un ours dans le Jura' });
    expect(s.avi.publica).toEqual(SESSIONS.avi.publica);
    expect(s.domingos.publica.titolTraduit).toBe('Els diumenges');
    expect(s.pig).toEqual(SESSIONS.pig);
    expect(s.gusen).toEqual(SESSIONS.gusen);

    const segona = await executar({ db, apply: true, dirBackups: dir, avui: AVUI, log: () => {} });
    expect(segona).toMatchObject({ canviar: 0, escrit: false });

    const d = await desfer({ fitxer, db, esborrarCamp: ESBORRAR, dirBackups: dir, avui: AVUI, log: () => {} });
    expect(d).toEqual({ desfets: 3, saltats: 0 });
    expect(db.estat.sessions).toEqual(SESSIONS);
  });

  it('--desfer no toca una sessió editada després i demana la còpia d\'avui', async () => {
    const db = firestoreFals(SESSIONS);
    const dir = dirBackupsAmbCopia();
    await executar({ db, apply: true, dirBackups: dir, avui: AVUI, log: () => {} });
    db.estat.sessions.ours.titol = 'Un ours dans le Jura (2025)';
    const fitxer = join(dir, '2026-10-27', 'unifica-titols-sessions.json');
    const d = await desfer({ fitxer, db, esborrarCamp: ESBORRAR, dirBackups: dir, avui: AVUI, log: () => {} });
    expect(d).toEqual({ desfets: 2, saltats: 1 });
    expect(db.estat.sessions.ours.titol).toBe('Un ours dans le Jura (2025)');
    await expect(desfer({ fitxer, db, esborrarCamp: ESBORRAR, dirBackups: mkdtempSync(join(tmpdir(), 'titols-')), avui: AVUI }))
      .rejects.toThrow(/còpia de seguretat/);
  });
});
