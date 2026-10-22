// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
  esdevenimentDesDeSessio, calcularCanvis, sessionsPubliques, llegirOpcions, credencialsCalendari, executar,
  SOURCE_TAG,
} from './sync-calendar.mjs';

const sessio = (extra = {}) => ({
  id: 's1',
  slug: 'la-pelicula',
  data: '2026-10-22',
  hora: '19:00',
  publicada: true,
  titol: 'La pel·lícula',
  publica: { titol: 'La pel·lícula', sinopsiCartell: 'Una història<br/>molt   bonica.' },
  ...extra,
});

// Esdeveniment tal com el retornaria Google: la mateixa data amb ofset i `id` propi.
const existent = (ev, extra = {}) => ({
  id: `g-${ev.iCalUID}`,
  eventType: 'default',
  ...structuredClone(ev),
  ...extra,
});

describe('esdevenimentDesDeSessio', () => {
  it('construeix l\'esdeveniment com el de Hugo', () => {
    const ev = esdevenimentDesDeSessio(sessio());
    expect(ev.summary).toBe('La pel·lícula');
    expect(ev.location).toBe('Teatre del Casino Municipal de Roda de Berà');
    expect(ev.description).toBe(
      'Una història molt bonica.\n\nMés informació i entrades: https://cineclubrodadebera.cat/programacio/2026/la-pelicula/',
    );
    expect(ev.source).toEqual({
      title: 'Fitxa de la sessió',
      url: 'https://cineclubrodadebera.cat/programacio/2026/la-pelicula/',
    });
    expect(ev.extendedProperties.private).toEqual({ source: SOURCE_TAG, cineclubSessioId: 's1' });
    expect(SOURCE_TAG).toBe('cineclub-website-sync');
    expect(ev.iCalUID).toBe('la-pelicula-20261022@cineclubrodadebera.cat');
  });

  it('afegeix el títol a Espanya si és diferent del títol (sense distingir majúscules)', () => {
    const amb = esdevenimentDesDeSessio(sessio({ publica: { titol: 'Vermiglio', titolEspanya: 'La sombra' } }));
    expect(amb.summary).toBe('Vermiglio (La sombra)');
    const igual = esdevenimentDesDeSessio(sessio({ publica: { titol: 'Vermiglio', titolEspanya: 'vermiglio' } }));
    expect(igual.summary).toBe('Vermiglio');
  });

  it('usa el títol de gestió si no hi ha publica.titol', () => {
    expect(esdevenimentDesDeSessio(sessio({ publica: {} })).summary).toBe('La pel·lícula');
  });

  it('retalla la sinopsi a 200 caràcters i la treu de la secció «Sinopsi» del cos si no hi ha sinopsiCartell', () => {
    const llarga = esdevenimentDesDeSessio(sessio({ publica: { titol: 'X', sinopsiCartell: 'a'.repeat(300) } }));
    expect(llarga.description.split('\n\n')[0]).toBe(`${'a'.repeat(200)}…`);
    const cos = '## Fitxa\n\nres\n\n## Sinopsi\nEl text\nde la sinopsi.\n\n## Més\naltre';
    const deCos = esdevenimentDesDeSessio(sessio({ publica: { titol: 'X', cos } }));
    expect(deCos.description.split('\n\n')[0]).toBe('El text de la sinopsi.');
  });

  it('usa l\'hora d\'Europe/Madrid d\'estiu i d\'hivern, amb durada de 3 hores', () => {
    const estiu = esdevenimentDesDeSessio(sessio({ data: '2026-10-22', hora: '19:00' }));
    expect(estiu.start.dateTime).toBe('2026-10-22T17:00:00.000Z');
    expect(estiu.end.dateTime).toBe('2026-10-22T20:00:00.000Z');
    const hivern = esdevenimentDesDeSessio(sessio({ data: '2026-10-29', hora: '19:00' }));
    expect(hivern.start.dateTime).toBe('2026-10-29T18:00:00.000Z');
    const abansMarc = esdevenimentDesDeSessio(sessio({ data: '2026-03-26', hora: '19:00' }));
    expect(abansMarc.start.dateTime).toBe('2026-03-26T18:00:00.000Z');
    const desprésMarc = esdevenimentDesDeSessio(sessio({ data: '2026-04-02', hora: '19:00' }));
    expect(desprésMarc.start.dateTime).toBe('2026-04-02T17:00:00.000Z');
  });

  it('accepta hores sense zero a l\'esquerra i les absents valen 00:00', () => {
    expect(esdevenimentDesDeSessio(sessio({ hora: '9:30' })).start.dateTime).toBe('2026-10-22T07:30:00.000Z');
    expect(esdevenimentDesDeSessio(sessio({ hora: undefined })).start.dateTime).toBe('2026-10-21T22:00:00.000Z');
  });

  it('no fa servir publica.durada: la durada és fixa', () => {
    const ev = esdevenimentDesDeSessio(sessio({ publica: { titol: 'X', durada: 90 } }));
    expect(Date.parse(ev.end.dateTime) - Date.parse(ev.start.dateTime)).toBe(3 * 3600000);
  });

  it('respecta urlBase', () => {
    const ev = esdevenimentDesDeSessio(sessio(), { urlBase: 'http://localhost:4321' });
    expect(ev.source.url).toBe('http://localhost:4321/programacio/2026/la-pelicula/');
  });
});

describe('sessionsPubliques', () => {
  it('només deixa les publicades amb slug i data vàlida', () => {
    const docs = [
      sessio({ id: 'a' }),
      sessio({ id: 'b', publicada: false }),
      sessio({ id: 'c', publicada: undefined }),
      sessio({ id: 'd', slug: '' }),
      sessio({ id: 'e', data: '2026-02-31' }),
      sessio({ id: 'f', data: undefined }),
    ];
    expect(sessionsPubliques(docs).map((s) => s.id)).toEqual(['a']);
  });
});

describe('calcularCanvis', () => {
  const s1 = sessio();
  const s2 = sessio({ id: 's2', slug: 'altra', data: '2026-11-05', publica: { titol: 'Altra' } });
  const ev1 = () => existent(esdevenimentDesDeSessio(s1));

  it('crea les sessions sense esdeveniment', () => {
    const c = calcularCanvis([s1, s2], [ev1()]);
    expect(c.crear.map((x) => x.sessio.id)).toEqual(['s2']);
    expect(c.crear[0].esdeveniment.summary).toBe('Altra');
    expect(c.actualitzar).toEqual([]);
    expect(c.esborrar).toEqual([]);
    expect(c.iguals).toBe(1);
  });

  it('actualitza si canvia qualsevol cosa (títol, hora, sinopsi)', () => {
    for (const canvi of [
      { publica: { titol: 'Nou títol' } },
      { hora: '20:00' },
      { publica: { titol: 'La pel·lícula', sinopsiCartell: 'Una altra sinopsi' } },
    ]) {
      const c = calcularCanvis([sessio(canvi)], [ev1()]);
      expect(c.actualitzar).toHaveLength(1);
      expect(c.actualitzar[0].id).toBe(ev1().id);
      expect(c.actualitzar[0].esdeveniment.summary).toBe(esdevenimentDesDeSessio(sessio(canvi)).summary);
      expect(c.crear).toEqual([]);
      expect(c.esborrar).toEqual([]);
    }
  });

  it('esborra l\'esdeveniment d\'una sessió despublicada o esborrada', () => {
    const despublicada = calcularCanvis(sessionsPubliques([sessio({ publicada: false })]), [ev1()]);
    expect(despublicada.esborrar.map((e) => e.id)).toEqual([ev1().id]);
    const esborrada = calcularCanvis([], [ev1()]);
    expect(esborrada.esborrar).toHaveLength(1);
  });

  it('ignora els esdeveniments sense l\'etiqueta i no els esborra mai', () => {
    const demma = { id: 'x', summary: 'Aniversari', extendedProperties: { private: { source: 'altre' } } };
    const sense = { id: 'y', summary: 'Reunió' };
    const c = calcularCanvis([], [demma, sense]);
    expect(c.esborrar).toEqual([]);
    expect(c.ignorats.map((e) => e.id)).toEqual(['x', 'y']);
  });

  it('és idempotent: aplicar el pla i tornar-lo a calcular no canvia res', () => {
    let calendari = [];
    for (let i = 0; i < 2; i += 1) {
      const c = calcularCanvis([s1, s2], calendari);
      if (i === 0) {
        expect(c.crear).toHaveLength(2);
        calendari = c.crear.map((x, n) => existent(x.esdeveniment, { id: `g${n}` }));
      } else {
        expect(c.crear).toEqual([]);
        expect(c.actualitzar).toEqual([]);
        expect(c.esborrar).toEqual([]);
        expect(c.iguals).toBe(2);
      }
    }
  });

  it('compara els instants, no el text, de les dates que torna Google', () => {
    const ev = ev1();
    ev.start = { dateTime: '2026-10-22T19:00:00+02:00', timeZone: 'Europe/Madrid' };
    ev.end = { dateTime: '2026-10-22T22:00:00+02:00' };
    expect(calcularCanvis([s1], [ev]).actualitzar).toEqual([]);
  });

  it('adopta els esdeveniments de Hugo (etiqueta sense id de sessió) per iCalUID i els actualitza', () => {
    const hugo = {
      id: 'h1',
      eventType: 'default',
      iCalUID: 'la-pelicula-20261022@cineclubrodadebera.cat',
      summary: 'La pel·lícula',
      extendedProperties: { private: { source: SOURCE_TAG } },
    };
    const c = calcularCanvis([s1], [hugo]);
    expect(c.crear).toEqual([]);
    expect(c.esborrar).toEqual([]);
    expect(c.actualitzar.map((x) => x.id)).toEqual(['h1']);
    expect(c.actualitzar[0].esdeveniment.extendedProperties.private.cineclubSessioId).toBe('s1');
  });

  it('empareja per id de sessió encara que la data hagi canviat (no duplica ni deixa orfes)', () => {
    const c = calcularCanvis([sessio({ data: '2026-10-29' })], [ev1()]);
    expect(c.crear).toEqual([]);
    expect(c.esborrar).toEqual([]);
    expect(c.actualitzar).toHaveLength(1);
  });

  it('esborra els duplicats d\'una mateixa sessió', () => {
    const c = calcularCanvis([s1], [ev1(), existent(esdevenimentDesDeSessio(s1), { id: 'dup' })]);
    expect(c.esborrar.map((e) => e.id)).toEqual(['dup']);
    expect(c.actualitzar).toEqual([]);
  });

  it('conserva els placeholders de Hugo i esborra els altres etiquetats sense sessió', () => {
    const etiquetat = { source: SOURCE_TAG };
    const placeholder = {
      id: 'p1', iCalUID: 'placeholder-2026-12@cineclubrodadebera.cat', extendedProperties: { private: etiquetat },
    };
    const vell = { id: 'v1', iCalUID: 'vella-20250101@cineclubrodadebera.cat', extendedProperties: { private: etiquetat } };
    const c = calcularCanvis([s1], [ev1(), placeholder, vell]);
    expect(c.esborrar.map((e) => e.id)).toEqual(['v1']);
    expect(c.placeholders.map((e) => e.id)).toEqual(['p1']);
  });
});

describe('llegirOpcions i credencialsCalendari', () => {
  it('per defecte és informe; --apply aplica; una opció desconeguda llança', () => {
    expect(llegirOpcions([])).toEqual({ apply: false });
    expect(llegirOpcions(['--dry-run'])).toEqual({ apply: false });
    expect(llegirOpcions(['--apply'])).toEqual({ apply: true });
    expect(() => llegirOpcions(['--aplica'])).toThrow(/desconeguda/);
    expect(() => llegirOpcions(['--apply', '--dry-run'])).toThrow(/alhora/);
  });

  it('dóna un error clar si falten les variables o la clau no és JSON, sense mostrar-ne el valor', () => {
    expect(() => credencialsCalendari({})).toThrow(/GOOGLE_CALENDAR_SERVICE_ACCOUNT_KEY.*GOOGLE_CALENDAR_ID/);
    expect(() => credencialsCalendari({ GOOGLE_CALENDAR_ID: 'c' })).toThrow(/GOOGLE_CALENDAR_SERVICE_ACCOUNT_KEY/);
    expect(() => credencialsCalendari({ GOOGLE_CALENDAR_SERVICE_ACCOUNT_KEY: 'secret{', GOOGLE_CALENDAR_ID: 'c' }))
      .toThrow(/JSON/);
    try {
      credencialsCalendari({ GOOGLE_CALENDAR_SERVICE_ACCOUNT_KEY: 'secret{', GOOGLE_CALENDAR_ID: 'c' });
    } catch (err) {
      expect(err.message).not.toContain('secret');
    }
    expect(credencialsCalendari({ GOOGLE_CALENDAR_SERVICE_ACCOUNT_KEY: '{"client_email":"a"}', GOOGLE_CALENDAR_ID: 'c' }))
      .toEqual({ credencials: { client_email: 'a' }, calendarId: 'c' });
  });
});

describe('executar', () => {
  const s1 = sessio();
  const dbFals = (docs) => ({
    collection: () => ({ get: async () => ({ docs: docs.map(({ id, ...d }) => ({ id, data: () => d })) }) }),
  });
  const calendariFals = (esdeveniments) => ({
    llistar: vi.fn(async () => esdeveniments),
    crear: vi.fn(async () => {}),
    actualitzar: vi.fn(async () => {}),
    esborrar: vi.fn(async () => {}),
  });
  const orfe = { id: 'old', summary: 'Vella', extendedProperties: { private: { source: SOURCE_TAG } } };
  const manual = { id: 'man', summary: 'De mà' };

  it('en mode informe llegeix però no escriu al calendari, i mostra el pla i els no gestionats', async () => {
    const calendari = calendariFals([orfe, manual]);
    const log = vi.fn();
    await executar({ apply: false, db: dbFals([s1]), calendari, log });
    expect(calendari.llistar).toHaveBeenCalled();
    expect(calendari.crear).not.toHaveBeenCalled();
    expect(calendari.actualitzar).not.toHaveBeenCalled();
    expect(calendari.esborrar).not.toHaveBeenCalled();
    const text = log.mock.calls.map((c) => c[0]).join('\n');
    expect(text).toMatch(/Crear \(1\)/);
    expect(text).toMatch(/Esborrar \(1\)/);
    expect(text).toMatch(/No gestionats.*1/);
    expect(text).toMatch(/De mà/);
    expect(text).toMatch(/La pel·lícula \(2026-10-22 19:00\)/);
  });

  it('en mode informe sense calendari només mostra les sessions a sincronitzar', async () => {
    const log = vi.fn();
    const res = await executar({ apply: false, db: dbFals([s1]), calendari: null, log });
    expect(res.canvis.crear).toHaveLength(1);
    expect(log.mock.calls.map((c) => c[0]).join('\n')).toMatch(/Sense credencials/);
  });

  it('mostra els placeholders conservats i no els esborra amb --apply', async () => {
    const placeholder = {
      id: 'p1', summary: 'Sessió per determinar', iCalUID: 'placeholder-2026-12@cineclubrodadebera.cat',
      extendedProperties: { private: { source: SOURCE_TAG } },
    };
    const calendari = calendariFals([placeholder]);
    const log = vi.fn();
    await executar({ apply: true, db: dbFals([]), calendari, log });
    expect(calendari.esborrar).not.toHaveBeenCalled();
    expect(log.mock.calls.map((c) => c[0]).join('\n')).toMatch(/placeholders de Hugo conservats \(1\)/i);
  });

  it('amb --apply crida les funcions injectades', async () => {
    const calendari = calendariFals([orfe, manual]);
    await executar({ apply: true, db: dbFals([s1]), calendari, log: () => {} });
    expect(calendari.crear).toHaveBeenCalledTimes(1);
    expect(calendari.crear.mock.calls[0][0].summary).toBe('La pel·lícula');
    expect(calendari.esborrar).toHaveBeenCalledWith('old');
    expect(calendari.esborrar).toHaveBeenCalledTimes(1);
    expect(calendari.actualitzar).not.toHaveBeenCalled();
  });

  it('amb --apply sense calendari llança un error', async () => {
    await expect(executar({ apply: true, db: dbFals([s1]), calendari: null, log: () => {} })).rejects.toThrow(/GOOGLE_CALENDAR/);
  });

  it('una segona execució amb --apply no escriu res', async () => {
    const creats = [];
    const calendari = calendariFals([]);
    calendari.crear.mockImplementation(async (ev) => { creats.push(existent(ev)); });
    await executar({ apply: true, db: dbFals([s1]), calendari, log: () => {} });
    const segon = calendariFals(creats);
    await executar({ apply: true, db: dbFals([s1]), calendari: segon, log: () => {} });
    expect(segon.crear).not.toHaveBeenCalled();
    expect(segon.actualitzar).not.toHaveBeenCalled();
    expect(segon.esborrar).not.toHaveBeenCalled();
  });
});
