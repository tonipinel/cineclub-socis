import { describe, it, expect } from 'vitest';
import {
  validarEntitat, camiLogoEntitat, llistaDeText, textDeLlista, sessionsQueUsen, nomAlCataleg,
} from './entitats';

describe('validarEntitat', () => {
  const altres = [{ id: 'a', nom: "L'Ateneu Rodenc" }];

  it('exigeix un nom', () => {
    const r = validarEntitat({ nom: '  ', url: '' }, []);
    expect(r.valid).toBe(false);
    expect(r.errors.nom).toBeTruthy();
  });

  it('no admet comes al nom', () => {
    const r = validarEntitat({ nom: 'Foo, Bar', url: '' }, []);
    expect(r.valid).toBe(false);
    expect(r.errors.nom).toBeTruthy();
  });

  it('rebutja un nom repetit ignorant majúscules i espais, tret del propi', () => {
    const nom = "  l'ateneu rodenc ";
    const repetit = validarEntitat({ nom, url: '' }, altres);
    expect(repetit.valid).toBe(false);
    expect(repetit.errors.nom).toBeTruthy();
    expect(validarEntitat({ nom, url: '' }, altres, 'a')).toEqual({ valid: true, errors: {} });
  });

  it('valida la URL', () => {
    const dolent = validarEntitat({ nom: 'X', url: 'ftp://x' }, []);
    expect(dolent.valid).toBe(false);
    expect(dolent.errors.url).toBeTruthy();
    expect(validarEntitat({ nom: 'X', url: '' }, [])).toEqual({ valid: true, errors: {} });
    expect(validarEntitat({ nom: 'X', url: 'https://x.cat/' }, [])).toEqual({ valid: true, errors: {} });
  });
});

describe('camiLogoEntitat', () => {
  it('construeix el camí amb slug, instant i extensió', () => {
    expect(camiLogoEntitat("L'Ateneu Rodenc", { type: 'image/jpeg' }, 123)).toBe('web/entitats/l-ateneu-rodenc-123.jpg');
    expect(camiLogoEntitat('Foo', { type: 'image/png' }, 5)).toBe('web/entitats/foo-5.png');
    expect(camiLogoEntitat('Foo', { type: 'image/webp' }, 5)).toBe('web/entitats/foo-5.webp');
  });
});

describe('llistaDeText i textDeLlista', () => {
  it('converteix entre text i llista', () => {
    expect(llistaDeText('a,  b ,, c')).toEqual(['a', 'b', 'c']);
    expect(llistaDeText('')).toEqual([]);
    expect(textDeLlista(['a', 'b'])).toBe('a, b');
    expect(textDeLlista([])).toBe('');
  });
});

describe('sessionsQueUsen', () => {
  const sessions = [
    { id: '1', titol: 'U', publica: { organitza: 'Foo' } },
    { id: '2', titol: 'D', publica: { participa: ['Bar', 'Foo'] } },
    { id: '3', titol: 'T', publica: { collabora: ['Foo'] } },
    { id: '4', titol: 'Q', publica: { organitza: 'Altra', participa: ['Foo Bar'], collabora: [] } },
    { id: '5', titol: 'Sense publica' },
  ];

  it('troba les sessions per cada camp, amb coincidència exacta', () => {
    expect(sessionsQueUsen('Foo', sessions)).toEqual([
      { id: '1', titol: 'U' }, { id: '2', titol: 'D' }, { id: '3', titol: 'T' },
    ]);
  });

  it('no peta amb sessions sense publica i retorna buit si no hi ha coincidències', () => {
    expect(sessionsQueUsen('Cap', sessions)).toEqual([]);
  });

  it('és exacte: mai per subcadena i sempre tolerant al tipus del camp', () => {
    const f = (publica) => sessionsQueUsen('Foo', [{ id: 'x', titol: 'T', publica }]);
    expect(f({ organitza: 'Foo Bar' })).toEqual([]);
    expect(f({ participa: 'Foo Bar' })).toEqual([]);
    expect(f({ participa: 'Foo' })).toEqual([{ id: 'x', titol: 'T' }]);
    expect(f({ collabora: 'Foo' })).toEqual([{ id: 'x', titol: 'T' }]);
    expect(f({ collabora: 5 })).toEqual([]);
    expect(f({ collabora: { Foo: true } })).toEqual([]);
    expect(f({ participa: null, collabora: undefined })).toEqual([]);
  });
});

describe('nomAlCataleg', () => {
  const noms = ['Cineclub Roda de Berà', "L'Ateneu Rodenc"];

  it('torna el nom si és al catàleg i null si no hi és', () => {
    expect(nomAlCataleg("L'Ateneu Rodenc", noms)).toBe("L'Ateneu Rodenc");
    expect(nomAlCataleg('Entitat Vella', noms)).toBeNull();
    expect(nomAlCataleg("l'ateneu rodenc", noms)).toBeNull();
  });

  it('«cineclub» (sense distingir majúscules) equival a «Cineclub Roda de Berà» només si és al catàleg', () => {
    expect(nomAlCataleg('cineclub', noms)).toBe('Cineclub Roda de Berà');
    expect(nomAlCataleg('Cineclub', noms)).toBe('Cineclub Roda de Berà');
    expect(nomAlCataleg('cineclub', ["L'Ateneu Rodenc"])).toBeNull();
  });
});
