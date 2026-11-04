import { describe, it, expect, vi } from 'vitest';
import flyers from './flyers.js';

const { firmaFlyer, calGenerar, regenerarFlyer, urlImpressio, gestionarFlyerEscrit, gestionarSessioEscrita } = flyers;

const sessio = (id, extra = {}) => ({
  id, publicada: true, data: '2026-12-01', hora: '20:00',
  publica: { titol: `Peli ${id}`, titolTraduit: 'T', versioTipus: 'vose', idioma: 'fr', generes: ['drama'], cartell: 'c.jpg' },
  ...extra,
});
const flyer = { nom: 'Desembre', sessionsIds: ['a', 'b'], clauPrevia: 'secret' };
const sessions = [sessio('a'), sessio('b', { data: '2026-12-08' })];

describe('firmaFlyer', () => {
  it('és estable per a les mateixes dades', () => {
    expect(firmaFlyer(flyer, sessions)).toBe(firmaFlyer({ ...flyer }, structuredClone(sessions)));
  });

  it('canvia en canviar la data d\'una sessió', () => {
    const canviades = [sessions[0], { ...sessions[1], data: '2026-12-09' }];
    expect(firmaFlyer(flyer, canviades)).not.toBe(firmaFlyer(flyer, sessions));
  });

  it('canvia en canviar el nom o un camp imprès de la sessió', () => {
    const base = firmaFlyer(flyer, sessions);
    expect(firmaFlyer({ ...flyer, nom: 'Gener' }, sessions)).not.toBe(base);
    const cartell = [{ ...sessions[0], publica: { ...sessions[0].publica, cartell: 'altre.jpg' } }, sessions[1]];
    expect(firmaFlyer(flyer, cartell)).not.toBe(base);
  });

  it('no canvia amb un camp que no hi surt', () => {
    const base = firmaFlyer(flyer, sessions);
    expect(firmaFlyer({ ...flyer, desde: 'x', clauPrevia: 'altra', estat: 'publicat' }, sessions)).toBe(base);
    const altres = [{ ...sessions[0], aforament: 80, publica: { ...sessions[0].publica, sinopsi: 'hola' } }, sessions[1]];
    expect(firmaFlyer(flyer, altres)).toBe(base);
  });

  it('canvia amb el titol i el slug de la sessió', () => {
    const base = firmaFlyer(flyer, sessions);
    expect(firmaFlyer(flyer, [{ ...sessions[0], titol: 'Nou' }, sessions[1]])).not.toBe(base);
    expect(firmaFlyer(flyer, [{ ...sessions[0], slug: 'nou' }, sessions[1]])).not.toBe(base);
  });

  it('una sessió despublicada canvia la signatura', () => {
    const despublicades = [sessions[0], { ...sessions[1], publicada: false }];
    expect(firmaFlyer(flyer, despublicades)).not.toBe(firmaFlyer(flyer, sessions));
  });
});

describe('calGenerar', () => {
  it('és false si només canvia pdfs o actualitzatEl', () => {
    expect(calGenerar(flyer, { ...flyer, pdfs: { simple: { firma: 'x' } } })).toBe(false);
    expect(calGenerar({ ...flyer, pdfs: { simple: { firma: 'x' } } }, { ...flyer, pdfs: { simple: { firma: 'y' } }, actualitzatEl: 1 })).toBe(false);
  });

  it('és true en crear-se o canviar qualsevol altre camp', () => {
    expect(calGenerar(null, flyer)).toBe(true);
    expect(calGenerar(flyer, { ...flyer, nom: 'Altre' })).toBe(true);
    expect(calGenerar(flyer, { ...flyer, sessionsIds: ['a'] })).toBe(true);
  });

  it('és false si el flyer s\'esborra', () => {
    expect(calGenerar(flyer, null)).toBe(false);
  });
});

function entorn({ flyerDades = flyer, sessionsDades = sessions } = {}) {
  const update = vi.fn().mockResolvedValue();
  const save = vi.fn().mockResolvedValue();
  const docs = Object.fromEntries(sessionsDades.map(({ id, ...d }) => [id, d]));
  const db = {
    collection: (nom) => ({
      doc: (id) => ({
        get: async () => {
          const dades = nom === 'flyers' ? flyerDades : docs[id];
          return { exists: !!dades, data: () => dades };
        },
        update,
      }),
    }),
  };
  const bucket = { file: vi.fn(() => ({ save })) };
  const renderPdf = vi.fn().mockResolvedValue(Buffer.from('pdf'));
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { db, bucket, renderPdf, logger, update, save };
}

describe('regenerarFlyer', () => {
  it('no fa res si les signatures coincideixen', async () => {
    const firma = firmaFlyer(flyer, sessions);
    const e = entorn({ flyerDades: { ...flyer, pdfs: { simple: { firma }, impremta: { firma } } } });
    await regenerarFlyer({ id: 'f1', ...e });
    expect(e.renderPdf).not.toHaveBeenCalled();
    expect(e.update).not.toHaveBeenCalled();
  });

  it('renderitza una vegada per variant, desa els PDF i escriu pdfs', async () => {
    const e = entorn();
    await regenerarFlyer({ id: 'f1', ...e, urlBase: 'https://web.test', ara: () => 1000 });
    expect(e.renderPdf).toHaveBeenCalledTimes(2);
    const urls = e.renderPdf.mock.calls.map(([u]) => new URL(u));
    expect(urls.map((u) => u.searchParams.get('variant'))).toEqual(['simple', 'impremta']);
    expect(urls[0].origin + urls[0].pathname).toBe('https://web.test/flyer/f1/imprimir/');
    expect(urls[0].searchParams.get('clau')).toBe('secret');
    expect(urls[0].searchParams.get('t')).toBe('1000');
    expect(e.bucket.file.mock.calls.map(([p]) => p)).toEqual(['web/flyers/f1/flyer-simple.pdf', 'web/flyers/f1/flyer-impremta.pdf']);
    expect(e.save).toHaveBeenCalledWith(Buffer.from('pdf'), expect.objectContaining({ contentType: 'application/pdf' }));
    const firma = firmaFlyer(flyer, sessions);
    expect(e.update).toHaveBeenCalledWith({
      pdfs: {
        simple: expect.objectContaining({ path: 'web/flyers/f1/flyer-simple.pdf', firma }),
        impremta: expect.objectContaining({ path: 'web/flyers/f1/flyer-impremta.pdf', firma }),
      },
    });
  });

  it('regenera si només una variant està desactualitzada', async () => {
    const firma = firmaFlyer(flyer, sessions);
    const e = entorn({ flyerDades: { ...flyer, pdfs: { simple: { firma }, impremta: { firma: 'vella' } } } });
    await regenerarFlyer({ id: 'f1', ...e });
    expect(e.renderPdf).toHaveBeenCalledTimes(2);
  });

  it('una sessió despublicada fa regenerar', async () => {
    const firma = firmaFlyer(flyer, sessions);
    const e = entorn({
      flyerDades: { ...flyer, pdfs: { simple: { firma }, impremta: { firma } } },
      sessionsDades: [sessions[0], { ...sessions[1], publicada: false }],
    });
    await regenerarFlyer({ id: 'f1', ...e });
    expect(e.renderPdf).toHaveBeenCalledTimes(2);
  });

  it('no desa res si el render falla, i no registra la clau', async () => {
    const e = entorn();
    e.renderPdf.mockRejectedValueOnce(new Error('boom'));
    await expect(regenerarFlyer({ id: 'f1', ...e })).rejects.toThrow('render simple fallit');
    expect(e.update).not.toHaveBeenCalled();
    expect(JSON.stringify([e.logger.info.mock.calls, e.logger.error.mock.calls])).not.toContain('secret');
  });

  it('l\'error que surt de regenerarFlyer i el logger no porten la clau ni la URL', async () => {
    const e = entorn();
    e.renderPdf.mockImplementation(async (url) => { throw new Error(`net::ERR_FAILED at ${url}`); });
    const error = await regenerarFlyer({ id: 'f1', ...e }).catch((x) => x);
    expect(error.message).toBe('render simple fallit');
    expect(error.message + String(error.cause ?? '')).not.toContain('secret');
    await gestionarFlyerEscrit({ id: 'f1', abans: null, despres: flyer, regenerar: () => regenerarFlyer({ id: 'f1', ...e }), logger: e.logger });
    expect(e.logger.error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify([e.logger.info.mock.calls, e.logger.warn.mock.calls, e.logger.error.mock.calls])).not.toMatch(/secret|imprimir/);
  });

  it('si les dades canvien durant el render, renderitza de nou i desa la signatura vigent', async () => {
    const v2 = { ...sessions[1], data: '2026-12-09' };
    let lectures = 0;
    const update = vi.fn().mockResolvedValue();
    const db = {
      collection: (nom) => ({
        doc: (id) => ({
          get: async () => {
            if (nom === 'flyers') return { exists: true, data: () => flyer };
            if (id === 'a') return { exists: true, data: () => sessions[0] };
            lectures += 1;
            const { id: _, ...dades } = lectures === 1 ? sessions[1] : v2; // eslint-disable-line no-unused-vars
            return { exists: true, data: () => dades };
          },
          update,
        }),
      }),
    };
    const e = entorn();
    await regenerarFlyer({ id: 'f1', db, bucket: e.bucket, renderPdf: e.renderPdf, logger: e.logger });
    expect(e.renderPdf).toHaveBeenCalledTimes(4);
    expect(e.save).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledTimes(1);
    const firmaV2 = firmaFlyer(flyer, [sessions[0], v2]);
    expect(update.mock.calls[0][0].pdfs.simple.firma).toBe(firmaV2);
    expect(update.mock.calls[0][0].pdfs.impremta.firma).toBe(firmaV2);
  });

  it('si no deixa de canviar, no desa res i avisa', async () => {
    let n = 0;
    const update = vi.fn();
    const db = {
      collection: (nom) => ({
        doc: (id) => ({
          get: async () => (nom === 'flyers'
            ? { exists: true, data: () => flyer }
            : { exists: true, data: () => ({ ...sessions[0], id: undefined, data: `d${id}${n += 1}` }) }),
          update,
        }),
      }),
    };
    const e = entorn();
    await regenerarFlyer({ id: 'f1', db, bucket: e.bucket, renderPdf: e.renderPdf, logger: e.logger });
    expect(e.save).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(e.logger.warn).toHaveBeenCalledTimes(1);
  });

  it('ignora un flyer que ja no existeix', async () => {
    const e = entorn({ flyerDades: null });
    expect(await regenerarFlyer({ id: 'f1', ...e })).toBeNull();
    expect(e.renderPdf).not.toHaveBeenCalled();
  });
});

describe('urlImpressio', () => {
  it('codifica la clau', () => {
    const url = urlImpressio({ urlBase: 'https://x', id: 'f', variant: 'simple', clau: 'a&b', ara: 1 });
    expect(new URL(url).searchParams.get('clau')).toBe('a&b');
  });
});

describe('gestors dels disparadors', () => {
  const logger = () => ({ error: vi.fn() });

  it('el del flyer no regenera si només canvia pdfs', async () => {
    const regenerar = vi.fn();
    await gestionarFlyerEscrit({ id: 'f1', abans: flyer, despres: { ...flyer, pdfs: {} }, regenerar, logger: logger() });
    expect(regenerar).not.toHaveBeenCalled();
    await gestionarFlyerEscrit({ id: 'f1', abans: flyer, despres: { ...flyer, nom: 'X' }, regenerar, logger: logger() });
    expect(regenerar).toHaveBeenCalledWith('f1');
  });

  it('el de sessió consulta array-contains i un flyer que falla no atura els altres', async () => {
    const where = vi.fn(() => ({ get: async () => ({ docs: [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }] }) }));
    const db = { collection: vi.fn(() => ({ where })) };
    const regenerar = vi.fn(async (id) => { if (id === 'f2') throw new Error('render simple fallit'); });
    const l = logger();
    await gestionarSessioEscrita({ id: 's9', db, regenerar, logger: l });
    expect(db.collection).toHaveBeenCalledWith('flyers');
    expect(where).toHaveBeenCalledWith('sessionsIds', 'array-contains', 's9');
    expect(regenerar.mock.calls.map(([i]) => i)).toEqual(['f1', 'f2', 'f3']);
    expect(l.error).toHaveBeenCalledTimes(1);
  });
});
