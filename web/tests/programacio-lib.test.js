import { describe, it, expect } from 'vitest';
import { sessionsMosaic, sessionsDescendents, anysAmbSessions } from '../src/lib/sessions.js';
import { elementsCalendari } from '../src/lib/calendari.js';

const s = (id, data, hora = '19:00', publica = { seccio: 'cartellera' }) => ({ id, titol: id, slug: id, publicada: true, data, hora, publica });

const artist = s('the-artist', '2026-03-05');
const pig = s('pig', '2026-06-25');
const gusen = s('gusen', '2026-05-09', '19:00', { seccio: 'xarxa' });
const abejas = s('abejas', '2026-10-08');
const night = s('night', '2026-10-22', '19:00', { seccio: 'extra' });
const nou = s('nou', '2026-12-10');
const totes = [artist, pig, gusen, abejas, night, nou];

const ara = new Date('2026-10-21T12:00:00+02:00');

describe('sessionsDescendents', () => {
  it('ordena de la més nova a la més antiga (com RegularPages de Hugo)', () => {
    expect(sessionsDescendents(totes).map((x) => x.id)).toEqual(['nou', 'night', 'abejas', 'pig', 'gusen', 'the-artist']);
  });
});

describe('sessionsMosaic', () => {
  it('posa al final les 3 properes i la resta en ordre descendent', () => {
    expect(sessionsMosaic(totes, ara).map((x) => x.id)).toEqual(['abejas', 'pig', 'gusen', 'the-artist', 'night', 'nou']);
  });
  it('talla a 9', () => {
    const moltes = Array.from({ length: 12 }, (_, i) => s(`p${i}`, `2026-0${1 + (i % 9)}-1${i % 9}`));
    expect(sessionsMosaic(moltes, ara)).toHaveLength(9);
  });
  it('si no hi ha properes, deixa tot descendent', () => {
    expect(sessionsMosaic([artist, pig], ara).map((x) => x.id)).toEqual(['pig', 'the-artist']);
  });
  it('tria només les 3 properes si n\'hi ha més de 3', () => {
    const futur = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'].map((d, i) => s(`f${i}`, d));
    expect(sessionsMosaic(futur, ara, 9).map((x) => x.id)).toEqual(['f3', 'f0', 'f1', 'f2']);
  });
});

describe('anysAmbSessions', () => {
  it('agrupa per any (anys descendents) amb les sessions ascendents', () => {
    const grups = anysAmbSessions([s('b', '2025-12-04'), pig, s('a', '2025-01-09'), artist]);
    expect(grups.map((g) => g.any)).toEqual(['2026', '2025']);
    expect(grups[0].sessions.map((x) => x.id)).toEqual(['the-artist', 'pig']);
    expect(grups[1].sessions.map((x) => x.id)).toEqual(['a', 'b']);
  });
});

describe('elementsCalendari', () => {
  it('llista les sessions i afegeix 3 «Per determinar» en els propers mesos sense cartellera', () => {
    const els = elementsCalendari(totes, ara);
    const pendents = els.filter((e) => !e.url);
    // Octubre ja té cartellera (abejas); novembre, desembre (nou és cartellera) -> nov, gener, febrer.
    expect(pendents.map((e) => e.data)).toEqual(['2026-11-05', '2027-01-07', '2027-02-04']);
    expect(pendents.every((e) => e.hora === '19:00' && e.titol === 'Per determinar')).toBe(true);
  });
  it('ordena per data i ho fa amb enllaç a les sessions', () => {
    const els = elementsCalendari(totes, ara);
    expect(els.map((e) => e.data)).toEqual([...els.map((e) => e.data)].sort());
    expect(els.find((e) => e.titol === 'pig').url).toBe('/programacio/2026/pig/');
  });
  it('no posa pendents en una data ja passada d\'aquest mes', () => {
    const tard = new Date('2026-11-20T12:00:00+01:00');
    const pendents = elementsCalendari([], tard).filter((e) => !e.url);
    expect(pendents.map((e) => e.data)).toEqual(['2026-12-03', '2027-01-07', '2027-02-04']);
  });
});
