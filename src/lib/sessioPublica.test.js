import { describe, it, expect } from 'vitest';
import {
  generarSlug, slugDisponible, construirSessioDesDeProposta, validarPublicable, netejarPublica, marcarActualitzada,
  publicaAFormulari, formulariAPublica, camiPublic, urlPublica, afegirAlias, esSlugValid, validarImatge, camiImatge, urlStorage,
} from './sessioPublica';

const SINOPSI = 'Yukiko, una jove mecanògrafa, torna del Vietnam a un Tòquio devastat per la guerra i retroba Tomioka, l\'home amb qui va tenir una relació. '
  + 'Ell la rebutja i comença una història de desengany i dependència que els acompanyarà durant anys.';

const FLOATING_CLOUDS = {
  titol: 'Floating Clouds',
  titolLocal: 'Nubes flotantes',
  directors: ['成瀬巳喜男'],
  guionistes: ['水木洋子'],
  paisos: ['Japó'],
  any: '1955',
  durada: 123,
  idiomes: ['Japonès'],
  generes: ['Drama', 'Romanç'],
  repartiment: Array.from({ length: 10 }, (_, i) => ({ nom: `Actor ${i + 1}`, personatge: `Personatge ${i + 1}` })),
  sinopsi: SINOPSI,
  trailerUrl: '',
  imatgeUrl: 'https://firebasestorage.googleapis.com/v0/b/cineclub-socis.firebasestorage.app/o/carteils%2Ffc.jpg?alt=media',
  cartellPath: 'carteils/fc.jpg',
  imatges: [],
  nomProposant: 'Anna',
  comentari: 'Imprescindible',
  numeroSoci: 12,
  estat: 'proposada',
};

const AVUI = new Date('2026-10-22T10:00:00Z');

describe('generarSlug', () => {
  it('passa a minúscules amb guions', () => {
    expect(generarSlug('Floating Clouds')).toBe('floating-clouds');
  });

  it('treu accents i símbols', () => {
    expect(generarSlug('La tarta del presidente!')).toBe('la-tarta-del-presidente');
    expect(generarSlug('  Ñandú: Él & Ça va?  ')).toBe('nandu-el-ca-va');
  });

  it('retalla a 60 caràcters sense deixar guió final', () => {
    const slug = generarSlug('a'.repeat(59) + ' bbbbbbbbbb');
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('transliterra lletres sense descomposició', () => {
    expect(generarSlug('Øresund æble Straße Łódź Đorđe')).toBe('oresund-aeble-strasse-lodz-dorde');
  });

  it('retorna buit si no hi ha res aprofitable', () => {
    expect(generarSlug('')).toBe('');
    expect(generarSlug('成瀬巳喜男')).toBe('');
    expect(generarSlug(undefined)).toBe('');
  });
});

describe('slugDisponible', () => {
  const sessions = [
    { id: 'a', slug: 'floating-clouds', data: '2026-11-05' },
    { id: 'b', slug: 'altra', data: '2026-11-12' },
    { id: 'c', data: '2026-11-19' },
    { id: 'd', slug: 'sense-data' },
  ];

  it('és lliure si cap altra sessió té el mateix slug i any', () => {
    expect(slugDisponible('nova', '2026-12-03', sessions)).toBe(true);
  });

  it('no és lliure si una altra sessió el té el mateix any', () => {
    expect(slugDisponible('floating-clouds', '2026-12-03', sessions)).toBe(false);
  });

  it('és lliure si el té la pròpia sessió', () => {
    expect(slugDisponible('floating-clouds', '2026-11-05', sessions, 'a')).toBe(true);
  });

  it('és lliure en un any diferent', () => {
    expect(slugDisponible('floating-clouds', '2027-01-14', sessions)).toBe(true);
  });

  it('tolera dates que no són text (Timestamp, null) i una data buida', () => {
    const rares = [{ id: 'x', slug: 'nova', data: { seconds: 1 } }, { id: 'y', slug: 'nova', data: null }];
    expect(slugDisponible('nova', '2026-12-03', rares)).toBe(true);
    expect(slugDisponible('nova', '', [{ id: 'z', slug: 'nova', data: '2026-01-01' }])).toBe(true);
    expect(slugDisponible('nova', '', [{ id: 'z', slug: 'nova', data: '' }])).toBe(true);
  });

  it('ignora les sessions sense slug o sense data', () => {
    expect(slugDisponible('sense-data', '2026-11-05', sessions)).toBe(true);
  });
});

describe('construirSessioDesDeProposta', () => {
  const { sessio, slugSuggerit } = construirSessioDesDeProposta(FLOATING_CLOUDS, { propostaId: 'prop1', avui: AVUI });

  it('crea els camps de gestió sense publicar', () => {
    expect(sessio).toMatchObject({
      titol: 'Floating Clouds',
      data: '',
      hora: '19:00',
      urlProgramacio: '',
      imatgeUrl: FLOATING_CLOUDS.imatgeUrl,
      publicada: false,
      slug: '',
      propostaId: 'prop1',
    });
    expect(sessio).not.toHaveProperty('activa');
  });

  it('suggereix el slug del títol original', () => {
    expect(slugSuggerit).toBe('floating-clouds');
  });

  it('usa el títol local si l\'original no dóna slug o no hi és', () => {
    const r = construirSessioDesDeProposta({ ...FLOATING_CLOUDS, titol: '浮雲' }, { propostaId: 'p', avui: AVUI });
    expect(r.slugSuggerit).toBe('nubes-flotantes');
    expect(r.sessio.titol).toBe('浮雲');
    const r2 = construirSessioDesDeProposta({ ...FLOATING_CLOUDS, titol: undefined }, { propostaId: 'p', avui: AVUI });
    expect(r2.sessio.titol).toBe('Nubes flotantes');
    expect(r2.sessio.publica.titol).toBe('Nubes flotantes');
    expect(r2.sessio.publica).not.toHaveProperty('titolOriginal');
    expect(r2.sessio.publica).not.toHaveProperty('titolEspanya');
    const r3 = construirSessioDesDeProposta({ ...FLOATING_CLOUDS, titolLocal: 'FLOATING CLOUDS' }, { propostaId: 'p', avui: AVUI });
    expect(r3.sessio.publica).not.toHaveProperty('titolEspanya');
  });

  it('mapeja la fitxa pública', () => {
    const p = sessio.publica;
    expect(p.titol).toBe('Floating Clouds');
    expect(p.titolOriginal).toBe('Floating Clouds');
    expect(p.titolEspanya).toBe('Nubes flotantes');
    expect(p).not.toHaveProperty('titolTraduit');
    expect(p.directors).toEqual(['成瀬巳喜男']);
    expect(p.guio).toBe('水木洋子');
    expect(p.pais).toBe('Japó');
    expect(p.any).toBe('1955');
    expect(p.durada).toBe(123);
    expect(p.idioma).toBe('Japonès');
    expect(p.generes).toEqual(['Drama', 'Romanç']);
    expect(p.sinopsiCartell).toBe(SINOPSI);
    expect(p.cartell).toBe(FLOATING_CLOUDS.imatgeUrl);
    expect(p.seccio).toBe('cartellera');
  });

  it('uneix amb coma guionistes, països i idiomes', () => {
    const r = construirSessioDesDeProposta(
      { ...FLOATING_CLOUDS, guionistes: ['A', 'B'], paisos: ['Japó', 'França'], idiomes: ['Japonès', 'Francès'] },
      { propostaId: 'p', avui: AVUI },
    );
    expect(r.sessio.publica.guio).toBe('A, B');
    expect(r.sessio.publica.pais).toBe('Japó, França');
    expect(r.sessio.publica.idioma).toBe('Japonès, Francès');
  });

  it('copia fotografia, muntatge, música i producció com a text i omet els buits', () => {
    const r = construirSessioDesDeProposta(
      {
        ...FLOATING_CLOUDS, fotografia: ['Masao Tamai'], muntatge: ['Hideshi Ohi', ' '], musica: ['Ichirō Saitō'], produccio: ['Toho', 'Altra'],
      },
      { propostaId: 'p', avui: AVUI },
    );
    expect(r.sessio.publica).toMatchObject({
      fotografia: 'Masao Tamai', muntatge: 'Hideshi Ohi', musica: 'Ichirō Saitō', produccio: 'Toho, Altra',
    });
    const buida = construirSessioDesDeProposta({ ...FLOATING_CLOUDS, fotografia: [], musica: null }, { propostaId: 'p' });
    for (const camp of ['fotografia', 'muntatge', 'musica', 'produccio']) expect(buida.sessio.publica).not.toHaveProperty(camp);
  });

  it('limita els intèrprets a 8 i en treu el personatge', () => {
    expect(sessio.publica.interprets).toEqual(Array.from({ length: 8 }, (_, i) => `Actor ${i + 1}`));
  });

  it('retalla la descripció a 160 caràcters en una paraula sencera amb punts suspensius', () => {
    const d = sessio.publica.descripcio;
    expect(d.length).toBeLessThanOrEqual(160);
    expect(d.endsWith('…')).toBe(true);
    const cos = d.slice(0, -1);
    expect(SINOPSI.startsWith(cos)).toBe(true);
    expect(SINOPSI[cos.length]).toMatch(/[\s,;:.]/);
    expect(cos).toMatch(/[\p{L}\p{N}]$/u);
  });

  it('treu la puntuació final abans del punt suspensiu', () => {
    const sinopsi = `${'a'.repeat(150)}, bbbbbbbbbbbb cccc`;
    const d = construirSessioDesDeProposta({ titol: 'X', sinopsi }, { propostaId: 'p' }).sessio.publica.descripcio;
    expect(d).toBe(`${'a'.repeat(150)}…`);
  });

  it('no afegeix punts suspensius si la sinopsi cap sencera', () => {
    const r = construirSessioDesDeProposta({ ...FLOATING_CLOUDS, sinopsi: 'Una sinopsi curta.' }, { propostaId: 'p', avui: AVUI });
    expect(r.sessio.publica.descripcio).toBe('Una sinopsi curta.');
  });

  it('extreu l\'id del tràiler de YouTube', () => {
    const id = 'dQw4w9WgXcQ';
    const urls = [
      `https://youtu.be/${id}`,
      `https://youtu.be/${id}?si=abc`,
      `https://www.youtube.com/watch?v=${id}`,
      `https://www.youtube.com/watch?feature=share&v=${id}&t=3`,
      `https://www.youtube.com/embed/${id}`,
      `https://youtube.com/shorts/${id}`,
    ];
    for (const trailerUrl of urls) {
      const r = construirSessioDesDeProposta({ ...FLOATING_CLOUDS, trailerUrl }, { propostaId: 'p', avui: AVUI });
      expect(r.sessio.publica.trailerYoutubeId).toBe(id);
    }
  });

  it('no posa trailerYoutubeId si no és de YouTube o és buit', () => {
    for (const trailerUrl of ['', undefined, 'https://vimeo.com/12345', 'https://exemple.com/watch?v=abc']) {
      const r = construirSessioDesDeProposta({ ...FLOATING_CLOUDS, trailerUrl }, { propostaId: 'p', avui: AVUI });
      expect(r.sessio.publica).not.toHaveProperty('trailerYoutubeId');
    }
  });

  it('marca la data d\'actualització d\'Europe/Madrid', () => {
    expect(sessio.publica.actualitzatEl).toBe('2026-10-22');
  });

  it('no filtra res intern ni dades del proposant', () => {
    const text = JSON.stringify(sessio);
    expect(text).not.toContain('Anna');
    expect(text).not.toContain('Imprescindible');
    expect(sessio).not.toHaveProperty('propostesInternes');
    expect(sessio.publica).not.toHaveProperty('propostesInternes');
    expect(sessio.publica).not.toHaveProperty('preu');
    expect(sessio.publica).not.toHaveProperty('versioTipus');
  });

  it('no genera undefined amb camps absents', () => {
    const r = construirSessioDesDeProposta({ titol: 'Només títol' }, { propostaId: 'p', avui: AVUI });
    expect(r.sessio.titol).toBe('Només títol');
    expect(r.sessio.imatgeUrl).toBe('');
    expect(r.sessio.publica).not.toHaveProperty('cartell');
    expect(r.sessio.publica).not.toHaveProperty('descripcio');
    expect(r.sessio.publica).not.toHaveProperty('durada');
    expect(r.sessio.publica.directors).toEqual([]);
    expect(r.sessio.publica.interprets).toEqual([]);
    expect(r.sessio.publica.generes).toEqual([]);
    const buscaUndefined = (o) => Object.values(o).some((v) => v === undefined || (v && typeof v === 'object' && !Array.isArray(v) && buscaUndefined(v)));
    expect(buscaUndefined(r.sessio)).toBe(false);
  });

  it('no passa a publica una durada NaN, 0, negativa o no numèrica, ni un any buit', () => {
    for (const durada of [NaN, 0, -5, '123', null, Infinity]) {
      const r = construirSessioDesDeProposta({ titol: 'X', durada, any: '' }, { propostaId: 'p', avui: AVUI });
      expect(r.sessio.publica).not.toHaveProperty('durada');
      expect(r.sessio.publica).not.toHaveProperty('any');
    }
  });

  it('fa trim de titolLocal i titol abans del fallback', () => {
    const r = construirSessioDesDeProposta({ titol: '  Floating Clouds ', titolLocal: '   ' }, { propostaId: 'p' });
    expect(r.sessio.titol).toBe('Floating Clouds');
    expect(r.sessio.publica.titol).toBe('Floating Clouds');
    expect(r.sessio.publica.titolOriginal).toBe('Floating Clouds');
    expect(r.sessio.publica).not.toHaveProperty('titolEspanya');
    expect(r.slugSuggerit).toBe('floating-clouds');
  });

  it('accepta trailers sense protocol i altres formes de YouTube', () => {
    const id = 'dQw4w9WgXcQ';
    const urls = [
      `www.youtube.com/watch?v=${id}`, `youtu.be/${id}`, `youtube.com/shorts/${id}`,
      `https://www.youtube.com/live/${id}`, `https://www.youtube.com/v/${id}`,
      `https://www.youtube-nocookie.com/embed/${id}`, `  https://youtu.be/${id}  `,
    ];
    for (const trailerUrl of urls) {
      const r = construirSessioDesDeProposta({ titol: 'X', trailerUrl }, { propostaId: 'p' });
      expect(r.sessio.publica.trailerYoutubeId).toBe(id);
    }
  });

  it('només accepta ids de YouTube d\'11 caràcters', () => {
    for (const trailerUrl of ['https://youtu.be/abc123', 'https://youtu.be/dQw4w9WgXcQextra']) {
      const r = construirSessioDesDeProposta({ titol: 'X', trailerUrl }, { propostaId: 'p' });
      expect(r.sessio.publica).not.toHaveProperty('trailerYoutubeId');
    }
  });

  it('tolera una proposta null o undefined', () => {
    for (const proposta of [null, undefined]) {
      const { sessio, slugSuggerit } = construirSessioDesDeProposta(proposta, { propostaId: 'p' });
      expect(slugSuggerit).toBe('');
      expect(sessio.titol).toBe('');
      expect(sessio.publicada).toBe(false);
      expect(sessio.publica.directors).toEqual([]);
    }
  });

  it('tolera repartiment, guionistes, països i idiomes que no són arrays', () => {
    const r = construirSessioDesDeProposta(
      { titol: 'X', repartiment: 'Actor Sol', guionistes: 'Guionista', paisos: 'Japó', idiomes: 'Japonès' },
      { propostaId: 'p' },
    );
    expect(r.sessio.publica.interprets).toEqual(['Actor Sol']);
    expect(r.sessio.publica.guio).toBe('Guionista');
    expect(r.sessio.publica.pais).toBe('Japó');
    expect(r.sessio.publica.idioma).toBe('Japonès');
    const r2 = construirSessioDesDeProposta({ titol: 'X', repartiment: { nom: 'A' } }, { propostaId: 'p' });
    expect(r2.sessio.publica.interprets).toEqual(['A']);
    const r3 = construirSessioDesDeProposta({ titol: 'X', repartiment: ['Actor Sol'] }, { propostaId: 'p' });
    expect(r3.sessio.publica.interprets).toEqual(['Actor Sol']);
  });

  it('tracta un avui invàlid com a absent', () => {
    for (const avui of [new Date('x'), 'ahir', 5, null]) {
      const r = construirSessioDesDeProposta({ titol: 'X' }, { propostaId: 'p', avui });
      expect(r.sessio.publica).not.toHaveProperty('actualitzatEl');
    }
  });
});

describe('validarPublicable', () => {
  const base = {
    id: 's1',
    titol: 'Nubes flotantes',
    slug: 'nubes-flotantes',
    data: '2026-11-05',
    publica: { cartell: 'https://exemple.com/c.jpg' },
  };

  it('accepta una sessió completa', () => {
    expect(validarPublicable(base, [])).toEqual({ valid: true, errors: {}, avisos: {} });
  });

  it('exigeix títol', () => {
    const r = validarPublicable({ ...base, titol: '  ' }, []);
    expect(r.valid).toBe(false);
    expect(r.errors.titol).toBeTruthy();
  });

  it('exigeix slug i que sigui vàlid', () => {
    expect(validarPublicable({ ...base, slug: '' }, []).errors.slug).toBeTruthy();
    for (const slug of ['Majúscules', 'amb espais', '-inici', 'final-', 'dos--guions', 'ñ']) {
      const r = validarPublicable({ ...base, slug }, []);
      expect(r.valid).toBe(false);
      expect(r.errors.slug).toBeTruthy();
    }
  });

  it('rebutja un slug ja usat el mateix any, però no el de la pròpia sessió', () => {
    const altres = [{ id: 's2', slug: 'nubes-flotantes', data: '2026-03-01' }];
    expect(validarPublicable(base, altres).errors.slug).toBeTruthy();
    expect(validarPublicable(base, [...altres, base]).errors.slug).toBeTruthy();
    expect(validarPublicable(base, [{ id: 's1', slug: 'nubes-flotantes', data: '2026-11-05' }]).valid).toBe(true);
    expect(validarPublicable(base, [{ id: 's2', slug: 'nubes-flotantes', data: '2025-03-01' }]).valid).toBe(true);
  });

  it('exigeix una data de calendari vàlida', () => {
    for (const data of ['', undefined, '05/11/2026', '2026-02-31', '2026-13-01', '2026-11-5']) {
      const r = validarPublicable({ ...base, data }, []);
      expect(r.valid).toBe(false);
      expect(r.errors.data).toBeTruthy();
    }
  });

  it('exigeix que el preu sigui un número >= 0 si hi és', () => {
    expect(validarPublicable({ ...base, publica: { ...base.publica, preu: 0 } }, []).valid).toBe(true);
    expect(validarPublicable({ ...base, publica: { ...base.publica, preu: 5.5 } }, []).valid).toBe(true);
    for (const preu of [-1, 'cinc', NaN, '0', Infinity]) {
      const r = validarPublicable({ ...base, publica: { ...base.publica, preu } }, []);
      expect(r.valid).toBe(false);
      expect(r.errors.preu).toBeTruthy();
    }
    expect(validarPublicable({ ...base, publica: { ...base.publica, preu: '' } }, []).valid).toBe(true);
  });

  it('sense cartell dóna un avís però no invalida', () => {
    const r = validarPublicable({ ...base, publica: {} }, []);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual({});
    expect(r.avisos.cartell).toBeTruthy();
    expect(validarPublicable({ ...base, publica: undefined }, []).avisos.cartell).toBeTruthy();
  });
});

describe('netejarPublica', () => {
  it('elimina els valors buits però conserva 0 i false', () => {
    expect(netejarPublica({
      a: '', b: null, c: undefined, d: [], e: 0, f: false, g: 'text', h: ['x'],
    })).toEqual({
      directors: [], interprets: [], generes: [], participa: [], collabora: [], aliases: [], e: 0, f: false, g: 'text', h: ['x'],
    });
  });

  it('elimina NaN', () => {
    expect(netejarPublica({ a: NaN, b: 1 })).toMatchObject({ b: 1 });
    expect(netejarPublica({ a: NaN })).not.toHaveProperty('a');
  });

  it('conserva sempre les llistes com a arrays', () => {
    const r = netejarPublica({ directors: null, interprets: undefined, generes: 'Drama', participa: ['A'] });
    expect(r.directors).toEqual([]);
    expect(r.interprets).toEqual([]);
    expect(r.generes).toEqual(['Drama']);
    expect(r.participa).toEqual(['A']);
    expect(r.collabora).toEqual([]);
    expect(r.aliases).toEqual([]);
  });

  it('no modifica l\'original', () => {
    const original = { a: '', directors: null };
    netejarPublica(original);
    expect(original).toEqual({ a: '', directors: null });
  });
});

describe('marcarActualitzada', () => {
  it('posa la data d\'Europe/Madrid, no la d\'UTC', () => {
    expect(marcarActualitzada({ a: 1 }, new Date('2026-10-21T22:30:00Z')).actualitzatEl).toBe('2026-10-22');
    expect(marcarActualitzada({ a: 1 }, new Date('2026-01-15T23:30:00Z')).actualitzatEl).toBe('2026-01-16');
    expect(marcarActualitzada({ a: 1 }, new Date('2026-07-15T12:00:00Z')).actualitzatEl).toBe('2026-07-15');
  });

  it('conserva la resta de camps sense mutar l\'original', () => {
    const original = { a: 1, actualitzatEl: '2020-01-01' };
    const r = marcarActualitzada(original, new Date('2026-07-15T12:00:00Z'));
    expect(r).toEqual({ a: 1, actualitzatEl: '2026-07-15' });
    expect(original.actualitzatEl).toBe('2020-01-01');
  });
});

describe('formulari de la pàgina pública', () => {
  const PUBLICA = {
    titol: 'Pig', directors: ['Michael Sarnoski'], interprets: [], generes: ['Drama', 'Thriller'],
    any: 2021, durada: 92, preu: 0, edatMinimaRecomanada: 12, trailerYoutubeId: '22EdsxVNJiQ',
    cartell: 'https://x/poster.jpg', galeria: ['https://x/g1.jpg'], aliases: ['/programacio/25-de-juny-pig/'], cos: '## Sinopsi',
  };

  it('converteix publica a text de formulari i de tornada sense perdre res', () => {
    const form = publicaAFormulari(PUBLICA);
    expect(form.directors).toBe('Michael Sarnoski');
    expect(form.generes).toBe('Drama, Thriller');
    expect(form.preu).toBe('0');
    expect(form.durada).toBe('92');
    const { publica, errors } = formulariAPublica(form);
    expect(errors).toEqual({});
    expect(netejarPublica(publica)).toEqual(netejarPublica(PUBLICA));
  });

  it('porta l\'id i el nom de la distribuïdora d\'anada i tornada; buits, desapareixen', () => {
    const form = publicaAFormulari({ suportDistribucio: 'Atalante', suportDistribucioId: 'd1' });
    expect(form.suportDistribucio).toBe('Atalante');
    expect(form.suportDistribucioId).toBe('d1');
    expect(netejarPublica(formulariAPublica(form).publica)).toMatchObject({ suportDistribucio: 'Atalante', suportDistribucioId: 'd1' });
    expect(publicaAFormulari(undefined).suportDistribucioId).toBe('');
    const buida = netejarPublica(formulariAPublica({ ...form, suportDistribucio: '', suportDistribucioId: '' }).publica);
    expect(buida).not.toHaveProperty('suportDistribucio');
    expect(buida).not.toHaveProperty('suportDistribucioId');
  });

  it('un formulari sense publica és buit i torna una publica neta sense camps', () => {
    const form = publicaAFormulari(undefined);
    expect(form.titol).toBe('');
    expect(form.galeria).toEqual([]);
    const { publica } = formulariAPublica(form);
    expect(Object.keys(netejarPublica(publica)).sort()).toEqual(['aliases', 'collabora', 'directors', 'generes', 'interprets', 'participa']);
  });

  it('el preu 0 és 0, el buit no hi és, el decimal amb coma és número i el text és error', () => {
    const base = publicaAFormulari({});
    expect(formulariAPublica({ ...base, preu: '0' }).publica.preu).toBe(0);
    expect(formulariAPublica({ ...base, preu: ' ' }).publica.preu).toBeUndefined();
    expect(formulariAPublica({ ...base, preu: '4,50' }).publica.preu).toBe(4.5);
    expect(formulariAPublica({ ...base, preu: 'gratis' }).errors.preu).toMatch(/preu/);
    expect(formulariAPublica({ ...base, durada: 'llarga' }).errors.durada).toBeTruthy();
    expect(formulariAPublica({ ...base, edatMinimaRecomanada: 'TP' }).errors.edatMinimaRecomanada).toBeTruthy();
  });

  it('separa les llistes per comes i accepta URL o id de YouTube', () => {
    const base = publicaAFormulari({});
    const { publica } = formulariAPublica({
      ...base, interprets: ' Anna,  Pere ,', trailerYoutubeId: 'https://www.youtube.com/watch?v=22EdsxVNJiQ',
    });
    expect(publica.interprets).toEqual(['Anna', 'Pere']);
    expect(publica.trailerYoutubeId).toBe('22EdsxVNJiQ');
    expect(formulariAPublica({ ...base, trailerYoutubeId: '22EdsxVNJiQ' }).publica.trailerYoutubeId).toBe('22EdsxVNJiQ');
    expect(formulariAPublica({ ...base, trailerYoutubeId: 'no és un vídeo' }).errors.trailerYoutubeId).toBeTruthy();
  });

  it('una descripció de més de 160 caràcters és un avís, no un error', () => {
    const base = publicaAFormulari({});
    expect(formulariAPublica({ ...base, descripcio: 'a'.repeat(160) }).avisos.descripcio).toBeUndefined();
    const llarga = formulariAPublica({ ...base, descripcio: 'a'.repeat(161) });
    expect(llarga.errors.descripcio).toBeUndefined();
    expect(llarga.avisos.descripcio).toMatch(/160/);
    expect(llarga.publica.descripcio).toBe('a'.repeat(161));
  });

  it('la durada i l\'edat mínima han de ser enters', () => {
    const base = publicaAFormulari({});
    expect(formulariAPublica({ ...base, durada: '92' }).publica.durada).toBe(92);
    expect(formulariAPublica({ ...base, durada: '92.5' }).errors.durada).toBe('La durada ha de ser un nombre enter de minuts.');
    expect(formulariAPublica({ ...base, edatMinimaRecomanada: '12,5' }).errors.edatMinimaRecomanada)
      .toBe("L'edat mínima ha de ser un nombre enter (0 = tots els públics).");
    expect(formulariAPublica({ ...base, edatMinimaRecomanada: '0' }).publica.edatMinimaRecomanada).toBe(0);
    expect(formulariAPublica({ ...base, preu: '4.5' }).errors.preu).toBeUndefined();
  });
});

describe('URL i alias de la pàgina pública', () => {
  it('camí i URL de programació a partir de la data i el slug', () => {
    expect(camiPublic('2026-10-08', 'pig')).toBe('/programacio/2026/pig/');
    expect(urlPublica('2026-10-08', 'pig')).toBe('https://cineclubrodadebera.cat/programacio/2026/pig/');
    expect(camiPublic('', 'pig')).toBe('');
    expect(camiPublic('2026-10-08', '')).toBe('');
  });

  it('afegeix un alias només si no hi és', () => {
    expect(afegirAlias(['/a/'], '/b/')).toEqual(['/a/', '/b/']);
    expect(afegirAlias(['/a/'], '/a/')).toEqual(['/a/']);
    expect(afegirAlias(undefined, '/a/')).toEqual(['/a/']);
    expect(afegirAlias(['/a/'], '')).toEqual(['/a/']);
  });

  it('valida el format del slug', () => {
    expect(esSlugValid('pig-2')).toBe(true);
    expect(esSlugValid('Pig')).toBe(false);
    expect(esSlugValid('')).toBe(false);
  });
});

describe('imatges de la pàgina pública', () => {
  const fitxer = (type, size = 1000) => ({ type, size, name: 'x' });

  it('accepta jpg, png i webp de fins a 10 MB', () => {
    expect(validarImatge(fitxer('image/jpeg'))).toBeNull();
    expect(validarImatge(fitxer('image/png'))).toBeNull();
    expect(validarImatge(fitxer('image/webp', 10 * 1024 * 1024))).toBeNull();
    expect(validarImatge(fitxer('image/gif'))).toMatch(/JPG, PNG o WebP/);
    expect(validarImatge(fitxer('image/jpeg', 10 * 1024 * 1024 + 1))).toMatch(/10 MB/);
  });

  it('dona camins segurs dins de web/sessions/<slug>/ i la URL pública de Storage', () => {
    expect(camiImatge('pig', 'poster', fitxer('image/jpeg'), 123)).toBe('web/sessions/pig/poster-123.jpg');
    expect(camiImatge('pig', 'gallery', fitxer('image/webp'), 123, 2)).toBe('web/sessions/pig/gallery-123-2.webp');
    expect(urlStorage('bucket', 'web/sessions/pig/poster-1.jpg'))
      .toBe('https://firebasestorage.googleapis.com/v0/b/bucket/o/web%2Fsessions%2Fpig%2Fposter-1.jpg?alt=media');
  });
});
