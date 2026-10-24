import { describe, it, expect } from 'vitest';
import {
  urlWeb, camiLogoDistribuidora, validarUrlPublica, validarCorreu, validarPreu, sessionsQueUsen, construirDistribuidora, opcionsDistribucio,
} from './distribuidores';

const MISSATGE = "L'adreça ha de començar per http:// o https://.";

describe('urlWeb', () => {
  it('afegeix el protocol només si falta', () => {
    expect(urlWeb('x.cat')).toBe('https://x.cat');
    expect(urlWeb('http://x.cat')).toBe('http://x.cat');
  });
});

describe('camiLogoDistribuidora', () => {
  it('construeix el camí amb slug, instant i extensió', () => {
    expect(camiLogoDistribuidora('A Contracorriente', { type: 'image/png' }, 7))
      .toBe('web/distribuidores/a-contracorriente-7.png');
    expect(camiLogoDistribuidora('Filmin', { type: 'image/jpeg' }, 1)).toBe('web/distribuidores/filmin-1.jpg');
    expect(camiLogoDistribuidora('Filmin', { type: 'image/webp' }, 1)).toBe('web/distribuidores/filmin-1.webp');
  });
});

describe('validarUrlPublica', () => {
  it('accepta buit i URLs http(s)', () => {
    expect(validarUrlPublica('')).toBeNull();
    expect(validarUrlPublica('https://x.cat/')).toBeNull();
    expect(validarUrlPublica('http://x.cat')).toBeNull();
  });

  it('rebutja la resta', () => {
    expect(validarUrlPublica('x.cat')).toBe(MISSATGE);
    expect(validarUrlPublica('ftp://x')).toBe(MISSATGE);
  });
});

describe('sessionsQueUsen', () => {
  const sessions = [
    { id: '1', titol: 'A', publica: { suportDistribucio: 'A Contracorriente' } },
    { id: '2', titol: 'B', publica: { suportDistribucio: 'A Contracorriente Films' } },
    { id: '3', titol: 'C' },
    { id: '4', titol: 'D', publica: { suportDistribucio: 5 } },
    { id: '5', titol: 'E', publica: { suportDistribucio: 'Nom vell', suportDistribucioId: 'dAC' } },
    { id: '6', titol: 'F', publica: { suportDistribucio: 'Atalante', suportDistribucioId: 'dAT' } },
  ];

  it('coincideix de forma exacta, no per substring', () => {
    expect(sessionsQueUsen({ id: 'x', nom: 'A Contracorriente' }, sessions)).toEqual([{ id: '1', titol: 'A' }]);
    expect(sessionsQueUsen({ id: 'x', nom: 'A Contracorriente Films' }, sessions)).toEqual([{ id: '2', titol: 'B' }]);
  });

  it('compta les sessions que la referencien per id encara que el nom sigui vell', () => {
    expect(sessionsQueUsen({ id: 'dAC', nom: 'A Contracorriente' }, sessions)).toEqual([
      { id: '1', titol: 'A' }, { id: '5', titol: 'E' },
    ]);
  });

  it('compta pel nom encara que la sessió tingui l\'id d\'una altra distribuïdora', () => {
    expect(sessionsQueUsen({ id: 'dNou', nom: 'Atalante' }, sessions)).toEqual([{ id: '6', titol: 'F' }]);
  });

  it('tolera publica absent, camps no-string i id o nom buits', () => {
    expect(sessionsQueUsen({ id: 'x', nom: '5' }, sessions)).toEqual([]);
    expect(sessionsQueUsen({ id: 'x', nom: 'X' }, sessions)).toEqual([]);
    expect(sessionsQueUsen({ id: '', nom: '' }, [{ id: '7', titol: 'G', publica: { suportDistribucio: '', suportDistribucioId: '' } }])).toEqual([]);
    expect(sessionsQueUsen({ id: undefined, nom: 'X' }, [{ id: '8', titol: 'H', publica: {} }])).toEqual([]);
  });
});

describe('opcionsDistribucio', () => {
  const CATALEG = [{ id: 'd1', nom: 'A Contracorriente' }, { id: 'd2', nom: 'B-team' }];
  const BUIDA = { nom: '', id: '' };
  const parells = ({ opcions }) => opcions.map((o) => [o.etiqueta, o.nom, o.id]);
  const triada = (r) => r.opcions.find((o) => o.valor === r.valor);

  it('sense distribuïdora: «—» triat i el catàleg amb el valor = id', () => {
    const r = opcionsDistribucio(CATALEG, BUIDA, BUIDA);
    expect(r.valor).toBe('');
    expect(r.opcions.map((o) => [o.valor, o.etiqueta])).toEqual([['', '—'], ['d1', 'A Contracorriente'], ['d2', 'B-team']]);
  });

  it('amb un id del catàleg tria aquella opció amb el nom actual, encara que el text sigui vell', () => {
    const r = opcionsDistribucio(CATALEG, { nom: 'Nom vell', id: 'd1' }, { nom: 'Nom vell', id: 'd1' });
    expect(r.valor).toBe('d1');
    expect(triada(r).etiqueta).toBe('A Contracorriente');
    expect(r.opcions.some((o) => /no és al catàleg/.test(o.etiqueta))).toBe(false);
  });

  it('amb només el nom exacte d\'una del catàleg la mostra triada', () => {
    const r = opcionsDistribucio(CATALEG, { nom: 'B-team', id: '' }, { nom: 'B-team', id: '' });
    expect(r.valor).toBe('d2');
    expect(r.opcions).toHaveLength(3);
  });

  it('un nom que no és al catàleg (ni per àlies o espais) surt com «no és al catàleg» i conserva el parell', () => {
    for (const nom of ['A Contracorriente Films', 'b-team', ' B-team']) {
      const r = opcionsDistribucio(CATALEG, { nom, id: '' }, { nom, id: '' });
      expect(parells(r)[1]).toEqual([`${nom} (no és al catàleg)`, nom, '']);
      expect(triada(r)).toMatchObject({ nom, id: '' });
    }
  });

  it('un id que ja no és al catàleg surt com «no és al catàleg» amb el seu nom, encara que el nom hi sigui', () => {
    const r = opcionsDistribucio(CATALEG, { nom: 'B-team', id: 'esborrada' }, { nom: 'B-team', id: 'esborrada' });
    expect(triada(r)).toMatchObject({ etiqueta: 'B-team (no és al catàleg)', nom: 'B-team', id: 'esborrada' });
    expect(r.valor).not.toBe('d2');
  });

  it('un id fora del catàleg sense nom s\'etiqueta amb l\'id', () => {
    const r = opcionsDistribucio(CATALEG, { nom: '', id: 'esborrada' }, BUIDA);
    expect(triada(r)).toMatchObject({ etiqueta: 'esborrada (no és al catàleg)', nom: '', id: 'esborrada' });
  });

  it('el valor desat fora del catàleg continua disponible després de triar-ne una altra', () => {
    const desada = { nom: 'A Contracorriente Films', id: '' };
    const r = opcionsDistribucio(CATALEG, { nom: 'B-team', id: 'd2' }, desada);
    expect(r.valor).toBe('d2');
    expect(parells(r)).toEqual([
      ['—', '', ''], ['A Contracorriente Films (no és al catàleg)', 'A Contracorriente Films', ''],
      ['A Contracorriente', 'A Contracorriente', 'd1'], ['B-team', 'B-team', 'd2'],
    ]);
  });

  it('l\'actual i el desat fora del catàleg surten tots dos, sense repetir-se', () => {
    const r = opcionsDistribucio([], { nom: 'X', id: '' }, { nom: 'Y', id: 'y' });
    expect(parells(r)).toEqual([['—', '', ''], ['X (no és al catàleg)', 'X', ''], ['Y (no és al catàleg)', 'Y', 'y']]);
    expect(triada(r).nom).toBe('X');
    expect(opcionsDistribucio([], { nom: 'X', id: '' }, { nom: 'X', id: '' }).opcions).toHaveLength(2);
  });

  it('els valors de les opcions «no és al catàleg» no poden coincidir amb cap id de document', () => {
    const r = opcionsDistribucio(CATALEG, { nom: 'X', id: 'd9' }, { nom: 'Y', id: '' });
    const fora = r.opcions.filter((o) => /no és al catàleg/.test(o.etiqueta));
    expect(fora).toHaveLength(2);
    for (const o of fora) expect(o.valor).toContain('/');
    expect(new Set(r.opcions.map((o) => o.valor)).size).toBe(r.opcions.length);
  });
});

describe('construirDistribuidora', () => {
  const base = { nom: ' Filmin ', web: ' filmin.es ', contacte: ' Anna ', correu: ' a@b.cat ', preu: '', condicions: ' ok ' };

  it('retalla els textos i converteix el preu', () => {
    expect(construirDistribuidora(base)).toEqual({
      nom: 'Filmin', web: 'filmin.es', contacte: 'Anna', correu: 'a@b.cat', preu: null, condicions: 'ok',
    });
    expect(construirDistribuidora({ ...base, preu: '12.5' }).preu).toBe(12.5);
  });

  it('no inclou logo ni urlPublica si són buits', () => {
    const r = construirDistribuidora({ ...base, logo: '  ', urlPublica: '' });
    expect('logo' in r).toBe(false);
    expect('urlPublica' in r).toBe(false);
  });

  it('inclou logo i urlPublica amb trim si hi són', () => {
    const r = construirDistribuidora({ ...base, logo: ' web/distribuidores/f-1.png ', urlPublica: ' https://f.cat ' });
    expect(r.logo).toBe('web/distribuidores/f-1.png');
    expect(r.urlPublica).toBe('https://f.cat');
  });

  it('conserva el logo en passar una distribuïdora existent pel formulari', () => {
    const existent = { nom: 'Filmin', web: 'filmin.es', contacte: '', correu: '', preu: 10, condicions: '', logo: 'web/distribuidores/filmin-1.png', urlPublica: 'https://f.cat' };
    const r = construirDistribuidora({ ...existent, preu: String(existent.preu) });
    expect(r).toEqual(existent);
  });
});

describe('validarCorreu', () => {
  it('és opcional i accepta adreces vàlides amb espais al voltant', () => {
    expect(validarCorreu('')).toBeNull();
    expect(validarCorreu('   ')).toBeNull();
    expect(validarCorreu(undefined)).toBeNull();
    expect(validarCorreu(' pere@atalante.test ')).toBeNull();
    expect(validarCorreu('a.b+c@sub.domini.cat')).toBeNull();
  });

  it('rebutja el que el navegador rebutjaria en un camp de correu', () => {
    ['pere', 'pere@', '@atalante.test', 'pere atalante@x.test', 'pere@@x.test', 'pere@-x.test'].forEach((v) => {
      expect(validarCorreu(v)).toBe('El correu electrònic no és vàlid.');
    });
  });
});

describe('validarPreu', () => {
  it('és opcional i accepta números iguals o més grans que 0', () => {
    expect(validarPreu('')).toBeNull();
    expect(validarPreu('  ')).toBeNull();
    expect(validarPreu('0')).toBeNull();
    expect(validarPreu('90.5')).toBeNull();
    expect(validarPreu('120')).toBeNull();
  });

  it('rebutja negatius i textos que no són números', () => {
    ['-5', '-0.01', 'abc', '12a', 'Infinity'].forEach((v) => {
      expect(validarPreu(v)).toBe('El preu ha de ser un número igual o més gran que 0.');
    });
  });
});
