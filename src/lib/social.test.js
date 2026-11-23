import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('html-to-image', () => ({ toBlob: vi.fn() }));

import { toBlob } from 'html-to-image';
import {
  diapositivesPelicula, negretaAHtml, diaMesCa, fraseVersio, imatgeAData, exportaPng, nomFitxer, logosEntitats, urlsDiapositiva, curiositatsADesar, diapositivaTancamentProgramacio, logoDistribuidora, htmlAText, maxCuriositats, caixaContingut, retallaMarges, rangDatesCa, curiositatsDe, descarrega, seccioDe, disposicioMosaic, disposicioTires, composaTires, composaFonsTires, esFilmoxarxa, repartiment, diapositivaObertura, MAX_CURIOSITAT, LLOC, MAX_PROGRAMACIO,
} from './social';

beforeEach(() => vi.clearAllMocks());

describe('diapositivesPelicula', () => {
  it('fa portada, una diapositiva per curiositat i tancament, i repeteix els fotogrames en cicle', () => {
    const sessio = { publica: { curiositats: ['a', 'b', 'c'], galeria: ['g1', 'g2'] } };
    expect(diapositivesPelicula(sessio)).toEqual([
      { tipus: 'portada-pelicula' },
      { tipus: 'curiositat', text: 'a', imatge: 'g1' },
      { tipus: 'curiositat', text: 'b', imatge: 'g2' },
      { tipus: 'curiositat', text: 'c', imatge: 'g1' },
      { tipus: 'tancament' },
    ]);
  });

  it('sense curiositats només té portada i tancament', () => {
    expect(diapositivesPelicula({ publica: {} })).toEqual([{ tipus: 'portada-pelicula' }, { tipus: 'tancament' }]);
    expect(diapositivesPelicula({})).toEqual([{ tipus: 'portada-pelicula' }, { tipus: 'tancament' }]);
  });

  it('sense galeria les curiositats no porten imatge', () => {
    const [, curiositat] = diapositivesPelicula({ publica: { curiositats: ['a'] } });
    expect(curiositat).toEqual({ tipus: 'curiositat', text: 'a', imatge: null });
  });
});

describe('negretaAHtml', () => {
  it('escapa l\'HTML i només converteix la negreta', () => {
    expect(negretaAHtml('<b>**x**</b>')).toBe('&lt;b&gt;<strong>x</strong>&lt;/b&gt;');
    expect(negretaAHtml('un *sol* asterisc i **dues** parts **més**')).toBe('un *sol* asterisc i <strong>dues</strong> parts <strong>més</strong>');
  });
});

describe('diaMesCa i fraseVersio', () => {
  it('escriu el dia com a la web', () => {
    expect(diaMesCa('2026-10-22')).toBe("Dijous 22 d'octubre");
    expect(diaMesCa('2026-12-03')).toBe('Dijous 3 de desembre');
  });

  it('una sessió sense data (recent programada) no trenca: dia buit', () => {
    expect(diaMesCa('')).toBe('');
    expect(diaMesCa(undefined)).toBe('');
  });

  it('la frase de versió només surt per a VOSE i VOSC', () => {
    expect(fraseVersio({ publica: { versioTipus: 'vose' } })).toMatch(/V\.O\. subtitulada/);
    expect(fraseVersio({ publica: { versioTipus: 'vosc' } })).toMatch(/V\.O\. subtitulada/);
    expect(fraseVersio({ publica: { versioTipus: 'vo' } })).toBe('');
    expect(fraseVersio({})).toBe('');
  });
});

describe('constants', () => {
  it('el lloc és fix i Programació admet 10 sessions', () => {
    expect(LLOC).toBe('Teatre del Casino Municipal de Roda de Berà');
    expect(MAX_PROGRAMACIO).toBe(10);
  });
});

describe('imatgeAData', () => {
  it('baixa la imatge i la torna com a data URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['abc'], { type: 'image/jpeg' }) }));
    const url = await imatgeAData('https://x/y.jpg');
    expect(url).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('no reutilitza una còpia de la caché HTTP descarregada sense CORS', async () => {
    const fetchFals = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['a'], { type: 'image/png' }) });
    vi.stubGlobal('fetch', fetchFals);
    await imatgeAData('https://x/y.png');
    expect(fetchFals).toHaveBeenCalledWith('https://x/y.png', expect.objectContaining({ cache: 'reload' }));
  });

  it('llança si la baixada falla (p. ex. per CORS) o la resposta no és correcta', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(imatgeAData('https://x/y.jpg')).rejects.toThrow();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    await expect(imatgeAData('https://x/y.jpg')).rejects.toThrow();
  });
});

describe('exportaPng', () => {
  it('exporta el node a 1080 × 1350 sense escala i torna el Blob', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    toBlob.mockResolvedValue(blob);
    const node = document.createElement('div');
    await expect(exportaPng(node)).resolves.toBe(blob);
    expect(toBlob).toHaveBeenCalledWith(node, expect.objectContaining({
      width: 1080, height: 1350, pixelRatio: 1, style: expect.objectContaining({ transform: 'none' }),
    }));
  });

  it('llança si no es pot generar la imatge', async () => {
    toBlob.mockResolvedValue(null);
    await expect(exportaPng(document.createElement('div'))).rejects.toThrow();
  });
});

describe('nomFitxer', () => {
  it('dona un nom estable, sense accents ni espais', () => {
    const sessio = { slug: 'la-tarta-del-presidente', data: '2026-10-22' };
    expect(nomFitxer({ sessio, tipus: 'pelicula', n: 2 })).toBe('cineclub-2026-10-22-la-tarta-del-presidente-pelicula-3.png');
    expect(nomFitxer({ sessio: { slug: 'Ça va?', data: '2026-10-22' }, tipus: 'programacio', n: 0 })).toBe('cineclub-2026-10-22-ca-va-programacio-1.png');
    expect(nomFitxer({ sessio: { slug: '', titol: 'Sense slug', data: '2026-10-22' }, tipus: 'pelicula', n: 0 })).toBe('cineclub-2026-10-22-sense-slug-pelicula-1.png');
  });
});

describe('logosEntitats', () => {
  const entitats = [
    { id: '1', nom: 'Ajuntament de Roda de Berà', logo: 'https://x/aj.png' },
    { id: '2', nom: 'Sense logo' },
    { id: '3', nom: 'Cineclub', logo: 'https://x/ci.png' },
  ];

  it('dona els logos de les entitats de la sessió que en tenen, sense el del Cineclub ni repetits', () => {
    const sessio = { publica: { organitza: 'cineclub', participa: ['Ajuntament de Roda de Berà'], collabora: ['Ajuntament de Roda de Berà', 'Sense logo', 'Desconeguda'] } };
    expect(logosEntitats(sessio, entitats)).toEqual(['https://x/aj.png']);
  });

  it('tampoc repeteix el logo del Cineclub quan hi consta amb el nom complet', () => {
    const sessio = { publica: { organitza: 'Cineclub Roda de Berà', collabora: ['Ajuntament de Roda de Berà'] } };
    const amb = [...entitats, { id: '4', nom: 'Cineclub Roda de Berà', logo: 'https://x/ci2.png' }];
    expect(logosEntitats(sessio, amb)).toEqual(['https://x/aj.png']);
  });

  it('sense entitats torna una llista buida', () => {
    expect(logosEntitats({ publica: { organitza: 'cineclub' } }, entitats)).toEqual([]);
    expect(logosEntitats({}, [])).toEqual([]);
  });
});

describe('urlsDiapositiva', () => {
  const sessio = { publica: { cartell: 'c', galeria: ['g1', 'g2', 'g3', 'g4', 'g5'] } };

  it('la portada d\'una sessió de Programació porta el cartell i els logos', () => {
    expect(urlsDiapositiva(sessio, { tipus: 'portada-programacio' }, ['l1'])).toEqual(['c', 'l1']);
  });

  it('la curiositat porta el cartell i el seu fotograma', () => {
    expect(urlsDiapositiva(sessio, { tipus: 'curiositat', text: 't', imatge: 'g2' }, [])).toEqual(['c', 'g2']);
  });

  it('el tancament porta fins a 4 fotogrames per al collage', () => {
    expect(urlsDiapositiva(sessio, { tipus: 'tancament' }, [])).toEqual(['c', 'g1', 'g2', 'g3', 'g4']);
  });

  it('Programació (sense diapositiva) i sessions buides no trenquen', () => {
    expect(urlsDiapositiva(sessio, null, [])).toEqual(['c']);
    expect(urlsDiapositiva({}, { tipus: 'tancament' }, [])).toEqual([]);
  });
});

describe('curiositatsADesar', () => {
  it('treu els espais i les curiositats buides', () => {
    expect(curiositatsADesar([' A ', '', '  ', 'B'])).toEqual(['A', 'B']);
    expect(curiositatsADesar([])).toEqual([]);
  });

  it('el límit és de 280 caràcters', () => {
    expect(MAX_CURIOSITAT).toBe(280);
  });
});

describe('diapositivaTancamentProgramacio', () => {
  const sessio = (publica) => ({ publica });

  it('el collage porta la primera imatge de cada sessió (galeria o, si no, cartell), fins a 4', () => {
    const sessions = [
      sessio({ galeria: ['g1', 'g1b'], cartell: 'c1' }), sessio({ cartell: 'c2' }), sessio({}), sessio({ galeria: ['g4'] }),
      sessio({ galeria: ['g5'] }), sessio({ galeria: ['g6'] }),
    ];
    expect(diapositivaTancamentProgramacio(sessions)).toMatchObject({ tipus: 'tancament-programacio', imatges: ['g1', 'c2', 'g4', 'g5'] });
  });

  it('«en Versió Original» només si totes les sessions són VO, VOSE o VOSC', () => {
    expect(diapositivaTancamentProgramacio([sessio({ versioTipus: 'vose' }), sessio({ versioTipus: 'vosc' }), sessio({ versioTipus: 'vo' })]).versio).toBe(true);
    expect(diapositivaTancamentProgramacio([sessio({ versioTipus: 'vose' }), sessio({ versioTipus: 'doblada-cat' })]).versio).toBe(false);
    expect(diapositivaTancamentProgramacio([]).versio).toBe(false);
  });

  it('urlsDiapositiva en retorna les imatges per exportar-les', () => {
    const d = diapositivaTancamentProgramacio([sessio({ galeria: ['g1'] })]);
    expect(urlsDiapositiva({}, d, [])).toEqual(['g1']);
  });
});

describe('logoDistribuidora', () => {
  const distribuidores = [{ id: 'd1', nom: 'Filmoxarxa', logo: 'https://x/f.png' }, { id: 'd2', nom: 'Sense logo' }];

  it('la troba per id i, a les sessions antigues, pel nom exacte', () => {
    expect(logoDistribuidora({ publica: { suportDistribucioId: 'd1' } }, distribuidores)).toBe('https://x/f.png');
    expect(logoDistribuidora({ publica: { suportDistribucio: 'Filmoxarxa' } }, distribuidores)).toBe('https://x/f.png');
  });

  it('torna null si no n\'hi ha, no té logo o la sessió no en té', () => {
    expect(logoDistribuidora({ publica: { suportDistribucioId: 'd2' } }, distribuidores)).toBeNull();
    expect(logoDistribuidora({ publica: { suportDistribucioId: 'x' } }, distribuidores)).toBeNull();
    expect(logoDistribuidora({ publica: {} }, distribuidores)).toBeNull();
    expect(logoDistribuidora({}, [])).toBeNull();
  });
});

describe('htmlAText', () => {
  it('passa l\'HTML renderitzat a text pla per enganxar-lo a Instagram', () => {
    const html = '<h2>Sinopsi</h2><p>Text <strong>llarg</strong></p><ul><li>a</li><li>b</li></ul><p>Fi</p>';
    expect(htmlAText(html)).toBe('Sinopsi\n\nText llarg\n\n• a\n• b\n\nFi');
  });

  it('un text buit dona una cadena buida', () => {
    expect(htmlAText('')).toBe('');
  });
});

describe('maxCuriositats', () => {
  it('no pot passar del nombre d\'imatges de la galeria', () => {
    expect(maxCuriositats({ publica: { galeria: ['a', 'b', 'c'] } })).toBe(3);
    expect(maxCuriositats({ publica: {} })).toBe(0);
    expect(maxCuriositats({})).toBe(0);
  });
});

describe('caixaContingut', () => {
  const imatge = (width, height, pixels) => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) data.set([255, 255, 255, 255], i * 4); // fons blanc
    for (const [x, y, rgba] of pixels) data.set(rgba, (y * width + x) * 4);
    return { data, width, height };
  };

  it('dona la caixa del que no és blanc ni transparent', () => {
    const img = imatge(6, 5, [[2, 1, [200, 80, 0, 255]], [3, 3, [0, 0, 0, 255]]]);
    expect(caixaContingut(img)).toEqual({ x: 2, y: 1, w: 2, h: 3 });
  });

  it('ignora els píxels transparents i els quasi blancs', () => {
    const img = imatge(4, 4, [[0, 0, [10, 10, 10, 0]], [3, 3, [250, 250, 250, 255]], [1, 2, [20, 20, 20, 255]]]);
    expect(caixaContingut(img)).toEqual({ x: 1, y: 2, w: 1, h: 1 });
  });

  it('una imatge buida no té caixa', () => {
    expect(caixaContingut(imatge(3, 3, []))).toBeNull();
  });
});

describe('retallaMarges', () => {
  it('si no es pot treballar amb la imatge (sense canvas), la torna tal qual', async () => {
    await expect(retallaMarges('data:image/png;base64,AAAA')).resolves.toBe('data:image/png;base64,AAAA');
  });
});

describe('rangDatesCa', () => {
  it.each([
    [['2026-12-03'], 'el 3 de desembre'],
    [['2026-12-17', '2026-12-03', '2026-12-10'], 'del 3 al 17 de desembre'],
    [['2026-10-06', '2026-10-27'], "del 6 al 27 d'octubre"],
    [['2026-09-29', '2026-10-06'], "del 29 de setembre al 6 d'octubre"],
    [['2026-12-28', '2027-01-04'], 'del 28 de desembre al 4 de gener'],
    [[], ''],
  ])('%j → %s', (dates, esperat) => {
    expect(rangDatesCa(dates)).toBe(esperat);
  });
});

describe('disposicioMosaic', () => {
  const AMPLADA = 984;
  const ALCADA = 850;
  const casos = [['cartells (2:3)', 2 / 3], ['fotogrames (3:2)', 3 / 2]];

  describe.each(casos)('%s', (_nom, aspecte) => {
    it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('%i imatges: les files sumen n, caben a l\'espai i mantenen la proporció', (n) => {
      const {
        cols, files, w, h,
      } = disposicioMosaic(n, { alcada: ALCADA, aspecte });
      expect(files.reduce((a, b) => a + b, 0)).toBe(n);
      expect(Math.max(...files)).toBe(cols);
      expect(w / h).toBeCloseTo(aspecte, 5);
      expect(cols * w + (cols - 1) * 16).toBeLessThanOrEqual(AMPLADA + 0.001);
      expect(files.length * h + (files.length - 1) * 16).toBeLessThanOrEqual(ALCADA + 0.001);
    });

    it.each([4, 5, 6, 7, 8, 9, 10])('%i imatges: cap fila de només una imatge', (n) => {
      expect(Math.min(...disposicioMosaic(n, { alcada: ALCADA, aspecte }).files)).toBeGreaterThan(1);
    });
  });

  it('amb cartells, 4 fan 2 i 2 (no 3 i 1), 6 fan 3 i 3 i 10 fan 5 i 5', () => {
    expect(disposicioMosaic(4, { alcada: ALCADA }).files).toEqual([2, 2]);
    expect(disposicioMosaic(6, { alcada: ALCADA }).files).toEqual([3, 3]);
    expect(disposicioMosaic(10, { alcada: ALCADA }).files).toEqual([5, 5]);
  });

  it('amb fotogrames les files queden equilibrades: 4 → 2,2; 5 → 3,2; 7 → 3,2,2; 10 → 3,3,2,2', () => {
    const f = (n) => disposicioMosaic(n, { alcada: ALCADA, aspecte: 3 / 2 }).files;
    expect(f(4)).toEqual([2, 2]);
    expect(f(5)).toEqual([3, 2]);
    expect(f(7)).toEqual([3, 2, 2]);
    expect(f(10)).toEqual([3, 3, 2, 2]);
  });

  it('una sola imatge ocupa tot l\'espai que pot', () => {
    expect(disposicioMosaic(1, { alcada: ALCADA }).files).toEqual([1]);
  });

  it('sense imatges no hi ha mosaic', () => {
    expect(disposicioMosaic(0)).toEqual({ cols: 0, files: [], w: 0, h: 0 });
  });
});

describe('repartiment', () => {
  it('reparteix les imatges en files segons la mida de cada fila', () => {
    expect(repartiment(['a', 'b', 'c', 'd', 'e'], [3, 2])).toEqual([['a', 'b', 'c'], ['d', 'e']]);
    expect(repartiment(['a'], [])).toEqual([]);
  });
});

describe('disposicioTires', () => {
  const AMPLADA = 1080;
  const ALCADA = 850;
  const MARC_ALT = 56;
  const opcions = { alcada: ALCADA };

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('%i fotogrames: tires de com a màxim 3, sense tires d\'un de sol i dins de l\'espai', (n) => {
    const { tires } = disposicioTires(n, opcions);
    expect(tires.reduce((a, t) => a + t.k, 0)).toBe(n);
    tires.forEach((t) => expect(t.k).toBeLessThanOrEqual(3));
    if (n > 1) tires.forEach((t) => expect(t.k).toBeGreaterThan(1));
    const alt = tires.reduce((a, t) => a + t.h + MARC_ALT, 0) + (tires.length - 1) * 18;
    expect(alt).toBeLessThanOrEqual(ALCADA + 0.01);
    tires.forEach((t) => {
      expect(t.w / t.h).toBeCloseTo(3 / 2, 5);
      expect(t.k * t.w + (t.k - 1) * 8).toBeLessThanOrEqual(AMPLADA - 120 + 0.01);
    });
  });

  it('reparteix en tires equilibrades: 4 → 2,2; 5 → 3,2; 7 → 3,2,2; 8 → 3,3,2; 10 → 3,3,2,2', () => {
    const k = (n) => disposicioTires(n, opcions).tires.map((t) => t.k);
    expect(k(4)).toEqual([2, 2]);
    expect(k(5)).toEqual([3, 2]);
    expect(k(7)).toEqual([3, 2, 2]);
    expect(k(8)).toEqual([3, 3, 2]);
    expect(k(10)).toEqual([3, 3, 2, 2]);
  });

  it.each([5, 7, 8, 10])('%i fotogrames: les tires de dos són més grans que les de tres', (n) => {
    const { tires } = disposicioTires(n, opcions);
    const de2 = tires.find((t) => t.k === 2);
    const de3 = tires.find((t) => t.k === 3);
    expect(de2.w).toBeGreaterThan(de3.w);
  });

  it('cada tira té prou fotogrames laterals per arribar fins a les vores (i es talla pels costats)', () => {
    disposicioTires(10, opcions).tires.forEach((t) => {
      const costat = (AMPLADA - (t.k * t.w + (t.k - 1) * 8)) / 2;
      expect(t.laterals * (t.w + 8)).toBeGreaterThanOrEqual(costat);
      expect(t.laterals).toBeGreaterThanOrEqual(1);
    });
  });

  it('un de sol fa una tira gran', () => {
    const { tires } = disposicioTires(1, opcions);
    expect(tires).toHaveLength(1);
    expect(tires[0].k).toBe(1);
  });

  it('sense fotogrames no hi ha tires', () => {
    expect(disposicioTires(0)).toEqual({ tires: [] });
  });
});

describe('composaTires', () => {
  const principals = ['p1', 'p2', 'p3', 'p4'];

  it('posa els fotogrames principals a les tires i omple els laterals amb els extres', () => {
    const tires = composaTires(principals, ['x1', 'x2', 'x3'], { alcada: 850 });
    expect(tires.map((t) => t.principals)).toEqual([['p1', 'p2'], ['p3', 'p4']]);
    tires.forEach((t) => {
      expect(t.esquerra).toHaveLength(t.laterals);
      expect(t.dreta).toHaveLength(t.laterals);
      [...t.esquerra, ...t.dreta].forEach((u) => expect(['x1', 'x2', 'x3']).toContain(u));
    });
  });

  it('repeteix els extres en cicle quan no n\'hi ha prou', () => {
    const [t] = composaTires(principals, ['x1'], { alcada: 850 });
    expect([...t.esquerra, ...t.dreta].every((u) => u === 'x1')).toBe(true);
  });

  it('sense extres, repeteix els fotogrames principals als costats', () => {
    const tires = composaTires(principals, [], { alcada: 850 });
    tires.forEach((t) => [...t.esquerra, ...t.dreta].forEach((u) => expect(principals).toContain(u)));
  });

  it('sense fotogrames no hi ha tires', () => {
    expect(composaTires([], ['x1'], { alcada: 850 })).toEqual([]);
  });

  // Posicions comptades des de la vora: j = 0 és el fotograma que es talla del tot
  const exterior = (t) => ({ esq: t.esquerra, dre: [...t.dreta].reverse() });

  it('una tira no repeteix al costat dret el que porta a l\'esquerre, a la mateixa posició', () => {
    const extres = ['x0', 'x1', 'x2', 'x3'];
    composaTires(['p1', 'p2', 'p3', 'p4'], extres, { alcada: 850 }).forEach((t) => {
      const { esq, dre } = exterior(t);
      esq.forEach((url, j) => expect(dre[j]).not.toBe(url));
    });
  });

  it('la tira de dalt i la de baix no tallen la mateixa imatge pel mateix costat i posició', () => {
    const extres = ['x0', 'x1', 'x2', 'x3'];
    const tires = composaTires(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'], extres, { alcada: 850 });
    for (let i = 1; i < tires.length; i += 1) {
      const a = exterior(tires[i - 1]);
      const b = exterior(tires[i]);
      for (let j = 0; j < Math.min(a.esq.length, b.esq.length); j += 1) {
        expect(b.esq[j]).not.toBe(a.esq[j]);
        expect(b.dre[j]).not.toBe(a.dre[j]);
      }
    }
  });

  it('amb només dues imatges per repetir, les inverteix: la tira de sota porta l\'ordre contrari', () => {
    const [a, b] = composaTires(['p1', 'p2', 'p3', 'p4'], ['x1', 'x2'], { alcada: 850 }).map(exterior);
    expect(a.esq[0]).not.toBe(a.dre[0]);
    expect(b.esq[0]).not.toBe(a.esq[0]);
    expect(b.dre[0]).not.toBe(a.dre[0]);
  });

  it('amb una sola imatge no peta: es repeteix', () => {
    const tires = composaTires(['p1', 'p2', 'p3', 'p4'], ['x1'], { alcada: 850 });
    tires.forEach((t) => [...t.esquerra, ...t.dreta].forEach((u) => expect(u).toBe('x1')));
  });
});

describe('diapositivaObertura', () => {
  const sessio = (data, publica) => ({ data, publica });

  it('el mosaic porta fotogrames que no són els del collage del tancament', () => {
    const sessions = [
      sessio('2026-12-03', { galeria: ['a1', 'a2'], cartell: 'ca' }),
      sessio('2026-12-10', { galeria: ['b1', 'b2', 'b3'], cartell: 'cb' }),
    ];
    const tancament = diapositivaTancamentProgramacio(sessions);
    const obertura = diapositivaObertura(sessions);
    expect(tancament.imatges).toEqual(['a1', 'b1']);
    expect(obertura).toEqual({
      tipus: 'obertura-programacio', format: 'fotogrames', imatges: ['a2', 'b2'], extres: ['b3'], interval: 'del 3 al 10 de desembre',
    });
    expect(obertura.imatges.filter((u) => tancament.imatges.includes(u))).toEqual([]);
  });

  it('una sessió sense cap altre fotograma lliure no hi entra; les que passen del collage poden fer servir el primer', () => {
    const sessions = [
      sessio('2026-12-03', { galeria: ['a1'] }), sessio('2026-12-04', { galeria: ['b1', 'b2'] }), sessio('2026-12-05', { galeria: ['c1'] }),
      sessio('2026-12-06', { galeria: ['d1'] }), sessio('2026-12-07', { galeria: ['e1'] }),
    ];
    // el tancament fa servir a1, b1, c1 i d1; l'obertura: b2 i, de la cinquena sessió, el primer (e1)
    expect(diapositivaObertura(sessions).imatges).toEqual(['b2', 'e1']);
    expect(diapositivaObertura(sessions).extres).toEqual([]);
  });

  it('si cap sessió té un fotograma lliure, torna als cartells', () => {
    const sessions = [sessio('2026-12-03', { galeria: ['a1'], cartell: 'ca' }), sessio('2026-12-10', { cartell: 'cb' })];
    expect(diapositivaObertura(sessions)).toEqual({
      tipus: 'obertura-programacio', format: 'cartells', imatges: ['ca', 'cb'], extres: [], interval: 'del 3 al 10 de desembre',
    });
  });

  it('urlsDiapositiva en retorna els fotogrames principals i els dels costats per exportar-los', () => {
    const d = diapositivaObertura([sessio('2026-12-03', { galeria: ['a1', 'a2', 'a3'] })]);
    expect(urlsDiapositiva({ publica: {} }, d, [])).toEqual(['a2', 'a3']);
  });

  it('els extres són fotogrames de les mateixes pel·lícules que no són ni als principals ni al tancament', () => {
    const sessions = [sessio('2026-12-03', { galeria: ['a1', 'a2', 'a3', 'a4'] }), sessio('2026-12-10', { galeria: ['b1', 'b2'] })];
    const d = diapositivaObertura(sessions);
    expect(d.imatges).toEqual(['a2', 'b2']);
    expect(d.extres).toEqual(['a3', 'a4']);
  });
});

describe('composaFonsTires', () => {
  const opcions = { alcada: 1350 };
  const pool = ['g0', 'g1', 'g2', 'g3'];

  it('fa 2 tires, amb prou fotogrames per travessar la imatge de costat a costat', () => {
    const tires = composaFonsTires(pool, opcions);
    expect(tires).toHaveLength(2);
    tires.forEach((t) => {
      expect(t.w / t.h).toBeCloseTo(3 / 2, 5);
      expect(t.fotogrames.length * (t.w + 8)).toBeGreaterThan(1080);
    });
  });

  it('no repeteix el mateix fotograma al costat ni a sobre, amb tres o més imatges', () => {
    [['g0', 'g1', 'g2'], pool].forEach((p) => {
      const tires = composaFonsTires(p, opcions);
      tires.forEach((t, i) => t.fotogrames.forEach((u, j) => {
        if (j > 0) expect(u).not.toBe(t.fotogrames[j - 1]);
        if (i > 0) expect(u).not.toBe(tires[i - 1].fotogrames[j]);
      }));
    });
  });

  it('els fotogrames que es veuen (els que el cartell no tapa) són tots diferents', () => {
    [pool, ['g0', 'g1', 'g2', 'g3', 'g4']].forEach((p) => {
      const tires = composaFonsTires(p, opcions);
      const vistos = tires.flatMap((t) => t.vistos.map((j) => t.fotogrames[j]));
      expect(vistos).toHaveLength(4);
      expect(new Set(vistos).size).toBe(4);
    });
  });

  it('amb només dues imatges, la tira de sota porta els visibles invertits respecte a la de dalt', () => {
    const [dalt, baix] = composaFonsTires(['g0', 'g1'], opcions);
    const [esq, dre] = dalt.vistos;
    expect(baix.fotogrames[esq]).toBe(dalt.fotogrames[dre]);
    expect(baix.fotogrames[dre]).toBe(dalt.fotogrames[esq]);
    // així no hi ha la mateixa imatge una sobre l'altra a cap costat
    expect(baix.fotogrames[esq]).not.toBe(dalt.fotogrames[esq]);
    expect(baix.fotogrames[dre]).not.toBe(dalt.fotogrames[dre]);
  });

  it('amb tres imatges, els costats no tenen la mateixa imatge una sobre l\'altra', () => {
    const [dalt, baix] = composaFonsTires(['g0', 'g1', 'g2'], opcions);
    dalt.vistos.forEach((j) => expect(baix.fotogrames[j]).not.toBe(dalt.fotogrames[j]));
  });

  it('amb menys imatges que fotogrames visibles, en repeteix el mínim', () => {
    const vistos = composaFonsTires(['g0', 'g1', 'g2'], opcions).flatMap((t) => t.vistos.map((j) => t.fotogrames[j]));
    expect(new Set(vistos).size).toBe(3);
  });

  it('els visibles són els dels costats: no el del mig (que tapa el cartell) ni les puntes quasi fora de la imatge', () => {
    const [t] = composaFonsTires(pool, opcions);
    expect(t.vistos).toHaveLength(2);
    const mig = Math.floor(t.fotogrames.length / 2);
    expect(t.vistos).not.toContain(mig);
    expect(t.vistos).not.toContain(0);
    expect(t.vistos).not.toContain(t.fotogrames.length - 1);
  });

  it('amb una sola imatge la repeteix, i sense imatges no hi ha tires', () => {
    composaFonsTires(['g0'], opcions).forEach((t) => t.fotogrames.forEach((u) => expect(u).toBe('g0')));
    expect(composaFonsTires([], opcions)).toEqual([]);
  });

  it('urlsDiapositiva de la portada de la pel·lícula inclou el cartell, els fotogrames del fons i els logos', () => {
    const sessio = { publica: { cartell: 'c', galeria: ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'] } };
    expect(urlsDiapositiva(sessio, { tipus: 'portada-pelicula' }, ['l1'])).toEqual(['c', 'g1', 'g2', 'g3', 'g4', 'g5', 'l1']);
  });
});

describe('esFilmoxarxa', () => {
  const distribuidores = [{ id: 'd1', nom: ' FilmoXarxa ' }, { id: 'd2', nom: 'Atalante' }];

  it('reconeix Filmoxarxa per id o, a les sessions antigues, pel nom, sense distingir majúscules ni espais', () => {
    expect(esFilmoxarxa({ publica: { suportDistribucioId: 'd1' } }, distribuidores)).toBe(true);
    expect(esFilmoxarxa({ publica: { suportDistribucio: ' FilmoXarxa ' } }, distribuidores)).toBe(true);
    expect(esFilmoxarxa({ publica: { suportDistribucio: 'filmoxarxa' } }, [])).toBe(true);
  });

  it('les altres distribuïdores i les sessions sense distribuïdora no ho són', () => {
    expect(esFilmoxarxa({ publica: { suportDistribucioId: 'd2' } }, distribuidores)).toBe(false);
    expect(esFilmoxarxa({ publica: { suportDistribucio: 'Atalante' } }, distribuidores)).toBe(false);
    expect(esFilmoxarxa({ publica: {} }, distribuidores)).toBe(false);
    expect(esFilmoxarxa({}, [])).toBe(false);
  });
});

describe('dates invàlides', () => {
  it.each(['2026-13-05', '2026-00-10', '2026-02-31', '2026-12-00', 'avui'])('diaMesCa(%s) no trenca: dia buit', (data) => {
    expect(() => diaMesCa(data)).not.toThrow();
    expect(diaMesCa(data)).toBe('');
  });

  it('rangDatesCa ignora les dates invàlides', () => {
    expect(rangDatesCa(['2026-13-05', '2026-12-03'])).toBe('el 3 de desembre');
    expect(rangDatesCa(['2026-13-05', '2026-00-01'])).toBe('');
  });
});

describe('descarrega', () => {
  it('no revoca l\'URL en el mateix tick del clic (Firefox i Safari cancel·larien la baixada) sinó una mica després', () => {
    vi.useFakeTimers();
    const crea = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    const revoca = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    descarrega(new Blob(['a']), 'a.png');
    expect(clic).toHaveBeenCalledTimes(1);
    expect(revoca).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revoca).toHaveBeenCalledWith('blob:x');
    vi.useRealTimers();
    crea.mockRestore();
    revoca.mockRestore();
    clic.mockRestore();
  });
});

describe('curiositatsDe', () => {
  it('prefereix el camp propi de la sessió, encara que sigui buit, i cau al camp antic de la fitxa pública', () => {
    expect(curiositatsDe({ curiositatsSocial: ['a'], publica: { curiositats: ['b'] } })).toEqual(['a']);
    expect(curiositatsDe({ curiositatsSocial: [], publica: { curiositats: ['b'] } })).toEqual([]);
    expect(curiositatsDe({ publica: { curiositats: ['b'] } })).toEqual(['b']);
  });

  it('ignora el que no sigui una llista', () => {
    expect(curiositatsDe({ curiositatsSocial: 'x', publica: { curiositats: 'y' } })).toEqual([]);
    expect(curiositatsDe({})).toEqual([]);
    expect(curiositatsDe(undefined)).toEqual([]);
  });
});

describe('seccioDe', () => {
  it.each([
    ['cartellera', 'Cartellera', '#bf9000'],
    ['xarxa', 'Xarxa', '#2f6f76'],
    ['extra', 'Extra', '#8b2e2e'],
    ['xiquets', 'Xiquis', '#a78bd4'],
  ])('%s → «%s» amb el color de la web', (seccio, nom, color) => {
    const r = seccioDe({ publica: { seccio } });
    expect(r.nom).toBe(nom);
    expect(r.color).toBe(color);
    expect(r.text).toMatch(/^#/);
  });

  it('sense secció, o amb una de desconeguda, és Cartellera (la per defecte)', () => {
    expect(seccioDe({ publica: {} }).nom).toBe('Cartellera');
    expect(seccioDe({ publica: { seccio: '' } }).nom).toBe('Cartellera');
    expect(seccioDe({ publica: { seccio: 'altra' } }).nom).toBe('Cartellera');
    expect(seccioDe({}).nom).toBe('Cartellera');
  });
});
