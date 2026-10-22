// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import calendari from '../functions/calendari.js';
import { llegirOpcions, executar } from './sync-calendar.mjs';

const { SOURCE_TAG } = calendari;

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

describe('llegirOpcions', () => {
  it('per defecte és informe; --apply aplica; una opció desconeguda llança', () => {
    expect(llegirOpcions([])).toEqual({ apply: false });
    expect(llegirOpcions(['--dry-run'])).toEqual({ apply: false });
    expect(llegirOpcions(['--apply'])).toEqual({ apply: true });
    expect(() => llegirOpcions(['--aplica'])).toThrow(/desconeguda/);
    expect(() => llegirOpcions(['--apply', '--dry-run'])).toThrow(/alhora/);
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
