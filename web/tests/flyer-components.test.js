import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import FlyerCaraA from '../src/components/FlyerCaraA.astro';
import FlyerCaraB from '../src/components/FlyerCaraB.astro';
import flyer from '../src/data/flyer.json';

const peli = (i, extra = {}) => ({
  id: `s${i}`,
  titol: `Pel·lícula ${i}`,
  titolTraduit: '',
  dataText: `Dj ${i} nov`,
  imatge: `https://exemple.cat/cartell-${i}.jpg`,
  generes: 'Drama · Comèdia',
  versio: 'VOSE',
  idioma: 'Francès',
  url: `/sessions/s${i}/`,
  ...extra,
});

const renderitza = async (component, props) => {
  const container = await AstroContainer.create();
  return container.renderToString(component, { props });
};
const compta = (html, re) => (html.match(re) ?? []).length;

describe('FlyerCaraB preu', () => {
  it('dues pastilles: socis «Entrada gratuïta. Fes-te soci/a per 30 €/any!» i no socis amb el preu calculat', async () => {
    const html = await renderitza(FlyerCaraB, { preu: { text: 'de 3 a 5 € segons sessió' } });
    expect(html).toMatch(/flyer-info__etiqueta">Socis<\/span>.*<strong class="flyer-info__import">Entrada gratuïta\.<\/strong> Fes-te soci\/a per 30 €\/any!/s);
    expect(html).toMatch(/flyer-info__etiqueta">No socis<\/span>.*Aportació <strong class="flyer-info__import">de 3 a 5 €<\/strong> segons sessió/s);
    expect(html).not.toContain('>Preu<');
  });
  it('sense preu calculat, el text provisional de flyer.json', async () => {
    const html = await renderitza(FlyerCaraB, {});
    expect(html).toMatch(new RegExp(`flyer-info__etiqueta">No socis</span>.*<strong class="flyer-info__import">${flyer.preu.charAt(0).toUpperCase()}${flyer.preu.slice(1)}</strong>`, 's'));
  });
});

describe('logo del club', () => {
  it('les dues cares porten el logo en color com a <img> amb alt (el hero-logo blanc no es veuria sobre el blanc)', async () => {
    const a = await renderitza(FlyerCaraA, { pelicules: [peli(1)] });
    expect(a).toMatch(/<img class="flyer-tira__logo" src="\/images\/entitats\/cineclub-roda-de-bera\.webp" width="1220" height="784" alt="Cineclub Roda de Berà"/);
    expect(a).toContain('Programació');
    const b = await renderitza(FlyerCaraB, {});
    expect(b).toMatch(/<img class="flyer-marca__logo" src="\/images\/entitats\/cineclub-roda-de-bera\.webp" width="1220" height="784" alt="Cineclub Roda de Berà"/);
  });
});

describe('FlyerCaraA', () => {
  it.each([3, 5])('%i pel·lícules donen %i columnes', async (n) => {
    const html = await renderitza(FlyerCaraA, { pelicules: Array.from({ length: n }, (_, i) => peli(i + 1)) });
    expect(compta(html, /class="flyer-columna"/g)).toBe(n);
    expect(html.includes('Cineclub Roda de Berà')).toBe(n !== 5); // a 5 no hi ha lateral (ni logo)
  });

  it('el títol llarg porta la classe de retall', async () => {
    const titol = 'A'.repeat(120);
    const html = await renderitza(FlyerCaraA, { pelicules: [peli(1, { titol })] });
    expect(html).toMatch(/class="flyer-columna__titol"[^>]*>\s*A{120}\s*</);
  });

  it('sense cartell surt el marcador amb el títol', async () => {
    const html = await renderitza(FlyerCaraA, { pelicules: [peli(1, { imatge: '', titol: 'Sense Cartell' })] });
    expect(html).not.toContain('flyer-columna__imatge');
    expect(html).toMatch(/class="flyer-columna__marcador"[^>]*>\s*Sense Cartell/);
  });

  it('la targeta porta (de dalt a baix) pastilla de secció + data amb hora, cartell, títol en català, i versió + idioma en UNA pastilla al final', async () => {
    const html = await renderitza(FlyerCaraA, { pelicules: [peli(1, { titolTraduit: 'Títol traduït', hora: '19:00', seccio: 'xarxa' })] });
    const ordre = ['flyer-columna__seccio', 'flyer-columna__data', 'flyer-columna__imatge', 'flyer-columna__titol', 'flyer-columna__versio'];
    const posicions = ordre.map((c) => html.indexOf(`class="${c}`));
    expect(posicions.every((n) => n >= 0)).toBe(true);
    expect(posicions).toEqual([...posicions].sort((x, y) => x - y));
    expect(html).toMatch(/flyer-columna__seccio" style="background-color: #2f6f76; color: #fff;">Xarxa/);
    // Pastilla composta d'una sola línia (secció + data sense dia de la setmana, amb l'hora).
    expect(html).toMatch(/<div class="flyer-columna__capcalera"><span class="flyer-columna__seccio"[^>]*>Xarxa<\/span><span class="flyer-columna__data"><b>1 nov<\/b><span class="flyer-columna__hora"> 19:00<\/span><\/span><\/div>/);
    expect(html).not.toContain('Dj 1 nov</b>');
    const senseSeccio = await renderitza(FlyerCaraA, { pelicules: [peli(1, { seccio: 'inexistent' })] });
    expect(senseSeccio).not.toContain('flyer-columna__seccio');
    expect(senseSeccio).toContain('flyer-columna__data');
    const cartellera = await renderitza(FlyerCaraA, { pelicules: [peli(1, { seccio: 'cartellera' })] });
    expect(cartellera).toMatch(/background-color: #bf9000; color: #000;">Cartellera/);
    expect(html).toContain('19:00');
    expect(html.match(/class="flyer-columna__versio/g)).toHaveLength(1);
    expect(html).toMatch(/flyer-columna__versio">.*VOSE<span class="flyer-columna__idioma"> · Francès/s);
    expect(html).not.toContain('flyer-columna__pastilles');
  });

  it('mostra només el títol en català (el de la traducció); sense traducció, l\'original; mai buit; cap subtítol', async () => {
    const amb = await renderitza(FlyerCaraA, { pelicules: [peli(1, { titol: 'Anatomie', titolTraduit: 'Anatomia d\'una caiguda' })] });
    expect(amb).toMatch(/flyer-columna__titol"[^>]*>\s*Anatomia d(?:&#39;|')una caiguda\s*</);
    expect(amb).not.toContain('>Anatomie<');
    const sense = await renderitza(FlyerCaraA, { pelicules: [peli(1, { titol: 'Perfect Days', titolTraduit: '' })] });
    expect(sense).toMatch(/flyer-columna__titol"[^>]*>\s*Perfect Days\s*</);
    expect(amb + sense).not.toContain('subtitol');
  });

  it('sense versió es pinta «Versió per confirmar» marcat com a incomplet; sense idioma, només la versió', async () => {
    const html = await renderitza(FlyerCaraA, { pelicules: [peli(1, { versio: '' })] });
    expect(html).toMatch(/flyer-columna__versio flyer-columna__versio--incompleta[^>]*>.*Versió per confirmar/s);
    const ok = await renderitza(FlyerCaraA, { pelicules: [peli(1)] });
    expect(ok).not.toContain('--incompleta');
    expect(ok).toContain('VOSE');
    const senseIdioma = await renderitza(FlyerCaraA, { pelicules: [peli(1, { idioma: '' })] });
    expect(senseIdioma).toContain('VOSE');
    expect(senseIdioma).not.toContain('flyer-columna__idioma');
  });

  it('el CSS retalla el títol a 2 línies, enganxa la pastilla de versió a baix i amaga el desbordament', () => {
    const css = readFileSync(new URL('../src/styles/flyer.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.flyer-columna__titol\s*{[^}]*line-clamp:\s*3/);
    expect(css).not.toContain('subtitol');
    expect(css).toMatch(/\.flyer-columna__versio\s*{[^}]*margin-top:\s*auto/);
    expect(css).toMatch(/\.flyer-tira\s*{[^}]*width:\s*210mm[^}]*height:\s*99mm[^}]*overflow:\s*hidden/s);
  });

  it('la pastilla de versió + idioma té el text blanc sobre fons negre (es llegeix bé imprès)', () => {
    const css = readFileSync(new URL('../src/styles/flyer.css', import.meta.url), 'utf8');
    const pastilla = css.match(/\.flyer-columna__versio\s*{([^}]*)}/)[1];
    expect(pastilla).toMatch(/\btext-white\b/);
    expect(pastilla).not.toMatch(/\btext-gold\b/);
    expect(pastilla).toMatch(/background-color:\s*#000;/);
    expect(css).toMatch(/\.flyer-columna__idioma\s*{[^}]*\btext-white\b/);
  });
});

describe('FlyerCaraB', () => {
  it('conté l\'adreça, la web i el QR en SVG', async () => {
    const html = await renderitza(FlyerCaraB, { url: 'https://cineclubrodadebera.cat' });
    expect(html).toContain(flyer.adreca);
    expect(html).toContain(flyer.web);
    expect(html).toMatch(/class="flyer-qr"[^>]*>\s*<svg/);
  });
});

describe('FlyerCaraB tipografia', () => {
  it('titular amb la part daurada, parells etiqueta daurada + valor i el text del QR', async () => {
    const html = await renderitza(FlyerCaraB, {});
    expect(html).toMatch(/<h2 class="flyer-info__titular">Cinema en <span class="flyer-info__titular-or">versió original<\/span><\/h2>/);
    const etiquetes = [...html.matchAll(/flyer-info__etiqueta">([^<]+)</g)].map((m) => m[1]);
    expect(etiquetes).toEqual(['Quan', 'Socis', 'No socis', 'On', 'Més info']);
    expect(html).toContain(flyer.qrText);
  });
});

describe('FlyerCaraB estructura', () => {
  it('només hi ha l\'espai entre el bloc del logo i els textos: cap element de divisòria a la banda', async () => {
    const html = await renderitza(FlyerCaraB, {});
    expect(html).not.toMatch(/divisor|divis|separador/i);
    const css = readFileSync(new URL('../src/styles/flyer.css', import.meta.url), 'utf8');
    expect(css).not.toMatch(/\.flyer-info::(before|after)/);
    expect(css).toMatch(/\.flyer-banda\s*\{[^}]*background-image:[^;]*cinema-pattern/);
  });
});

describe('FlyerCaraA lateral', () => {
  it('el rang de dates va sense el dia de la setmana: «5 nov – 19 nov» (mateix mes), «5 nov» (una sola data)', async () => {
    const dos = await renderitza(FlyerCaraA, { pelicules: [peli(1, { dataText: 'Dj 5 nov' }), peli(2, { dataText: 'Dj 19 nov' })] });
    expect(dos).toMatch(/flyer-tira__dates">5 nov – 19 nov</);
    const una = await renderitza(FlyerCaraA, { pelicules: [peli(1, { dataText: 'Dj 5 nov' })] });
    expect(una).toMatch(/flyer-tira__dates">5 nov</);
    const tres = await renderitza(FlyerCaraA, { pelicules: [peli(1, { dataText: 'Dj 5 nov' }), peli(2, { dataText: 'Dj 3 des' }), peli(3, { dataText: 'Dj 7 gen' })] });
    expect(tres).toMatch(/flyer-tira__dates">5 nov – 7 gen</);
  });
});

describe('FlyerCaraB pastilla del QR', () => {
  it('el QR i els textos (frase + subtítol) van dins una sola fila/pastilla sota el logo; el titular no porta caixa', async () => {
    const html = await renderitza(FlyerCaraB, {});
    const fila = html.match(/<div class="flyer-marca__fila">([\s\S]*?)<\/div><\/div><\/div>/)?.[0] ?? '';
    expect(fila).toContain('flyer-qr');
    expect(fila).toContain('flyer-marca__text');
    expect(fila).toContain('flyer-qr-text');
    expect(html.indexOf('flyer-marca__logo')).toBeLessThan(html.indexOf('flyer-marca__fila'));
    const css = readFileSync(new URL('../src/styles/flyer.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.flyer-marca__fila\s*\{[^}]*background-color:\s*#000/);
    expect(css).not.toMatch(/\.flyer-info__(cos|titular)\s*\{[^}]*background/);
  });
});

describe('estil quadrat', () => {
  it('les pastilles i la banda del flyer no tenen cantonades arrodonides', () => {
    const css = readFileSync(new URL('../src/styles/flyer.css', import.meta.url), 'utf8');
    const art = css.slice(0, css.indexOf('/* Pàgina pública'));
    expect(art).not.toMatch(/border-radius|\brounded/);
  });
});

describe('cartell de la targeta', () => {
  it('omple la caixa (cover) ancorat a dalt, sense bandes ni alternativa contain', () => {
    const css = readFileSync(new URL('../src/styles/flyer.css', import.meta.url), 'utf8');
    const bloc = css.match(/\.flyer-columna__imatge,\s*\.flyer-columna__marcador\s*\{[^}]*\}/)?.[0] ?? '';
    expect(bloc).toMatch(/object-cover/);
    expect(bloc).toMatch(/object-position:\s*top center/);
    expect(bloc).toMatch(/width:\s*100cqw/);
    expect(bloc).toMatch(/height:\s*100cqh/);
    // Els logos de la franja de la cara B sí que es contenen (mai es retallen); els cartells no.
    expect(css.replace(/\.flyer-franja__logo\s*\{[^}]*\}/, '')).not.toMatch(/object-contain|object-fit:\s*contain|min-aspect-ratio/);
  });
});

describe('enquadrament del cartell', () => {
  it('cada cartell porta el modificador del seu enquadrament («dalt» no en porta)', async () => {
    const html = await renderitza(FlyerCaraA, {
      pelicules: [peli(1), peli(2, { enquadrament: 'centre' }), peli(3, { enquadrament: 'baix' }), peli(4, { enquadrament: 'dalt' })],
    });
    expect(compta(html, /class="flyer-columna__imatge"/g)).toBe(2);
    expect(compta(html, /class="flyer-columna__imatge flyer-columna__imatge--centre"/g)).toBe(1);
    expect(compta(html, /class="flyer-columna__imatge flyer-columna__imatge--baix"/g)).toBe(1);
  });
  it('el CSS ancora el cartell al centre o a baix amb els modificadors', () => {
    const css = readFileSync(new URL('../src/styles/flyer.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.flyer-columna__imatge--centre\s*\{\s*object-position:\s*center center;\s*\}/);
    expect(css).toMatch(/\.flyer-columna__imatge--baix\s*\{\s*object-position:\s*bottom center;\s*\}/);
  });
});

describe('FlyerCaraA laterals', () => {
  const n = (html, re) => (html.match(re) ?? []).length;
  it('3 pel·lícules: lateral esquerre i lateral dret (mirall) amb els mateixos textos; 4-6: només l\'esquerre', async () => {
    const tres = await renderitza(FlyerCaraA, { pelicules: [peli(1), peli(2), peli(3)] });
    expect(n(tres, /<aside class="flyer-tira__lateral/g)).toBe(2);
    expect(n(tres, />Programació</g)).toBe(2);
    expect(tres).toContain('flyer-tira__lateral flyer-tira__lateral--dreta');
    // El dret va després de les targetes.
    expect(tres.indexOf('flyer-tira__lateral--dreta')).toBeGreaterThan(tres.lastIndexOf('flyer-columna"'));
    for (const k of [4]) {
      const html = await renderitza(FlyerCaraA, { pelicules: Array.from({ length: k }, (_, i) => peli(i + 1)) });
      expect(n(html, /<aside class="flyer-tira__lateral/g)).toBe(1);
      expect(html).not.toContain('--dreta');
    }
  });
  it('5 pel·lícules: cap lateral (ni logo ni «Programació» ni dates): les targetes ocupen tot l\'ample', async () => {
    const html = await renderitza(FlyerCaraA, { pelicules: Array.from({ length: 5 }, (_, i) => peli(i + 1)) });
    expect(n(html, /<aside/g)).toBe(0);
    expect(html).not.toContain('Programació');
    expect(html).not.toContain('flyer-tira__logo');
    expect(n(html, /class="flyer-columna"/g)).toBe(5);
  });
  it('el CSS del lateral dret llegeix de dalt a baix (sense gir) i porta el logo a baix', () => {
    const css = readFileSync(new URL('../src/styles/flyer.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.flyer-tira__vertical\s*\{[^}]*writing-mode:\s*vertical-rl;[^}]*rotate\(180deg\)/);
    expect(css).toMatch(/\.flyer-tira__lateral--dreta\s*\{[^}]*flex-col-reverse/);
    expect(css).toMatch(/\.flyer-tira__lateral--dreta \.flyer-tira__vertical\s*\{[^}]*transform:\s*none/);
  });
});

describe('FlyerCaraA 5 pel·lícules: cartell 2:3', () => {
  it('només amb 5 pel·lícules la tira porta la classe de caixa de 52 mm (un poc menys que 2:3: es retalla la part de baix)', async () => {
    const cinc = await renderitza(FlyerCaraA, { pelicules: Array.from({ length: 5 }, (_, i) => peli(i + 1)) });
    expect(cinc).toContain('flyer-tira flyer-tira--cinc');
    for (const k of [3, 4]) {
      const html = await renderitza(FlyerCaraA, { pelicules: Array.from({ length: k }, (_, i) => peli(i + 1)) });
      expect(html).not.toContain('flyer-tira--cinc');
    }
    const css = readFileSync(new URL('../src/styles/flyer.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.flyer-tira--cinc \.flyer-columna__cartell\s*\{[^}]*flex:\s*0 0 auto;[^}]*height:\s*52mm/);
    expect(css).toMatch(/object-position:\s*top center/);
  });
});

describe('FlyerCaraA idiomes complets i separador', () => {
  const tira = (n, extra = {}) => renderitza(FlyerCaraA, { pelicules: Array.from({ length: n }, (_, i) => peli(i + 1, extra)) });
  it('mida del títol per nombre de pel·lícules', async () => {
    const mida = (html) => html.match(/--titol-mida: ([\d.]+)mm/)?.[1];
    expect([await tira(3), await tira(4), await tira(5)].map(mida)).toEqual(['3.9', '3.9', '4.4']);
  });
  it('la llista d\'idiomes surt sencera, sense «+N», a qualsevol nombre de pel·lícules', async () => {
    for (const k of [3, 4, 5]) {
      const html = await tira(k, { idioma: 'Àrab, Hebreu' });
      expect(html).toContain(' · Àrab, Hebreu');
      expect(html).not.toMatch(/\+\d/);
    }
  });
  it('la barra porta una línia fina que la separa del cartell sense fer-la créixer', () => {
    const css = readFileSync(new URL('../src/styles/flyer.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.flyer-columna__capcalera\s*\{[^}]*box-shadow:\s*0 0\.3mm 0 0 #000/);
  });
});

describe('FlyerCaraA títols: reserva per tira i excepció dels molt llargs', () => {
  const mostra = 'Misteriós assassinat a la muntanya';
  const tira = (n, titols) => renderitza(FlyerCaraA, { pelicules: Array.from({ length: n }, (_, i) => peli(i + 1, { titolTraduit: titols[i % titols.length] })) });
  const alcada = (html) => Number(html.match(/--titol-alcada: ([\d.]+)mm/)?.[1]);
  const mides = (html) => [...html.matchAll(/flyer-columna__noms" style="--titol: ([\d.]+)mm"/g)].map((m) => Number(m[1]));
  it('títols curts a 3 pel·lícules reserven 1 línia (3,9 mm x 1,1); amb el títol d\'exemple, més alçada', async () => {
    expect(alcada(await tira(3, ['Perfect Days']))).toBeCloseTo(4.29, 1);
    expect(alcada(await tira(3, [mostra]))).toBeGreaterThan(alcada(await tira(3, ['Perfect Days'])));
  });
  it('el títol d\'exemple surt sencer a 3, 4 i 5 pel·lícules (fins a 3 línies) sense reduir la lletra, i només un de desmesurat redueix la lletra (mínim 2,4 mm)', async () => {
    for (const n of [3, 4, 5]) expect(mides(await tira(n, [mostra]))).toEqual([]);
    const llarg = 'Un títol traduït tan llarg que no cap ni en tres línies d\'una targeta estreta de cinc pel·lícules';
    const reduides = mides(await tira(5, [llarg]));
    expect(reduides.length).toBeGreaterThan(0);
    for (const m of reduides) { expect(m).toBeGreaterThanOrEqual(2.4); expect(m).toBeLessThan(4.4); }
  });
});

describe('espai entre el títol i la pastilla', () => {
  it('el títol va centrat verticalment al bloc reservat (buits de dalt i baix iguals) i la pastilla fixada a baix', () => {
    const css = readFileSync(new URL('../src/styles/flyer.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.flyer-columna__noms\s*\{[^}]*justify-content:\s*center/);
    expect(css).toMatch(/\.flyer-columna__versio\s*\{[^}]*margin-top:\s*auto/);
    expect(css).toMatch(/\.flyer-columna__text\s*\{[^}]*gap:\s*1\.2mm;\s*padding:\s*1\.2mm/);
    expect(css).not.toMatch(/justify-content:\s*flex-(start|end)/);
  });
});

describe('FlyerCaraA fora de rang (3-5)', () => {
  it('amb més de 5 pel·lícules (document antic) en pinta només les 5 primeres; amb menys de 3, no peta', async () => {
    const sis = await renderitza(FlyerCaraA, { pelicules: Array.from({ length: 6 }, (_, i) => peli(i + 1)) });
    expect(compta(sis, /class="flyer-columna"/g)).toBe(5);
    expect(sis).toContain('Pel·lícula 5');
    expect(sis).not.toContain('Pel·lícula 6');
    const dues = await renderitza(FlyerCaraA, { pelicules: [peli(1), peli(2)] });
    expect(compta(dues, /class="flyer-columna"/g)).toBe(2);
  });
});

describe('FlyerCaraB: redacció del preu dels no socis', () => {
  const noSocis = async (text) => (await renderitza(FlyerCaraB, { preu: { text } })).match(/No socis<\/span>.*?<span class="flyer-info__valor">(.*?)<\/span>/s)?.[1].replace(/<[^>]+>/g, '');
  it('«Aportació de 3 a 5 € segons sessió»; un sol preu: «Aportació de 5 € per sessió»; amb gratuïtes barrejades, «Aportació: gratis o …»; tot gratis: «Gratis»', async () => {
    expect(await noSocis('de 3 a 5 € segons sessió')).toBe('Aportació de 3 a 5 € segons sessió');
    expect(await noSocis('5 € per sessió')).toBe('Aportació de 5 € per sessió');
    expect(await noSocis('gratis o 5 € segons la sessió')).toBe('Aportació: gratis o 5 € segons la sessió');
    expect(await noSocis('gratis')).toBe('Gratis');
  });
});

describe('FlyerCaraA estimació de línies del títol (5 pel·lícules)', () => {
  const alcada = (html) => Number(html.match(/--titol-alcada: ([\d.]+)mm/)?.[1]);
  const mides = (html) => [...html.matchAll(/flyer-columna__noms" style="--titol: ([\d.]+)mm"/g)].map((m) => Number(m[1]));
  const cinc = (titol) => renderitza(FlyerCaraA, { pelicules: Array.from({ length: 5 }, (_, i) => peli(i + 1, { titolTraduit: i === 2 ? titol : 'Dies perfectes' })) });
  it('«Misteriós assassinat a la muntanya» reserva 3 línies a la mida normal (4,4 mm)', async () => {
    const html = await cinc('Misteriós assassinat a la muntanya');
    expect(alcada(html)).toBeCloseTo(3 * 4.4 * 1.1, 1);
    expect(mides(html)).toEqual([]);
  });
  it('una sola paraula més llarga que una línia es compta en diverses línies (overflow-wrap) i, si no hi cap, redueix la lletra', async () => {
    const llarga = await cinc('Anticonstitucionalissimament');
    expect(alcada(llarga)).toBeGreaterThan(2 * 4.4 * 1.1 - 0.01);
    const css = readFileSync(new URL('../src/styles/flyer.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.flyer-columna__titol\s*\{[^}]*overflow-wrap:\s*anywhere/);
    const immensa = await cinc('Pneumoultramicroscopicossilicovolcanoconiosi pneumoultramicroscopicossilicovolcanoconiosi');
    for (const m of mides(immensa)) expect(m).toBeGreaterThanOrEqual(2.4);
  });
  it('un títol buit o sense dades (esborrany sense títol ni slug) no trenca el render', async () => {
    const html = await renderitza(FlyerCaraA, { pelicules: [peli(1, { titol: undefined, titolTraduit: '' }), peli(2), peli(3)] });
    expect(html).toContain('flyer-columna__titol');
  });
});

describe('FlyerCaraB franja de logos', () => {
  const AJUNTAMENT = /<img class="flyer-franja__logo" src="\/images\/entitats\/ajuntament-roda-de-bera-horitzontal\.png" alt="Ajuntament de Roda de Berà"/;
  it('sense distribuïdores: només el logo de l\'Ajuntament, sense etiquetes', async () => {
    const html = await renderitza(FlyerCaraB, {});
    expect(html).toMatch(AJUNTAMENT);
    expect(html).not.toMatch(/Amb el suport de|Distribuïdor/);
    expect(compta(html, /class="flyer-franja__logo"/g)).toBe(1);
  });
  it('una distribuïdora: l\'Ajuntament i el seu logo, en una sola banda i sense divisòria', async () => {
    const html = await renderitza(FlyerCaraB, { distribuidores: [{ nom: 'Avalon', logo: 'https://x/avalon.png' }] });
    expect(html).toMatch(/class="flyer-franja"[^>]*>\s*<img class="flyer-franja__logo"[^>]*alt="Ajuntament de Roda de Berà"[^>]*>\s*<img class="flyer-franja__logo" src="https:\/\/x\/avalon\.png" alt="Avalon"/);
    expect(html).not.toMatch(/Amb el suport de|Distribuïdor/);
  });
  it('diverses distribuïdores, en l\'ordre rebut; la franja va després de les files d\'informació', async () => {
    const distribuidores = [{ nom: 'Avalon', logo: 'https://x/avalon.png' }, { nom: 'Atalante', logo: 'https://x/atalante.png', url: 'https://atalante.es' }];
    const html = await renderitza(FlyerCaraB, { distribuidores });
    expect(html).toMatch(/alt="Ajuntament de Roda de Berà".*alt="Avalon".*alt="Atalante"/s);
    expect(compta(html, /class="flyer-franja__logo"/g)).toBe(3);
    expect(html).not.toContain('divisoria');
    expect(html.indexOf('flyer-info__llista')).toBeLessThan(html.indexOf('flyer-franja'));
    // Dins el bloc dret (titular + files + franja), que es centra com a unitat respecte del logo i el QR.
    expect(html).toMatch(/class="flyer-info__cos".*class="flyer-franja"/s);
  });
});
