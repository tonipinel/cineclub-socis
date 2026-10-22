// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { textSalutacio, llegirIdentitat, actualitzaSalutacio } from '../public/js/salutacio.js';
import { llegirIdentitat as llegirIdentitatLib, CLAU_IDENTITAT } from '../src/lib/identitat.js';

const IDENTITAT = { numeroSoci: 7, nomPublic: 'Isabel M.', token: 'tok-7' };

describe('textSalutacio', () => {
  it('saluda amb el nom públic', () => {
    expect(textSalutacio({ nomPublic: 'Isabel M.' })).toBe('Hola, Isabel M.!');
  });

  it('sense identitat (o sense nom) no hi ha text', () => {
    expect(textSalutacio(null)).toBe('');
    expect(textSalutacio(undefined)).toBe('');
    expect(textSalutacio({})).toBe('');
  });

  it('un nom en blanc, que no és text o massa llarg no saluda', () => {
    expect(textSalutacio({ nomPublic: '   ' })).toBe('');
    expect(textSalutacio({ nomPublic: 42 })).toBe('');
    expect(textSalutacio({ nomPublic: ['a'] })).toBe('');
    expect(textSalutacio({ nomPublic: 'x'.repeat(101) })).toBe('');
    expect(textSalutacio({ nomPublic: '  Isabel  ' })).toBe('Hola, Isabel!');
  });
});

describe('llegirIdentitat (còpia mínima del script)', () => {
  const casos = {
    'storage buit': () => {},
    'JSON corrupte': (s) => s.setItem(CLAU_IDENTITAT, '{no és json'),
    'valor null': (s) => s.setItem(CLAU_IDENTITAT, 'null'),
    'sense token': (s) => s.setItem(CLAU_IDENTITAT, JSON.stringify({ numeroSoci: 7, nomPublic: 'Isabel M.' })),
    'sense nom': (s) => s.setItem(CLAU_IDENTITAT, JSON.stringify({ numeroSoci: 7, token: 't' })),
    'número com a text': (s) => s.setItem(CLAU_IDENTITAT, JSON.stringify({ numeroSoci: '7', nomPublic: 'I', token: 't' })),
    'nom en blanc': (s) => s.setItem(CLAU_IDENTITAT, JSON.stringify({ ...IDENTITAT, nomPublic: '   ' })),
    'nom que no és text': (s) => s.setItem(CLAU_IDENTITAT, JSON.stringify({ ...IDENTITAT, nomPublic: { a: 1 } })),
    'nom massa llarg': (s) => s.setItem(CLAU_IDENTITAT, JSON.stringify({ ...IDENTITAT, nomPublic: 'x'.repeat(101) })),
    'nom al límit': (s) => s.setItem(CLAU_IDENTITAT, JSON.stringify({ ...IDENTITAT, nomPublic: 'x'.repeat(100) })),
    'nom amb espais': (s) => s.setItem(CLAU_IDENTITAT, JSON.stringify({ ...IDENTITAT, nomPublic: '  Isabel M.  ' })),
    'token en blanc': (s) => s.setItem(CLAU_IDENTITAT, JSON.stringify({ ...IDENTITAT, token: ' ' })),
    'token que no és text': (s) => s.setItem(CLAU_IDENTITAT, JSON.stringify({ ...IDENTITAT, token: 5 })),
    'token massa llarg': (s) => s.setItem(CLAU_IDENTITAT, JSON.stringify({ ...IDENTITAT, token: 't'.repeat(201) })),
    'identitat vàlida': (s) => s.setItem(CLAU_IDENTITAT, JSON.stringify(IDENTITAT)),
    'camps addicionals': (s) => s.setItem(CLAU_IDENTITAT, JSON.stringify({ ...IDENTITAT, extra: 1 })),
  };

  it.each(Object.entries(casos))('coincideix amb src/lib/identitat.js: %s', (_nom, prepara) => {
    sessionStorage.clear();
    prepara(sessionStorage);
    expect(llegirIdentitat(sessionStorage)).toEqual(llegirIdentitatLib(sessionStorage));
  });

  it('un storage que llença no trenca res', () => {
    const trencat = { getItem: () => { throw new Error('bloquejat'); } };
    expect(llegirIdentitat(trencat)).toBeNull();
    expect(llegirIdentitat(null)).toBeNull();
  });
});

describe('actualitzaSalutacio', () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '<header><div class="site-header__inner"><a class="site-header__brand" href="/">Marca</a><nav class="site-header__nav"></nav></div></header>';
  });
  const element = () => document.querySelector('.capcalera-publica__salutacio');

  it('sense identitat no afegeix res al DOM', () => {
    const abans = document.body.innerHTML;
    actualitzaSalutacio(document, sessionStorage);
    expect(document.body.innerHTML).toBe(abans);
  });

  it('amb identitat crea «Hola, {nom}!» entre la marca i el menú', () => {
    sessionStorage.setItem(CLAU_IDENTITAT, JSON.stringify(IDENTITAT));
    actualitzaSalutacio(document, sessionStorage);
    expect(element().textContent).toBe('Hola, Isabel M.!');
    expect(element().previousElementSibling.className).toBe('site-header__brand');
    expect(element().nextElementSibling.className).toBe('site-header__nav');
  });

  it('no el duplica en actualitzar-se i canvia el text', () => {
    sessionStorage.setItem(CLAU_IDENTITAT, JSON.stringify(IDENTITAT));
    actualitzaSalutacio(document, sessionStorage);
    sessionStorage.setItem(CLAU_IDENTITAT, JSON.stringify({ ...IDENTITAT, nomPublic: 'Anna P.' }));
    actualitzaSalutacio(document, sessionStorage);
    expect(document.querySelectorAll('.capcalera-publica__salutacio')).toHaveLength(1);
    expect(element().textContent).toBe('Hola, Anna P.!');
  });

  it('el nom es posa com a text, mai com a HTML', () => {
    sessionStorage.setItem(CLAU_IDENTITAT, JSON.stringify({ ...IDENTITAT, nomPublic: '<img src=x onerror=alert(1)>' }));
    actualitzaSalutacio(document, sessionStorage);
    expect(element().querySelector('img')).toBeNull();
    expect(element().textContent).toBe('Hola, <img src=x onerror=alert(1)>!');
  });

  it('en esborrar la identitat l\'element desapareix i el DOM torna a ser l\'original', () => {
    const original = document.body.innerHTML;
    sessionStorage.setItem(CLAU_IDENTITAT, JSON.stringify(IDENTITAT));
    actualitzaSalutacio(document, sessionStorage);
    sessionStorage.removeItem(CLAU_IDENTITAT);
    actualitzaSalutacio(document, sessionStorage);
    expect(element()).toBeNull();
    expect(document.body.innerHTML).toBe(original);
  });

  it('sense capçalera a la pàgina no fa res', () => {
    document.body.innerHTML = '';
    sessionStorage.setItem(CLAU_IDENTITAT, JSON.stringify(IDENTITAT));
    expect(() => actualitzaSalutacio(document, sessionStorage)).not.toThrow();
    expect(element()).toBeNull();
  });
});

describe('arrencada del script i esdeveniment identitat-canviada', () => {
  it('amb la capçalera a la pàgina, pinta en carregar i reacciona a identitat-canviada', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();
    sessionStorage.setItem(CLAU_IDENTITAT, JSON.stringify(IDENTITAT));
    document.body.innerHTML = '<div class="site-header__inner"><a class="site-header__brand" href="/">Marca</a></div>';
    await import('../public/js/salutacio.js');
    const el = () => document.querySelector('.capcalera-publica__salutacio');
    expect(el().textContent).toBe('Hola, Isabel M.!');

    sessionStorage.setItem(CLAU_IDENTITAT, JSON.stringify({ ...IDENTITAT, nomPublic: 'Anna P.' }));
    window.dispatchEvent(new CustomEvent('identitat-canviada'));
    expect(el().textContent).toBe('Hola, Anna P.!');

    sessionStorage.removeItem(CLAU_IDENTITAT);
    window.dispatchEvent(new CustomEvent('identitat-canviada'));
    expect(el()).toBeNull();
  });
});
