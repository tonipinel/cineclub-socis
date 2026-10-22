import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { paramTermeValid, termesDe, trobaTerme } from '../src/lib/taxonomies.js';

const termesHugo = JSON.parse(readFileSync(new URL('./fixtures/hugo-termes.json', import.meta.url), 'utf8'));

const sessio = (data, publicada, publica) => ({ data, publicada, publica });

describe('termesDe', () => {
  const sessions = [
    sessio('2026-10-08', true, { directors: ['Mike Leigh'], generes: ['Drama'], interprets: ['Timothy Spall'] }),
    sessio('2026-09-03', true, { directors: ['Mike Leigh', 'Eloy Calvo'], generes: ['Drama', 'Època'], interprets: [] }),
    sessio('2026-11-05', false, { directors: ['Aquest no'], generes: ['Ocult'], interprets: ['Ningú'] }),
  ];

  it('agrupa per terme, amb slug i sessions, ordenat per nom', () => {
    const res = termesDe(sessions, 'directors');
    expect(res.map((t) => t.nom)).toEqual(['Eloy Calvo', 'Mike Leigh']);
    expect(res[1].slug).toBe('mike-leigh');
    expect(res[1].sessions).toHaveLength(2);
  });

  it('ignora les sessions no publicades', () => {
    expect(termesDe(sessions, 'directors').some((t) => t.nom === 'Aquest no')).toBe(false);
    expect(termesDe(sessions, 'generes').map((t) => t.nom)).toEqual(['Drama', 'Època']);
  });

  it('tolera camps absents', () => {
    expect(termesDe([sessio('2026-01-01', true, {})], 'interprets')).toEqual([]);
    expect(termesDe([sessio('2026-01-01', true, undefined)], 'interprets')).toEqual([]);
  });
});

describe('termesDe: dades dolentes i grafies', () => {
  const publica = (directors, data = '2026-01-01', hora) => ({ data, hora, publicada: true, publica: { directors } });

  it('ignora els noms que no són text i les llistes que no són llista, sense llançar', () => {
    const sessions = [publica(['Bo', 42, null, {}, ['x'], true]), publica('Mike Leigh'), publica({ 0: 'Mike' })];
    expect(termesDe(sessions, 'directors').map((t) => t.nom)).toEqual(['Bo']);
  });

  it('salta els noms que fan un slug buit', () => {
    const sessions = [publica(['', '   ', '!!!', '¿?', 'Real'])];
    expect(termesDe(sessions, 'directors').map((t) => t.nom)).toEqual(['Real']);
  });

  it('les grafies NFC i NFD d\'un mateix nom són un sol terme (en NFC)', () => {
    const nfc = 'Alauda Ruiz de Azúa';
    const nfd = nfc.normalize('NFD');
    expect(nfd).not.toBe(nfc);
    const res = termesDe([publica([nfd], '2026-02-01'), publica([nfc], '2026-03-01')], 'directors');
    expect(res).toHaveLength(1);
    expect(res[0].nom).toBe(nfc);
    expect(res[0].slug).toBe(nfc.toLowerCase().replace(/ /g, '-'));
    expect(res[0].sessions).toHaveLength(2);
  });

  it('una sessió que repeteix el nom en dues grafies compta una sola vegada', () => {
    const nfc = 'Azúa';
    const res = termesDe([publica([nfc, nfc.normalize('NFD')])], 'directors');
    expect(res[0].sessions).toHaveLength(1);
  });

  it('l\'hora `9:30` ordena abans que `10:00` i la grafia és la de la sessió més antiga', () => {
    const res = termesDe([publica(['Zeta'], '2026-01-01', '10:00'), publica(['ZETA'], '2026-01-01', '9:30')], 'directors');
    expect(res[0].nom).toBe('ZETA');
  });
});

describe('termesDe: ordre i nom (com `.Data.Terms.Alphabetical` i `.Title` de Hugo)', () => {
  // Una sessió per terme real, en ordre barrejat, per comprovar que l'ordre surt de l'ordenació.
  const barrejat = (noms) => [...noms].sort((a, b) => (a.length * 7 + a.charCodeAt(1)) - (b.length * 7 + b.charCodeAt(1)));

  for (const camp of ['directors', 'generes', 'interprets']) {
    it(`ordena els ${camp} reals igual que el /${camp}/ de Hugo (amb accents i apòstrofs)`, () => {
      const noms = termesHugo[camp].map((t) => t.nom);
      const sessions = barrejat(noms).map((nom, i) => sessio(`2026-01-${String(i % 28 + 1).padStart(2, '0')}`, true, { [camp]: [nom] }));
      const res = termesDe(sessions, camp);
      expect(res.map((t) => t.nom)).toEqual(noms);
      expect(res.map((t) => t.slug)).toEqual(termesHugo[camp].map((t) => t.carpeta));
    });
  }

  it('Àlex va entre Adam i Alex Wolff (el col·lacionat ignora l\'accent en primera instància)', () => {
    const noms = ['Alex Wolff', 'Àlex Cirera Izquierdo', 'Adam Arkin'];
    const res = termesDe(noms.map((nom) => sessio('2026-01-01', true, { interprets: [nom] })), 'interprets');
    expect(res.map((t) => t.nom)).toEqual(['Adam Arkin', 'Àlex Cirera Izquierdo', 'Alex Wolff']);
  });

  it('Romàntic va abans de Romàntica i Comèdia abans de Comèdia dramàtica', () => {
    const noms = ['Romàntica', 'Comèdia dramàtica', 'Romàntic', 'Comèdia'];
    const res = termesDe(noms.map((nom) => sessio('2026-01-01', true, { generes: [nom] })), 'generes');
    expect(res.map((t) => t.nom)).toEqual(['Comèdia', 'Comèdia dramàtica', 'Romàntic', 'Romàntica']);
  });

  it('si dues grafies donen el mateix slug, el nom és el de la sessió més antiga', () => {
    const sessions = [
      sessio('2026-05-01', true, { interprets: ["Judith O'Dea"] }),
      sessio('2026-02-01', true, { interprets: ['Judith ODea'] }),
    ];
    const [terme, ...resta] = termesDe(sessions, 'interprets');
    expect(resta).toEqual([]);
    expect(terme.nom).toBe('Judith ODea');
    expect(terme.slug).toBe('judith-odea');
    expect(terme.sessions.map((s) => s.data)).toEqual(['2026-02-01', '2026-05-01']);
  });

  it('el nom surt de la sessió més antiga encara que arribin en un altre ordre', () => {
    const sessions = [
      sessio('2026-05-01', true, { generes: ['DRAMA'] }),
      sessio('2026-02-01', true, { generes: ['Drama'] }),
    ];
    expect(termesDe(sessions, 'generes')[0].nom).toBe('Drama');
  });

  it('ignora els noms buits', () => {
    expect(termesDe([sessio('2026-01-01', true, { generes: ['', 'Drama'] })], 'generes').map((t) => t.nom)).toEqual(['Drama']);
  });
});

describe('trobaTerme', () => {
  const termes = termesDe([
    sessio('2026-09-03', true, { directors: ['Alauda Ruiz de Azúa'], interprets: ["Judith O'Dea"], generes: ['Drama'] }),
  ], 'directors');

  it('resol la forma amb accents i la percent-encoded ja decodificada', () => {
    expect(trobaTerme(termes, 'alauda-ruiz-de-azúa').nom).toBe('Alauda Ruiz de Azúa');
    expect(trobaTerme(termes, decodeURIComponent('alauda-ruiz-de-az%C3%BAa')).nom).toBe('Alauda Ruiz de Azúa');
  });
  it('accepta la forma descomposta (NFD) del mateix slug', () => {
    expect(trobaTerme(termes, 'alauda-ruiz-de-azúa'.normalize('NFD')).nom).toBe('Alauda Ruiz de Azúa');
  });
  it('no accepta majúscules, parts ni altres termes', () => {
    expect(trobaTerme(termes, 'Alauda-Ruiz-de-Azúa')).toBeNull();
    expect(trobaTerme(termes, 'alauda')).toBeNull();
    expect(trobaTerme(termes, '')).toBeNull();
    expect(trobaTerme(termes, undefined)).toBeNull();
  });
});

describe('paramTermeValid', () => {
  it('accepta text normal (amb accents i espais) i rebutja formes impossibles', () => {
    for (const bo of ['mike-leigh', 'azúa', 'a'.repeat(200), 'dos paraules']) expect(paramTermeValid(bo)).toBe(true);
    for (const dolent of ['', 'a'.repeat(201), 'a\tb', 'a\u0000', 'a\u0085', undefined, null, 3]) expect(paramTermeValid(dolent)).toBe(false);
  });
});
