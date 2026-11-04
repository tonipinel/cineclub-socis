import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CACHE_OK } from '../src/lib/cache.js';

const { getDbMock, getBucketMock } = vi.hoisted(() => ({ getDbMock: vi.fn(), getBucketMock: vi.fn() }));
vi.mock('../src/lib/db.js', async (original) => ({ ...(await original()), getDb: getDbMock }));
vi.mock('../src/lib/storage.js', () => ({ getBucket: getBucketMock }));

const { GET } = await import('../src/pages/flyer/[id]/flyer.pdf.js');

const PDF = Buffer.from('%PDF-1.4 simple');
const PDF_IMPREMTA = Buffer.from('%PDF-1.4 impremta');
const PDFS = { simple: { path: 'flyers/f1/flyer-simple.pdf' }, impremta: { path: 'flyers/f1/flyer-impremta.pdf' } };

let file;
const ambFlyer = (dades) => getDbMock.mockReturnValue({
  collection: () => ({ doc: (id) => ({ get: async () => ({ exists: Boolean(dades), id, data: () => dades }) }) }),
});
const demana = (consulta = '') => GET({ params: { id: 'f1' }, url: new URL(`http://localhost/flyer/f1/flyer.pdf${consulta}`) });

beforeEach(() => {
  getDbMock.mockReset();
  getBucketMock.mockReset();
  file = vi.fn((cami) => ({ download: async () => [cami === PDFS.impremta.path ? PDF_IMPREMTA : PDF] }));
  getBucketMock.mockReturnValue({ file });
});

describe('GET /flyer/<id>/flyer.pdf', () => {
  it('publicat: serveix el PDF simple amb les capçaleres i caché pública', async () => {
    ambFlyer({ estat: 'publicat', clauPrevia: 'k', pdfs: PDFS });
    const res = await demana();
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer())).toEqual(PDF);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toBe('inline; filename="flyer-cineclub.pdf"');
    expect(res.headers.get('Cache-Control')).toBe(CACHE_OK);
    expect(file).toHaveBeenCalledWith(PDFS.simple.path);
  });

  it('impremta: sense clau 404 (ni toca Storage); amb la clau 200 i no-store', async () => {
    ambFlyer({ estat: 'publicat', clauPrevia: 'k', pdfs: PDFS });
    expect((await demana('?variant=impremta')).status).toBe(404);
    expect((await demana('?variant=impremta&clau=x')).status).toBe(404);
    expect(file).not.toHaveBeenCalled();
    const res = await demana('?variant=impremta&clau=k');
    expect(res.status).toBe(200);
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
    expect(file).not.toHaveBeenCalled();
  });

  it('sense PDF generat: 404 amb missatge i no-store (però un esborrany sense clau no ho revela)', async () => {
    ambFlyer({ estat: 'publicat', clauPrevia: 'k' });
    const res = await demana();
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('El PDF encara s\'està preparant');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    ambFlyer({ estat: 'publicat', clauPrevia: 'k', pdfs: { simple: PDFS.simple } });
    expect((await demana('?variant=impremta&clau=k')).status).toBe(404);
    ambFlyer({ estat: 'esborrany', clauPrevia: 'k' });
    expect(await (await demana()).text()).toBe('Not found');
  });

  it('el fitxer no és a Storage (download falla): 404 amb el missatge i no-store, sense llançar', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    file.mockReturnValue({ download: async () => { throw new Error('No such object'); } });
    ambFlyer({ estat: 'publicat', clauPrevia: 'k', pdfs: PDFS });
    const res = await demana();
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('El PDF encara s\'està preparant');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('flyer inexistent: 404', async () => {
    ambFlyer(null);
    const res = await demana();
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('Not found');
    expect(file).not.toHaveBeenCalled();
  });
});
