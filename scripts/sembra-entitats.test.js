// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  llegirOpcions, pla, comprovarCopia, camiLogo, urlLogo, construeixDoc, sembra, desfer,
} from './sembra-entitats.mjs';
import { camiLogoEntitat } from '../src/lib/entitats.js';
import { urlStorage } from '../src/lib/sessioPublica.js';

const AVUI = new Date('2026-10-23T10:00:00Z');
const BUCKET = 'cineclub-socis.firebasestorage.app';
const JSON_ENTITATS = {
  "L'Ateneu Rodenc": { logo: '/images/entitats/ateneu.jpg', url: 'https://a.cat/' },
  'Amical de Mauthausen': { logo: '/images/entitats/amical.jpg', url: 'https://b.cat/' },
  'Associació Republicana': { logo: '/images/entitats/republicana.jpg', url: 'https://c.cat/' },
  'Cineclub Roda de Berà': { logo: '/images/entitats/cineclub.png', url: 'https://d.cat/' },
  'Ajuntament de Roda de Berà': { logo: '/images/entitats/ajuntament.png', url: 'https://e.cat/' },
};

const dirLogos = (noms) => {
  const dir = mkdtempSync(join(tmpdir(), 'logos-'));
  noms.forEach((n) => writeFileSync(join(dir, n), `bytes-${n}`));
  return dir;
};
const TOTS = ['ateneu.jpg', 'amical.jpg', 'republicana.jpg', 'cineclub.png', 'ajuntament.png'];
const backups = (ambCopia = true) => {
  const dir = mkdtempSync(join(tmpdir(), 'backups-'));
  if (ambCopia) {
    mkdirSync(join(dir, '2026-10-23'));
    writeFileSync(join(dir, '2026-10-23', 'manifest.json'), '{}');
  }
  return dir;
};

// Firestore fals: `entitats` en memòria, amb els `set` i `delete` registrats.
function firestoreFals(noms = []) {
  const docs = new Map(noms.map((nom, i) => [`e${i}`, { nom }]));
  const escriptures = [];
  const esborrats = [];
  let n = 0;
  return {
    docs, escriptures, esborrats,
    collection: () => ({
      get: async () => ({ docs: [...docs].map(([id, d]) => ({ id, data: () => d })) }),
      doc: (id) => {
        const ref = { id: id ?? `nou${n++}` };
        ref.set = async (dades) => { escriptures.push([ref.id, dades]); docs.set(ref.id, dades); };
        ref.get = async () => ({ exists: docs.has(ref.id), data: () => docs.get(ref.id) });
        ref.delete = async () => { esborrats.push(ref.id); docs.delete(ref.id); };
        return ref;
      },
    }),
  };
}
function bucketFals() {
  const pujades = [];
  const bucket = {
    name: BUCKET,
    pujades,
    file: (cami) => ({
      save: async (contingut, opcions) => { pujades.push({ cami, contingut: contingut.toString(), opcions }); },
    }),
  };
  return bucket;
}
const base = (extra = {}) => ({
  entitatsJson: JSON_ENTITATS, dirLogos: dirLogos(TOTS), dirBackups: backups(), avui: AVUI,
  instant: 1000, creatEl: () => 'TS', log: () => {}, ...extra,
});

describe('llegirOpcions', () => {
  it('per defecte és informe', () => expect(llegirOpcions([])).toEqual({ apply: false, desfer: null }));
  it('--apply', () => expect(llegirOpcions(['--apply'])).toEqual({ apply: true, desfer: null }));
  it('--desfer <fitxer>', () => expect(llegirOpcions(['--desfer', 'f.json'])).toEqual({ apply: false, desfer: 'f.json' }));
  it('errors', () => {
    expect(() => llegirOpcions(['--desfer'])).toThrow();
    expect(() => llegirOpcions(['--apply', '--desfer', 'f'])).toThrow();
    expect(() => llegirOpcions(['--executa'])).toThrow(/desconeguda/);
  });
});

describe('pla', () => {
  it('amb un nom existent: 1 saltar i 4 crear', () => {
    const p = pla(JSON_ENTITATS, ["L'Ateneu Rodenc"]);
    expect(p).toHaveLength(5);
    expect(p.filter((e) => e.accio === 'saltar').map((e) => e.nom)).toEqual(["L'Ateneu Rodenc"]);
    expect(p.filter((e) => e.accio === 'crear').map((e) => e.nom)).toEqual([
      'Amical de Mauthausen', 'Associació Republicana', 'Cineclub Roda de Berà', 'Ajuntament de Roda de Berà',
    ]);
    expect(p[0]).toEqual({ nom: "L'Ateneu Rodenc", logo: '/images/entitats/ateneu.jpg', url: 'https://a.cat/', accio: 'saltar' });
  });
});

describe('format de camí i URL del logo', () => {
  it('és el mateix que el de l\'admin', () => {
    for (const [nom, ext, type] of [["L'Ateneu Rodenc", 'jpg', 'image/jpeg'], ['Cineclub Roda de Berà', 'png', 'image/png'], ['X', 'webp', 'image/webp']]) {
      expect(camiLogo(nom, `logo.${ext.toUpperCase()}`, 123)).toBe(camiLogoEntitat(nom, { type }, 123));
    }
    expect(camiLogo('Cineclub Roda de Berà', 'a.png', 5)).toBe('web/entitats/cineclub-roda-de-bera-5.png');
    expect(urlLogo(BUCKET, 'web/entitats/a b-1.png')).toBe(urlStorage(BUCKET, 'web/entitats/a b-1.png'));
  });
  it('construeixDoc omet url i logo absents', () => {
    expect(construeixDoc({ nom: 'A', url: 'https://a/' }, 'L', 'T')).toEqual({ nom: 'A', logo: 'L', url: 'https://a/', creatEl: 'T' });
    expect(construeixDoc({ nom: 'A' }, null, 'T')).toEqual({ nom: 'A', creatEl: 'T' });
  });
});

describe('comprovarCopia', () => {
  it('falla sense la còpia d\'avui', () => expect(() => comprovarCopia(backups(false), AVUI)).toThrow(/còpia de seguretat/));
  it('passa amb la còpia', () => expect(() => comprovarCopia(backups(), AVUI)).not.toThrow());
});

describe('sembra', () => {
  it('informe: 0 pujades, 0 escriptures i sense fitxer d\'entitats creades', async () => {
    const db = firestoreFals(["L'Ateneu Rodenc"]);
    const bucket = bucketFals();
    const o = base();
    const linies = [];
    const res = await sembra({ ...o, db, bucket, log: (l) => linies.push(l) });
    expect(res.pla.filter((e) => e.accio === 'crear')).toHaveLength(4);
    expect(db.escriptures).toEqual([]);
    expect(bucket.pujades).toEqual([]);
    expect(existsSync(join(o.dirBackups, '2026-10-23', 'entitats-creades.json'))).toBe(false);
    expect(linies.join('\n')).toMatch(/MODE INFORME/);
  });

  it('apply sense còpia d\'avui es nega i no toca res', async () => {
    const db = firestoreFals();
    const bucket = bucketFals();
    await expect(sembra({ ...base({ dirBackups: backups(false) }), db, bucket, apply: true })).rejects.toThrow(/còpia/);
    expect(db.escriptures).toEqual([]);
    expect(bucket.pujades).toEqual([]);
  });

  it('apply: puja el logo i crea un document per entitat nova amb l\'URL exacta', async () => {
    const db = firestoreFals(Object.keys(JSON_ENTITATS).filter((n) => n !== 'Cineclub Roda de Berà'));
    const bucket = bucketFals();
    const o = base();
    await sembra({ ...o, db, bucket, apply: true });
    const cami = 'web/entitats/cineclub-roda-de-bera-1000.png';
    expect(bucket.pujades).toHaveLength(1);
    expect(bucket.pujades[0].cami).toBe(cami);
    expect(bucket.pujades[0].contingut).toBe('bytes-cineclub.png');
    expect(bucket.pujades[0].opcions.contentType).toBe('image/png');
    expect(db.escriptures).toEqual([['nou0', {
      nom: 'Cineclub Roda de Berà',
      logo: `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/web%2Fentitats%2Fcineclub-roda-de-bera-1000.png?alt=media`,
      url: 'https://d.cat/',
      creatEl: 'TS',
    }]]);
    const creades = JSON.parse(readFileSync(join(o.dirBackups, '2026-10-23', 'entitats-creades.json'), 'utf8'));
    expect(creades.entitats).toEqual([{ id: 'nou0', nom: 'Cineclub Roda de Berà', logo: cami }]);
  });

  it('segona execució: 0 pujades i 0 escriptures', async () => {
    const db = firestoreFals();
    const bucket = bucketFals();
    const o = base();
    await sembra({ ...o, db, bucket, apply: true });
    expect(db.escriptures).toHaveLength(5);
    expect(bucket.pujades).toHaveLength(5);
    await sembra({ ...o, db, bucket, apply: true });
    expect(db.escriptures).toHaveLength(5);
    expect(bucket.pujades).toHaveLength(5);
  });

  it('logo absent al disc: document sense logo i missatge', async () => {
    const db = firestoreFals();
    const bucket = bucketFals();
    const linies = [];
    await sembra({
      ...base({ dirLogos: dirLogos(TOTS.filter((n) => n !== 'amical.jpg')) }), db, bucket, apply: true, log: (l) => linies.push(l),
    });
    const doc = db.escriptures.find(([, d]) => d.nom === 'Amical de Mauthausen')[1];
    expect(doc).toEqual({ nom: 'Amical de Mauthausen', url: 'https://b.cat/', creatEl: 'TS' });
    expect(bucket.pujades).toHaveLength(4);
    expect(linies.join('\n')).toMatch(/Falta el logo.*amical\.jpg/);
  });
});

describe('casos límit', () => {
  it('un nom existent amb altres majúscules i espais compta com a existent', async () => {
    const db = firestoreFals(['  cineclub roda de berà ']);
    const linies = [];
    const res = await sembra({ ...base(), db, bucket: bucketFals(), apply: true, log: (l) => linies.push(l) });
    expect(res.pla.find((e) => e.nom === 'Cineclub Roda de Berà').accio).toBe('saltar');
    expect(db.escriptures).toHaveLength(4);
    expect(linies.join('\n')).toContain('saltar Cineclub Roda de Berà (ja existeix');
  });

  it('un logo amb extensió no admesa dóna missatge propi i entitat sense logo', async () => {
    const db = firestoreFals();
    const linies = [];
    const json = { 'Amb SVG': { logo: '/images/entitats/x.svg', url: 'https://x.cat/' } };
    await sembra({ ...base({ entitatsJson: json, dirLogos: dirLogos(['x.svg']) }), db, bucket: bucketFals(), apply: true, log: (l) => linies.push(l) });
    expect(db.escriptures).toEqual([['nou0', { nom: 'Amb SVG', url: 'https://x.cat/', creatEl: 'TS' }]]);
    expect(linies.join('\n')).toMatch(/tipus de logo no admès: .*x\.svg/);
    expect(linies.join('\n')).not.toMatch(/Falta el logo/);
  });
});

describe('desfer', () => {
  it('esborra només els documents del fitxer i mai toca Storage', async () => {
    const db = firestoreFals(['Aliena']);
    const bucket = bucketFals();
    const o = base();
    await sembra({ ...o, db, bucket, apply: true });
    const fitxer = join(o.dirBackups, '2026-10-23', 'entitats-creades.json');
    let toquesStorage = 0;
    const bucketVigilat = { name: BUCKET, file: () => { toquesStorage++; return { delete: async () => { toquesStorage++; } }; } };
    await desfer({ fitxer, db, bucket: bucketVigilat, dirBackups: o.dirBackups, avui: AVUI, log: () => {} });
    expect(db.esborrats.sort()).toEqual(['nou0', 'nou1', 'nou2', 'nou3', 'nou4']);
    expect(db.docs.get('e0')).toEqual({ nom: 'Aliena' });
    expect(toquesStorage).toBe(0);
  });

  const fitxerAmb = (entitats) => {
    const dir = backups();
    const fitxer = join(dir, 'f.json');
    writeFileSync(fitxer, JSON.stringify({ entitats }));
    return { dir, fitxer };
  };

  it('salta els inexistents sense error i els que han canviat de nom', async () => {
    const db = firestoreFals();
    db.docs.set('a', { nom: 'A' });
    db.docs.set('b', { nom: 'B canviat' });
    const { dir, fitxer } = fitxerAmb([{ id: 'a', nom: 'A' }, { id: 'b', nom: 'B' }, { id: 'zz', nom: 'Z' }]);
    const linies = [];
    const res = await desfer({ fitxer, db, dirBackups: dir, avui: AVUI, log: (l) => linies.push(l) });
    expect(db.esborrats).toEqual(['a']);
    expect(db.docs.get('b')).toEqual({ nom: 'B canviat' });
    expect(res).toEqual({ esborrades: 1, saltades: 2 });
    const text = linies.join('\n');
    expect(text).toContain('saltat: zz no existeix');
    expect(text).toContain('saltat: b ha canviat de nom (B → B canviat)');
    expect(text).toContain('Esborrades 1, saltades 2.');
  });

  it('sense còpia d\'avui no esborra res', async () => {
    const db = firestoreFals();
    const dir = backups(false);
    const fitxer = join(dir, 'f.json');
    writeFileSync(fitxer, JSON.stringify({ entitats: [{ id: 'x' }] }));
    await expect(desfer({ fitxer, db, dirBackups: dir, avui: AVUI, log: () => {} })).rejects.toThrow(/còpia/);
    expect(db.esborrats).toEqual([]);
  });
});
