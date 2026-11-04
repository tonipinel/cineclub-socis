import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CACHE_OK } from '../src/lib/cache.js';

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock('../src/lib/db.js', async (original) => ({ ...(await original()), getDb: getDbMock }));

const { GET } = await import('../src/pages/flyer/[id]/flyer.pdf.js');

const PDF = Buffer.from('%PDF-1.4 simple');
const PDF_IMPREMTA = Buffer.from('%PDF-1.4 impremta');
const URL_SIMPLE = 'https://firebasestorage.googleapis.com/v0/b/b/o/flyers%2Ff1%2Fflyer-simple.pdf?alt=media&token=TOKEN-SIMPLE';
const URL_IMPREMTA = 'https://firebasestorage.googleapis.com/v0/b/b/o/flyers%2Ff1%2Fflyer-impremta.pdf?alt=media&token=TOKEN-IMPREMTA';
// `sessionsIds`: les sessions pintades al PDF (les desa la funció).
const PDFS = { simple: { path: 'flyers/f1/flyer-simple.pdf', url: URL_SIMPLE, sessionsIds: ['s1'] }, impremta: { path: 'flyers/f1/flyer-impremta.pdf', url: URL_IMPREMTA, sessionsIds: ['s1'] } };
// Flyer actiu: publicat i amb la sessió `s1` publicada.
const ACTIU = { estat: 'publicat', clauPrevia: 'k', sessionsIds: ['s1'] };
const S1 = { id: 's1', publicada: true };

let fetchMock;
// `sessions`: els documents de `sessions` que existeixen ({ id, publicada }).
const ambFlyer = (dades, sessions = [S1]) => getDbMock.mockReturnValue({
  collection: (nom) => ({
    doc: (id) => ({
      get: async () => {
        const d = nom === 'flyers' ? dades : sessions.find((s) => s.id === id);
        return { exists: Boolean(d), id, data: () => d };
      },
    }),
  }),
  getAll: async (...refs) => Promise.all(refs.map((r) => r.get())),
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
    ambFlyer({ ...ACTIU, pdfs: PDFS });
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
    ambFlyer({ ...ACTIU, pdfs: PDFS });
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
      ambFlyer({ ...ACTIU, clauPrevia, pdfs: PDFS });
      expect((await demana('?variant=impremta&clau=')).status).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sense PDF generat: 404 amb missatge i no-store (però un esborrany sense clau no ho revela)', async () => {
    ambFlyer({ ...ACTIU });
    const res = await demana();
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('El PDF encara s\'està preparant');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    ambFlyer({ ...ACTIU, pdfs: { simple: { path: PDFS.simple.path } } });
    expect((await demana()).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    ambFlyer({ ...ACTIU, pdfs: { simple: PDFS.simple } });
    expect((await demana('?variant=impremta&clau=k')).status).toBe(404);
    ambFlyer({ estat: 'esborrany', clauPrevia: 'k' });
    expect(await (await demana()).text()).toBe('Not found');
  });

  it('la descàrrega no és OK: 404 amb el missatge i no-store; només es registra l\'id i l\'estat', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const resposta = new Response('denied', { status: 403 });
    const cancel = vi.spyOn(resposta.body, 'cancel');
    fetchMock.mockResolvedValue(resposta);
    ambFlyer({ ...ACTIU, pdfs: PDFS });
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
    ambFlyer({ ...ACTIU, pdfs: PDFS });
    const res = await demana();
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('El PDF encara s\'està preparant');
    expect(JSON.stringify(error.mock.calls)).not.toContain('TOKEN-');
    error.mockRestore();
  });

  it('timeout/abort del fetch: 404 amable i només es registra l\'id', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockRejectedValue(new DOMException('The operation was aborted', 'TimeoutError'));
    ambFlyer({ ...ACTIU, pdfs: PDFS });
    const res = await demana();
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('El PDF encara s\'està preparant');
    expect(error.mock.calls).toEqual([['no s\'ha pogut llegir el PDF del flyer', 'f1']]);
    error.mockRestore();
  });

  it('una URL d\'un altre origen o prefix no es descarrega', async () => {
    for (const url of ['https://evil.test/v0/b/b/o/x?token=TOKEN-X', 'http://firebasestorage.googleapis.com/v0/b/b/o/x', 'https://firebasestorage.googleapis.com.evil.test/v0/b/b/o/x', 'https://firebasestorage.googleapis.com/other', 42]) {
      ambFlyer({ ...ACTIU, pdfs: { simple: { path: 'p', url } } });
      const res = await demana();
      expect(res.status).toBe(404);
      expect(await res.text()).toBe('El PDF encara s\'està preparant');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('publicat amb una sessió sense publicar o esborrada (no actiu): el 404 d\'un esborrany sense clau; amb la clau 200 i no-store', async () => {
    const sessions = [{ id: 's1', publicada: true }, { id: 's2', publicada: false }];
    for (const sessionsIds of [['s1', 's2'], ['s1', 'esborrada']]) {
      ambFlyer({ ...ACTIU, sessionsIds, pdfs: PDFS }, sessions);
      for (const consulta of ['', '?clau=', '?clau=x', '?variant=simple']) {
        const res = await demana(consulta);
        expect(res.status).toBe(404);
        expect(await res.text()).toBe('Not found');
      }
      expect(fetchMock).not.toHaveBeenCalled();
      const res = await demana('?clau=k');
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      fetchMock.mockClear();
    }
  });

  it('publicat amb totes les sessions publicades (actiu): 200 sense clau i caché pública', async () => {
    ambFlyer({ ...ACTIU, sessionsIds: ['s1', 's2'], pdfs: PDFS }, [{ id: 's1', publicada: true }, { id: 's2', publicada: true }]);
    const res = await demana();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe(CACHE_OK);
  });

  it('amb una clau vàlida la resposta és no-store encara que el flyer sigui actiu', async () => {
    ambFlyer({ ...ACTIU, pdfs: PDFS });
    const res = await demana('?clau=k');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('un PDF pintat amb una sessió que ja no és del flyer no se serveix sense clau fins que es regeneri', async () => {
    const pintat = (sessionsIds) => ({ simple: { ...PDFS.simple, sessionsIds } });
    const sessions = [S1, { id: 's2', publicada: true }, { id: 's3', publicada: true }];
    // Esborrany [s1, s2, d] amb d sense publicar; l'admin treu d (o la canvia per s3) i publica: el PDF desat encara porta d.
    for (const sessionsIds of [['s1', 's2'], ['s1', 's2', 's3']]) {
      ambFlyer({ ...ACTIU, sessionsIds, pdfs: pintat(['s1', 's2', 'd']) }, sessions);
      const res = await demana();
      expect(res.status).toBe(404);
      expect(await res.text()).toBe('El PDF encara s\'està preparant');
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(fetchMock).not.toHaveBeenCalled();
      // amb la clau es continua servint
      expect((await demana('?clau=k')).status).toBe(200);
      fetchMock.mockClear();
      // regenerat amb les sessions actuals: se serveix
      ambFlyer({ ...ACTIU, sessionsIds, pdfs: pintat(sessionsIds) }, sessions);
      expect((await demana()).status).toBe(200);
      fetchMock.mockClear();
    }
  });

  it('un PDF antic sense sessionsIds no se serveix sense clau (sí amb la clau)', async () => {
    ambFlyer({ ...ACTIU, pdfs: { simple: { path: PDFS.simple.path, url: URL_SIMPLE } } });
    const res = await demana();
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('El PDF encara s\'està preparant');
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await demana('?clau=k')).status).toBe(200);
  });

  it('flyer inexistent: 404', async () => {
    ambFlyer(null);
    const res = await demana();
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('Not found');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
