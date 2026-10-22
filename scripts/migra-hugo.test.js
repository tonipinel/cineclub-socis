// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  llegirSessionsHugo, llegirPaginesHugo, emparellar, pla, executar, urlStorage, llegirOpcions, BUCKET,
} from './migra-hugo.mjs';

const CONTINGUT = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/migra-hugo/content');
const WEB = 'https://cineclubrodadebera.cat';
const AVUI = new Date('2026-10-21T10:00:00Z');

// Firestore fals en memòria: desa de veritat el que s'hi escriu, perquè una segona
// execució vegi l'estat resultant de la primera. `set` no està permès.
function firestoreFals(inicial = {}) {
  const dades = structuredClone(inicial);
  const escriptures = [];
  let auto = 0;
  const assignar = (obj, cami, valor) => {
    const parts = cami.split('.');
    let actual = obj;
    for (const part of parts.slice(0, -1)) {
      if (typeof actual[part] !== 'object' || actual[part] === null) actual[part] = {};
      actual = actual[part];
    }
    actual[parts.at(-1)] = structuredClone(valor);
  };
  return {
    dades,
    escriptures,
    collection(nom) {
      dades[nom] ??= {};
      const col = dades[nom];
      return {
        get: async () => ({
          docs: Object.entries(col).map(([id, d]) => ({ id, data: () => structuredClone(d) })),
        }),
        doc(id = `auto-${++auto}`) {
          return {
            id,
            create: async (d) => {
              if (col[id]) throw new Error('ALREADY_EXISTS');
              escriptures.push({ op: 'create', nom, id });
              col[id] = structuredClone(d);
            },
            update: async (canvis) => {
              if (!col[id]) throw new Error('NOT_FOUND');
              escriptures.push({ op: 'update', nom, id, canvis });
              for (const [cami, valor] of Object.entries(canvis)) assignar(col[id], cami, valor);
            },
            set: async () => { throw new Error('set no permès a la migració'); },
          };
        },
      };
    },
  };
}

function bucketFals(existents = []) {
  const fitxers = new Map(existents.map((nom) => [nom, { antic: true }]));
  return {
    name: BUCKET,
    fitxers,
    getFiles: async ({ prefix }) => [[...fitxers.keys()].filter((n) => n.startsWith(prefix)).map((name) => ({ name }))],
    file: (name) => ({
      exists: async () => [fitxers.has(name)],
      save: async (contingut, opcions) => {
        if (fitxers.has(name)) throw new Error('PRECONDITION_FAILED');
        fitxers.set(name, { contingut, opcions });
      },
    }),
  };
}

function dirBackupsAmbManifest(data = '2026-10-21') {
  const dir = mkdtempSync(join(tmpdir(), 'backups-'));
  mkdirSync(join(dir, data));
  writeFileSync(join(dir, data, 'manifest.json'), '{"sessions": 2}');
  return dir;
}

const hugoPerSlug = (slug) => llegirSessionsHugo(CONTINGUT).find((h) => h.slug === slug);
const fotoUrl = (slug, fitxer) => urlStorage(BUCKET, `web/sessions/${slug}/${fitxer}`);

describe('llegirSessionsHugo', () => {
  it('llegeix totes les sessions amb slug, any, data i hora (Europe/Madrid)', () => {
    const hugo = llegirSessionsHugo(CONTINGUT);
    expect(hugo.map((h) => h.slug).sort()).toEqual(['20000-especies-de-abejas', 'carretera-a-gusen', 'pig', 'una-altra']);
    const abelles = hugoPerSlug('20000-especies-de-abejas');
    expect(abelles).toMatchObject({ any: '2026', data: '2026-10-08', hora: '19:00', titol: '20.000 especies de abejas' });
    expect(hugoPerSlug('carretera-a-gusen').hora).toBe('18:30');
  });

  it('sense slug al front matter, fa servir el nom de la carpeta, i llegeix els aliases', () => {
    const pig = hugoPerSlug('pig');
    expect(pig.aliases).toEqual(['/programacio/25-de-juny-pig/']);
    expect(pig.publica.aliases).toEqual(['/programacio/25-de-juny-pig/']);
  });

  it('el front matter de "20.000 especies de abejas" es mapeja a `publica` amb tots els camps', () => {
    const { publica } = hugoPerSlug('20000-especies-de-abejas');
    expect(Object.keys(publica).sort()).toEqual([
      'aliases', 'any', 'cartell', 'collabora', 'cos', 'directors', 'durada', 'edatMinimaRecomanada',
      'fotografia', 'galeria', 'generes', 'guio', 'idioma', 'interprets', 'muntatge', 'organitza', 'pais',
      'participa', 'premisDestacats', 'preu', 'produccio', 'queInclou', 'seccio', 'sinopsiCartell',
      'suportDistribucio', 'titol', 'titolOriginal', 'trailerYoutubeId', 'versioTipus',
    ]);
    expect(publica).toMatchObject({
      titol: '20.000 especies de abejas',
      titolOriginal: '20.000 especies de abejas',
      trailerYoutubeId: '22EdsxVNJiQ',
      directors: ['Estibaliz Urresola Solaguren'],
      guio: 'Estibaliz Urresola Solaguren',
      pais: 'Espanya',
      any: 2023,
      durada: 125,
      idioma: 'Castellà, basc i francès',
      generes: ['Drama'],
      fotografia: 'Gina Ferrer García',
      muntatge: 'Raúl Barreras',
      produccio: 'Gariza Films, Inicia Films',
      interprets: ['Sofía Otero', 'Patricia López Arnaiz', 'Ane Gabarain', 'Itziar Lazkano', 'Martxelo Rubio'],
      versioTipus: 'vose',
      preu: 5,
      edatMinimaRecomanada: 7,
      suportDistribucio: 'BTeam Pictures',
      seccio: 'cartellera',
      organitza: 'cineclub',
      participa: [],
      collabora: [],
      aliases: [],
      cartell: fotoUrl('20000-especies-de-abejas', 'poster.jpg'),
      galeria: [fotoUrl('20000-especies-de-abejas', 'gallery-1.jpg'), fotoUrl('20000-especies-de-abejas', 'gallery-2.jpg')],
    });
    expect(publica.sinopsiCartell).toMatch(/^Aitor viu amb la família a Baiona\./);
    expect(publica.premisDestacats).toMatch(/^Os de Plata/);
    expect(publica.queInclou).toMatch(/col·loqui moderat posterior\.$/);
    expect(publica.cos).toMatch(/^## Sinopsi\n/);
    expect(publica.cos).toContain("## Per què l'hem programat?");
  });

  it('les llistes absents són sempre `[]`, mai null', () => {
    const { publica } = hugoPerSlug('carretera-a-gusen');
    for (const camp of ['directors', 'interprets', 'generes', 'participa', 'collabora', 'aliases', 'galeria']) {
      expect(publica[camp]).toEqual(camp === 'participa' ? ['Cineclub Roda de Berà'] : []);
    }
    expect(publica).not.toHaveProperty('cartell');
  });

  it('la URL de Storage té la forma de firebasestorage amb el camí codificat', () => {
    expect(urlStorage('b.app', 'web/sessions/pig/poster.jpg'))
      .toBe('https://firebasestorage.googleapis.com/v0/b/b.app/o/web%2Fsessions%2Fpig%2Fposter.jpg?alt=media');
  });
});

describe('llegirPaginesHugo', () => {
  it('llegeix les cinc pàgines amb el seu slug, tipus i imatges', () => {
    const pagines = llegirPaginesHugo(CONTINGUT);
    expect(pagines.map((p) => [p.doc.slug, p.doc.tipus])).toEqual([
      ['portada', 'portada'],
      ['preguntes-frequents', 'faq'],
      ['privacitat', 'contingut'],
      ['fes-te-socia', 'socia'],
      ['programacio', 'contingut'],
    ]);
    const portada = pagines[0];
    expect(portada.doc.titol).toBe('Cineclub Roda de Berà');
    expect(portada.doc.dades.date).toBe('2026-08-20');
    expect(portada.doc.cos).toBe('## Un nou espai de cinema');
    expect(portada.doc.imatges).toEqual({ 'ajuntament.png': urlStorage(BUCKET, 'web/pagines/ajuntament.png') });
    expect(pagines[3].doc.imatges).toEqual({ 'foto-public.jpg': urlStorage(BUCKET, 'web/pagines/foto-public.jpg') });
    expect(pagines[1].doc.imatges).toEqual({});
  });
});

describe('emparellar', () => {
  const hugo = () => llegirSessionsHugo(CONTINGUT);
  const abelles = {
    id: 'abelles1', titol: '20.000 especies de abejas', data: '2026-10-08',
    urlProgramacio: `${WEB}/programacio/2026/20000-especies-de-abejas/`,
  };

  it('empareja per urlProgramacio', () => {
    const { parelles } = emparellar(hugo(), [abelles], {});
    expect(parelles).toContainEqual(expect.objectContaining({
      hugo: expect.objectContaining({ slug: '20000-especies-de-abejas' }),
      sessio: expect.objectContaining({ id: 'abelles1' }),
      motiu: 'urlProgramacio',
    }));
  });

  it('empareja per un alias del front matter', () => {
    const porc = { id: 'porc1', titol: 'Porc', data: '2026-06-26', urlProgramacio: `${WEB}/programacio/25-de-juny-pig/` };
    const { parelles } = emparellar(hugo(), [porc], {});
    expect(parelles.find((p) => p.hugo.slug === 'pig')).toMatchObject({ sessio: { id: 'porc1' }, motiu: 'alias' });
  });

  it('empareja per data i títol normalitzat si no hi ha URL', () => {
    const { parelles } = emparellar(hugo(), [{ id: 'pig1', titol: 'PIG', data: '2026-06-25' }], {});
    expect(parelles.find((p) => p.hugo.slug === 'pig')).toMatchObject({ sessio: { id: 'pig1' }, motiu: 'data i títol' });
  });

  it('marca dubtosa si dues sessions comparteixen la data', () => {
    const sessions = [{ id: 'x1', titol: 'Pig', data: '2026-06-25' }, { id: 'x2', titol: 'Una altra', data: '2026-06-25' }];
    const { parelles, dubtoses, noves } = emparellar(hugo(), sessions, {});
    const dubtosa = dubtoses.find((d) => d.hugo.slug === 'pig');
    expect(dubtosa.candidats.map((c) => c.id).sort()).toEqual(['x1', 'x2']);
    expect(parelles.some((p) => p.hugo.slug === 'pig')).toBe(false);
    expect(noves.some((h) => h.slug === 'pig')).toBe(false);
  });

  it('marca dubtosa si l\'únic candidat ho és només per data', () => {
    const { dubtoses } = emparellar(hugo(), [{ id: 'x1', titol: 'Una altra', data: '2026-06-25' }], {});
    expect(dubtoses.find((d) => d.hugo.slug === 'pig')).toMatchObject({ candidats: [{ id: 'x1' }] });
  });

  it('marca dubtosa si el títol coincideix però la data no', () => {
    const { dubtoses } = emparellar(hugo(), [{ id: 'x1', titol: 'Pig', data: '2026-07-01' }], {});
    expect(dubtoses.find((d) => d.hugo.slug === 'pig')).toMatchObject({ candidats: [{ id: 'x1' }] });
  });

  it('marca dubtoses les dues si dues sessions de Hugo apunten a la mateixa sessió', () => {
    const comuna = { id: 'c1', titol: 'X', data: '2026-01-01', urlProgramacio: `${WEB}/programacio/2026/pig/ i ${WEB}/programacio/2026/carretera-a-gusen/` };
    const { dubtoses, parelles } = emparellar(hugo(), [comuna], {});
    expect(dubtoses.map((d) => d.hugo.slug).sort()).toEqual(['carretera-a-gusen', 'pig']);
    expect(parelles).toEqual([]);
  });

  it('una sessió sense parella va a noves', () => {
    const { noves, parelles, dubtoses } = emparellar(hugo(), [abelles], {});
    expect(noves.map((h) => h.slug).sort()).toEqual(['carretera-a-gusen', 'pig', 'una-altra']);
    expect(parelles).toHaveLength(1);
    expect(dubtoses).toEqual([]);
  });

  it('el mapa manual té prioritat: un id empareja i "nova" la crea', () => {
    const sessions = [{ id: 'x1', titol: 'Pig', data: '2026-06-25' }, { id: 'x2', titol: 'Una altra', data: '2026-06-25' }];
    const { parelles, noves } = emparellar(hugo(), sessions, { pig: 'x2', 'carretera-a-gusen': 'nova' });
    expect(parelles.find((p) => p.hugo.slug === 'pig')).toMatchObject({ sessio: { id: 'x2' }, motiu: 'mapa' });
    expect(noves.map((h) => h.slug)).toContain('carretera-a-gusen');
  });

  it('un id del mapa que no existeix és dubtosa', () => {
    const { dubtoses } = emparellar(hugo(), [], { pig: 'no-hi-es' });
    expect(dubtoses.map((d) => d.hugo.slug)).toEqual(['pig']);
  });

  it('una sessió ja migrada (mateix slug i any) s\'empareja encara que el mapa digui "nova"', () => {
    const migrada = { id: 'm1', titol: 'Carretera a Gusen', data: '2026-05-09', slug: 'carretera-a-gusen', creadaPerMigracio: true };
    const { parelles, noves } = emparellar(hugo(), [migrada], { 'carretera-a-gusen': 'nova' });
    expect(parelles.find((p) => p.hugo.slug === 'carretera-a-gusen')).toMatchObject({ sessio: { id: 'm1' }, motiu: 'ja migrada' });
    expect(noves.some((h) => h.slug === 'carretera-a-gusen')).toBe(false);
  });
});

describe('pla', () => {
  it('no planeja pujar imatges que ja són a Storage ni crear pàgines que ja existeixen', () => {
    const hugo = llegirSessionsHugo(CONTINGUT);
    const pagines = llegirPaginesHugo(CONTINGUT);
    const emparellament = emparellar(hugo, [], {});
    const accions = pla({
      emparellament,
      pagines,
      paginesExistents: new Set(['privacitat']),
      fitxersExistents: new Set(['web/sessions/pig/poster.jpg', 'web/pagines/ajuntament.png']),
    });
    const pujades = accions.filter((a) => a.tipus === 'pujar imatge').map((a) => a.desti).sort();
    expect(pujades).toEqual([
      'web/pagines/foto-public.jpg',
      'web/sessions/20000-especies-de-abejas/gallery-1.jpg',
      'web/sessions/20000-especies-de-abejas/gallery-2.jpg',
      'web/sessions/20000-especies-de-abejas/poster.jpg',
    ]);
    expect(accions.filter((a) => a.tipus === 'crear pagina').map((a) => a.slug))
      .toEqual(['portada', 'preguntes-frequents', 'fes-te-socia', 'programacio']);
    expect(accions.filter((a) => a.tipus === 'crear sessio')).toHaveLength(4);
  });

  it('no planeja res per a una sessió que ja té slug, publicada i publica iguals', () => {
    const [h] = llegirSessionsHugo(CONTINGUT).filter((s) => s.slug === 'pig');
    const sessio = { id: 'p1', titol: 'Pig', data: '2026-06-25', urlProgramacio: 'x', slug: 'pig', publicada: true, publica: h.publica };
    const accions = pla({
      emparellament: { parelles: [{ hugo: h, sessio, motiu: 'mapa' }], noves: [], dubtoses: [] },
      pagines: [],
      paginesExistents: new Set(),
      fitxersExistents: new Set(['web/sessions/pig/poster.jpg']),
    });
    expect(accions).toEqual([]);
  });
});

describe('executar', () => {
  const sessionsInicials = () => ({
    sessions: {
      abelles1: {
        titol: '20.000 especies de abejas', data: '2026-10-08', hora: '19:00', activa: true,
        urlProgramacio: `${WEB}/programacio/2026/20000-especies-de-abejas/`,
        imatgeUrl: `${WEB}/programacio/2026/20000-especies-de-abejas/poster.jpg`,
        preuEntrada: 5, lotActiu: 'lot1', publica: { notaManual: 'no es toca' },
      },
      porc1: { titol: 'Porc', data: '2026-06-25', hora: '19:00', activa: false, urlProgramacio: '' , preuEntrada: 5 },
    },
  });
  const mapa = { pig: 'porc1' };

  it('--apply es nega si no hi ha la còpia de seguretat d\'avui, sense llegir ni escriure res', async () => {
    const db = firestoreFals(sessionsInicials());
    const bucket = bucketFals();
    const dirBackups = dirBackupsAmbManifest('2026-10-20');
    await expect(executar({ apply: true, db, bucket, dirContingut: CONTINGUT, mapa, dirBackups, avui: AVUI, log: () => {} }))
      .rejects.toThrow(/No hi ha cap còpia de seguretat d'avui .*2026-10-21.*manifest\.json/);
    expect(db.escriptures).toEqual([]);
    expect(bucket.fitxers.size).toBe(0);
  });

  it('--apply es nega si hi ha sessions dubtoses sense resoldre al mapa', async () => {
    const db = firestoreFals({ sessions: { x1: { titol: 'Una altra', data: '2026-06-25' } } });
    const bucket = bucketFals();
    await expect(executar({ apply: true, db, bucket, dirContingut: CONTINGUT, mapa: {}, dirBackups: dirBackupsAmbManifest(), avui: AVUI, log: () => {} }))
      .rejects.toThrow(/dubtoses.*migracio-mapa\.json/);
    expect(db.escriptures).toEqual([]);
    expect(bucket.fitxers.size).toBe(0);
  });

  it('el mode informe no escriu res', async () => {
    const db = firestoreFals(sessionsInicials());
    const bucket = bucketFals();
    const linies = [];
    const { accions } = await executar({ db, bucket, dirContingut: CONTINGUT, mapa, log: (l) => linies.push(l) });
    expect(accions.length).toBeGreaterThan(0);
    expect(db.escriptures).toEqual([]);
    expect(bucket.fitxers.size).toBe(0);
    expect(linies.join('\n')).toMatch(/MODE INFORME/);
  });

  it('aplicar i tornar a planejar dona una llista d\'accions buida (idempotència)', async () => {
    const db = firestoreFals(sessionsInicials());
    const bucket = bucketFals();
    const opcions = { db, bucket, dirContingut: CONTINGUT, mapa, dirBackups: dirBackupsAmbManifest(), avui: AVUI, log: () => {} };
    const primera = await executar({ ...opcions, apply: true });
    expect(primera.accions.length).toBeGreaterThan(0);
    const escripturesPrimera = db.escriptures.length;
    const segona = await executar({ ...opcions, apply: true });
    expect(segona.accions).toEqual([]);
    expect(db.escriptures.length).toBe(escripturesPrimera);
    // Només s'han creat les sessions noves (carretera-a-gusen i una-altra); les altres dues eren parelles.
    expect(Object.keys(db.dades.sessions)).toHaveLength(4);
    expect(Object.keys(db.dades.pagines).sort()).toEqual(['fes-te-socia', 'portada', 'preguntes-frequents', 'privacitat', 'programacio']);
  });

  it('un document existent conserva els camps no migrats (merge) i només rep slug, publicada, publica i urlProgramacio buida', async () => {
    const db = firestoreFals(sessionsInicials());
    const bucket = bucketFals();
    await executar({ apply: true, db, bucket, dirContingut: CONTINGUT, mapa, dirBackups: dirBackupsAmbManifest(), avui: AVUI, log: () => {} });
    const abelles = db.dades.sessions.abelles1;
    const inicials = sessionsInicials().sessions;
    expect(abelles).toMatchObject({ ...inicials.abelles1, publica: expect.any(Object), slug: '20000-especies-de-abejas', publicada: true });
    expect(abelles.publica.notaManual).toBe('no es toca');
    expect(abelles.publica.titolOriginal).toBe('20.000 especies de abejas');
    const porc = db.dades.sessions.porc1;
    expect(porc).toMatchObject({ titol: 'Porc', data: '2026-06-25', hora: '19:00', activa: false, preuEntrada: 5, slug: 'pig', publicada: true });
    expect(porc.urlProgramacio).toBe(`${WEB}/programacio/2026/pig/`);
    // Les actualitzacions toquen només aquests camps.
    for (const { op, canvis } of db.escriptures.filter((e) => e.nom === 'sessions' && e.op === 'update')) {
      expect(op).toBe('update');
      for (const camp of Object.keys(canvis)) expect(camp).toMatch(/^(slug|publicada|urlProgramacio|publica\..+)$/);
    }
  });

  it('les sessions noves es creen inactives i marcades com a migrades', async () => {
    const db = firestoreFals(sessionsInicials());
    await executar({ apply: true, db, bucket: bucketFals(), dirContingut: CONTINGUT, mapa, dirBackups: dirBackupsAmbManifest(), avui: AVUI, log: () => {} });
    const nova = Object.values(db.dades.sessions).find((s) => s.slug === 'carretera-a-gusen');
    expect(nova).toMatchObject({
      titol: 'Carretera a Gusen', data: '2026-05-09', hora: '18:30', activa: false, creadaPerMigracio: true,
      slug: 'carretera-a-gusen', publicada: true, urlProgramacio: `${WEB}/programacio/2026/carretera-a-gusen/`,
    });
  });

  it('una sessió nova de xarxa i gratuïta porta senseControl: true; les altres no', async () => {
    const db = firestoreFals(sessionsInicials());
    const linies = [];
    await executar({ apply: true, db, bucket: bucketFals(), dirContingut: CONTINGUT, mapa, dirBackups: dirBackupsAmbManifest(), avui: AVUI, log: (l) => linies.push(l) });
    const perSlug = (slug) => Object.values(db.dades.sessions).find((s) => s.slug === slug);
    expect(perSlug('carretera-a-gusen').senseControl).toBe(true);
    expect(perSlug('una-altra')).not.toHaveProperty('senseControl');
    expect(perSlug('20000-especies-de-abejas')).not.toHaveProperty('senseControl');
    expect(perSlug('pig')).not.toHaveProperty('senseControl');
    expect(linies.join('\n')).toMatch(/crear sessio carretera-a-gusen:.*senseControl: true/);
    expect(linies.join('\n')).not.toMatch(/crear sessio una-altra:.*senseControl/);
  });

  it('amb --omet-noves aplica tot menys la creació de sessions, i una segona execució sense l\'opció només les crea', async () => {
    const db = firestoreFals(sessionsInicials());
    const bucket = bucketFals();
    const linies = [];
    const opcions = { db, bucket, dirContingut: CONTINGUT, mapa, dirBackups: dirBackupsAmbManifest(), avui: AVUI, log: (l) => linies.push(l) };
    const primera = await executar({ ...opcions, apply: true, ometNoves: true });

    expect(primera.accions.filter((a) => a.tipus === 'crear sessio').map((a) => a.slug).sort()).toEqual(['carretera-a-gusen', 'una-altra']);
    expect(linies.join('\n')).toMatch(/crear sessio carretera-a-gusen: .*\(omesa\)/);
    expect(linies.at(-1)).toMatch(/SENSE crear 2 sessions noves \(--omet-noves\)/);
    expect(db.escriptures.filter((e) => e.nom === 'sessions' && e.op === 'create')).toEqual([]);
    expect(db.escriptures.filter((e) => e.nom === 'sessions' && e.op === 'update').map((e) => e.id).sort()).toEqual(['abelles1', 'porc1']);
    expect(Object.keys(db.dades.pagines)).toHaveLength(5);
    expect(bucket.fitxers.size).toBeGreaterThan(0);
    expect(Object.keys(db.dades.sessions)).toHaveLength(2);

    const abans = db.escriptures.length;
    const fitxersAbans = bucket.fitxers.size;
    const segona = await executar({ ...opcions, apply: true });
    expect(segona.accions.map((a) => `${a.tipus} ${a.slug}`).sort()).toEqual(['crear sessio carretera-a-gusen', 'crear sessio una-altra']);
    expect(db.escriptures.slice(abans).map((e) => e.op)).toEqual(['create', 'create']);
    expect(bucket.fitxers.size).toBe(fitxersAbans);
    expect(Object.keys(db.dades.sessions)).toHaveLength(4);

    const tercera = await executar({ ...opcions, apply: true });
    expect(tercera.accions).toEqual([]);
  });

  it('el missatge final sense --omet-noves no parla d\'omissions', async () => {
    const linies = [];
    await executar({ apply: true, db: firestoreFals(sessionsInicials()), bucket: bucketFals(), dirContingut: CONTINGUT, mapa, dirBackups: dirBackupsAmbManifest(), avui: AVUI, log: (l) => linies.push(l) });
    expect(linies.at(-1)).toBe('Migració aplicada.');
  });

  it('no sobreescriu les imatges que ja són a Storage', async () => {
    const db = firestoreFals(sessionsInicials());
    const bucket = bucketFals(['web/sessions/pig/poster.jpg']);
    await executar({ apply: true, db, bucket, dirContingut: CONTINGUT, mapa, dirBackups: dirBackupsAmbManifest(), avui: AVUI, log: () => {} });
    expect(bucket.fitxers.get('web/sessions/pig/poster.jpg')).toEqual({ antic: true });
    expect(bucket.fitxers.get('web/sessions/20000-especies-de-abejas/poster.jpg').opcions)
      .toMatchObject({ contentType: 'image/jpeg', preconditionOpts: { ifGenerationMatch: 0 } });
  });
});

describe('llegirOpcions', () => {
  it('sense arguments és un informe', () => {
    expect(llegirOpcions([], '/c')).toEqual({ apply: false, ometNoves: false, dirContingut: '/c' });
  });
  it('reconeix --apply, --omet-noves i --contingut', () => {
    expect(llegirOpcions(['--apply', '--omet-noves', '--contingut', '/x'], '/c')).toEqual({ apply: true, ometNoves: true, dirContingut: '/x' });
  });
  it('una opció desconeguda (la errada de --omet-noves) llança, mai no s\'aplica', () => {
    for (const dolent of ['--omet-nova', '--omet-noves=1', '--apply-tot', '--ometnoves', 'apply']) {
      expect(() => llegirOpcions(['--apply', dolent], '/c'), dolent).toThrow(/desconeguda/);
    }
  });
  it('--contingut sense valor llança', () => {
    expect(() => llegirOpcions(['--contingut'], '/c')).toThrow(/--contingut/);
    expect(() => llegirOpcions(['--contingut', '--apply'], '/c')).toThrow(/--contingut/);
  });
  it('des de la línia d\'ordres, una opció desconeguda imprimeix l\'ús i surt amb error', () => {
    const arxiu = join(dirname(fileURLToPath(import.meta.url)), 'migra-hugo.mjs');
    const r = spawnSync(process.execPath, [arxiu, '--omet-nova'], {
      encoding: 'utf8',
      cwd: tmpdir(),
      // Per seguretat: mai no pot arribar a cap Firestore real, ni amb una regressió
      env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: '/nonexistent', FIRESTORE_EMULATOR_HOST: '127.0.0.1:1' },
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/desconeguda: --omet-nova/);
    expect(r.stderr).toMatch(/Ús: node scripts\/migra-hugo\.mjs/);
  });
});
