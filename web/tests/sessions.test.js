import { describe, it, expect } from 'vitest';
import {
  sessionsPubliques,
  sessioPerSlug,
  properesSessions,
  sessionsRelacionades,
} from '../src/lib/sessions.js';
import { dataIso } from '../src/lib/format.js';

// Db fals: només `collection('sessions').get()`, com el que fa el codi real.
function dbFals(docs) {
  return {
    collection: (nom) => ({
      get: async () => ({
        docs: (nom === 'sessions' ? docs : []).map(({ id, ...dades }) => ({ id, data: () => dades })),
      }),
    }),
  };
}

// Sessions reals del front matter de Hugo (només els camps que fan servir els tests).
const sessio = (id, data, hora, publica, extra = {}) => ({
  id,
  titol: id,
  slug: id,
  publicada: true,
  data,
  hora,
  publica,
  ...extra,
});

const abejas = sessio('20000-especies-de-abejas', '2026-10-08', '19:00', {
  directors: ['Estibaliz Urresola Solaguren'],
  interprets: ['Sofía Otero', 'Patricia López Arnaiz', 'Ane Gabarain', 'Itziar Lazkano', 'Martxelo Rubio'],
  seccio: 'cartellera',
});
const domingos = sessio('los-domingos', '2026-09-03', '19:00', {
  directors: ['Alauda Ruiz de Azúa'],
  interprets: ['Blanca Soroa', 'Patricia López Arnaiz', 'Miguel Garcés', 'Juan Minujín', 'Mabel Rivera', 'Nagore Aranburu'],
  seccio: 'cartellera',
});
const jane = sessio('jane-eyre', '2026-08-06', '19:00', {
  directors: ['Cary Joji Fukunaga'],
  interprets: ['Mia Wasikowska', 'Michael Fassbender', 'Jamie Bell', 'Judi Dench', 'Sally Hawkins'],
  seccio: 'cartellera',
});
const dali = sessio('esperando-a-dali', '2026-07-23', '19:00', {
  directors: ['David Pujol'],
  interprets: ['Iván Massagué', 'José Garcia', 'Clara Ponsot'],
  seccio: 'cartellera',
});
const pig = sessio('pig', '2026-06-25', '19:00', {
  directors: ['Michael Sarnoski'],
  interprets: ['Nicolas Cage', 'Alex Wolff', 'Adam Arkin'],
  seccio: 'cartellera',
});
const gusen = sessio('carretera-a-gusen', '2026-05-09', '19:00', {
  directors: ['Eloy Calvo'],
  interprets: ['Àlex Cirera Izquierdo'],
  seccio: 'xarxa',
});
const preso = sessio('la-preso-invisible-executada', '2026-09-24', '18:30', { seccio: 'xarxa' });
const night = sessio('night-of-the-living-dead', '2026-10-22', '19:00', {
  directors: ['George A. Romero'],
  interprets: ['Duane Jones'],
  seccio: 'extra',
});

const totes = [pig, night, gusen, abejas, jane, preso, dali, domingos];
const ids = (llista) => llista.map((s) => s.id);

describe('sessionsPubliques', () => {
  it('descarta les no publicades i les sense slug, i ordena per data i hora', async () => {
    const db = dbFals([
      sessio('b', '2026-05-07', '19:00', {}),
      sessio('a', '2026-05-07', '18:00', {}),
      sessio('c', '2026-03-05', '19:00', {}),
      sessio('oculta', '2026-01-01', '19:00', {}, { publicada: false }),
      sessio('sense-slug', '2026-01-02', '19:00', {}, { slug: undefined }),
      sessio('sense-camp', '2026-01-03', '19:00', {}, { publicada: undefined }),
    ]);
    expect(ids(await sessionsPubliques(db))).toEqual(['c', 'a', 'b']);
  });

  it('ignora les publicades sense una `data` vàlida, perquè un sol document dolent no tombi el web', async () => {
    const db = dbFals([
      sessio('bona', '2026-05-07', '19:00', {}),
      sessio('sense-data', undefined, '19:00', {}),
      sessio('data-nul', null, '19:00', {}),
      sessio('data-text', 'aviat', '19:00', {}),
      sessio('data-numero', 20260507, '19:00', {}),
      sessio('mes-13', '2026-13-01', '19:00', {}),
      sessio('dia-31-feb', '2026-02-31', '19:00', {}),
      sessio('data-curta', '2026-5-7', '19:00', {}),
    ]);
    expect(ids(await sessionsPubliques(db))).toEqual(['bona']);
  });

  it('tracta l\'hora absent o invàlida com 00:00', async () => {
    const db = dbFals([
      sessio('tarda', '2026-05-07', '19:00', {}),
      sessio('sense-hora', '2026-05-07', undefined, {}),
      sessio('hora-nul', '2026-05-07', null, {}),
      sessio('hora-buida', '2026-05-07', '', {}),
      sessio('hora-dolenta', '2026-05-07', 'tard', {}),
    ]);
    const llista = await sessionsPubliques(db);
    expect(ids(llista).at(-1)).toBe('tarda');
    expect(llista.map((s) => s.hora)).toEqual(['00:00', '00:00', '00:00', '00:00', '19:00']);
    // i les plantilles poden construir la data ISO sense llançar
    expect(() => llista.forEach((s) => dataIso(s.data, s.hora))).not.toThrow();
  });

  it('conserva l\'id del document i les dades', async () => {
    const [s] = await sessionsPubliques(dbFals([pig]));
    expect(s.id).toBe('pig');
    expect(s.publica.directors).toEqual(['Michael Sarnoski']);
  });
});

describe('sessioPerSlug', () => {
  const db = dbFals([
    sessio('pig', '2026-06-25', '19:00', {}),
    sessio('pig', '2025-06-25', '19:00', {}, { id: 'pig-2025' }),
    sessio('oculta', '2026-01-01', '19:00', {}, { publicada: false }),
  ]);

  it('retorna la sessió de l\'any i el slug indicats', async () => {
    expect((await sessioPerSlug('2026', 'pig', db)).data).toBe('2026-06-25');
    expect((await sessioPerSlug('2025', 'pig', db)).id).toBe('pig-2025');
  });
  it('retorna null si no existeix o no està publicada', async () => {
    expect(await sessioPerSlug('2026', 'oculta', db)).toBeNull();
    expect(await sessioPerSlug('2024', 'pig', db)).toBeNull();
    expect(await sessioPerSlug('2026', 'altra', db)).toBeNull();
  });
});

describe('properesSessions', () => {
  const llista = [pig, gusen, domingos, preso, abejas, night, jane, dali];

  it('retorna les 3 properes en ordre ascendent', () => {
    const avui = new Date('2026-09-10T12:00:00+02:00');
    expect(ids(properesSessions(llista, avui))).toEqual([
      'la-preso-invisible-executada',
      '20000-especies-de-abejas',
      'night-of-the-living-dead',
    ]);
  });
  it('inclou la sessió del mateix dia fins a l\'hora d\'inici (Europe/Madrid)', () => {
    expect(ids(properesSessions(llista, new Date('2026-10-08T18:59:00+02:00'), 1))).toEqual(['20000-especies-de-abejas']);
    expect(ids(properesSessions(llista, new Date('2026-10-08T19:00:00+02:00'), 1))).toEqual(['20000-especies-de-abejas']);
    expect(ids(properesSessions(llista, new Date('2026-10-08T19:01:00+02:00'), 1))).toEqual(['night-of-the-living-dead']);
  });
  it('respecta n i retorna buit si no n\'hi ha', () => {
    expect(properesSessions(llista, new Date('2026-01-01T00:00:00Z'), 2)).toHaveLength(2);
    expect(properesSessions(llista, new Date('2027-01-01T00:00:00Z'))).toEqual([]);
  });
  it('no modifica l\'array d\'entrada', () => {
    const copia = [...llista];
    properesSessions(llista, new Date('2026-01-01T00:00:00Z'));
    expect(llista).toEqual(copia);
  });
});

describe('sessionsRelacionades (related-sessions.html)', () => {
  it('exclou la sessió actual i ordena: intèrpret compartit, després mateixa secció (més noves primer)', () => {
    // 20000 espècies comparteix "Patricia López Arnaiz" amb Los domingos.
    // La resta de "cartellera" van de més nova a més antiga; "xarxa" i "extra" no entren.
    expect(ids(sessionsRelacionades(abejas, totes))).toEqual(['los-domingos', 'jane-eyre', 'esperando-a-dali']);
  });

  it('una sessió sense directors ni intèrprets només rep les de la seva secció', () => {
    expect(ids(sessionsRelacionades(preso, totes))).toEqual(['carretera-a-gusen']);
  });

  it('la secció per defecte és "cartellera"', () => {
    const senseSeccio = sessio('x', '2026-02-01', '19:00', {});
    expect(ids(sessionsRelacionades(senseSeccio, totes))).toEqual([
      '20000-especies-de-abejas',
      'los-domingos',
      'jane-eyre',
    ]);
  });

  it('director compartit va primer; el criteri s\'aplica per candidata (if / else if / else)', () => {
    const mateixDirector = sessio('dir-antic', '2026-01-10', '19:00', { directors: ['Eloy Calvo'], seccio: 'xarxa' });
    const mateixDirectorNou = sessio('dir-nou', '2026-11-10', '19:00', {
      directors: ['Eloy Calvo'],
      interprets: ['Sofía Otero'],
      seccio: 'extra',
    });
    const actual = sessio('actual', '2026-12-01', '19:00', {
      directors: ['Eloy Calvo'],
      interprets: ['Sofía Otero'],
      seccio: 'cartellera',
    });
    const resultat = sessionsRelacionades(actual, [...totes, mateixDirector, mateixDirectorNou, actual]);
    // byDirector (nova -> antiga): dir-nou, carretera-a-gusen, dir-antic (director Eloy Calvo).
    // Omplen les 3 places: la de 20000 espècies (intèrpret Sofía Otero) queda fora.
    expect(ids(resultat)).toEqual(['dir-nou', 'carretera-a-gusen', 'dir-antic']);
  });

  it('una candidata que coincideix per director no entra també per secció (sense duplicats)', () => {
    const actual = sessio('actual', '2026-12-01', '19:00', { directors: ['Michael Sarnoski'], seccio: 'cartellera' });
    const resultat = ids(sessionsRelacionades(actual, [...totes, actual]));
    expect(resultat).toEqual(['pig', '20000-especies-de-abejas', 'los-domingos']);
    expect(new Set(resultat).size).toBe(3);
  });

  it('no depèn de l\'ordre de l\'entrada i no la modifica', () => {
    const copia = [...totes];
    expect(ids(sessionsRelacionades(abejas, [...totes].reverse()))).toEqual(ids(sessionsRelacionades(abejas, totes)));
    expect(totes).toEqual(copia);
  });
});
