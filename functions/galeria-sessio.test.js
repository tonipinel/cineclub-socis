// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import galeria from './galeria-sessio.js';

const {
  MAXIM_BYTES, esPathValid, planificarGaleria, descarregarImatgeTmdb, importarGaleria, importarGaleriaSessio,
} = galeria;

const BUCKET = 'cinema.test';
const url = (cami) => `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(cami)}?alt=media`;
const IMATGES = ['/a1.jpg', '/b_2.jpg', '/c-3.png'];

const MAGICS = { 'image/jpeg': [0xff, 0xd8, 0xff], 'image/png': [0x89, 0x50, 0x4e, 0x47] };

// El cos arriba en trossos de 4 bytes; per defecte comença amb els bytes màgics del tipus. `llargada: null`: sense capçalera.
function resposta({
  ok = true, status = 200, tipus = 'image/jpeg', mida = 10, llargada, magic = MAGICS[tipus] ?? [], senseCos = false,
} = {}) {
  const capcaleres = { 'content-type': tipus };
  if (llargada !== null) capcaleres['content-length'] = String(llargada ?? mida);
  const bytes = new Uint8Array(mida);
  bytes.set(magic.slice(0, mida));
  const llegits = { n: 0 };
  async function* cos() {
    for (let i = 0; i < mida; i += 4) {
      llegits.n += Math.min(4, mida - i);
      yield bytes.slice(i, i + 4);
    }
  }
  return {
    ok, status, llegits, headers: { get: (nom) => capcaleres[nom] ?? null }, body: senseCos ? null : Object.assign(cos(), { cancel: vi.fn(async () => {}) }),
  };
}

// Respon segons el path (sense `/t/p/w1280`): una funció, una resposta o un error.
const fetchPer = (respostes = {}) => vi.fn(async (u) => {
  const r = respostes[u.replace('https://image.tmdb.org/t/p/w1280', '')];
  if (r instanceof Error) throw r;
  return r ?? resposta({ tipus: u.endsWith('.png') ? 'image/png' : 'image/jpeg' });
});

// Firestore i bucket falsos amb la forma de l'Admin SDK. `abansDeTx` simula un canvi concurrent.
function entorn({ sessio, proposta, abansDeTx, falliPujada = [] } = {}) {
  const estat = { sessions: { s1: structuredClone(sessio) }, propostes: { p1: structuredClone(proposta) } };
  if (sessio === undefined) delete estat.sessions.s1;
  if (proposta === undefined) delete estat.propostes.p1;
  const snap = (col, id) => ({ exists: id in estat[col], data: () => structuredClone(estat[col][id]) });
  const ref = (col, id) => ({ col, id, get: async () => snap(col, id) });
  const fitxers = {};
  const db = {
    estat,
    collection: (col) => ({ doc: (id) => ref(col, id) }),
    // Com Firestore amb contenció: el primer intent es descarta i la funció es torna a executar.
    runTransaction: vi.fn(async (fn) => {
      abansDeTx?.(estat);
      let resultat;
      for (const confirma of [false, true]) {
        const pendents = [];
        resultat = await fn({ get: async (r) => snap(r.col, r.id), update: (r, camps) => pendents.push([r, camps]) });
        if (!confirma) continue;
        for (const [r, camps] of pendents) {
          for (const [camp, valor] of Object.entries(camps)) {
            const [a, b] = camp.split('.');
            estat[r.col][r.id][a] = { ...estat[r.col][r.id][a], [b]: valor };
          }
        }
      }
      return resultat;
    }),
  };
  const bucket = {
    name: BUCKET,
    fitxers,
    file: (cami) => ({
      save: vi.fn(async (contingut, opcions) => {
        if (falliPujada.includes(cami)) throw new Error('storage');
        fitxers[cami] = { mida: contingut.length, opcions };
      }),
      delete: vi.fn(async () => { delete fitxers[cami]; }),
    }),
  };
  return { db, bucket, estat };
}

const SESSIO = { titol: 'Film', propostaId: 'p1', publicada: false, publica: { titol: 'Film', cartell: 'https://c' } };
const PROPOSTA = { titol: 'Film', imatges: IMATGES };
const AVUI = () => new Date('2026-10-27T10:00:00Z').getTime();

describe('esPathValid', () => {
  it.each(['/abc.jpg', '/A-b_9.jpeg', '/x.png'])('accepta %s', (p) => expect(esPathValid(p)).toBe(true));
  it.each([
    'abc.jpg', '/../a.jpg', '/a/b.jpg', '/a.gif', '/a.jpg?x=1', 'https://evil.test/a.jpg', '//evil.test/a.jpg',
    '/a.jpg/', '/.jpg', '/a b.jpg', null, 5, {},
  ])('rebutja %s', (p) => expect(esPathValid(p)).toBe(false));
});

describe('planificarGaleria', () => {
  it('camí per id de sessió i posició, URL ?alt=media, sense repetits, invàlids comptats i màxim 5', () => {
    const pla = planificarGaleria('s1', ['/a.jpg', '/a.jpg', '../x.jpg', '/b.png', '/c.jpg', '/d.jpg', '/e.jpg', '/f.jpg'], BUCKET);
    expect(pla.rebutjats).toBe(1);
    expect(pla.imatges.map((i) => i.cami)).toEqual([
      'web/sessions/s1/gallery-1-a.jpg', 'web/sessions/s1/gallery-2-b.png', 'web/sessions/s1/gallery-3-c.jpg',
      'web/sessions/s1/gallery-4-d.jpg', 'web/sessions/s1/gallery-5-e.jpg',
    ]);
    expect(pla.imatges[0].url).toBe('https://firebasestorage.googleapis.com/v0/b/cinema.test/o/web%2Fsessions%2Fs1%2Fgallery-1-a.jpg?alt=media');
  });

  it('un .jpeg es desa com a .jpg i un altre fitxer de TMDB a la mateixa posició té un altre camí', () => {
    expect(planificarGaleria('s1', ['/x_Y-9.jpeg'], BUCKET).imatges[0].cami).toBe('web/sessions/s1/gallery-1-x_Y-9.jpg');
    expect(planificarGaleria('s1', ['/z.jpg'], BUCKET).imatges[0].cami).not.toBe(planificarGaleria('s1', ['/a.jpg'], BUCKET).imatges[0].cami);
  });

  it('sense imatges (o no una llista) és buit', () => {
    expect(planificarGaleria('s1', undefined, BUCKET)).toEqual({ rebutjats: 0, imatges: [] });
    expect(planificarGaleria('s1', 'x', BUCKET)).toEqual({ rebutjats: 0, imatges: [] });
  });
});

describe('descarregarImatgeTmdb', () => {
  it('només baixa de image.tmdb.org/t/p/w1280, sense redireccions i amb temps màxim', async () => {
    const fetchFn = fetchPer();
    const { contingut, contentType } = await descarregarImatgeTmdb('/a.jpg', fetchFn);
    expect(fetchFn).toHaveBeenCalledWith('https://image.tmdb.org/t/p/w1280/a.jpg', expect.objectContaining({ redirect: 'error' }));
    expect(fetchFn.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(contingut.length).toBe(10);
    expect(contentType).toBe('image/jpeg');
  });

  it.each(['//evil.test/a.jpg', '/../../a.jpg', 'https://evil.test/a.jpg'])('amb un path invàlid (%s) no fa cap petició', async (p) => {
    const fetchFn = fetchPer();
    await expect(descarregarImatgeTmdb(p, fetchFn)).rejects.toThrow('Path de TMDB no vàlid.');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    ['un error HTTP', resposta({ ok: false, status: 404 })],
    ['un tipus que no és el de l\'extensió', resposta({ tipus: 'text/html' })],
    ['una capçalera de mida massa gran', resposta({ llargada: MAXIM_BYTES + 1 })],
    ['un cos buit', resposta({ mida: 0 })],
    ['una resposta sense cos', resposta({ senseCos: true })],
    ['uns bytes que no són JPEG', resposta({ magic: [0x3c, 0x68, 0x74] })],
    ['un PNG servit com a JPEG', resposta({ magic: MAGICS['image/png'] })],
  ])('falla amb %s', async (_nom, r) => {
    await expect(descarregarImatgeTmdb('/a.jpg', fetchPer({ '/a.jpg': r }))).rejects.toThrow();
  });

  it('sense content-length, deixa de llegir en passar del límit', async () => {
    const r = resposta({ mida: MAXIM_BYTES + 100, llargada: null });
    await expect(descarregarImatgeTmdb('/a.jpg', fetchPer({ '/a.jpg': r }))).rejects.toThrow('Imatge massa gran.');
    expect(r.llegits.n).toBeLessThanOrEqual(MAXIM_BYTES + 4);
    expect(r.body.cancel).toHaveBeenCalled();
  });

  it('accepta un PNG amb els seus bytes màgics', async () => {
    const r = await descarregarImatgeTmdb('/a.png', fetchPer());
    expect(r.contentType).toBe('image/png');
  });
});

describe('importarGaleria', () => {
  it('baixa les imatges, les desa amb Cache-Control públic i escriu només publica.galeria', async () => {
    const { db, bucket, estat } = entorn({ sessio: SESSIO, proposta: PROPOSTA });
    const fetchFn = fetchPer();
    const r = await importarGaleria({ db, bucket, fetchFn, ara: AVUI }, 's1');
    const camins = ['web/sessions/s1/gallery-1-a1.jpg', 'web/sessions/s1/gallery-2-b_2.jpg', 'web/sessions/s1/gallery-3-c-3.png'];
    expect(r).toEqual({ estat: 'importada', galeria: camins.map(url), fallades: 0, fitxers: camins, actualitzatEl: '2026-10-27' });
    expect(Object.keys(bucket.fitxers)).toEqual(camins);
    expect(bucket.fitxers[camins[0]].opcions).toMatchObject({ contentType: 'image/jpeg', metadata: { cacheControl: 'public, max-age=31536000' } });
    expect(bucket.fitxers[camins[2]].opcions.contentType).toBe('image/png');
    // Com `prepararDesat`: un canvi real de la fitxa pública mou `actualitzatEl`, publicada o no.
    expect(estat.sessions.s1).toEqual({ ...SESSIO, publica: { ...SESSIO.publica, galeria: camins.map(url), actualitzatEl: '2026-10-27' } });
  });

  it('és idempotent: la segona vegada no baixa ni escriu res', async () => {
    const { db, bucket, estat } = entorn({ sessio: SESSIO, proposta: PROPOSTA });
    await importarGaleria({ db, bucket, fetchFn: fetchPer() }, 's1');
    const abans = structuredClone(estat.sessions.s1);
    const fetchFn = fetchPer();
    const r = await importarGaleria({ db, bucket, fetchFn }, 's1');
    expect(r.estat).toBe('ja-tenia');
    expect(fetchFn).not.toHaveBeenCalled();
    expect(db.runTransaction).toHaveBeenCalledTimes(1);
    expect(estat.sessions.s1).toEqual(abans);
  });

  it.each([[['https://meva']], ['https://meva']])('no sobreescriu una galeria que ja té res (%j)', async (galeriaActual) => {
    const sessio = { ...SESSIO, publica: { ...SESSIO.publica, galeria: galeriaActual } };
    const { db, bucket, estat } = entorn({ sessio, proposta: PROPOSTA });
    const fetchFn = fetchPer();
    expect(await importarGaleria({ db, bucket, fetchFn }, 's1')).toMatchObject({ estat: 'ja-tenia', galeria: ['https://meva'] });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(estat.sessions.s1).toEqual(sessio);
  });

  it.each([[[]], [''], [null]])('una galeria buida (%j) sí que s\'omple', async (galeriaActual) => {
    const { db, bucket } = entorn({ sessio: { ...SESSIO, publica: { galeria: galeriaActual } }, proposta: PROPOSTA });
    expect((await importarGaleria({ db, bucket, fetchFn: fetchPer() }, 's1')).estat).toBe('importada');
  });

  it('cursa: una galeria posada mentrestant com a text sol també compta', async () => {
    const { db, bucket, estat } = entorn({
      sessio: SESSIO, proposta: PROPOSTA, abansDeTx: (e) => { e.sessions.s1.publica.galeria = 'https://meva'; },
    });
    expect(await importarGaleria({ db, bucket, fetchFn: fetchPer() }, 's1')).toMatchObject({ estat: 'ja-tenia', galeria: ['https://meva'] });
    expect(estat.sessions.s1.publica.galeria).toBe('https://meva');
    expect(bucket.fitxers).toEqual({});
  });

  it('cursa: si mentrestant hi han posat una galeria, no la toca i esborra els fitxers nous', async () => {
    const { db, bucket, estat } = entorn({
      sessio: SESSIO, proposta: PROPOSTA, abansDeTx: (e) => { e.sessions.s1.publica.galeria = ['https://meva']; },
    });
    const r = await importarGaleria({ db, bucket, fetchFn: fetchPer() }, 's1');
    expect(r).toMatchObject({ estat: 'ja-tenia', galeria: ['https://meva'] });
    expect(estat.sessions.s1.publica.galeria).toEqual(['https://meva']);
    expect(bucket.fitxers).toEqual({});
  });

  it('cursa: si mentrestant l\'han esborrada, no la crea, esborra els fitxers i dona not-found', async () => {
    const { db, bucket, estat } = entorn({ sessio: SESSIO, proposta: PROPOSTA, abansDeTx: (e) => { delete e.sessions.s1; } });
    await expect(importarGaleria({ db, bucket, fetchFn: fetchPer() }, 's1')).rejects.toMatchObject({ codi: 'not-found' });
    expect(estat.sessions.s1).toBeUndefined();
    expect(bucket.fitxers).toEqual({});
  });

  it('errors parcials: desa les que han anat bé, en ordre, i compta les fallades (invàlides incloses)', async () => {
    const { db, bucket, estat } = entorn({
      sessio: SESSIO,
      proposta: { imatges: ['/a1.jpg', 'https://evil.test/x.jpg', '/b_2.jpg', '/c-3.png'] },
      falliPujada: ['web/sessions/s1/gallery-3-c-3.png'],
    });
    const log = vi.fn();
    const r = await importarGaleria({ db, bucket, fetchFn: fetchPer({ '/a1.jpg': new Error('xarxa') }), log }, 's1');
    expect(r).toMatchObject({ estat: 'importada', galeria: [url('web/sessions/s1/gallery-2-b_2.jpg')], fallades: 3 });
    expect(estat.sessions.s1.publica.galeria).toEqual([url('web/sessions/s1/gallery-2-b_2.jpg')]);
    expect(log).toHaveBeenCalledTimes(2);
  });

  it('si no se\'n pot baixar cap, no escriu res i torna estat error', async () => {
    const { db, bucket, estat } = entorn({ sessio: SESSIO, proposta: PROPOSTA });
    const fetchFn = vi.fn(async () => resposta({ ok: false, status: 500 }));
    expect(await importarGaleria({ db, bucket, fetchFn }, 's1')).toMatchObject({ estat: 'error', galeria: [], fallades: 3 });
    expect(db.runTransaction).not.toHaveBeenCalled();
    expect(estat.sessions.s1).toEqual(SESSIO);
  });

  it.each([
    ['sense propostaId', { ...SESSIO, propostaId: undefined }, PROPOSTA],
    ['amb la proposta esborrada', SESSIO, undefined],
    ['amb una proposta sense imatges', SESSIO, { titol: 'Film' }],
  ])('%s no fa res', async (_nom, sessio, proposta) => {
    const { db, bucket } = entorn({ sessio, proposta });
    const fetchFn = fetchPer();
    expect(await importarGaleria({ db, bucket, fetchFn }, 's1')).toMatchObject({ estat: 'sense-imatges', galeria: [] });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(db.runTransaction).not.toHaveBeenCalled();
  });

  it('agafa com a màxim 5 imatges', async () => {
    const { db, bucket } = entorn({ sessio: SESSIO, proposta: { imatges: ['/1.jpg', '/2.jpg', '/3.jpg', '/4.jpg', '/5.jpg', '/6.jpg'] } });
    const fetchFn = fetchPer();
    const r = await importarGaleria({ db, bucket, fetchFn }, 's1');
    expect(r.galeria).toHaveLength(5);
    expect(fetchFn).toHaveBeenCalledTimes(5);
  });

  it.each([undefined, '', 'a/b', '../x', 'a'.repeat(129), { id: 's1' }])('rebutja l\'id de sessió %s', async (id) => {
    const { db, bucket } = entorn({ sessio: SESSIO, proposta: PROPOSTA });
    await expect(importarGaleria({ db, bucket }, id)).rejects.toMatchObject({ codi: 'invalid-argument' });
  });

  it('una sessió inexistent dona not-found', async () => {
    const { db, bucket } = entorn({ proposta: PROPOSTA });
    await expect(importarGaleria({ db, bucket }, 's1')).rejects.toMatchObject({ codi: 'not-found' });
  });
});

describe('importarGaleriaSessio: permisos', () => {
  const admin = { getUser: vi.fn(async () => ({ customClaims: { role: 'admin' } })) };

  it.each([
    ['sense sessió', null, admin, 'unauthenticated'],
    ['sense rol d\'admin al token', { uid: 'u', token: { role: 'taquilla' } }, admin, 'permission-denied'],
    ['amb el compte desactivat', { uid: 'u', token: { role: 'admin' } }, { getUser: async () => ({ disabled: true, customClaims: { role: 'admin' } }) }, 'permission-denied'],
    ['si ja no és admin', { uid: 'u', token: { role: 'admin' } }, { getUser: async () => ({ customClaims: {} }) }, 'permission-denied'],
    ['si no es pot comprovar el compte', { uid: 'u', token: { role: 'admin' } }, { getUser: async () => { throw new Error('x'); } }, 'permission-denied'],
  ])('%s: %s', async (_nom, auth, servei, codi) => {
    const { db, bucket } = entorn({ sessio: SESSIO, proposta: PROPOSTA });
    const fetchFn = fetchPer();
    await expect(importarGaleriaSessio({ auth: servei, db, bucket, fetchFn }, { auth, data: { sessioId: 's1' } }))
      .rejects.toMatchObject({ codi });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('l\'admin la importa', async () => {
    const { db, bucket } = entorn({ sessio: SESSIO, proposta: PROPOSTA });
    const r = await importarGaleriaSessio(
      { auth: admin, db, bucket, fetchFn: fetchPer() },
      { auth: { uid: 'u', token: { role: 'admin' } }, data: { sessioId: 's1' } },
    );
    expect(r.estat).toBe('importada');
  });
});
