import { describe, expect, it } from 'vitest';
import {
  canvisDesdeBase, flyerActiu, instantania, sessionsDelRang, sessionsNoPublicades, validarFlyer,
} from './flyers.js';

const sessio = (id, data, hora, extra = {}) => ({
  id, data, hora, titol: `Peli ${id}`, publicada: true, publica: { versioTipus: 'vose' }, ...extra,
});

describe('sessionsDelRang', () => {
  const sessions = [
    sessio('c', '2026-12-10', '20:00'),
    sessio('a', '2026-12-01', '22:00'),
    sessio('b', '2026-12-01', '18:00'),
    sessio('d', '2026-12-31', '19:00'),
    sessio('fora', '2026-11-30', '20:00'),
    sessio('fora2', '2027-01-01', '20:00'),
    sessio('esborrany', '2026-12-05', '20:00', { publicada: false }),
  ];

  it('inclou els dos extrems i ordena per data i hora', () => {
    expect(sessionsDelRang(sessions, '2026-12-01', '2026-12-31')).toEqual(['b', 'a', 'esborrany', 'c', 'd']);
  });

  it('inclou les sessions no publicades', () => {
    expect(sessionsDelRang(sessions, '2026-12-05', '2026-12-05')).toEqual(['esborrany']);
  });
});

describe('sessionsNoPublicades i flyerActiu', () => {
  const sessionsPerId = {
    a: sessio('a', '2026-12-01', '20:00'),
    b: sessio('b', '2026-12-02', '20:00'),
    p: sessio('p', '2026-12-03', '20:00', { publicada: false }),
  };
  const flyer = (estat, sessionsIds) => ({ estat, sessionsIds });

  it('llista les sessions sense publicar i les ids que ja no existeixen', () => {
    expect(sessionsNoPublicades(flyer('publicat', ['a', 'p', 'x']), sessionsPerId)).toEqual([
      { sessionId: 'p', titol: 'Peli p' },
      { sessionId: 'x', titol: 'Sessió esborrada (x)' },
    ]);
    expect(sessionsNoPublicades(flyer('publicat', ['a', 'b']), sessionsPerId)).toEqual([]);
  });

  it.each([
    ['un esborrany', flyer('esborrany', ['a', 'b']), false],
    ['un publicat complet', flyer('publicat', ['a', 'b']), true],
    ['un publicat amb una sessió sense publicar', flyer('publicat', ['a', 'p']), false],
    ['un publicat amb una sessió esborrada', flyer('publicat', ['a', 'x']), false],
  ])('%s: actiu = %s', (_, f, esperat) => {
    expect(flyerActiu(f, sessionsPerId)).toBe(esperat);
  });
});

describe('validarFlyer', () => {
  const sessions = ['1', '2', '3', '4', '5', '6', '7'].map((id) => sessio(id, '2026-12-01', '20:00'));
  const base = { nom: 'Desembre', desde: '2026-12-01', fins: '2026-12-31' };

  it('dona error amb menys de 3 sessions', () => {
    const { errors } = validarFlyer({ ...base, sessionsIds: ['1', '2'] }, sessions);
    expect(errors.sessionsIds).toBeTruthy();
  });

  it('és vàlid amb 3 sessions', () => {
    expect(validarFlyer({ ...base, sessionsIds: ['1', '2', '3'] }, sessions)).toEqual({ errors: {} });
  });

  it('dona error amb més de 5 sessions (límit dur), i 5 és vàlid', () => {
    const set = Array.from({ length: 7 }, (_, i) => String(i + 1));
    expect(validarFlyer({ ...base, sessionsIds: set.slice(0, 5) }, sessions).errors).toEqual({});
    const r = validarFlyer({ ...base, sessionsIds: set }, sessions);
    expect(r.errors.sessionsIds).toContain("Un flyer té de 3 a 5 sessions. Desmarca'n alguna.");
    expect(r.avisos).toBeUndefined();
  });

  it('dona error per una sessió sense versioTipus i n\'hi anomena el títol', () => {
    const llista = [...sessions, sessio('8', '2026-12-02', '20:00', { titol: 'Sense versió', publica: { versioTipus: '' } })];
    const { errors } = validarFlyer({ ...base, sessionsIds: ['1', '2', '8'] }, llista);
    expect(errors.sessionsIds).toHaveLength(1);
    expect(errors.sessionsIds[0]).toContain('Sense versió');
  });

  it('no dona error per una sessió no publicada', () => {
    const amb = [...sessions, sessio('np', '2026-12-02', '20:00', { publicada: false })];
    expect(validarFlyer({ ...base, sessionsIds: ['1', '2', 'np'] }, amb).errors).toEqual({});
  });

  it('dona error sense nom', () => {
    expect(validarFlyer({ ...base, nom: '  ', sessionsIds: ['1', '2', '3'] }, sessions).errors.nom).toBeTruthy();
  });

  it('dona error amb dates invàlides', () => {
    const { errors } = validarFlyer({ ...base, desde: '2026-02-31', fins: '', sessionsIds: ['1', '2', '3'] }, sessions);
    expect(errors.desde).toBeTruthy();
    expect(errors.fins).toBeTruthy();
  });

  it('dona error si desde és posterior a fins', () => {
    const { errors } = validarFlyer({ ...base, desde: '2026-12-31', fins: '2026-12-01', sessionsIds: ['1', '2', '3'] }, sessions);
    expect(errors.desde).toBeTruthy();
  });
});

describe('instantania', () => {
  it('copia els camps que es mostren al flyer', () => {
    expect(instantania(sessio('a', '2026-12-01', '20:00'))).toEqual({
      data: '2026-12-01', hora: '20:00', titol: 'Peli a', versioTipus: 'vose', publicada: true,
    });
  });
});

describe('canvisDesdeBase', () => {
  const original = sessio('a', '2026-12-01', '20:00');
  const flyer = { base: { a: instantania(original) } };
  const canvis = (actual) => canvisDesdeBase(flyer, actual === undefined ? {} : { a: actual });

  it('no retorna res si tot coincideix', () => {
    expect(canvis(original)).toEqual([]);
  });

  it.each([
    ['data', { data: '2026-12-02' }],
    ['hora', { hora: '21:00' }],
    ['titol', { titol: 'Altre' }],
    ['versio', { publica: { versioTipus: 'vo' } }],
    ['despublicada', { publicada: false }],
  ])('detecta el canvi de %s', (tipus, canvi) => {
    expect(canvis({ ...original, ...canvi })).toEqual([
      { sessionId: 'a', titol: canvi.titol ?? 'Peli a', tipus },
    ]);
  });

  it('no dona «despublicada» si la sessió ja no era publicada a la base', () => {
    const noPublicada = sessio('a', '2026-12-01', '20:00', { publicada: false });
    const f = { base: { a: instantania(noPublicada) } };
    expect(canvisDesdeBase(f, { a: noPublicada })).toEqual([]);
    expect(canvisDesdeBase(f, { a: { ...noPublicada, publicada: undefined } })).toEqual([]);
  });

  it('detecta una sessió esborrada amb el títol de la base', () => {
    expect(canvis(undefined)).toEqual([{ sessionId: 'a', titol: 'Peli a', tipus: 'esborrada' }]);
  });

  it('retorna un canvi per cada diferència', () => {
    const r = canvis({ ...original, data: '2026-12-02', hora: '21:00' });
    expect(r.map((c) => c.tipus)).toEqual(['data', 'hora']);
  });
});
