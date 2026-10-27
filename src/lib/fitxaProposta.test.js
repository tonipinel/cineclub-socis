import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';
import {
  CAMPS_PELLICULA, ETIQUETES_CAMPS, fitxaAFormulari, formulariAFitxa, formatRepartiment,
  parseRepartiment, campsCanviats, campsEditatsNous, esCampEditat, valorsADesar, prepararDesatFitxa,
} from './fitxaProposta';

const { CAMPS_EDITABLES } = createRequire(import.meta.url)('../../functions/fitxa-proposta.js');

const proposta = {
  titol: 'Delicatessen',
  titolLocal: 'Delicatessen (Esp)',
  any: 1991,
  durada: 99,
  directors: ['Jean-Pierre Jeunet', 'Marc Caro'],
  guionistes: ['Gilles Adrien'],
  fotografia: ['Darius Khondji'],
  muntatge: ['Hervé Schneid'],
  musica: ['Carlos D\'Alessio'],
  produccio: ['Constellation', 'UGC'],
  paisos: ['França'],
  idiomes: ['Francès', 'Anglès'],
  generes: ['Comèdia', 'Ciència-ficció'],
  repartiment: [{ nom: 'Dominique Pinon', personatge: 'Louison' }, { nom: 'Karin Viard', personatge: '' }, { nom: 'Figurant' }],
  lema: null,
  sinopsi: 'Una finca estranya.',
  trailerUrl: 'https://youtu.be/x',
  imatgeUrl: undefined,
};

const formBuit = fitxaAFormulari({});

describe('constants', () => {
  it('CAMPS_PELLICULA coincideix amb CAMPS_EDITABLES del servidor', () => {
    expect(CAMPS_PELLICULA).toEqual(CAMPS_EDITABLES);
    expect(CAMPS_PELLICULA).toHaveLength(18);
  });
  it('totes les etiquetes existeixen', () => {
    expect(Object.keys(ETIQUETES_CAMPS)).toEqual(CAMPS_PELLICULA);
    expect(ETIQUETES_CAMPS.durada).toBe('Durada (minuts)');
    expect(ETIQUETES_CAMPS.titolLocal).toBe('Títol a Espanya');
    expect([ETIQUETES_CAMPS.fotografia, ETIQUETES_CAMPS.muntatge, ETIQUETES_CAMPS.musica, ETIQUETES_CAMPS.produccio])
      .toEqual(['Fotografia', 'Muntatge', 'Música', 'Producció']);
  });
});

describe('fitxaAFormulari', () => {
  it('converteix una proposta de TMDB a text', () => {
    expect(fitxaAFormulari(proposta)).toEqual({
      titol: 'Delicatessen',
      titolLocal: 'Delicatessen (Esp)',
      any: '1991',
      durada: '99',
      directors: 'Jean-Pierre Jeunet, Marc Caro',
      guionistes: 'Gilles Adrien',
      fotografia: 'Darius Khondji',
      muntatge: 'Hervé Schneid',
      musica: 'Carlos D\'Alessio',
      produccio: 'Constellation, UGC',
      paisos: 'França',
      idiomes: 'Francès, Anglès',
      generes: 'Comèdia, Ciència-ficció',
      repartiment: 'Dominique Pinon (Louison)\nKarin Viard\nFigurant',
      lema: '',
      sinopsi: 'Una finca estranya.',
      trailerUrl: 'https://youtu.be/x',
      imatgeUrl: '',
    });
  });
  it('una proposta buida dona tot cadenes buides', () => {
    expect(formBuit).toEqual(Object.fromEntries(CAMPS_PELLICULA.map((c) => [c, ''])));
  });
});

describe('formulariAFitxa', () => {
  const ok = { ...formBuit, titol: 'Títol' };
  it('converteix tots els camps', () => {
    const { valors, errors } = formulariAFitxa({
      ...ok, titolLocal: ' Local ', any: '1991', durada: '99', directors: 'A, B,, ,B, C',
      guionistes: 'G', fotografia: 'F1, F2', muntatge: 'M', musica: '', produccio: 'P1, P1, P2', paisos: 'França, França', idiomes: '', generes: 'Drama',
      repartiment: 'X (Y)\n\nZ', lema: 'Lema', sinopsi: 'Sin', trailerUrl: 'http://t', imatgeUrl: 'https://i',
    });
    expect(errors).toEqual({});
    expect(valors).toEqual({
      titol: 'Títol', titolLocal: 'Local', any: 1991, durada: 99, directors: ['A', 'B', 'C'],
      guionistes: ['G'], fotografia: ['F1', 'F2'], muntatge: ['M'], musica: [], produccio: ['P1', 'P2'], paisos: ['França'], idiomes: [], generes: ['Drama'],
      repartiment: [{ nom: 'X', personatge: 'Y' }, { nom: 'Z', personatge: '' }],
      lema: 'Lema', sinopsi: 'Sin', trailerUrl: 'http://t', imatgeUrl: 'https://i',
    });
  });
  it('any i durada buits són null', () => {
    const { valors, errors } = formulariAFitxa(ok);
    expect(errors).toEqual({});
    expect(valors.any).toBeNull();
    expect(valors.durada).toBeNull();
    expect(valors.trailerUrl).toBe('');
  });
  it('errors', () => {
    const r = formulariAFitxa({ ...formBuit, titol: '  ', any: '91', durada: '9,5', trailerUrl: 'ftp://x', imatgeUrl: 'cartell.jpg' });
    expect(r.errors).toEqual({
      titol: 'El títol no pot estar en blanc.',
      any: "L'any ha de tenir 4 xifres.",
      durada: 'La durada ha de ser un nombre enter de minuts.',
      trailerUrl: "L'adreça ha de començar per http:// o https://.",
      imatgeUrl: "L'adreça ha de començar per http:// o https://.",
    });
  });
  it('rebutja any i durada no numèrics', () => {
    expect(formulariAFitxa({ ...ok, any: '19a1' }).errors.any).toBe("L'any ha de tenir 4 xifres.");
    expect(formulariAFitxa({ ...ok, durada: '-5' }).errors.durada).toBe('La durada ha de ser un nombre enter de minuts.');
    expect(formulariAFitxa({ ...ok, durada: '0' }).errors.durada).toBe('La durada ha de ser un nombre enter de minuts.');
  });
});

describe('repartiment', () => {
  it('parseja nom i personatge', () => {
    expect(parseRepartiment('A (B)\nC')).toEqual([{ nom: 'A', personatge: 'B' }, { nom: 'C', personatge: '' }]);
  });
  it('manté els parèntesis aniuats al personatge', () => {
    expect(parseRepartiment('Nom (Personatge (amb parèntesis))')).toEqual([
      { nom: 'Nom', personatge: 'Personatge (amb parèntesis)' },
    ]);
  });
  it('línia sense ) final és només nom; ignora línies buides', () => {
    expect(parseRepartiment('\n  Nom (x) cap\n\n   \nAltre\n')).toEqual([
      { nom: 'Nom (x) cap', personatge: '' }, { nom: 'Altre', personatge: '' },
    ]);
  });
  it('format', () => {
    expect(formatRepartiment([{ nom: 'A', personatge: 'B' }, { nom: 'C', personatge: '' }, { nom: 'D' }])).toBe('A (B)\nC\nD');
    expect(formatRepartiment(undefined)).toBe('');
  });
  it('round-trip', () => {
    const llistes = [
      [{ nom: 'A', personatge: 'Rol (jove)' }, { nom: 'B', personatge: 'Rol' }],
      [{ nom: 'A', personatge: '' }, { nom: 'B', personatge: '' }],
      [{ nom: 'Smith, John', personatge: 'Dr. X' }, { nom: 'Pinon, D.', personatge: '' }],
    ];
    for (const llista of llistes) expect(parseRepartiment(formatRepartiment(llista))).toEqual(llista);
  });
});

describe('campsCanviats', () => {
  const base = fitxaAFormulari(proposta);
  it('sense tocar res no hi ha canvis', () => {
    expect(campsCanviats({ ...base }, base)).toEqual([]);
  });
  it('en ordre de CAMPS_PELLICULA', () => {
    expect(campsCanviats({ ...base, sinopsi: 'Nova', any: '1992', titol: 'T' }, base)).toEqual(['titol', 'any', 'sinopsi']);
  });
  it('un camp editat i tornat al valor original no hi és', () => {
    const form = { ...base, any: '1992' };
    form.any = base.any;
    expect(campsCanviats(form, base)).toEqual([]);
  });
  it('ignora els espais externs', () => {
    expect(campsCanviats({ ...base, titol: '  Delicatessen \n', lema: '  ' }, base)).toEqual([]);
  });
  it('canvi intern sí compta', () => {
    expect(campsCanviats({ ...base, directors: 'Jean-Pierre Jeunet,Marc Caro' }, base)).toEqual(['directors']);
  });
});

describe('campsEditatsNous', () => {
  it('unió ordenada, sense duplicats ni desconeguts', () => {
    expect(campsEditatsNous(['sinopsi', 'directors', 'xxx'], ['any', 'directors', 'yyy'])).toEqual(['any', 'directors', 'sinopsi']);
  });
  it('mai en treu', () => {
    expect(campsEditatsNous(['lema'], [])).toEqual(['lema']);
    expect(campsEditatsNous(undefined, ['titol'])).toEqual(['titol']);
    expect(campsEditatsNous()).toEqual([]);
  });
});

describe('esCampEditat', () => {
  it('per campsEditats', () => {
    expect(esCampEditat({ campsEditats: ['any'] }, 'any')).toBe(true);
    expect(esCampEditat({ campsEditats: ['any'] }, 'lema')).toBe(false);
    expect(esCampEditat({}, 'any')).toBe(false);
  });
  it('sinopsi en català compta com a editada si no és buida', () => {
    expect(esCampEditat({ sinopsiIdioma: 'ca', sinopsi: 'Text' }, 'sinopsi')).toBe(true);
    expect(esCampEditat({ sinopsiIdioma: 'ca', sinopsi: '' }, 'sinopsi')).toBe(false);
    expect(esCampEditat({ sinopsiIdioma: 'en', sinopsi: 'Text' }, 'sinopsi')).toBe(false);
    expect(esCampEditat({ sinopsiIdioma: 'ca', sinopsi: 'Text' }, 'lema')).toBe(false);
  });
});

describe('valorsADesar', () => {
  const { valors } = formulariAFitxa({ ...fitxaAFormulari(proposta), any: '1992', sinopsi: 'Nova', lema: 'Un lema' });
  it('només els camps canviats, amb campsEditats ampliat', () => {
    expect(valorsADesar({ valors, canviats: ['any'], proposta: { campsEditats: ['directors'] } })).toEqual({
      any: 1992, campsEditats: ['any', 'directors'],
    });
  });
  it('sinopsi posa sinopsiIdioma ca', () => {
    expect(valorsADesar({ valors, canviats: ['lema', 'sinopsi'], proposta: {} })).toEqual({
      lema: 'Un lema', sinopsi: 'Nova', campsEditats: ['lema', 'sinopsi'], sinopsiIdioma: 'ca',
    });
  });
  it('sense canvis, objecte buit', () => {
    expect(valorsADesar({ valors, canviats: [], proposta: { campsEditats: ['any'] } })).toEqual({});
  });
});

describe('prepararDesatFitxa', () => {
  const legacy = { ...proposta, imatgeUrl: 'cartell.jpg', any: 12345 };
  const base = fitxaAFormulari(legacy);
  const IMG = "L'adreça ha de començar per http:// o https://.";

  it('sense canvis no hi ha res', () => {
    expect(prepararDesatFitxa({ form: { ...base }, base, proposta: legacy })).toEqual({ canviats: [], errors: {}, payload: {} });
  });
  it('un camp antic no vàlid sense tocar no bloqueja un altre canvi', () => {
    expect(prepararDesatFitxa({ form: { ...base, lema: 'Nou' }, base, proposta: legacy })).toEqual({
      canviats: ['lema'], errors: {}, payload: { lema: 'Nou', campsEditats: ['lema'] },
    });
  });
  it('el camp no vàlid editat a un altre valor no vàlid dona error i payload buit', () => {
    expect(prepararDesatFitxa({ form: { ...base, imatgeUrl: 'altre.jpg', lema: 'Nou' }, base, proposta: legacy })).toEqual({
      canviats: ['lema', 'imatgeUrl'], errors: { imatgeUrl: IMG }, payload: {},
    });
  });
  it('el camp no vàlid editat a un valor vàlid es desa', () => {
    expect(prepararDesatFitxa({ form: { ...base, imatgeUrl: 'https://i/x.jpg' }, base, proposta: { ...legacy, campsEditats: ['any'] } })).toEqual({
      canviats: ['imatgeUrl'], errors: {}, payload: { imatgeUrl: 'https://i/x.jpg', campsEditats: ['any', 'imatgeUrl'] },
    });
  });
  it('any: 5 xifres és error; 0000 compleix la regla de 4 xifres', () => {
    const b = fitxaAFormulari(proposta);
    expect(prepararDesatFitxa({ form: { ...b, any: '12345' }, base: b, proposta }).errors).toEqual({ any: "L'any ha de tenir 4 xifres." });
    expect(prepararDesatFitxa({ form: { ...b, any: '0000' }, base: b, proposta })).toEqual({
      canviats: ['any'], errors: {}, payload: { any: 0, campsEditats: ['any'] },
    });
  });
  it('accepta HTTP:// en majúscules', () => {
    expect(formulariAFitxa({ ...formBuit, titol: 'T', trailerUrl: 'HTTP://x.com' }).errors).toEqual({});
  });
  it('un nom que acaba en ) sense personatge no és round-trippable, però sense tocar no es marca com a canviat', () => {
    const p = { ...proposta, repartiment: [{ nom: 'Film (1999)', personatge: '' }] };
    expect(parseRepartiment(formatRepartiment(p.repartiment))).toEqual([{ nom: 'Film', personatge: '1999' }]);
    const b = fitxaAFormulari(p);
    expect(prepararDesatFitxa({ form: { ...b }, base: b, proposta: p }).canviats).toEqual([]);
  });
});

describe('tolerància', () => {
  it('línia amb parèntesi sense tancar és tot nom', () => {
    expect(parseRepartiment('Nom (Rol\nAltre x)')).toEqual([
      { nom: 'Nom (Rol', personatge: '' }, { nom: 'Altre x)', personatge: '' },
    ]);
  });
  it('valorsADesar sense canviats no llança', () => {
    expect(valorsADesar({ valors: {} })).toEqual({});
  });
  it('campsEditatsNous ignora un actuals que no és array', () => {
    expect(campsEditatsNous('any', ['lema'])).toEqual(['lema']);
    expect(campsEditatsNous(null, ['lema'])).toEqual(['lema']);
  });
});
