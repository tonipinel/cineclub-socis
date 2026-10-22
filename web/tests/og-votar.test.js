import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock('../src/lib/db.js', async (original) => ({ ...(await original()), getDb: getDbMock }));

const { GET } = await import('../src/pages/propostes/votar/og.jpg.js');

const LOGO = readFileSync(new URL('../public/images/entitats/cineclub-roda-de-bera.png', import.meta.url));
const CACHE_OG = 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400';
const CACHE_FALLBACK = 'public, max-age=60, s-maxage=60';
const BUCKET = 'https://firebasestorage.googleapis.com/v0/b/cineclub-socis.firebasestorage.app/o/carteils%2F';

const dia = (text) => new Date(`${text}T10:00:00Z`);
const stamp = (data) => ({ toDate: () => data });
const futur = () => stamp(new Date(Date.now() + 7 * 86400000));
const passat = () => stamp(new Date(Date.now() - 7 * 86400000));

// Db fals: només `collection('tandes').get()` i `doc('propostes/<id>').get()`, com el codi real.
const dbFals = ({ tandes = [], propostes = {}, falla = false } = {}) => ({
  collection: () => ({
    get: async () => {
      if (falla) throw new Error('Firestore caigut');
      return { docs: tandes.map(({ id, ...dades }) => ({ id, data: () => dades })) };
    },
  }),
  doc: (ruta) => ({
    get: async () => {
      const dades = propostes[ruta.split('/')[1]];
      return { exists: Boolean(dades), data: () => dades };
    },
  }),
});

const proposta = (id, extra = {}) => ({ titol: id, estat: 'aprovada', imatgeUrl: `${BUCKET}${id}.jpg?alt=media`, ...extra });
const ids = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const tandaAmb = (llista, extra = {}) => ({
  tandes: [{ id: 't1', nom: 'Q4', propostes: llista, creada: passat(), tanca: futur(), ...extra }],
  propostes: Object.fromEntries(llista.map((id) => [id, proposta(id)])),
});

// Cartell sintètic amb degradat i franges: comprimeix com un cartell de veritat.
const cartell = (color) => sharp(Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#202020"/></linearGradient></defs>`
  + '<rect width="500" height="750" fill="url(#g)"/><rect x="40" y="500" width="420" height="40" fill="#fff"/><rect x="90" y="560" width="320" height="24" fill="#ddd"/></svg>',
)).jpeg().toBuffer();

let fetchMock;
const respostaImatge = async (url) => new Response(await cartell(['#c0392b', '#2980b9', '#27ae60', '#f39c12'][String(url).length % 4]), { status: 200, headers: { 'content-type': 'image/jpeg' } });

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getDbMock.mockReset();
  fetchMock = vi.fn(respostaImatge);
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const peticio = (cerca = '') => ({ url: new URL(`http://localhost/propostes/votar/og.jpg${cerca}`) });
const esFallback = async (res) => {
  expect(res.status).toBe(200);
  expect(res.headers.get('Content-Type')).toBe('image/png');
  expect(res.headers.get('Cache-Control')).toBe(CACHE_FALLBACK);
  expect(Buffer.from(await res.arrayBuffer()).equals(LOGO)).toBe(true);
};

describe('GET /propostes/votar/og.jpg', () => {
  it('serveix un JPEG opac de 1200 × 630 de menys de 300 KB amb els cartells de la tanda (8)', async () => {
    getDbMock.mockReturnValue(dbFals(tandaAmb(ids(8))));
    const res = await GET(peticio());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(res.headers.get('Cache-Control')).toBe(CACHE_OG);
    const cos = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(cos).metadata();
    expect(meta).toMatchObject({ format: 'jpeg', width: 1200, height: 630, channels: 3, hasAlpha: false });
    expect(cos.length).toBeLessThan(300 * 1024);
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it.each([1, 3, 12, 24])('funciona amb %i cartells', async (n) => {
    getDbMock.mockReturnValue(dbFals(tandaAmb(ids(n))));
    const res = await GET(peticio());
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    const cos = Buffer.from(await res.arrayBuffer());
    expect(await sharp(cos).metadata()).toMatchObject({ width: 1200, height: 630 });
    expect(cos.length).toBeLessThan(300 * 1024);
  });

  it('només descarrega els cartells de les propostes aprovades o programades', async () => {
    const dades = tandaAmb(['a', 'b', 'c', 'd', 'e']);
    dades.propostes.b.estat = 'programada';
    dades.propostes.c.estat = 'pendent';
    dades.propostes.d.estat = 'rebutjada';
    delete dades.propostes.e;
    getDbMock.mockReturnValue(dbFals(dades));
    await GET(peticio());
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([`${BUCKET}a.jpg?alt=media`, `${BUCKET}b.jpg?alt=media`]);
  });

  it('tria la mateixa tanda que el servidor de vot: la oberta amb `creada` més recent', async () => {
    getDbMock.mockReturnValue(dbFals({
      tandes: [
        { id: 'vella', propostes: ['v1'], creada: stamp(dia('2026-09-01')), tanca: futur() },
        { id: 'nova', propostes: ['n1'], creada: stamp(dia('2026-10-20')), tanca: futur() },
        { id: 'tancada', propostes: ['t1'], creada: stamp(dia('2026-10-21')), tanca: passat() },
      ],
      propostes: { v1: proposta('v1'), n1: proposta('n1'), t1: proposta('t1') },
    }));
    await GET(peticio());
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([`${BUCKET}n1.jpg?alt=media`]);
  });

  it('sense tanda oberta usa la darrera tancada', async () => {
    getDbMock.mockReturnValue(dbFals({
      tandes: [
        { id: 'a', propostes: ['a1'], creada: stamp(dia('2026-01-01')), tanca: stamp(dia('2026-02-01')) },
        { id: 'b', propostes: ['b1'], creada: stamp(dia('2026-03-01')), tanca: stamp(dia('2026-04-01')) },
      ],
      propostes: { a1: proposta('a1'), b1: proposta('b1') },
    }));
    await GET(peticio());
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([`${BUCKET}b1.jpg?alt=media`]);
  });

  it('limita els cartells a 24', async () => {
    getDbMock.mockReturnValue(dbFals(tandaAmb(ids(40))));
    await GET(peticio());
    expect(fetchMock).toHaveBeenCalledTimes(24);
  });

  it('descarrega els cartells amb un timeout curt i sense seguir redireccions', async () => {
    getDbMock.mockReturnValue(dbFals(tandaAmb(ids(2))));
    await GET(peticio());
    const [, opcions] = fetchMock.mock.calls[0];
    expect(opcions.redirect).toBe('error');
    expect(opcions.signal).toBeInstanceOf(AbortSignal);
  });

  it('salta els cartells que fallen i composa la resta', async () => {
    getDbMock.mockReturnValue(dbFals(tandaAmb(ids(4))));
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes('p2.jpg')) throw new Error('timeout');
      if (String(url).includes('p3.jpg')) return new Response('no', { status: 404 });
      return respostaImatge(url);
    });
    const res = await GET(peticio());
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(await sharp(Buffer.from(await res.arrayBuffer())).metadata()).toMatchObject({ width: 1200, height: 630 });
  });

  it('salta els cartells que no són una imatge ràster (SVG amb content-type d\'imatge)', async () => {
    getDbMock.mockReturnValue(dbFals(tandaAmb(ids(2))));
    fetchMock.mockImplementation(async (url) => (String(url).includes('p1.jpg')
      ? new Response('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>', { status: 200, headers: { 'content-type': 'image/jpeg' } })
      : respostaImatge(url)));
    const res = await GET(peticio());
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
  });

  it('no descarrega mai cartells de hosts que no són a la llista', async () => {
    const dades = tandaAmb(['a', 'b', 'c', 'd', 'e', 'f']);
    dades.propostes.a.imatgeUrl = 'https://exemple.cat/a.jpg';
    dades.propostes.b.imatgeUrl = 'http://image.tmdb.org/t/p/w500/b.jpg';
    dades.propostes.c.imatgeUrl = 'https://image.tmdb.org@exemple.cat/c.jpg';
    dades.propostes.d.imatgeUrl = 'https://image.tmdb.org.exemple.cat/d.jpg';
    dades.propostes.e.imatgeUrl = 'https://image.tmdb.org:8443/e.jpg';
    dades.propostes.f.imatgeUrl = 'http://169.254.169.254/latest/meta-data';
    getDbMock.mockReturnValue(dbFals(dades));
    await esFallback(await GET(peticio()));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepta image.tmdb.org, firebasestorage.googleapis.com i storage.googleapis.com', async () => {
    const dades = tandaAmb(['a', 'b', 'c']);
    dades.propostes.a.imatgeUrl = 'https://image.tmdb.org/t/p/w500/a.jpg';
    dades.propostes.c.imatgeUrl = 'https://storage.googleapis.com/cineclub-socis.firebasestorage.app/carteils/c.jpg';
    getDbMock.mockReturnValue(dbFals(dades));
    await GET(peticio());
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  describe('fallback: la imatge per defecte, amb caché curta i mai un 500', () => {
    it('sense cap tanda', async () => {
      getDbMock.mockReturnValue(dbFals());
      await esFallback(await GET(peticio()));
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('amb una tanda sense propostes efectives', async () => {
      getDbMock.mockReturnValue(dbFals({ tandes: [{ id: 't', propostes: ['a'], creada: passat(), tanca: futur() }], propostes: { a: proposta('a', { estat: 'pendent' }) } }));
      await esFallback(await GET(peticio()));
    });

    it('si no es pot baixar cap cartell', async () => {
      getDbMock.mockReturnValue(dbFals(tandaAmb(ids(3))));
      fetchMock.mockRejectedValue(new Error('xarxa caiguda'));
      await esFallback(await GET(peticio()));
    });

    it('si cap cartell no és una imatge', async () => {
      getDbMock.mockReturnValue(dbFals(tandaAmb(ids(2))));
      fetchMock.mockImplementation(async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }));
      await esFallback(await GET(peticio()));
    });

    it('si Firestore falla', async () => {
      getDbMock.mockReturnValue(dbFals({ falla: true }));
      await esFallback(await GET(peticio()));
      expect(console.error).toHaveBeenCalled();
    });

    it('si no es pot ni obtenir la base de dades', async () => {
      getDbMock.mockImplementation(() => { throw new Error('sense credencials'); });
      await esFallback(await GET(peticio()));
    });
  });

  it('si ni el logo no es pot llegir, redirigeix a la imatge per defecte amb caché curta (mai 500)', async () => {
    getDbMock.mockReturnValue(dbFals(tandaAmb(ids(2))));
    vi.spyOn(process, 'cwd').mockReturnValue('/directori/que/no/existeix');
    const res = await GET(peticio());
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/images/entitats/cineclub-roda-de-bera.png');
    expect(res.headers.get('Cache-Control')).toBe(CACHE_FALLBACK);
  });

  it('no accepta paràmetres: cap `?x` no genera variants (400) i no llegeix res', async () => {
    getDbMock.mockReturnValue(dbFals(tandaAmb(ids(2))));
    for (const cerca of ['?u=https://exemple.cat/a.jpg', '?x=1']) {
      expect((await GET(peticio(cerca))).status).toBe(400);
    }
    expect(getDbMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
