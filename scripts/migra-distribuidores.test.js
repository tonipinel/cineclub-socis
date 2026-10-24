// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MAPA_NOMS, llegirOpcions, normalitza, nomCanonic, pla, comprovarCopia, camiLogo, urlLogo, migra, desfer,
} from './migra-distribuidores.mjs';
import { camiLogoDistribuidora } from '../src/lib/distribuidores.js';
import { urlStorage } from '../src/lib/sessioPublica.js';

const AVUI = new Date('2026-10-24T10:00:00Z');
const BUCKET = 'cineclub-socis.firebasestorage.app';
const JSON_DISTRIBUIDORS = {
  'A Contracorriente Films': { logo: '/images/distribuidors/a-contracorriente.png', url: 'https://acontracorrientefilms.com/' },
  'Arlong Productions': { logo: '/images/distribuidors/arlong-productions.png', url: 'https://www.arlongproductions.com/' },
  'BTeam Pictures': { logo: '/images/distribuidors/bteam-pictures.png', url: 'https://bteampictures.es/' },
};
const LOGOS = ['a-contracorriente.png', 'arlong-productions.png', 'bteam-pictures.png'];
const url = (cami) => `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(cami)}?alt=media`;

const dirLogos = (noms = LOGOS) => {
  const dir = mkdtempSync(join(tmpdir(), 'logos-'));
  noms.forEach((n) => writeFileSync(join(dir, n), `bytes-${n}`));
  return dir;
};
const backups = (ambCopia = true) => {
  const dir = mkdtempSync(join(tmpdir(), 'backups-'));
  if (ambCopia) {
    mkdirSync(join(dir, '2026-10-24'));
    writeFileSync(join(dir, '2026-10-24', 'manifest.json'), '{}');
  }
  return dir;
};

const ESBORRA = { esborra: true };
const sessio = (suport, publicada = true) => ({ titol: `T ${suport}`, publicada, publica: { suportDistribucio: suport, titol: 'P' } });
const DISTRIBUIDORES = {
  d1: { nom: 'A Contracorriente', web: 'acontracorriente.es' },
  d2: { nom: 'B-team', web: '' },
  d3: { nom: 'Arlong Productions' },
  d4: { nom: 'Una altra' },
};
const SESSIONS = {
  s1: sessio('A Contracorriente Films'),
  s2: sessio('A Contracorriente Films'),
  s3: sessio('A Contracorriente Films', false),
  s4: sessio('  a contracorriente films '),
  s5: sessio('BTeam Pictures'),
  s6: sessio('BTeam Pictures', false),
  s7: sessio('BTeam Pictures'),
  s8: sessio('bteam pictures', false),
  s9: sessio('Arlong Productions'),
  s10: sessio('Una altra'),
  s11: { titol: 'Sense publica', publicada: true },
  s12: { titol: 'Sense suport', publica: { titol: 'X' } },
};

// Firestore fals: col·leccions en memòria; `update` entén la notació de punt i el sentinella ESBORRA.
function firestoreFals({ distribuidores = DISTRIBUIDORES, sessions = SESSIONS, fallaUnCop = [] } = {}) {
  const falla = new Set(fallaUnCop);
  const cols = {
    distribuidores: new Map(Object.entries(structuredClone(distribuidores))),
    sessions: new Map(Object.entries(structuredClone(sessions))),
  };
  const escriptures = [];
  const aplica = (doc, camps) => {
    for (const [cami, valor] of Object.entries(camps)) {
      const parts = cami.split('.');
      const pare = parts.slice(0, -1).reduce((o, p) => (o[p] ??= {}), doc);
      if (valor === ESBORRA) delete pare[parts.at(-1)];
      else pare[parts.at(-1)] = valor;
    }
  };
  const ref = (col, id) => ({
    id,
    get: async () => ({ exists: cols[col].has(id), data: () => cols[col].get(id) }),
    update: async (camps) => {
      if (!cols[col].has(id)) throw new Error(`no existeix ${col}/${id}`);
      if (falla.delete(`${col}/${id}`)) throw new Error(`error simulat a ${col}/${id}`);
      escriptures.push([col, id, camps]);
      aplica(cols[col].get(id), camps);
    },
  });
  return {
    cols, escriptures,
    collection: (col) => ({
      get: async () => ({ docs: [...cols[col]].map(([id, d]) => ({ id, data: () => d, ref: ref(col, id) })) }),
      doc: (id) => ref(col, id),
    }),
  };
}
function bucketFals() {
  const pujades = [];
  const esborrats = [];
  return {
    name: BUCKET,
    pujades,
    esborrats,
    file: (cami) => ({
      save: async (contingut, opcions) => { pujades.push({ cami, contingut: contingut.toString(), opcions }); },
      delete: async () => { esborrats.push(cami); },
    }),
  };
}
const base = (extra = {}) => ({
  distribuidorsJson: JSON_DISTRIBUIDORS, dirLogos: dirLogos(), dirBackups: backups(), avui: AVUI,
  instant: 1000, log: () => {}, esborraCamp: () => ESBORRA, ...extra,
});
const fitxerRegistre = (dir) => join(dir, '2026-10-24', 'distribuidores-migracio.json');

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

describe('noms', () => {
  it('el mapa té els tres noms', () => expect(MAPA_NOMS).toEqual({
    'A Contracorriente Films': 'A Contracorriente',
    'BTeam Pictures': 'B-team',
    'Arlong Productions': 'Arlong Productions',
  }));
  it('normalitza sense majúscules ni espais als extrems', () => expect(normalitza('  BTeam Pictures ')).toBe('bteam pictures'));
  it('nomCanonic troba el nom antic sense distingir majúscules ni espais', () => {
    expect(nomCanonic(' a contracorriente FILMS ')).toBe('A Contracorriente');
    expect(nomCanonic('BTeam Pictures')).toBe('B-team');
    expect(nomCanonic('Una altra')).toBeNull();
    expect(nomCanonic(undefined)).toBeNull();
  });
});

describe('format de camí i URL del logo', () => {
  it('és el mateix que el de l\'admin', () => {
    for (const [nom, ext, type] of [['A Contracorriente', 'png', 'image/png'], ['B-team', 'jpg', 'image/jpeg'], ['Àrlong Prod.', 'webp', 'image/webp']]) {
      expect(camiLogo(nom, `logo.${ext.toUpperCase()}`, 123)).toBe(camiLogoDistribuidora(nom, { type }, 123));
    }
    expect(camiLogo('B-team', 'bteam-pictures.png', 5)).toBe('web/distribuidores/b-team-5.png');
    expect(urlLogo(BUCKET, 'web/distribuidores/a b-1.png')).toBe(urlStorage(BUCKET, 'web/distribuidores/a b-1.png'));
  });
});

describe('pla', () => {
  const docs = (obj) => Object.entries(obj).map(([id, d]) => ({ id, ...d }));
  it('distribuïdores: camps que falten, existents i inexistents', () => {
    const { distribuidores } = pla(JSON_DISTRIBUIDORS, docs({ ...DISTRIBUIDORES, d3: { nom: 'Arlong Productions', logo: 'L' } }), []);
    expect(distribuidores).toEqual([
      { nomAntic: 'A Contracorriente Films', nom: 'A Contracorriente', id: 'd1', logo: '/images/distribuidors/a-contracorriente.png', url: 'https://acontracorrientefilms.com/', camps: ['logo', 'urlPublica'] },
      { nomAntic: 'Arlong Productions', nom: 'Arlong Productions', id: 'd3', logo: '/images/distribuidors/arlong-productions.png', url: 'https://www.arlongproductions.com/', camps: ['urlPublica'] },
      { nomAntic: 'BTeam Pictures', nom: 'B-team', id: 'd2', logo: '/images/distribuidors/bteam-pictures.png', url: 'https://bteampictures.es/', camps: ['logo', 'urlPublica'] },
    ]);
    expect(pla(JSON_DISTRIBUIDORS, [], []).distribuidores.map((d) => d.id)).toEqual([null, null, null]);
    expect(pla({ Desconeguda: { logo: '/x.png' } }, [], []).distribuidores).toEqual([
      { nomAntic: 'Desconeguda', nom: null, id: null, logo: '/x.png', camps: [] },
    ]);
  });
  it('sessions: les dels noms antics i les que ja tenen el nom exacte del catàleg, si encara no tenen id', () => {
    const { sessions, sessionsSaltades, avisos } = pla(JSON_DISTRIBUIDORS, docs(DISTRIBUIDORES), docs(SESSIONS));
    expect(sessions.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10']);
    expect(sessionsSaltades).toEqual([]);
    expect(avisos).toEqual([]);
    const buit = pla(JSON_DISTRIBUIDORS, [], docs(SESSIONS));
    expect(buit.sessions).toEqual([]);
    expect(buit.sessionsSaltades.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9']);
    expect(buit.sessionsSaltades[8]).toEqual({ id: 's9', titol: 'T Arlong Productions', abans: 'Arlong Productions', canonic: 'Arlong Productions' });
    expect(sessions[0]).toEqual({ id: 's1', titol: 'T A Contracorriente Films', abans: 'A Contracorriente Films', despres: 'A Contracorriente', distribuidoraId: 'd1', publicada: true });
    expect(sessions[7]).toMatchObject({ abans: 'bteam pictures', despres: 'B-team', distribuidoraId: 'd2', publicada: false });
    expect(sessions[8]).toMatchObject({ abans: 'Arlong Productions', despres: 'Arlong Productions', distribuidoraId: 'd3' });
    expect(sessions[9]).toMatchObject({ abans: 'Una altra', despres: 'Una altra', distribuidoraId: 'd4' });
  });
  it('sessions: les que ja tenen id i els valors desconeguts no es toquen', () => {
    const ambId = (suport, id) => ({ titol: 'T', publicada: true, publica: { suportDistribucio: suport, suportDistribucioId: id } });
    const { sessions, sessionsSaltades } = pla(JSON_DISTRIBUIDORS, docs(DISTRIBUIDORES), docs({
      a: ambId('BTeam Pictures', 'd2'),
      b: ambId('A Contracorriente', 'un-altre'),
      c: sessio('Desconeguda'),
      d: sessio('una altra'),
      e: ambId('BTeam Pictures', ''),
      f: sessio(42),
    }));
    expect(sessions.map((x) => x.id)).toEqual(['e']);
    expect(sessions[0]).toMatchObject({ abans: 'BTeam Pictures', despres: 'B-team', distribuidoraId: 'd2', idAbans: '' });
    expect(sessionsSaltades).toEqual([]);
  });
});

describe('comprovarCopia', () => {
  it('falla sense la còpia d\'avui', () => expect(() => comprovarCopia(backups(false), AVUI)).toThrow(/còpia de seguretat/));
  it('passa amb la còpia', () => expect(() => comprovarCopia(backups(), AVUI)).not.toThrow());
});

describe('migra', () => {
  it('informe: 0 pujades, 0 escriptures, sense registre; avisa del calendari', async () => {
    const db = firestoreFals();
    const bucket = bucketFals();
    const o = base();
    const linies = [];
    const res = await migra({ ...o, db, bucket, log: (l) => linies.push(l) });
    expect(res.pla.sessions).toHaveLength(10);
    expect(db.escriptures).toEqual([]);
    expect(bucket.pujades).toEqual([]);
    expect(existsSync(fitxerRegistre(o.dirBackups))).toBe(false);
    const text = linies.join('\n');
    expect(text).toMatch(/MODE INFORME/);
    expect(text).toContain('Sessions a canviar: 10 (8 de nom, 10 amb id nou)');
    expect(text).toContain('- s9 (T Arlong Productions) [publicada]: id → d3');
    expect(text).toContain('- s1 (T A Contracorriente Films) [publicada]: «A Contracorriente Films» → «A Contracorriente», id → d1');
    expect(text).toContain('7 sessions publicades: es dispararà la sincronització del calendari (no hauria de canviar cap esdeveniment, perquè el suport de distribució no hi surt)');
  });

  it('apply sense còpia d\'avui es nega i no toca res', async () => {
    const db = firestoreFals();
    const bucket = bucketFals();
    await expect(migra({ ...base({ dirBackups: backups(false) }), db, bucket, apply: true })).rejects.toThrow(/còpia/);
    expect(db.escriptures).toEqual([]);
    expect(bucket.pujades).toEqual([]);
  });

  it('apply: 3 logos, 3 update exactes de distribuïdores, un per sessió (nom i id) i valors anteriors anotats', async () => {
    const db = firestoreFals();
    const bucket = bucketFals();
    const o = base();
    await migra({ ...o, db, bucket, apply: true });
    const camins = ['web/distribuidores/a-contracorriente-1000.png', 'web/distribuidores/arlong-productions-1000.png', 'web/distribuidores/b-team-1000.png'];
    expect(bucket.pujades.map((p) => p.cami)).toEqual(camins);
    expect(bucket.pujades[0].contingut).toBe('bytes-a-contracorriente.png');
    expect(bucket.pujades[0].opcions.contentType).toBe('image/png');
    const dist = db.escriptures.filter(([c]) => c === 'distribuidores');
    expect(dist).toEqual([
      ['distribuidores', 'd1', { logo: url(camins[0]), urlPublica: 'https://acontracorrientefilms.com/' }],
      ['distribuidores', 'd3', { logo: url(camins[1]), urlPublica: 'https://www.arlongproductions.com/' }],
      ['distribuidores', 'd2', { logo: url(camins[2]), urlPublica: 'https://bteampictures.es/' }],
    ]);
    const ses = db.escriptures.filter(([c]) => c === 'sessions');
    expect(ses.map(([, id]) => id)).toEqual(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10']);
    for (const [, id, camps] of ses.slice(0, 8)) {
      const bteam = ['s5', 's6', 's7', 's8'].includes(id);
      expect(camps).toEqual({
        'publica.suportDistribucio': bteam ? 'B-team' : 'A Contracorriente',
        'publica.suportDistribucioId': bteam ? 'd2' : 'd1',
      });
    }
    expect(ses[8][2]).toEqual({ 'publica.suportDistribucioId': 'd3' });
    expect(ses[9][2]).toEqual({ 'publica.suportDistribucioId': 'd4' });
    expect(db.cols.sessions.get('s1').publica).toEqual({ suportDistribucio: 'A Contracorriente', suportDistribucioId: 'd1', titol: 'P' });
    expect(db.cols.sessions.get('s9').publica).toEqual({ suportDistribucio: 'Arlong Productions', suportDistribucioId: 'd3', titol: 'P' });
    expect(db.cols.sessions.get('s10').publica).toEqual({ suportDistribucio: 'Una altra', suportDistribucioId: 'd4', titol: 'P' });
    expect(db.cols.sessions.get('s11')).toEqual(SESSIONS.s11);
    expect(db.cols.sessions.get('s12')).toEqual(SESSIONS.s12);
    expect(db.cols.distribuidores.get('d1')).toEqual({ nom: 'A Contracorriente', web: 'acontracorriente.es', logo: url(camins[0]), urlPublica: 'https://acontracorrientefilms.com/' });

    const registre = JSON.parse(readFileSync(fitxerRegistre(o.dirBackups), 'utf8'));
    expect(registre.canvis).toHaveLength(6 + 8 + 10);
    expect(registre.canvis[0]).toEqual({ coleccio: 'distribuidores', id: 'd1', camp: 'logo', abans: null, absent: true, despres: url(camins[0]), cami: camins[0] });
    expect(registre.canvis[1]).toEqual({ coleccio: 'distribuidores', id: 'd1', camp: 'urlPublica', abans: null, absent: true, despres: 'https://acontracorrientefilms.com/' });
    expect(registre.canvis.filter((c) => c.id === 's4')).toEqual([
      { coleccio: 'sessions', id: 's4', camp: 'publica.suportDistribucio', abans: '  a contracorriente films ', despres: 'A Contracorriente' },
      { coleccio: 'sessions', id: 's4', camp: 'publica.suportDistribucioId', abans: null, absent: true, despres: 'd1' },
    ]);
    expect(registre.canvis.filter((c) => c.id === 's9')).toEqual([
      { coleccio: 'sessions', id: 's9', camp: 'publica.suportDistribucioId', abans: null, absent: true, despres: 'd3' },
    ]);
  });

  it('apply: una sessió amb id buit rep l\'id i el registre en conserva el valor buit', async () => {
    const db = firestoreFals({ sessions: { s1: { titol: 'T', publica: { suportDistribucio: 'BTeam Pictures', suportDistribucioId: '' } } } });
    const o = base();
    await migra({ ...o, db, bucket: bucketFals(), apply: true });
    expect(db.cols.sessions.get('s1').publica).toEqual({ suportDistribucio: 'B-team', suportDistribucioId: 'd2' });
    const registre = JSON.parse(readFileSync(fitxerRegistre(o.dirBackups), 'utf8'));
    expect(registre.canvis.find((c) => c.camp === 'publica.suportDistribucioId')).toEqual({ coleccio: 'sessions', id: 's1', camp: 'publica.suportDistribucioId', abans: '', despres: 'd2' });
  });

  it('apply: les sessions que ja tenen id i els valors desconeguts no reben cap update', async () => {
    const db = firestoreFals({
      sessions: {
        a: { titol: 'A', publicada: true, publica: { suportDistribucio: 'BTeam Pictures', suportDistribucioId: 'd2' } },
        b: sessio('Desconeguda'),
        c: sessio('BTeam Pictures'),
      },
    });
    await migra({ ...base(), db, bucket: bucketFals(), apply: true });
    expect(db.escriptures.filter(([c]) => c === 'sessions').map(([, id]) => id)).toEqual(['c']);
    expect(db.cols.sessions.get('a').publica).toEqual({ suportDistribucio: 'BTeam Pictures', suportDistribucioId: 'd2' });
    expect(db.cols.sessions.get('b').publica).toEqual({ suportDistribucio: 'Desconeguda', titol: 'P' });
  });

  it('segona execució: 0 canvis', async () => {
    const db = firestoreFals();
    const bucket = bucketFals();
    const o = base();
    await migra({ ...o, db, bucket, apply: true });
    expect(db.escriptures).toHaveLength(13);
    const linies = [];
    const res = await migra({ ...o, db, bucket, apply: true, instant: 2000, log: (l) => linies.push(l) });
    expect(db.escriptures).toHaveLength(13);
    expect(bucket.pujades).toHaveLength(3);
    expect(res.pla.sessions).toEqual([]);
    expect(res.pla.distribuidores.every((d) => d.camps.length === 0)).toBe(true);
    expect(res.pla.sessionsSaltades).toEqual([]);
    expect(JSON.parse(readFileSync(fitxerRegistre(o.dirBackups), 'utf8')).canvis).toHaveLength(24);
    expect(linies.join('\n')).toContain('Sessions a canviar: 0 (0 de nom, 0 amb id nou)');
    expect(linies.join('\n')).toContain('0 sessions publicades');
  });

  it('una distribuïdora que ja té logo no se sobreescriu ni s\'hi puja res', async () => {
    const db = firestoreFals({ distribuidores: { ...DISTRIBUIDORES, d1: { nom: 'A Contracorriente', logo: 'VELL' } } });
    const bucket = bucketFals();
    await migra({ ...base(), db, bucket, apply: true });
    expect(bucket.pujades.map((p) => p.cami)).not.toContain('web/distribuidores/a-contracorriente-1000.png');
    expect(db.escriptures.find(([c, id]) => c === 'distribuidores' && id === 'd1')[2]).toEqual({ urlPublica: 'https://acontracorrientefilms.com/' });
    expect(db.cols.distribuidores.get('d1').logo).toBe('VELL');
  });

  it('una distribuïdora que ho té tot no rep cap update', async () => {
    const db = firestoreFals({ distribuidores: { ...DISTRIBUIDORES, d1: { nom: 'A Contracorriente', logo: 'L', urlPublica: 'U' } } });
    await migra({ ...base(), db, bucket: bucketFals(), apply: true });
    expect(db.escriptures.some(([c, id]) => c === 'distribuidores' && id === 'd1')).toBe(false);
  });

  it('una distribuïdora inexistent s\'informa i se salta (no es crea) i les seves sessions no es toquen', async () => {
    const { d2, ...sensBteam } = DISTRIBUIDORES;
    const db = firestoreFals({ distribuidores: sensBteam });
    const bucket = bucketFals();
    const linies = [];
    await migra({ ...base(), db, bucket, apply: true, log: (l) => linies.push(l) });
    expect(d2).toBeDefined();
    expect(bucket.pujades).toHaveLength(2);
    expect(db.escriptures.filter(([c]) => c === 'distribuidores').map(([, id]) => id)).toEqual(['d1', 'd3']);
    expect(db.escriptures.filter(([c]) => c === 'sessions').map(([, id]) => id)).toEqual(['s1', 's2', 's3', 's4', 's9', 's10']);
    expect(db.cols.sessions.get('s5').publica).toEqual(SESSIONS.s5.publica);
    expect(db.cols.distribuidores.size).toBe(3);
    const text = linies.join('\n');
    expect(text).toContain('B-team: no existeix al catàleg');
    expect(text).toContain('saltada: s5 (T BTeam Pictures): «BTeam Pictures» no es canvia perquè «B-team» no existeix al catàleg');
  });

  it('les sessions passen al nom exacte del catàleg i s\'avisa si no coincideix amb MAPA_NOMS', async () => {
    const db = firestoreFals({ distribuidores: { ...DISTRIBUIDORES, d2: { nom: 'B-Team' } } });
    const bucket = bucketFals();
    const linies = [];
    await migra({ ...base(), db, bucket, apply: true, log: (l) => linies.push(l) });
    expect(db.cols.sessions.get('s5').publica).toMatchObject({ suportDistribucio: 'B-Team', suportDistribucioId: 'd2' });
    expect(db.cols.sessions.get('s8').publica).toMatchObject({ suportDistribucio: 'B-Team', suportDistribucioId: 'd2' });
    expect(bucket.pujades.map((p) => p.cami)).toContain('web/distribuidores/b-team-1000.png');
    expect(linies.join('\n')).toContain('AVÍS: «B-team» de MAPA_NOMS és «B-Team» al catàleg (d2)');
    const res = await migra({ ...base(), db, bucket: bucketFals(), log: () => {} });
    expect(res.pla.sessions).toEqual([]);
  });

  it('avisa dels noms duplicats al catàleg', async () => {
    const db = firestoreFals({ distribuidores: { ...DISTRIBUIDORES, d5: { nom: ' a contracorriente ' } } });
    const linies = [];
    await migra({ ...base(), db, bucket: bucketFals(), log: (l) => linies.push(l) });
    expect(linies.join('\n')).toContain("AVÍS: noms duplicats al catàleg (sense majúscules ni espais): «A Contracorriente» (d1), « a contracorriente » (d5); s'usa d1");
  });

  it('informe: avisa del logo que falta o de tipus no admès, sense escriure res', async () => {
    const db = firestoreFals();
    const bucket = bucketFals();
    const linies = [];
    const json = { ...JSON_DISTRIBUIDORS, 'Arlong Productions': { logo: '/images/distribuidors/arlong.svg', url: 'https://a/' } };
    await migra({
      ...base({ distribuidorsJson: json, dirLogos: dirLogos(['a-contracorriente.png', 'arlong.svg']) }), db, bucket, log: (l) => linies.push(l),
    });
    const text = linies.join('\n');
    expect(text).toMatch(/Falta el logo de B-team .*bteam-pictures\.png/);
    expect(text).toMatch(/tipus de logo no admès: .*arlong\.svg/);
    expect(text).not.toMatch(/Falta el logo de A Contracorriente/);
    expect(db.escriptures).toEqual([]);
    expect(bucket.pujades).toEqual([]);
  });

  it('logo absent al disc: només s\'afegeix urlPublica i ho diu', async () => {
    const db = firestoreFals();
    const bucket = bucketFals();
    const linies = [];
    await migra({ ...base({ dirLogos: dirLogos(LOGOS.filter((n) => n !== 'bteam-pictures.png')) }), db, bucket, apply: true, log: (l) => linies.push(l) });
    expect(db.escriptures.find(([c, id]) => c === 'distribuidores' && id === 'd2')[2]).toEqual({ urlPublica: 'https://bteampictures.es/' });
    expect(bucket.pujades).toHaveLength(2);
    expect(linies.join('\n')).toMatch(/Falta el logo.*bteam-pictures\.png/);
  });
});

describe('desfer', () => {
  // `desfer` no rep cap bucket (no té accés a Storage), així que no cal provar que no hi esborra res.
  const desferTot = (o, db) => desfer({
    fitxer: fitxerRegistre(o.dirBackups), db, dirBackups: o.dirBackups, avui: AVUI, esborraCamp: () => ESBORRA, log: () => {},
  });

  it('restaura els valors anteriors', async () => {
    const db = firestoreFals();
    const o = base();
    await migra({ ...o, db, bucket: bucketFals(), apply: true });
    const res = await desferTot(o, db);
    expect(res).toEqual({ restablerts: 24, saltats: 0 });
    expect(db.cols.distribuidores.get('d1')).toEqual(DISTRIBUIDORES.d1);
    expect(db.cols.distribuidores.get('d2')).toEqual(DISTRIBUIDORES.d2);
    expect(Object.fromEntries(db.cols.sessions)).toEqual(SESSIONS);
    expect(db.cols.sessions.get('s1').publica).not.toHaveProperty('suportDistribucioId');
  });

  it('cada sessió es restableix amb un sol update (nom i id)', async () => {
    const db = firestoreFals();
    const o = base();
    await migra({ ...o, db, bucket: bucketFals(), apply: true });
    const fins = db.escriptures.length;
    await desferTot(o, db);
    const ses = db.escriptures.slice(fins).filter(([c]) => c === 'sessions');
    expect(ses.map(([, id]) => id)).toEqual(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10']);
    expect(ses[0][2]).toEqual({ 'publica.suportDistribucio': 'A Contracorriente Films', 'publica.suportDistribucioId': ESBORRA });
    expect(ses[8][2]).toEqual({ 'publica.suportDistribucioId': ESBORRA });
  });

  it('execució parcial (pujada i registre fets però update fallit) reintentada: desfer ho restaura tot', async () => {
    const db = firestoreFals({ fallaUnCop: ['distribuidores/d1'] });
    const bucket = bucketFals();
    const o = base();
    await expect(migra({ ...o, db, bucket, apply: true })).rejects.toThrow(/error simulat/);
    expect(db.cols.distribuidores.get('d1').logo).toBeUndefined();
    await migra({ ...o, db, bucket, apply: true, instant: 2000 });
    const registre = JSON.parse(readFileSync(fitxerRegistre(o.dirBackups), 'utf8'));
    const logoD1 = registre.canvis.filter((c) => c.id === 'd1' && c.camp === 'logo');
    expect(logoD1).toEqual([{
      coleccio: 'distribuidores', id: 'd1', camp: 'logo', abans: null, absent: true,
      despres: url('web/distribuidores/a-contracorriente-2000.png'), cami: 'web/distribuidores/a-contracorriente-2000.png',
    }]);
    expect(await desferTot(o, db)).toEqual({ restablerts: 24, saltats: 0 });
    expect(Object.fromEntries(db.cols.distribuidores)).toEqual(DISTRIBUIDORES);
    expect(Object.fromEntries(db.cols.sessions)).toEqual(SESSIONS);
  });

  it('apply → desfer → apply: el segon desfer també ho restaura tot', async () => {
    const db = firestoreFals();
    const o = base();
    await migra({ ...o, db, bucket: bucketFals(), apply: true });
    await desferTot(o, db);
    await migra({ ...o, db, bucket: bucketFals(), apply: true, instant: 2000 });
    expect(db.cols.distribuidores.get('d1').logo).toBe(url('web/distribuidores/a-contracorriente-2000.png'));
    const registre = JSON.parse(readFileSync(fitxerRegistre(o.dirBackups), 'utf8'));
    expect(registre.canvis).toHaveLength(24);
    expect(registre.canvis.filter((c) => c.id === 's1')).toEqual([
      { coleccio: 'sessions', id: 's1', camp: 'publica.suportDistribucio', abans: 'A Contracorriente Films', despres: 'A Contracorriente' },
      { coleccio: 'sessions', id: 's1', camp: 'publica.suportDistribucioId', abans: null, absent: true, despres: 'd1' },
    ]);
    expect(await desferTot(o, db)).toEqual({ restablerts: 24, saltats: 0 });
    expect(Object.fromEntries(db.cols.distribuidores)).toEqual(DISTRIBUIDORES);
    expect(Object.fromEntries(db.cols.sessions)).toEqual(SESSIONS);
  });

  it('salta els documents inexistents o canviats després de la migració', async () => {
    const db = firestoreFals();
    const o = base();
    await migra({ ...o, db, bucket: bucketFals(), apply: true });
    db.cols.sessions.get('s1').publica.suportDistribucio = 'Canviat a mà';
    db.cols.sessions.delete('s2');
    const linies = [];
    const res = await desfer({
      fitxer: fitxerRegistre(o.dirBackups), db, dirBackups: o.dirBackups, avui: AVUI, esborraCamp: () => ESBORRA, log: (l) => linies.push(l),
    });
    expect(res).toEqual({ restablerts: 21, saltats: 3 });
    expect(db.cols.sessions.get('s1').publica).toEqual({ suportDistribucio: 'Canviat a mà', titol: 'P' });
    const text = linies.join('\n');
    expect(text).toContain('saltat: sessions/s2 no existeix');
    expect(text).toContain('saltat: sessions/s1 publica.suportDistribucio ha canviat');
  });

  it('sense còpia d\'avui no escriu res', async () => {
    const db = firestoreFals();
    const dir = backups(false);
    const fitxer = join(dir, 'f.json');
    writeFileSync(fitxer, JSON.stringify({ canvis: [{ coleccio: 'sessions', id: 's1', camp: 'titol', abans: 'x', despres: 'T A Contracorriente Films' }] }));
    await expect(desfer({ fitxer, db, dirBackups: dir, avui: AVUI, esborraCamp: () => ESBORRA, log: () => {} })).rejects.toThrow(/còpia/);
    expect(db.escriptures).toEqual([]);
  });
});
