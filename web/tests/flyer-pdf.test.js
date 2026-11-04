import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CACHE_OK } from '../src/lib/cache.js';

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock('../src/lib/db.js', async (original) => ({ ...(await original()), getDb: getDbMock }));

const { GET } = await import('../src/pages/flyer/[id]/flyer.pdf.js');

const PDF = Buffer.from('%PDF-1.4 simple');
const PDF_IMPREMTA = Buffer.from('%PDF-1.4 impremta');
const URL_SIMPLE = 'https://firebasestorage.googleapis.com/v0/b/b/o/flyers%2Ff1%2Fflyer-simple.pdf?alt=media&token=TOKEN-SIMPLE';
const URL_IMPREMTA = 'https://firebasestorage.googleapis.com/v0/b/b/o/flyers%2Ff1%2Fflyer-impremta.pdf?alt=media&token=TOKEN-IMPREMTA';
const PDFS = { simple: { path: 'flyers/f1/flyer-simple.pdf', url: URL_SIMPLE }, impremta: { path: 'flyers/f1/flyer-impremta.pdf', url: URL_IMPREMTA } };

let fetchMock;
const ambFlyer = (dades) => getDbMock.mockReturnValue({
  collection: () => ({ doc: (id) => ({ get: async () => ({ exists: Boolean(dades), id, data: () => dades }) }) }),
});
const demana = (consulta = '') => GET({ params: { id: 'f1' }, url: new URL(`http://localhost/flyer/f1/flyer.pdf${consulta}`) });

beforeEach(() => {
  getDbMock.mockReset();
  fetchMock = vi.fn(async (u) => new Response(u === URL_IMPREMTA ? PDF_IMPREMTA : PDF, { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

const senseToken = async (res) => {
  const text = `${await res.clone().text()} ${[...res.headers].join(' ')}`;
  expect(text).not.toContain('TOKEN-');
  expect(text).not.toContain('firebasestorage');
  expect(res.headers.get('Location')).toBeNull();
};

describe('GET /flyer/<id>/flyer.pdf', () => {
  it('publicat: serveix el PDF simple amb les capçaleres i caché pública', async () => {
    ambFlyer({ estat: 'publicat', clauPrevia: 'k', pdfs: PDFS });
    const res = await demana();
    expect(res.status).toBe(200);
    await senseToken(res);
    expect(Buffer.from(await res.arrayBuffer())).toEqual(PDF);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toBe('inline; filename="flyer-cineclub.pdf"');
    expect(res.headers.get('Cache-Control')).toBe(CACHE_OK);
    expect(fetchMock).toHaveBeenCalledWith(URL_SIMPLE, { redirect: 'error', signal: expect.any(AbortSignal) });
  });

  it('impremta: sense clau 404 (ni descarrega res); amb la clau 200 i no-store', async () => {
    ambFlyer({ estat: 'publicat', clauPrevia: 'k', pdfs: PDFS });
    expect((await demana('?variant=impremta')).status).toBe(404);
    expect((await demana('?variant=impremta&clau=x')).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    const res = await demana('?variant=impremta&clau=k');
    expect(res.status).toBe(200);
    await senseToken(res);
    expect(Buffer.from(await res.arrayBuffer())).toEqual(PDF_IMPREMTA);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('esborrany: sense clau 404; amb la clau 200 i no-store', async () => {
    ambFlyer({ estat: 'esborrany', clauPrevia: 'k', pdfs: PDFS });
    const sense = await demana();
    expect(sense.status).toBe(404);
    expect(await sense.text()).toBe('Not found');
    expect((await demana('?clau=x')).status).toBe(404);
    const res = await demana('?clau=k');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('clau buida contra clauPrevia buida o absent: 404', async () => {
    for (const clauPrevia of ['', undefined]) {
      ambFlyer({ estat: 'esborrany', clauPrevia, pdfs: PDFS });
      expect((await demana('?clau=')).status).toBe(404);
      expect((await demana()).status).toBe(404);
      ambFlyer({ estat: 'publicat', clauPrevia, pdfs: PDFS });
      expect((await demana('?variant=impremta&clau=')).status).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sense PDF generat: 404 amb missatge i no-store (però un esborrany sense clau no ho revela)', async () => {
    ambFlyer({ estat: 'publicat', clauPrevia: 'k' });
    const res = await demana();
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('El PDF encara s\'està preparant');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    ambFlyer({ estat: 'publicat', clauPrevia: 'k', pdfs: { simple: { path: PDFS.simple.path } } });
    expect((await demana()).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    ambFlyer({ estat: 'publicat', clauPrevia: 'k', pdfs: { simple: PDFS.simple } });
    expect((await demana('?variant=impremta&clau=k')).status).toBe(404);
    ambFlyer({ estat: 'esborrany', clauPrevia: 'k' });
    expect(await (await demana()).text()).toBe('Not found');
  });

  it('la descàrrega no és OK: 404 amb el missatge i no-store; només es registra l\'id i l\'estat', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const resposta = new Response('denied', { status: 403 });
    const cancel = vi.spyOn(resposta.body, 'cancel');
    fetchMock.mockResolvedValue(resposta);
    ambFlyer({ estat: 'publicat', clauPrevia: 'k', pdfs: PDFS });
    const res = await demana();
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('El PDF encara s\'està preparant');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(error.mock.calls)).not.toContain('TOKEN-');
    expect(error.mock.calls[0]).toContain(403);
    expect(cancel).toHaveBeenCalled();
    error.mockRestore();
  });

  it('el fetch llança: 404 amb el missatge, sense registrar l\'error (porta la URL)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error(`fallit ${URL_SIMPLE}`));
    ambFlyer({ estat: 'publicat', clauPrevia: 'k', pdfs: PDFS });
    const res = await demana();
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('El PDF encara s\'està preparant');
    expect(JSON.stringify(error.mock.calls)).not.toContain('TOKEN-');
    error.mockRestore();
  });

  it('timeout/abort del fetch: 404 amable i només es registra l\'id', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockRejectedValue(new DOMException('The operation was aborted', 'TimeoutError'));
    ambFlyer({ estat: 'publicat', clauPrevia: 'k', pdfs: PDFS });
    const res = await demana();
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('El PDF encara s\'està preparant');
    expect(error.mock.calls).toEqual([['no s\'ha pogut llegir el PDF del flyer', 'f1']]);
    error.mockRestore();
  });

  it('una URL d\'un altre origen o prefix no es descarrega', async () => {
    for (const url of ['https://evil.test/v0/b/b/o/x?token=TOKEN-X', 'http://firebasestorage.googleapis.com/v0/b/b/o/x', 'https://firebasestorage.googleapis.com.evil.test/v0/b/b/o/x', 'https://firebasestorage.googleapis.com/other', 42]) {
      ambFlyer({ estat: 'publicat', clauPrevia: 'k', pdfs: { simple: { path: 'p', url } } });
      const res = await demana();
      expect(res.status).toBe(404);
      expect(await res.text()).toBe('El PDF encara s\'està preparant');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('flyer inexistent: 404', async () => {
    ambFlyer(null);
    const res = await demana();
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('Not found');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
