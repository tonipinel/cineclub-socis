import { describe, it, expect, vi } from 'vitest';
import flyers from './flyers.js';

const {
  firmaFlyer, calGenerar, regenerarFlyer, urlImpressio, gestionarFlyerEscrit, gestionarSessioEscrita, VERSIO_DISSENY, camiPdf,
} = flyers;

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

  it('canvia en canviar l\'enquadrament del cartell d\'una sessió; sense enquadrament és com «dalt»', () => {
    const base = firmaFlyer(flyer, sessions);
    expect(firmaFlyer({ ...flyer, enquadraments: { a: 'dalt' } }, sessions)).toBe(base);
    expect(firmaFlyer({ ...flyer, enquadraments: { a: 'xx' } }, sessions)).toBe(base);
    expect(firmaFlyer({ ...flyer, enquadraments: { fora: 'baix' } }, sessions)).toBe(base);
    const centre = firmaFlyer({ ...flyer, enquadraments: { a: 'centre' } }, sessions);
    expect(centre).not.toBe(base);
    expect(firmaFlyer({ ...flyer, enquadraments: { a: 'baix' } }, sessions)).not.toBe(centre);
    expect(firmaFlyer({ ...flyer, enquadraments: { b: 'centre' } }, sessions)).not.toBe(centre);
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

  it('canvia amb la versió del disseny', () => {
    expect(firmaFlyer(flyer, sessions, VERSIO_DISSENY + 1)).not.toBe(firmaFlyer(flyer, sessions));
    expect(firmaFlyer(flyer, sessions, VERSIO_DISSENY)).toBe(firmaFlyer(flyer, sessions));
  });

  it('canvia quan una sessió passa de no publicada a publicada (també amb sessions no publicades)', () => {
    const pendent = [sessions[0], { ...sessions[1], publicada: false }];
    const publicada = [sessions[0], { ...sessions[1], publicada: true }];
    expect(firmaFlyer(flyer, pendent)).not.toBe(firmaFlyer(flyer, publicada));
    expect(firmaFlyer(flyer, pendent)).toBe(firmaFlyer(flyer, structuredClone(pendent)));
  });

  it('una sessió no publicada compta: canviar-ne un camp imprès canvia la signatura', () => {
    const pendent = [sessions[0], { ...sessions[1], publicada: false }];
    const canviada = [sessions[0], { ...sessions[1], publicada: false, data: '2026-12-09' }];
    expect(firmaFlyer(flyer, canviada)).not.toBe(firmaFlyer(flyer, pendent));
  });

  it('canvia amb el preu i la secció de la sessió', () => {
    const base = firmaFlyer(flyer, sessions);
    expect(firmaFlyer(flyer, [{ ...sessions[0], publica: { ...sessions[0].publica, preu: 3 } }, sessions[1]])).not.toBe(base);
    expect(firmaFlyer(flyer, [{ ...sessions[0], publica: { ...sessions[0].publica, seccio: 'infantil' } }, sessions[1]])).not.toBe(base);
  });

  it('no canvia amb els gèneres (no s\'imprimeixen)', () => {
    const base = firmaFlyer(flyer, sessions);
    expect(firmaFlyer(flyer, [{ ...sessions[0], publica: { ...sessions[0].publica, generes: ['comèdia'] } }, sessions[1]])).toBe(base);
  });

  it('segueix l\'ordre del flyer', () => {
    expect(firmaFlyer(flyer, [sessions[1], sessions[0]])).not.toBe(firmaFlyer(flyer, sessions));
  });

  it('canvia amb la distribuïdora de la sessió (id o nom): el seu logo surt a la franja de la cara B', () => {
    const base = firmaFlyer(flyer, sessions);
    expect(firmaFlyer(flyer, [{ ...sessions[0], publica: { ...sessions[0].publica, suportDistribucioId: 'd1' } }, sessions[1]])).not.toBe(base);
    expect(firmaFlyer(flyer, [{ ...sessions[0], publica: { ...sessions[0].publica, suportDistribucio: 'Avalon' } }, sessions[1]])).not.toBe(base);
  });

  it('la versió del disseny és la 6', () => {
    expect(VERSIO_DISSENY).toBe(6);
  });

  it('una sessió despublicada canvia la signatura', () => {
    const despublicades = [sessions[0], { ...sessions[1], publicada: false }];
    expect(firmaFlyer(flyer, despublicades)).not.toBe(firmaFlyer(flyer, sessions));
  });
});

describe('camiPdf', () => {
  it('és fora de web/ (privat)', () => {
    expect(camiPdf('f1', 'simple')).toBe('flyers/f1/flyer-simple.pdf');
    expect(camiPdf('f1', 'impremta').startsWith('web/')).toBe(false);
  });
});

describe('calGenerar', () => {
  it('és false si només canvia pdfsComprovatEl o pdfsError', () => {
    expect(calGenerar(flyer, { ...flyer, pdfsComprovatEl: new Date() })).toBe(false);
    expect(calGenerar(flyer, { ...flyer, pdfsError: { data: new Date(), missatge: 'x' } })).toBe(false);
    expect(calGenerar({ ...flyer, pdfsError: { missatge: 'x' } }, { ...flyer, pdfsError: null })).toBe(false);
  });

  it('és false si només canvia pdfs', () => {
    expect(calGenerar(flyer, { ...flyer, pdfs: { simple: { firma: 'x' } } })).toBe(false);
    expect(calGenerar({ ...flyer, pdfs: { simple: { firma: 'x' } } }, { ...flyer, pdfs: { simple: { firma: 'y' } } })).toBe(false);
  });

  it('és true si només canvia actualitzatEl (Timestamp o Date), false si no canvia', () => {
    const ts = (ms) => ({ toMillis: () => ms });
    expect(calGenerar({ ...flyer, actualitzatEl: ts(1) }, { ...flyer, actualitzatEl: ts(2) })).toBe(true);
    expect(calGenerar({ ...flyer, actualitzatEl: new Date(1) }, { ...flyer, actualitzatEl: new Date(2) })).toBe(true);
    expect(calGenerar(flyer, { ...flyer, actualitzatEl: ts(2) })).toBe(true);
    expect(calGenerar({ ...flyer, actualitzatEl: ts(2) }, { ...flyer, actualitzatEl: ts(2) })).toBe(false);
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
    getAll: (...refs) => Promise.all(refs.map((r) => r.get())),
  };
  const bucket = { name: 'bucket-prova', file: vi.fn(() => ({ save })) };
  const renderPdf = vi.fn().mockResolvedValue(Buffer.from('pdf'));
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { db, bucket, renderPdf, logger, update, save };
}

describe('regenerarFlyer', () => {
  it('no fa res si les signatures coincideixen', async () => {
    const firma = firmaFlyer(flyer, sessions);
    const e = entorn({ flyerDades: { ...flyer, pdfs: { simple: { firma, url: 'u', sessionsIds: ['a', 'b'] }, impremta: { firma, url: 'u', sessionsIds: ['a', 'b'] } } } });
    await regenerarFlyer({ id: 'f1', ...e });
    expect(e.renderPdf).not.toHaveBeenCalled();
    expect(e.update).not.toHaveBeenCalled();
  });

  it('firma vigent però sense url: es regenera i desa la url (auto-reparació)', async () => {
    const firma = firmaFlyer(flyer, sessions);
    const e = entorn({ flyerDades: { ...flyer, pdfs: { simple: { firma }, impremta: { firma, url: 'u' } } } });
    await regenerarFlyer({ id: 'f1', ...e });
    expect(e.renderPdf).toHaveBeenCalledTimes(2);
    const { pdfs } = e.update.mock.calls[0][0];
    expect(pdfs.simple.url).toMatch(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/bucket-prova\/o\//);
    expect(pdfs.impremta.url).toMatch(/token=/);
  });

  it('renderitza una vegada per variant, desa els PDF i escriu pdfs', async () => {
    const e = entorn();
    await regenerarFlyer({ id: 'f1', ...e, urlBase: 'https://web.test', ara: () => 1000 });
    expect(e.renderPdf).toHaveBeenCalledTimes(2);
    const urls = e.renderPdf.mock.calls.map(([u]) => new URL(u));
    expect(urls.map((u) => u.searchParams.get('variant'))).toEqual(['simple', 'impremta']);
    expect(urls[0].origin + urls[0].pathname).toBe('https://web.test/flyer/f1/imprimir/');
    expect(urls[0].searchParams.get('clau')).toBe('secret');
    // Amb `totes=1`: els PDF porten totes les sessions del flyer, publicades o no.
    expect(urls.map((u) => u.searchParams.get('totes'))).toEqual(['1', '1']);
    expect(urls[0].searchParams.get('t')).toBe('1000');
    expect(e.bucket.file.mock.calls.map(([p]) => p)).toEqual(['flyers/f1/flyer-simple.pdf', 'flyers/f1/flyer-impremta.pdf']);
    expect(e.save).toHaveBeenCalledWith(Buffer.from('pdf'), expect.objectContaining({ contentType: 'application/pdf' }));
    const firma = firmaFlyer(flyer, sessions);
    const tokens = e.save.mock.calls.map(([, opcions]) => opcions.metadata.metadata.firebaseStorageDownloadTokens);
    expect(new Set(tokens).size).toBe(2);
    const urlDe = (variant, token) => `https://firebasestorage.googleapis.com/v0/b/bucket-prova/o/${encodeURIComponent(`flyers/f1/flyer-${variant}.pdf`)}?alt=media&token=${token}`;
    expect(e.update).toHaveBeenCalledWith({
      pdfs: {
        simple: expect.objectContaining({ path: 'flyers/f1/flyer-simple.pdf', url: urlDe('simple', tokens[0]), firma, sessionsIds: ['a', 'b'] }),
        impremta: expect.objectContaining({ path: 'flyers/f1/flyer-impremta.pdf', url: urlDe('impremta', tokens[1]), firma, sessionsIds: ['a', 'b'] }),
      },
      pdfsError: null,
    });
    // el token no surt als registres
    const registres = JSON.stringify([e.logger.info.mock.calls, e.logger.warn.mock.calls, e.logger.error.mock.calls]);
    tokens.forEach((t) => expect(registres).not.toContain(t));
  });

  it('generatEl és un Date (la Admin SDK el desa com a Timestamp), no un text', async () => {
    const e = entorn();
    await regenerarFlyer({ id: 'f1', ...e, ara: () => 1000 });
    const { pdfs } = e.update.mock.calls[0][0];
    expect(pdfs.simple.generatEl).toBeInstanceOf(Date);
    expect(pdfs.impremta.generatEl).toEqual(new Date(1000));
  });

  it('llegeix les sessions amb una sola getAll, en l\'ordre del flyer i saltant les inexistents', async () => {
    const e = entorn({ flyerDades: { ...flyer, sessionsIds: ['b', 'zz', 'a'] } });
    const getAll = vi.spyOn(e.db, 'getAll');
    await regenerarFlyer({ id: 'f1', ...e });
    expect(getAll).toHaveBeenCalledTimes(2); // una lectura abans de renderitzar i una després
    expect(getAll.mock.calls[0]).toHaveLength(3);
    expect(e.update.mock.calls[0][0].pdfs.simple.firma).toBe(firmaFlyer({ ...flyer, sessionsIds: ['b', 'zz', 'a'] }, [sessions[1], sessions[0]]));
    // Desa les sessions que s'han pintat (les que existien), perquè la web comprovi que el PDF no en porta cap de fora del flyer.
    expect(e.update.mock.calls[0][0].pdfs.simple.sessionsIds).toEqual(['b', 'a']);
  });

  it('llegeix també les sessions no publicades (entren a la signatura)', async () => {
    const pendents = [sessions[0], { ...sessions[1], publicada: false }];
    const e = entorn({ sessionsDades: pendents });
    await regenerarFlyer({ id: 'f1', ...e });
    expect(e.update.mock.calls[0][0].pdfs.simple.firma).toBe(firmaFlyer(flyer, pendents));
    expect(firmaFlyer(flyer, pendents)).not.toBe(firmaFlyer(flyer, [sessions[0]]));
  });

  it('sense bucle: amb els PDF d\'un flyer amb sessions no publicades ja vigents no torna a renderitzar', async () => {
    const pendents = [sessions[0], { ...sessions[1], publicada: false }];
    const firma = firmaFlyer(flyer, pendents);
    const e = entorn({ sessionsDades: pendents, flyerDades: { ...flyer, pdfs: { simple: { firma, url: 'u', sessionsIds: ['a', 'b'] }, impremta: { firma, url: 'u', sessionsIds: ['a', 'b'] } } } });
    await regenerarFlyer({ id: 'f1', ...e });
    expect(e.renderPdf).not.toHaveBeenCalled();
    expect(e.update).not.toHaveBeenCalled();
  });

  it('treure una sessió del flyer canvia la signatura i el regenera amb les sessionsIds noves', async () => {
    const firma = firmaFlyer(flyer, sessions);
    const vells = { firma, url: 'u', sessionsIds: ['a', 'b'] };
    const e = entorn({ flyerDades: { ...flyer, sessionsIds: ['a'], pdfs: { simple: vells, impremta: vells } } });
    await regenerarFlyer({ id: 'f1', ...e });
    expect(e.renderPdf).toHaveBeenCalledTimes(2);
    expect(e.update.mock.calls[0][0].pdfs.simple.sessionsIds).toEqual(['a']);
  });

  it('PDF vigents però sense sessionsIds (antics): es regeneren', async () => {
    const firma = firmaFlyer(flyer, sessions);
    const e = entorn({ flyerDades: { ...flyer, pdfs: { simple: { firma, url: 'u' }, impremta: { firma, url: 'u' } } } });
    await regenerarFlyer({ id: 'f1', ...e });
    expect(e.renderPdf).toHaveBeenCalledTimes(2);
    expect(e.update.mock.calls[0][0].pdfs.impremta.sessionsIds).toEqual(['a', 'b']);
  });

  it('un flyer sense sessions no crida getAll', async () => {
    const e = entorn({ flyerDades: { ...flyer, sessionsIds: [] }, sessionsDades: [] });
    const getAll = vi.spyOn(e.db, 'getAll');
    await regenerarFlyer({ id: 'f1', ...e });
    expect(getAll).not.toHaveBeenCalled();
  });

  describe('PDF vigents (mateixa signatura)', () => {
    const ts = (ms) => ({ toMillis: () => ms });
    const vigents = (extra) => {
      const firma = firmaFlyer(flyer, sessions);
      return entorn({
        flyerDades: { ...flyer, pdfs: { simple: { firma, url: 'u', sessionsIds: ['a', 'b'], generatEl: ts(1000) }, impremta: { firma, url: 'u', sessionsIds: ['a', 'b'], generatEl: ts(1000) } }, ...extra },
      });
    };

    it('si actualitzatEl és posterior a l\'última generació, escriu només pdfsComprovatEl', async () => {
      const e = vigents({ actualitzatEl: ts(2000) });
      await regenerarFlyer({ id: 'f1', ...e, ara: () => 3000 });
      expect(e.renderPdf).not.toHaveBeenCalled();
      expect(e.update).toHaveBeenCalledTimes(1);
      expect(e.update).toHaveBeenCalledWith({ pdfsComprovatEl: new Date(3000) });
    });

    it('amb Date en lloc de Timestamp també funciona', async () => {
      const e = vigents({ actualitzatEl: new Date(2000) });
      await regenerarFlyer({ id: 'f1', ...e, ara: () => 3000 });
      expect(e.update).toHaveBeenCalledWith({ pdfsComprovatEl: new Date(3000) });
    });

    it('no escriu res si el desat és anterior a la generació o a la darrera comprovació (no fa bucle)', async () => {
      const e1 = vigents({ actualitzatEl: ts(900) });
      await regenerarFlyer({ id: 'f1', ...e1 });
      expect(e1.update).not.toHaveBeenCalled();
      const e2 = vigents({ actualitzatEl: ts(2000), pdfsComprovatEl: ts(2500) });
      await regenerarFlyer({ id: 'f1', ...e2 });
      expect(e2.update).not.toHaveBeenCalled();
    });

    it('sense actualitzatEl no escriu res', async () => {
      const e = vigents({});
      await regenerarFlyer({ id: 'f1', ...e });
      expect(e.update).not.toHaveBeenCalled();
    });

    it('l\'escriptura de pdfsComprovatEl no torna a disparar la regeneració', () => {
      const abans = { ...flyer, actualitzatEl: ts(2000) };
      expect(calGenerar(abans, { ...abans, pdfsComprovatEl: new Date(3000) })).toBe(false);
    });

    it('un desat que només canvia actualitzatEl dispara una vegada i l\'escriptura de pdfsComprovatEl no en dispara una altra', async () => {
      const e = vigents({ actualitzatEl: ts(2000) });
      const regenerar = vi.fn((id) => regenerarFlyer({ id, ...e, ara: () => 3000 }));
      const l = { error: vi.fn() };
      const abans = { ...flyer, actualitzatEl: ts(1500) };
      const despres = { ...flyer, actualitzatEl: ts(2000) };
      await gestionarFlyerEscrit({ id: 'f1', abans, despres, regenerar, logger: l });
      expect(regenerar).toHaveBeenCalledTimes(1);
      expect(e.update).toHaveBeenCalledWith({ pdfsComprovatEl: new Date(3000) });
      await gestionarFlyerEscrit({ id: 'f1', abans: despres, despres: { ...despres, pdfsComprovatEl: new Date(3000) }, regenerar, logger: l });
      expect(regenerar).toHaveBeenCalledTimes(1);
    });
  });

  it('regenera si només una variant està desactualitzada', async () => {
    const firma = firmaFlyer(flyer, sessions);
    const e = entorn({ flyerDades: { ...flyer, pdfs: { simple: { firma, url: 'u', sessionsIds: ['a', 'b'] }, impremta: { firma: 'vella', url: 'u', sessionsIds: ['a', 'b'] } } } });
    await regenerarFlyer({ id: 'f1', ...e });
    expect(e.renderPdf).toHaveBeenCalledTimes(2);
  });

  it('una sessió despublicada fa regenerar', async () => {
    const firma = firmaFlyer(flyer, sessions);
    const e = entorn({
      flyerDades: { ...flyer, pdfs: { simple: { firma, url: 'u', sessionsIds: ['a', 'b'] }, impremta: { firma, url: 'u', sessionsIds: ['a', 'b'] } } },
      sessionsDades: [sessions[0], { ...sessions[1], publicada: false }],
    });
    await regenerarFlyer({ id: 'f1', ...e });
    expect(e.renderPdf).toHaveBeenCalledTimes(2);
  });

  it('no desa res si el render falla, i no registra la clau', async () => {
    const e = entorn();
    e.renderPdf.mockRejectedValueOnce(new Error('boom'));
    await expect(regenerarFlyer({ id: 'f1', ...e })).rejects.toThrow('render simple fallit');
    expect(e.update).not.toHaveBeenCalledWith(expect.objectContaining({ pdfs: expect.anything() }));
    expect(JSON.stringify([e.logger.info.mock.calls, e.logger.error.mock.calls])).not.toContain('secret');
  });

  it('un render fallit escriu pdfsError (sense l\'error original) i un èxit posterior l\'esborra', async () => {
    const e = entorn();
    e.renderPdf.mockRejectedValueOnce(new Error('net::ERR_FAILED at https://x/?clau=secret'));
    await expect(regenerarFlyer({ id: 'f1', ...e, ara: () => 5000 })).rejects.toThrow('render simple fallit');
    expect(e.update).toHaveBeenCalledTimes(1);
    expect(e.update).toHaveBeenCalledWith({ pdfsError: { data: new Date(5000), missatge: 'No s\'han pogut generar els PDF' } });
    expect(JSON.stringify(e.update.mock.calls)).not.toMatch(/secret|ERR_FAILED/);
    await regenerarFlyer({ id: 'f1', ...e });
    expect(e.update).toHaveBeenLastCalledWith(expect.objectContaining({ pdfsError: null }));
  });

  it('si en fallar el render el flyer ja s\'ha esborrat, no llança cap error no controlat a part del de render', async () => {
    const e = entorn();
    e.update.mockRejectedValue(new Error('NOT_FOUND secret'));
    e.renderPdf.mockRejectedValueOnce(new Error('boom'));
    const error = await regenerarFlyer({ id: 'f1', ...e }).catch((x) => x);
    expect(error.message).toBe('render simple fallit');
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
      getAll: (...refs) => Promise.all(refs.map((r) => r.get())),
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
      getAll: (...refs) => Promise.all(refs.map((r) => r.get())),
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
