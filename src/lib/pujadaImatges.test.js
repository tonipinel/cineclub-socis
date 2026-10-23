import { describe, it, expect, vi, afterEach } from 'vitest';
import { afegirUrls, arrossegamentDisponible, pujarImatges, reordenar } from './pujadaImatges';

const fitxer = (nom, tipus, mida = 1000) => {
  const f = new File(['x'], nom, { type: tipus });
  Object.defineProperty(f, 'size', { value: mida });
  return f;
};

const opcions = (extra) => ({ slug: 'pig', tipus: 'gallery', bucket: 'bucket-prova', instant: 7, ...extra });
const ERROR_PUJADA = "No s'ha pogut pujar la imatge. Torna-ho a provar.";

describe('pujarImatges', () => {
  it('puja els vàlids a web/sessions/<slug>/ i retorna l\'error de l\'invàlid sense pujar-lo', async () => {
    const pujarFitxer = vi.fn().mockResolvedValue({});
    const [a, gif, c] = [fitxer('a.jpg', 'image/jpeg'), fitxer('b.gif', 'image/gif'), fitxer('c.webp', 'image/webp')];
    const resultat = await pujarImatges([a, gif, c], opcions({ pujarFitxer }));
    expect(resultat).toEqual([
      { fitxer: a, url: 'https://firebasestorage.googleapis.com/v0/b/bucket-prova/o/web%2Fsessions%2Fpig%2Fgallery-7-1.jpg?alt=media' },
      { fitxer: gif, error: 'La imatge ha de ser JPG, PNG o WebP.' },
      { fitxer: c, url: 'https://firebasestorage.googleapis.com/v0/b/bucket-prova/o/web%2Fsessions%2Fpig%2Fgallery-7-2.webp?alt=media' },
    ]);
    expect(pujarFitxer).toHaveBeenCalledTimes(2);
    expect(pujarFitxer.mock.calls.map(([cami]) => cami)).toEqual(['web/sessions/pig/gallery-7-1.jpg', 'web/sessions/pig/gallery-7-2.webp']);
    expect(pujarFitxer.mock.calls.map(([, f]) => f)).toEqual([a, c]);
  });

  it('el cartell no porta número al nom', async () => {
    const pujarFitxer = vi.fn().mockResolvedValue({});
    const [r] = await pujarImatges([fitxer('x.png', 'image/png')], opcions({ tipus: 'poster', pujarFitxer }));
    expect(pujarFitxer).toHaveBeenCalledWith('web/sessions/pig/poster-7.png', expect.any(File));
    expect(r.url).toBe('https://firebasestorage.googleapis.com/v0/b/bucket-prova/o/web%2Fsessions%2Fpig%2Fposter-7.png?alt=media');
  });

  it('un fitxer de 11 MB dona l\'error de mida i no es puja', async () => {
    const pujarFitxer = vi.fn();
    const gran = fitxer('a.jpg', 'image/jpeg', 11 * 1024 * 1024);
    expect(await pujarImatges([gran], opcions({ pujarFitxer }))).toEqual([
      { fitxer: gran, error: 'La imatge no pot ocupar més de 10 MB.' },
    ]);
    expect(pujarFitxer).not.toHaveBeenCalled();
  });

  it('si falla la pujada d\'un fitxer, els altres continuen', async () => {
    const pujarFitxer = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('xarxa')).mockResolvedValueOnce({});
    const fitxers = [fitxer('a.jpg', 'image/jpeg'), fitxer('b.jpg', 'image/jpeg'), fitxer('c.jpg', 'image/jpeg')];
    const [r1, r2, r3] = await pujarImatges(fitxers, opcions({ pujarFitxer }));
    expect(r1.url).toMatch(/gallery-7-1\.jpg\?alt=media$/);
    expect(r2).toEqual({ fitxer: fitxers[1], error: ERROR_PUJADA });
    expect(r3.url).toMatch(/gallery-7-3\.jpg\?alt=media$/);
    expect(pujarFitxer).toHaveBeenCalledTimes(3);
  });

  it('informa del progrés de cada fitxer: pujant i després ok o error', async () => {
    const pujarFitxer = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('xarxa'));
    const onProgres = vi.fn();
    const [a, b, gif] = [fitxer('a.jpg', 'image/jpeg'), fitxer('b.jpg', 'image/jpeg'), fitxer('c.gif', 'image/gif')];
    await pujarImatges([a, b, gif], opcions({ pujarFitxer, onProgres }));
    const de = (f) => onProgres.mock.calls.filter(([x]) => x === f).map(([, estat]) => estat);
    expect(de(a)).toEqual(['pujant', 'ok']);
    expect(de(b)).toEqual(['pujant', 'error']);
    expect(de(gif)).toEqual(['error']);
  });
});

describe('afegirUrls', () => {
  it('afegeix només les URL que no hi són, mantenint l\'ordre', () => {
    expect(afegirUrls(['a', 'b'], ['b', 'c', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('no modifica la llista original', () => {
    const galeria = ['a'];
    afegirUrls(galeria, ['b']);
    expect(galeria).toEqual(['a']);
  });
});

describe('reordenar', () => {
  it('mou un element a una altra posició', () => {
    expect(reordenar(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(reordenar(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('amb índexs iguals o fora de rang retorna una còpia sense canvis', () => {
    const llista = ['a', 'b', 'c'];
    for (const [de, a] of [[1, 1], [-1, 0], [0, 3], [5, 1]]) {
      const r = reordenar(llista, de, a);
      expect(r).toEqual(['a', 'b', 'c']);
      expect(r).not.toBe(llista);
    }
  });
});

describe('arrossegamentDisponible', () => {
  const pointerEvent = Object.getOwnPropertyDescriptor(window, 'PointerEvent');
  const ontouchstart = Object.getOwnPropertyDescriptor(window, 'ontouchstart');

  afterEach(() => {
    delete window.PointerEvent;
    delete window.ontouchstart;
    if (pointerEvent) Object.defineProperty(window, 'PointerEvent', pointerEvent);
    if (ontouchstart) Object.defineProperty(window, 'ontouchstart', ontouchstart);
  });

  const sense = () => {
    delete window.PointerEvent;
    delete window.ontouchstart;
  };

  it('és cert amb PointerEvent', () => {
    sense();
    window.PointerEvent = function PointerEvent() {};
    expect(arrossegamentDisponible()).toBe(true);
  });

  it('és cert amb ontouchstart', () => {
    sense();
    window.ontouchstart = null;
    expect(arrossegamentDisponible()).toBe(true);
  });

  it('és fals si no hi ha cap dels dos', () => {
    sense();
    expect(arrossegamentDisponible()).toBe(false);
  });
});
