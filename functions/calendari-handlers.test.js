import { describe, it, expect, vi } from 'vitest';
import handlers from './calendari-handlers.js';
import calendari from './calendari.js';
import google from './calendari-google.js';

const { sincronitzarSessio, sincronitzarTot } = handlers;
const { esdevenimentDesDeSessio, SOURCE_TAG } = calendari;

const SECRET = '-----BEGIN PRIVATE KEY-----secret';
const ARA = new Date('2026-10-01T00:00:00Z');
const UID = 'la-pelicula-20261022@cineclubrodadebera.cat';

const sessio = (extra = {}) => ({
  slug: 'la-pelicula',
  data: '2026-10-22',
  hora: '19:00',
  publicada: true,
  titol: 'La pel·lícula',
  publica: { titol: 'La pel·lícula', sinopsiCartell: 'Una història.' },
  ...extra,
});

// API de Google Calendar en memòria amb el comportament que ens importa: els esborrats es queden com a
// `cancelled` amb el seu iCalUID i un `insert` amb un iCalUID existent (esborrat o no) dóna 409.
function googleFals(inicials = []) {
  const esdeveniments = new Map(inicials.map((e) => [e.id, { status: 'confirmed', ...structuredClone(e) }]));
  const escriptures = [];
  const llistes = [];
  let n = 0;
  const dins = (e, { timeMin, timeMax }) => !e.start?.dateTime || ((!timeMax || e.start.dateTime < timeMax)
    && (!timeMin || e.end.dateTime > timeMin));
  const api = {
    events: {
      list: vi.fn(async (p) => {
        llistes.push(p);
        const items = [...esdeveniments.values()].filter((e) => (p.showDeleted || e.status !== 'cancelled')
          && (!p.iCalUID || e.iCalUID === p.iCalUID)
          && (p.privateExtendedProperty ?? []).every((kv) => {
            const [k, v] = kv.split('=');
            return e.extendedProperties?.private?.[k] === v;
          })
          && dins(e, p));
        return { data: { items: items.map((e) => structuredClone(e)) } };
      }),
      insert: vi.fn(async ({ requestBody }) => {
        await Promise.resolve();
        if ([...esdeveniments.values()].some((e) => e.iCalUID === requestBody.iCalUID)) {
          throw Object.assign(new Error('The requested identifier already exists.'), { code: 409 });
        }
        n += 1;
        escriptures.push(['insert', requestBody.iCalUID]);
        esdeveniments.set(`nou${n}`, { id: `nou${n}`, status: 'confirmed', ...structuredClone(requestBody) });
      }),
      patch: vi.fn(async ({ eventId, requestBody }) => {
        escriptures.push(['patch', eventId]);
        esdeveniments.set(eventId, { ...esdeveniments.get(eventId), ...structuredClone(requestBody) });
      }),
      delete: vi.fn(async ({ eventId }) => {
        escriptures.push(['delete', eventId]);
        esdeveniments.get(eventId).status = 'cancelled';
      }),
    },
  };
  const client = google.clientCalendari({ calendarId: 'cal' }, api);
  const actius = () => [...esdeveniments.values()].filter((e) => e.status !== 'cancelled');
  return { api, client, esdeveniments, escriptures, llistes, actius };
}

// Firestore en memòria només amb el que llegeixen els gestors.
function dbFals(sessions = {}) {
  const dades = new Map(Object.entries(sessions));
  return {
    dades,
    doc: vi.fn((ruta) => ({
      get: async () => {
        const id = ruta.split('/')[1];
        return { exists: dades.has(id), data: () => structuredClone(dades.get(id)) };
      },
    })),
    collection: () => ({
      get: async () => ({ docs: [...dades].map(([id, d]) => ({ id, data: () => structuredClone(d) })) }),
    }),
  };
}

const loggerFals = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });
const deSessio = (id, dades, extra = {}) => ({ id: `g-${id}`, ...esdevenimentDesDeSessio({ ...dades, id }), ...extra });

// Executa el disparador de `s1` amb `actual` com a estat del document en el moment d'executar-se.
function entorn({ actual, esdeveniments = [] } = {}) {
  const g = googleFals(esdeveniments);
  const db = dbFals(actual ? { s1: actual } : {});
  const logger = loggerFals();
  const obtenirCalendari = vi.fn(() => g.client);
  const disparar = (abans, despres) => sincronitzarSessio({ id: 's1', abans, despres, db, obtenirCalendari, logger, ara: ARA });
  return { g, db, logger, obtenirCalendari, disparar };
}

describe('sincronitzarSessio (disparador de sessions/{id})', () => {
  it('crea l\'esdeveniment en publicar', async () => {
    const { g, disparar } = entorn({ actual: sessio() });
    await disparar(sessio({ publicada: false }), sessio());
    expect(g.escriptures).toEqual([['insert', UID]]);
    const [ev] = g.actius();
    expect(ev.summary).toBe('La pel·lícula');
    expect(ev.extendedProperties.private).toEqual({ source: SOURCE_TAG, cineclubSessioId: 's1' });
  });

  it('actualitza en canviar el títol, la data o l\'hora', async () => {
    for (const canvi of [{ publica: { titol: 'Nou títol' } }, { data: '2026-10-29' }, { hora: '20:30' }]) {
      const { g, disparar } = entorn({ actual: sessio(canvi), esdeveniments: [deSessio('s1', sessio())] });
      await disparar(sessio(), sessio(canvi));
      expect(g.escriptures).toEqual([['patch', 'g-s1']]);
      expect(g.actius()).toHaveLength(1);
      expect(g.actius()[0].summary).toBe(esdevenimentDesDeSessio({ id: 's1', ...sessio(canvi) }).summary);
    }
  });

  it('esborra l\'esdeveniment en despublicar o esborrar la sessió', async () => {
    for (const despres of [sessio({ publicada: false }), null]) {
      const { g, disparar } = entorn({ actual: despres, esdeveniments: [deSessio('s1', sessio())] });
      await disparar(sessio(), despres);
      expect(g.escriptures).toEqual([['delete', 'g-s1']]);
    }
  });

  it('no fa res (ni llegeix la sessió ni crida Google) si canvien camps que no surten al calendari', async () => {
    const { db, obtenirCalendari, disparar } = entorn({ actual: sessio() });
    const abans = sessio({ publica: { titol: 'La pel·lícula', sinopsiCartell: 'Una història.', cos: 'x' } });
    await disparar(abans, { ...abans, notes: 'nou', publica: { ...abans.publica, cos: 'Fitxa sense sinopsi', durada: 90 } });
    await disparar(sessio({ publicada: false }), sessio({ publicada: false, titol: 'X' }));
    await disparar(sessio({ hora: '19:00' }), sessio({ hora: '19:00 ' }));
    expect(obtenirCalendari).not.toHaveBeenCalled();
    expect(db.doc).not.toHaveBeenCalled();
  });

  it('adopta l\'esdeveniment de Hugo per iCalUID sense duplicar-lo', async () => {
    const hugo = { id: 'h1', iCalUID: UID, summary: 'Antic', extendedProperties: { private: { source: SOURCE_TAG } } };
    const { g, disparar } = entorn({ actual: sessio(), esdeveniments: [hugo] });
    await disparar(sessio({ publica: { titol: 'Antic' } }), sessio());
    expect(g.escriptures).toEqual([['patch', 'h1']]);
    expect(g.esdeveniments.get('h1').extendedProperties.private.cineclubSessioId).toBe('s1');
  });

  it('troba l\'esdeveniment de Hugo per l\'iCalUID d\'abans en despublicar', async () => {
    const hugo = { id: 'h1', iCalUID: UID, extendedProperties: { private: { source: SOURCE_TAG } } };
    const { g, disparar } = entorn({ actual: null, esdeveniments: [hugo] });
    await disparar(sessio(), null);
    expect(g.escriptures).toEqual([['delete', 'h1']]);
  });

  it('no toca esdeveniments sense etiqueta, placeholders ni els d\'una altra sessió', async () => {
    const sense = { id: 'man', iCalUID: UID, summary: 'De mà', extendedProperties: { private: { cineclubSessioId: 's1' } } };
    const placeholder = {
      id: 'p1', iCalUID: 'placeholder-2026-12@cineclubrodadebera.cat',
      extendedProperties: { private: { source: SOURCE_TAG, cineclubSessioId: 's1' } },
    };
    const altra = deSessio('s2', sessio(), { id: 'altra' });
    const { g, disparar } = entorn({ actual: null, esdeveniments: [sense, placeholder, altra] });
    await disparar(sessio(), null);
    expect(g.escriptures).toEqual([]);
  });

  it('és idempotent: tornar a lliurar el mateix disparador no escriu res', async () => {
    const { g, db, disparar } = entorn({ actual: sessio() });
    await disparar(sessio({ publicada: false }), sessio());
    await disparar(sessio({ publicada: false }), sessio());
    expect(g.escriptures).toHaveLength(1);
    db.dades.set('s1', sessio({ publicada: false }));
    await disparar(sessio(), sessio({ publicada: false }));
    await disparar(sessio(), sessio({ publicada: false }));
    expect(g.escriptures).toHaveLength(2);
    expect(g.actius()).toHaveLength(0);
  });

  it('cursa: publicar i despublicar de seguida, amb els disparadors desordenats, no deixa cap esdeveniment', async () => {
    const { g, disparar } = entorn({ actual: sessio({ publicada: false }) });
    await disparar(sessio(), sessio({ publicada: false }));
    await disparar(sessio({ publicada: false }), sessio());
    expect(g.actius()).toHaveLength(0);
    expect(g.escriptures).toEqual([]);
  });

  it('cursa: despublicar i tornar a publicar, amb els disparadors desordenats, deixa l\'esdeveniment', async () => {
    const { g, disparar } = entorn({ actual: sessio(), esdeveniments: [deSessio('s1', sessio())] });
    await disparar(sessio({ publicada: false }), sessio());
    await disparar(sessio(), sessio({ publicada: false }));
    expect(g.actius().map((e) => e.id)).toEqual(['g-s1']);
    expect(g.escriptures).toEqual([]);
  });

  it('cursa: dos canvis seguits d\'una sessió sense esdeveniment en deixen un de sol, amb l\'estat final', async () => {
    const { g, logger, disparar } = entorn({ actual: sessio({ publica: { titol: 'C' } }) });
    await Promise.all([
      disparar(sessio({ publicada: false }), sessio({ publica: { titol: 'B' } })),
      disparar(sessio({ publica: { titol: 'B' } }), sessio({ publica: { titol: 'C' } })),
    ]);
    expect(g.actius()).toHaveLength(1);
    expect(g.actius()[0].summary).toBe('C');
    expect(g.escriptures.filter(([op]) => op === 'insert')).toHaveLength(1);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('en tornar a publicar una sessió esborrada recupera el seu esdeveniment esborrat', async () => {
    const { g, db, disparar } = entorn({ actual: null, esdeveniments: [deSessio('s1', sessio())] });
    await disparar(sessio(), null);
    db.dades.set('s1', sessio());
    await disparar(null, sessio());
    expect(g.actius().map((e) => e.id)).toEqual(['g-s1']);
    expect(g.escriptures).toEqual([['delete', 'g-s1'], ['patch', 'g-s1']]);
  });

  it('acota la cerca per id de sessió a la finestra de temps; la d\'iCalUID no', async () => {
    const { g, disparar } = entorn({ actual: sessio() });
    await disparar(null, sessio());
    expect(g.llistes).toContainEqual(expect.objectContaining({
      privateExtendedProperty: ['cineclubSessioId=s1'], timeMin: '2025-10-01T00:00:00.000Z', timeMax: '2028-09-30T00:00:00.000Z',
    }));
    expect(g.llistes.find((p) => p.iCalUID === UID && !p.showDeleted)).not.toHaveProperty('timeMin');
  });

  it('una sessió publicada sense títol usa el slug', async () => {
    const sense = sessio({ titol: undefined, publica: {} });
    const { g, disparar } = entorn({ actual: sense });
    await disparar(null, sense);
    expect(g.actius()[0].summary).toBe('la-pelicula');
  });

  it('no llança mai: dades estranyes, errors de Firestore o del client es registren', async () => {
    const dolenta = sessio({ publica: { titol: 'X', sinopsiCartell: 42 } });
    const estranya = entorn({ actual: dolenta });
    await expect(estranya.disparar(null, dolenta)).resolves.toBeNull();

    const firestore = entorn({ actual: sessio() });
    firestore.db.doc.mockImplementation(() => { throw new Error('firestore'); });
    await expect(firestore.disparar(null, sessio())).resolves.toBeNull();

    const client = entorn({ actual: sessio() });
    client.obtenirCalendari.mockImplementation(() => { throw new Error('GOOGLE_CALENDAR_SERVICE_ACCOUNT_KEY no és un JSON vàlid'); });
    await expect(client.disparar(null, sessio())).resolves.toBeNull();

    for (const cas of [estranya, firestore, client]) expect(cas.logger.error).toHaveBeenCalledTimes(1);
  });

  it('registra els errors de l\'API sense filtrar secrets', async () => {
    const { g, logger, disparar } = entorn({ actual: sessio() });
    g.api.events.insert.mockRejectedValue(Object.assign(new Error('Forbidden'), {
      code: 403, config: { headers: { Authorization: `Bearer ${SECRET}` } },
    }));
    await expect(disparar(null, sessio())).resolves.toBeNull();
    expect(logger.error.mock.calls[0][1]).toEqual({ sessioId: 's1', missatge: 'Forbidden', codi: 403 });
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(SECRET);
  });
});

describe('sincronitzarTot (callable de l\'admin)', () => {
  const admin = { token: { role: 'admin' } };
  const orfe = {
    id: 'old', summary: 'Vella', start: { dateTime: '2026-01-01T19:00:00Z' }, end: { dateTime: '2026-01-01T22:00:00Z' },
    extendedProperties: { private: { source: SOURCE_TAG } },
  };
  const placeholder = { id: 'p1', summary: 'Sessió per determinar', iCalUID: 'placeholder-x', extendedProperties: { private: { source: SOURCE_TAG } } };
  const manual = { id: 'man', summary: 'Reunió privada', description: 'privat' };
  const cridar = (g, sessions, dades = {}, auth = admin, logger = loggerFals()) => sincronitzarTot({
    db: dbFals(sessions), obtenirCalendari: () => g.client, auth, dades, logger, ara: ARA,
  });

  it('rebutja qui no és admin amb permission-denied', async () => {
    const obtenirCalendari = vi.fn();
    for (const auth of [null, { token: {} }, { token: { role: 'soci' } }]) {
      await expect(sincronitzarTot({ db: dbFals(), obtenirCalendari, auth, dades: { aplicar: true }, logger: loggerFals() }))
        .rejects.toMatchObject({ codi: 'permission-denied' });
    }
    expect(obtenirCalendari).not.toHaveBeenCalled();
  });

  it('per defecte és un informe: no escriu, retorna textos curts i només el recompte dels no gestionats', async () => {
    const g = googleFals([orfe, placeholder, manual]);
    const res = await cridar(g, { s1: sessio() });
    expect(g.escriptures).toEqual([]);
    expect(res).toEqual({
      aplicat: false,
      crear: ['La pel·lícula (2026-10-22 19:00)'],
      actualitzar: [],
      esborrar: ['Vella (2026-01-01 20:00)'],
      placeholdersConservats: ['Sessió per determinar ()'],
      noGestionats: 1,
      sessionsOmeses: [],
      totals: { crear: 1, actualitzar: 0, esborrar: 1, iguals: 0, placeholdersConservats: 1 },
    });
    expect(JSON.stringify(res)).not.toMatch(/privat|Reunió/);
    expect(g.llistes[0]).toMatchObject({ timeMin: '2025-10-01T00:00:00.000Z', timeMax: '2028-09-30T00:00:00.000Z' });
  });

  it('amb aplicar:true escriu, i una segona execució no escriu res', async () => {
    const g = googleFals([orfe, placeholder, manual]);
    const res = await cridar(g, { s1: sessio() }, { aplicar: true });
    expect(res.aplicat).toBe(true);
    expect(g.escriptures).toEqual([['insert', UID], ['delete', 'old']]);
    await cridar(g, { s1: sessio() }, { aplicar: true });
    expect(g.escriptures).toHaveLength(2);
    expect(g.actius().map((e) => e.id).sort()).toEqual(['man', 'nou1', 'p1']);
  });

  it('només sincronitza les sessions dins la finestra de temps', async () => {
    const g = googleFals();
    const res = await cridar(g, { vella: sessio({ data: '2024-01-10' }), lluny: sessio({ data: '2030-01-10' }), s1: sessio() });
    expect(res.crear).toEqual(['La pel·lícula (2026-10-22 19:00)']);
  });

  it('omet una sessió que no es pot convertir, n\'informa i continua amb les altres sense tocar-ne l\'esdeveniment', async () => {
    const g = googleFals([deSessio('dolenta', sessio({ slug: 'dolenta' }))]);
    const logger = loggerFals();
    const sessions = { dolenta: sessio({ slug: 'dolenta', publica: { titol: 'X', sinopsiCartell: 42 } }), s1: sessio() };
    const res = await cridar(g, sessions, { aplicar: true }, admin, logger);
    expect(res.sessionsOmeses).toEqual(['dolenta']);
    expect(res.crear).toEqual(['La pel·lícula (2026-10-22 19:00)']);
    expect(res.esborrar).toEqual([]);
    expect(g.escriptures).toEqual([['insert', UID]]);
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ sessioId: 'dolenta' }));
  });

  it('limita la mida de la resposta a 200 elements per llista', async () => {
    const orfes = Array.from({ length: 250 }, (_, i) => ({ ...orfe, id: `o${i}` }));
    const res = await cridar(googleFals(orfes), {});
    expect(res.esborrar).toHaveLength(200);
    expect(res.totals.esborrar).toBe(250);
  });

  it('un error de l\'API es registra sense secrets i es retorna com a internal', async () => {
    const g = googleFals();
    g.api.events.list.mockRejectedValue(Object.assign(new Error('boom'), { config: { headers: { Authorization: SECRET } } }));
    const logger = loggerFals();
    await expect(cridar(g, { s1: sessio() }, {}, admin, logger)).rejects.toMatchObject({ codi: 'internal' });
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(SECRET);
  });
});

describe('clientCalendari', () => {
  const ev = () => esdevenimentDesDeSessio({ id: 's1', ...sessio() });

  it('cerca per id de sessió i per iCalUID, sense duplicats ni esdeveniments especials', async () => {
    const g = googleFals([
      deSessio('s1', sessio(), { id: 'a' }),
      { id: 'b', iCalUID: 'u1', eventType: 'outOfOffice' },
    ]);
    const trobats = await g.client.cercar({ sessioId: 's1', iCalUIDs: [UID, 'u1'] });
    expect(trobats.map((e) => e.id)).toEqual(['a']);
  });

  it('en un 409 contra un esdeveniment actiu nostre de la mateixa sessió, hi fa patch', async () => {
    const g = googleFals([deSessio('s1', sessio({ publica: { titol: 'Antic' } }))]);
    await g.client.crear(ev());
    expect(g.escriptures).toEqual([['patch', 'g-s1']]);
    expect(g.actius()[0].summary).toBe('La pel·lícula');
  });

  it('en un 409 no toca un esdeveniment aliè, sense etiqueta o d\'una altra sessió', async () => {
    for (const existent of [
      { id: 'man', iCalUID: UID },
      { id: 'alie', iCalUID: UID, status: 'cancelled', extendedProperties: { private: { source: 'altre' } } },
      deSessio('s2', sessio(), { id: 'altra' }),
    ]) {
      const g = googleFals([existent]);
      await expect(g.client.crear(ev())).rejects.toMatchObject({ code: 409 });
      expect(g.escriptures).toEqual([]);
    }
  });

  it('en un 409 contra un esborrat sense extendedProperties, el recupera', async () => {
    const g = googleFals([{ id: 'vell', iCalUID: UID, status: 'cancelled' }]);
    await g.client.crear(ev());
    expect(g.escriptures).toEqual([['patch', 'vell']]);
    expect(g.esdeveniments.get('vell').status).toBe('confirmed');
  });
});
