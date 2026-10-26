import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import sharp from 'sharp';
import { conWhere } from './helpers/firestore.js';

const { getDbMock, llegirStorageMock } = vi.hoisted(() => ({ getDbMock: vi.fn(), llegirStorageMock: vi.fn() }));
vi.mock('../src/lib/db.js', async (original) => ({ ...(await original()), getDb: getDbMock }));
vi.mock('../src/lib/resize.js', async (original) => ({ ...(await original()), llegirStorage: llegirStorageMock }));

const { GET } = await import('../src/pages/programacio/[any]/[slug]/og.jpg.js');
const { onRequest } = await import('../src/middleware.js');
const { buidaMemoriaOg, camiOgSessio, versioOg } = await import('../src/lib/og-sessio.js');

const ST = 'https://firebasestorage.googleapis.com/v0/b/cineclub-socis.firebasestorage.app/o/web%2Fsessions%2Fpig%2Fposter.jpg?alt=media';
const TMDB = 'https://image.tmdb.org/t/p/w780/pig.jpg';
const CARTELL = { timeoutMs: 4000, maxBytes: 5 * 1024 * 1024 };
const CACHE_RESERVA = 'public, max-age=60, s-maxage=60';
const sessio = (publica, extra = {}) => ({ id: 'pig-id', titol: 'Pig', slug: 'pig', publicada: true, data: '2026-06-25', hora: '19:00', publica, ...extra });

// Cada cas fa servir un db nou: la memòria de `sessionsPubliques` va per db.
const ambSessions = (docs) => getDbMock.mockReturnValue({
  collection: () => conWhere({ get: async () => ({ docs: docs.map(({ id, ...dades }) => ({ id, data: () => dades })) }) }),
});

const cartell = () => sharp({ create: { width: 500, height: 750, channels: 3, background: '#c0392b' } }).jpeg().toBuffer();
const imatge = async () => new Response(await cartell(), { status: 200, headers: { 'content-type': 'image/jpeg' } });
// `ruta` és el camí tal com arriba (percent-encoded); `slug` el paràmetre que lliura Astro (decodificat).
const peticio = (ruta, any, slug) => ({ params: { any, slug }, url: new URL(`http://localhost${ruta}`) });
const v = (c) => `?v=${versioOg(c)}`;
const mides = async (res) => sharp(Buffer.from(await res.arrayBuffer())).metadata();

let fetchMock;
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getDbMock.mockReset();
  llegirStorageMock.mockReset();
  buidaMemoriaOg();
  fetchMock = vi.fn(imatge);
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GET /programacio/<any>/<slug>/og.jpg', () => {
  it('serveix un JPEG de 1200 × 630 amb el cartell del nostre Storage (Admin SDK, amb els límits de la tanda)', async () => {
    ambSessions([sessio({ cartell: ST })]);
    llegirStorageMock.mockResolvedValue(await cartell());
    const res = await GET(peticio(`/programacio/2026/pig/og.jpg${v(ST)}`, '2026', 'pig'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=86400');
    expect(await mides(res)).toMatchObject({ format: 'jpeg', width: 1200, height: 630 });
    expect(llegirStorageMock).toHaveBeenCalledWith(ST, undefined, CARTELL);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('si l\'Admin SDK falla, el cartell es baixa de l\'endpoint públic de Storage', async () => {
    ambSessions([sessio({ cartell: ST })]);
    llegirStorageMock.mockRejectedValue(new Error('sense permisos'));
    const res = await GET(peticio(`/programacio/2026/pig/og.jpg${v(ST)}`, '2026', 'pig'));
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=86400');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(ST);
  });

  it('un cartell de TMDB es descarrega; el d\'un host no permès no, i es serveix la reserva', async () => {
    ambSessions([sessio({ cartell: TMDB })]);
    expect((await GET(peticio(`/programacio/2026/pig/og.jpg${v(TMDB)}`, '2026', 'pig'))).headers.get('Cache-Control')).toContain('s-maxage=86400');
    expect(fetchMock.mock.calls[0][0]).toBe(TMDB);
    fetchMock.mockClear();
    const altre = 'https://exemple.cat/pig.jpg';
    ambSessions([sessio({ cartell: altre })]);
    const res = await GET(peticio(`/programacio/2026/pig/og.jpg${v(altre)}`, '2026', 'pig'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe(CACHE_RESERVA);
  });

  it('reserva (sense cartell, o un cartell que no és una imatge): 200, JPEG 1200 × 630 només amb el logo, caché curta', async () => {
    ambSessions([sessio({})]);
    const sense = await GET(peticio('/programacio/2026/pig/og.jpg', '2026', 'pig'));
    expect(sense.status).toBe(200);
    expect(sense.headers.get('Cache-Control')).toBe(CACHE_RESERVA);
    expect(await mides(sense)).toMatchObject({ format: 'jpeg', width: 1200, height: 630 });
    ambSessions([sessio({ cartell: ST })]);
    llegirStorageMock.mockResolvedValue(Buffer.from('<html>no és una imatge</html>'));
    const dolent = await GET(peticio(`/programacio/2026/pig/og.jpg${v(ST)}`, '2026', 'pig'));
    expect(dolent.status).toBe(200);
    expect(dolent.headers.get('Cache-Control')).toBe(CACHE_RESERVA);
    expect(await mides(dolent)).toMatchObject({ format: 'jpeg', width: 1200, height: 630 });
  });

  it('passant pel middleware, la reserva manté la caché curta (no la d\'un 3xx ni la per defecte)', async () => {
    ambSessions([sessio({})]);
    const ruta = '/programacio/2026/pig/og.jpg';
    const res = await onRequest({ url: new URL(`http://localhost${ruta}`) }, () => GET(peticio(ruta, '2026', 'pig')));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe(CACHE_RESERVA);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
  });

  it('una sessió inexistent o no publicada és un 404; un altre paràmetre o més d\'un, un 400', async () => {
    ambSessions([sessio({ cartell: ST }), { ...sessio({ cartell: ST }), id: 'x', slug: 'oculta', publicada: false }]);
    expect((await GET(peticio('/programacio/2026/no-hi-es/og.jpg', '2026', 'no-hi-es'))).status).toBe(404);
    expect((await GET(peticio('/programacio/2026/oculta/og.jpg', '2026', 'oculta'))).status).toBe(404);
    expect((await GET(peticio('/programacio/2025/pig/og.jpg', '2025', 'pig'))).status).toBe(404);
    expect((await GET(peticio('/programacio/2026/pig/og.jpg?x=1', '2026', 'pig'))).status).toBe(400);
    expect((await GET(peticio(`/programacio/2026/pig/og.jpg${v(ST)}&v=2`, '2026', 'pig'))).status).toBe(400);
  });

  it('sense versió, amb una d\'antiga o amb una altra forma del camí: 301 a l\'adreça actual', async () => {
    ambSessions([sessio({ cartell: ST })]);
    for (const ruta of ['/programacio/2026/pig/og.jpg', '/programacio/2026/pig/og.jpg?v=antiga', `/programacio/2026/%70ig/og.jpg${v(ST)}`]) {
      const res = await GET(peticio(ruta, '2026', 'pig'));
      expect(res.status, ruta).toBe(301);
      expect(res.headers.get('Location'), ruta).toBe(`/programacio/2026/pig/og.jpg${v(ST)}`);
    }
    expect(llegirStorageMock).not.toHaveBeenCalled();
  });

  it('slug amb accents: l\'adreça canònica és la percent-encoded', async () => {
    const accents = sessio({ cartell: ST }, { slug: 'pàtria' });
    ambSessions([accents]);
    llegirStorageMock.mockResolvedValue(await cartell());
    const cami = camiOgSessio(accents);
    expect(cami).toBe(`/programacio/2026/p%C3%A0tria/og.jpg${v(ST)}`);
    expect((await GET(peticio(cami, '2026', 'pàtria'))).status).toBe(200);
    // `new URL` ja codifica els accents d'un camí literal: és la mateixa adreça.
    expect((await GET(peticio(`/programacio/2026/pàtria/og.jpg${v(ST)}`, '2026', 'pàtria'))).status).toBe(200);
  });

  it('genera un sol cop per versió del document: les peticions simultànies comparteixen la generació', async () => {
    ambSessions([sessio({ cartell: ST }, { modificadaEl: '2026-10-01T00:00:00.000Z' })]);
    llegirStorageMock.mockImplementation(async () => cartell());
    const ruta = `/programacio/2026/pig/og.jpg${v(ST)}`;
    const respostes = await Promise.all([1, 2, 3].map(() => GET(peticio(ruta, '2026', 'pig'))));
    expect(respostes.map((r) => r.status)).toEqual([200, 200, 200]);
    await GET(peticio(ruta, '2026', 'pig'));
    expect(llegirStorageMock).toHaveBeenCalledTimes(1);
  });

  it('una fallada no es queda a la memòria: la petició següent ho torna a provar', async () => {
    ambSessions([sessio({ cartell: ST })]);
    llegirStorageMock.mockResolvedValueOnce(null);
    fetchMock.mockResolvedValueOnce(new Response('x', { status: 500 }));
    const ruta = `/programacio/2026/pig/og.jpg${v(ST)}`;
    expect((await GET(peticio(ruta, '2026', 'pig'))).headers.get('Cache-Control')).toBe(CACHE_RESERVA);
    llegirStorageMock.mockResolvedValue(await cartell());
    expect((await GET(peticio(ruta, '2026', 'pig'))).headers.get('Cache-Control')).toContain('s-maxage=86400');
  });
});
