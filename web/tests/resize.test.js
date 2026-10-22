import { describe, it, expect, vi, afterEach } from 'vitest';
import sharp from 'sharp';
import { resizeRequest, toWebp, fetchImage } from '../src/lib/resize.js';
import { STORAGE_PREFIX } from '../src/lib/images.js';
import { GET } from '../src/pages/api/img.webp.js';

const SRC = `${STORAGE_PREFIX}sessions%2Fpig%2Fposter.jpg?alt=media`;
const params = (u, w) => new URLSearchParams({ u, w: String(w) });

describe('resizeRequest', () => {
  it('accepta fitxers de Storage amb un ample fix', () => {
    expect(resizeRequest(params(SRC, 400))).toEqual({ url: SRC, width: 400 });
  });
  it('rebutja altres hosts, altres buckets, altres carpetes i amples lliures', () => {
    expect(resizeRequest(params('https://exemple.cat/a.jpg', 400))).toBe(null);
    expect(resizeRequest(params('https://firebasestorage.googleapis.com/v0/b/altre.appspot.com/o/web%2Fa.jpg', 400))).toBe(null);
    expect(resizeRequest(params('https://firebasestorage.googleapis.com/v0/b/cineclub-socis.firebasestorage.app/o/factures%2Fa.pdf', 400))).toBe(null);
    expect(resizeRequest(params(SRC, 401))).toBe(null);
    expect(resizeRequest(new URLSearchParams())).toBe(null);
  });
  it('rebutja els segments de punt (`..`, `%2e`) i els amagats dins del nom de l\'objecte', () => {
    const origen = 'https://firebasestorage.googleapis.com/v0/b/cineclub-socis.firebasestorage.app/o/';
    expect(resizeRequest(params(`${origen}web%2F/../factures%2Fa.pdf`, 400))).toBe(null);
    expect(resizeRequest(params(`${origen}web%2F/%2e%2e/factures%2Fa.pdf`, 400))).toBe(null);
    expect(resizeRequest(params(`${origen}web%2F%2e%2e%2Ffactures%2Fa.pdf`, 400))).toBe(null);
    expect(resizeRequest(params(`${origen}web%2F..%2Ffactures%2Fa.pdf?alt=media`, 400))).toBe(null);
    expect(resizeRequest(params(`${origen}web%2Fsessions%2F.%2Fa.jpg`, 400))).toBe(null);
  });
  it('rebutja altres hosts disfressats (credencials, port, esquema)', () => {
    const [, resta] = SRC.split('https://firebasestorage.googleapis.com');
    expect(resizeRequest(params(`https://firebasestorage.googleapis.com@exemple.cat${resta}`, 400))).toBe(null);
    expect(resizeRequest(params(`https://firebasestorage.googleapis.com.exemple.cat${resta}`, 400))).toBe(null);
    expect(resizeRequest(params(`https://firebasestorage.googleapis.com:8443${resta}`, 400))).toBe(null);
    expect(resizeRequest(params(`http://firebasestorage.googleapis.com${resta}`, 400))).toBe(null);
  });
  it('retorna l\'adreça normalitzada, sense salts de línia ni tabuladors', () => {
    const peticio = resizeRequest(params(`${SRC.replace('poster', 'po\nster')}\t`, 400));
    expect(peticio.url).toBe(SRC);
    expect(peticio.url).not.toMatch(/[\r\n\t]/);
  });
});

describe('resizeRequest: ample i adreça estrictes', () => {
  const amb = (w) => resizeRequest(new URLSearchParams({ u: SRC, w }));
  it('l\'ample ha de ser només xifres', () => {
    for (const w of [' 400', '400 ', '0x190', '4e2', '400.0', '+400', '-400', '0400', '']) expect(amb(w)).toBe(null);
    expect(amb('400')).toEqual({ url: SRC, width: 400 });
  });
  it('només accepta l\'adreça canònica: `?alt=media`, sense `token`, fragment ni altres paràmetres', () => {
    const origen = `${STORAGE_PREFIX}sessions%2Fpig%2Fposter.jpg`;
    expect(resizeRequest(params(`${origen}?alt=media&token=t-1`, 400))).toBe(null);
    expect(resizeRequest(params(`${origen}?alt=media&evil=1`, 400))).toBe(null);
    expect(resizeRequest(params(`${origen}?alt=media#frag`, 400))).toBe(null);
    expect(resizeRequest(params(`${origen}?evil=1`, 400))).toBe(null);
    expect(resizeRequest(params(origen, 400))).toBe(null);
    expect(resizeRequest(params(`${origen}?alt=media`, 400)).url).toBe(`${origen}?alt=media`);
  });
  it('els paràmetres de la petició són exactament `w` i `u`, sense extres ni repetits', () => {
    const base = () => new URLSearchParams({ u: SRC, w: '400' });
    expect(resizeRequest(base())).toEqual({ url: SRC, width: 400 });
    const extra = base();
    extra.set('v', '1');
    expect(resizeRequest(extra)).toBe(null);
    const repetit = base();
    repetit.append('w', '400');
    expect(resizeRequest(repetit)).toBe(null);
    const repetitU = base();
    repetitU.append('u', SRC);
    expect(resizeRequest(repetitU)).toBe(null);
  });
});

describe('toWebp: límits i formats', () => {
  it('limita la concurrència de sharp a un fil', async () => {
    const petita = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).png().toBuffer();
    await toWebp(petita, 160);
    expect(sharp.concurrency()).toBe(1);
  });
  it('rebutja una imatge que passa del límit de píxels', async () => {
    const gran = await sharp({ create: { width: 6500, height: 6500, channels: 3, background: '#000' } }).png({ compressionLevel: 9 }).toBuffer();
    await expect(toWebp(gran, 400)).rejects.toThrow();
  });
  it('rebutja un SVG encara que arribi com a ràster', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    await expect(toWebp(svg, 400)).rejects.toThrow(/format/i);
  });
});

describe('toWebp', () => {
  const jpeg = (width, height) => sharp({ create: { width, height, channels: 3, background: '#c00' } }).jpeg().toBuffer();
  it('redueix a l\'ample mantenint la proporció', async () => {
    const meta = await sharp(await toWebp(await jpeg(2600, 1300), 800)).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 800, 400]);
  });
  it('no amplia una imatge petita', async () => {
    const meta = await sharp(await toWebp(await jpeg(300, 200), 1400)).metadata();
    expect(meta.width).toBe(300);
  });
});

describe('fetchImage', () => {
  const resposta = (cos, headers, status = 200) => async () => new Response(cos, { status, headers });
  const jpeg = { 'content-type': 'image/jpeg' };
  const flux = (trossos) => new ReadableStream({
    start(c) { trossos.forEach((t) => c.enqueue(t)); c.close(); },
  });

  it('retorna els bytes d\'una imatge', async () => {
    const buf = await fetchImage(SRC, resposta(new Uint8Array([1, 2]), jpeg));
    expect([...buf]).toEqual([1, 2]);
  });
  it('rebutja errors i respostes que no són imatge', async () => {
    expect(await fetchImage(SRC, resposta('x', jpeg, 404))).toBe(null);
    expect(await fetchImage(SRC, resposta('x', { 'content-type': 'text/html' }))).toBe(null);
    expect(await fetchImage(SRC, resposta('x', {}))).toBe(null);
  });
  it('només accepta imatges ràster (cap SVG), també amb paràmetres al content-type', async () => {
    for (const tipus of ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'IMAGE/PNG; charset=binary']) {
      expect(await fetchImage(SRC, resposta('x', { 'content-type': tipus }))).not.toBe(null);
    }
    expect(await fetchImage(SRC, resposta('<svg/>', { 'content-type': 'image/svg+xml' }))).toBe(null);
    expect(await fetchImage(SRC, resposta('x', { 'content-type': 'image/tiff' }))).toBe(null);
  });
  it('rebutja el content-length declarat de més de 40 MB', async () => {
    const gran = String(41 * 1024 * 1024);
    expect(await fetchImage(SRC, resposta('x', { ...jpeg, 'content-length': gran }))).toBe(null);
  });
  it('talla en llegir el flux si no hi ha content-length o és mentida', async () => {
    const tros = new Uint8Array(1024 * 1024);
    const gran = () => flux(Array.from({ length: 41 }, () => tros));
    expect(await fetchImage(SRC, resposta(gran(), jpeg))).toBe(null);
    expect(await fetchImage(SRC, resposta(gran(), { ...jpeg, 'content-length': '10' }))).toBe(null);
    expect((await fetchImage(SRC, resposta(flux([tros, tros]), jpeg))).length).toBe(2 * 1024 * 1024);
  });
  it('no segueix les redireccions i té temps màxim', async () => {
    let opcions;
    await fetchImage(SRC, async (url, o) => { opcions = o; return new Response('x', { headers: jpeg }); });
    expect(opcions.redirect).toBe('error');
    expect(opcions.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('GET /api/img.webp', () => {
  const crida = (u, w = 400) => GET({ url: new URL(`https://web.exemple/api/img.webp?w=${w}&u=${encodeURIComponent(u)}`) });
  afterEach(() => vi.unstubAllGlobals());

  it('respon 400 si la imatge no és del nostre Storage', async () => {
    expect((await crida('https://exemple.cat/a.jpg')).status).toBe(400);
  });
  it('serveix WebP amb caché llarga', async () => {
    const original = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#c00' } }).jpeg().toBuffer();
    vi.stubGlobal('fetch', async () => new Response(original, { headers: { 'content-type': 'image/jpeg' } }));
    const res = await crida(SRC);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('cache-control')).toContain('immutable');
    expect((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).width).toBe(400);
  });
  it('redirigeix a l\'original quan no es pot redimensionar', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('xarxa'); });
    const res = await crida(SRC);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(SRC);
  });
  it('un SVG servit com a imatge no es processa: redirigeix a l\'original', async () => {
    vi.stubGlobal('fetch', async () => new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', { headers: { 'content-type': 'image/png' } }));
    const res = await crida(SRC);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(SRC);
  });
  it('un valor `u` amb salts de línia no fa caure l\'endpoint', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('xarxa'); });
    const res = await crida(`${SRC}%0Ainjectat: 1`);
    expect([302, 400]).toContain(res.status);
    if (res.status === 302) expect(res.headers.get('location')).not.toMatch(/[\r\n]/);
  });
});
