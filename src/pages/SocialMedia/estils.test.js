// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// Les dues portades (la de les sessions de Programació, amb franges, i la de la pel·lícula) han de ser independents: un canvi al logo
// de l'una no pot tocar l'altra. jsdom no calcula estils, així que es comprova el CSS directament.
const css = readFileSync(new URL('../../styles/components/_social-diapositiva.css', import.meta.url), 'utf8');
const regla = (selector) => {
  const inici = css.indexOf(`${selector} {`);
  return inici < 0 ? '' : css.slice(inici, css.indexOf('}', inici));
};

describe('logo del Cineclub de les portades', () => {
  const programacio = regla('.social-slide__logo.social-slide__logo--peu-programacio');
  const pelicula = regla('.social-slide__logo.social-slide__logo--pelicula');

  it('a Programació, el logo és a l\'esquerra de la franja blanca de baix, gran i sobresortint cap amunt', () => {
    expect(programacio).toContain('left: 48px');
    expect(programacio).toContain('bottom: 18px');
    expect(programacio).toContain('height: 240px');
    expect(programacio).not.toMatch(/transform/);
    expect(css).not.toContain('logo--capcalera'); // ja no hi ha logo a la franja negra de dalt
  });

  it('a la pel·lícula, el logo és centrat i més gran', () => {
    expect(pelicula).toContain('left: 50%');
    expect(pelicula).toContain('translateX(-50%)');
    expect(pelicula).toContain('height: 180px');
  });

  it('cap regla comparteix els dos logos', () => {
    expect(css).not.toMatch(/logo--peu-programacio[^{}]*logo--pelicula|logo--pelicula[^{}]*logo--peu-programacio/);
  });
});

describe('aire del cartell a les portades', () => {
  it('a Programació, el cartell té aire a dalt i a baix (no toca les franges)', () => {
    expect(regla('.social-slide--portada-programacio .social-slide__marc')).toContain('padding: 30px 0');
  });

  it('el marc del cartell de Programació només s\'ajusta per a la seva portada, no per a la de la pel·lícula', () => {
    expect(css).not.toMatch(/\.social-slide__pelicula-marc[^{}]*padding: 30px 0/);
    expect(regla('.social-slide__pelicula-marc')).not.toContain('padding');
  });
});

describe('logo de Filmoxarxa (curiositats i tancament)', () => {
  it('va en una card quadrada amb les vores arrodonides, no en una pastilla', () => {
    const pastilla = regla('.social-slide__pastilla');
    expect(pastilla).toContain('border-radius: 28px');
    expect(pastilla).not.toContain('9999px');
    expect(pastilla).toMatch(/padding: 30px;/);
  });

  it('hi ha prou espai entre el logo del Cineclub i el de Filmoxarxa', () => {
    expect(regla('.social-slide__logos-parella')).toContain('gap: 48px');
  });
});

describe('CSS de la pàgina Social media', () => {
  const llegeix = (cami) => readFileSync(new URL(cami, import.meta.url), 'utf8');
  const cssPagina = llegeix('../../styles/components/_social-media.css');
  const fonts = ['SocialMedia.jsx', 'TriaSessions.jsx'].map((f) => llegeix(`./${f}`)).join('\n');

  it('cap classe definida queda sense ús (són estàtiques, no es munten amb plantilles)', () => {
    const classes = [...new Set(cssPagina.match(/\.(social-(?:media|sessio|sessions|previa)[\w-]*)/g) ?? [])].map((c) => c.slice(1));
    const mortes = classes.filter((c) => !new RegExp(`${c}(?![\\w-])`).test(fonts));
    expect(mortes).toEqual([]);
  });
});

describe('pastilla del tipus de sessió', () => {
  it('a la pel·lícula ocupa tota l\'alçada de la franja blanca, a l\'esquerra', () => {
    expect(regla('.social-slide__pelicula-franja')).toContain('height: 120px');
    const pastilla = regla('.social-slide__seccio-pelicula');
    expect(pastilla).toContain('height: 120px');
    expect(pastilla).toMatch(/shrink-0/); // la franja és flex: la pastilla va a l'esquerra, i el degradat comença on acaba
  });

  it('a Programació és un bloc a sang (esquerra i dalt) fins al filet gris de la franja negra, sense tapar-lo ni vores arrodonides', () => {
    const pastilla = regla('.social-slide__seccio-programacio');
    expect(pastilla).toContain('left: 0');
    expect(pastilla).toContain('top: 0');
    // arriba del filet gris (104 px de franja menys 14 px de filet) sense tapar-lo, per a totes les seccions
    expect(regla('.social-slide--portada-programacio .social-slide__franja--dalt')).toContain('height: 104px');
    expect(regla('.social-slide--portada-programacio .social-slide__franja--dalt')).toContain('border-b-[14px]');
    expect(pastilla).toContain('height: 90px');
    expect(pastilla).not.toContain('border-radius');
  });

});

describe('franges de les portades (degradats que s\'adapten)', () => {
  it('a Programació, el negre és sota el logo del Cineclub i es degrada, molt ample, fins on comença la distribuïdora (tot blanc)', () => {
    expect(regla('.social-slide--portada-programacio .social-slide__franja--baix')).not.toMatch(/gradient/);
    const peu = regla('.social-slide__peu');
    expect(peu).toContain('linear-gradient(to right, #000 0%, #000 45%, #fff 100%)');
    expect(peu).toMatch(/flex-1/); // ocupa tot el que queda fins al bloc blanc de la distribuïdora
  });

  it('a Programació el filet daurat discontinu és una capa amb forats transparents damunt del degradat (no una vora, que deixava el blanc als forats)', () => {
    expect(regla('.social-slide--portada-programacio .social-slide__franja--baix')).not.toMatch(/border-t/);
    const filet = regla('.social-slide__filet');
    expect(filet).toContain('repeating-linear-gradient(90deg, var(--color-gold) 0 28px, transparent 28px 42px)');
    expect(filet).toContain('height: 14px');
    expect(filet).toMatch(/pointer-events-none/);
  });

  it('a Programació el logo de la distribuïdora aprofita l\'alçada de la franja (2 px d\'aire sota el filet) però no toca la vora de baix', () => {
    expect(regla('.social-slide--portada-programacio .social-slide__franja--baix')).toContain('height: 200px');
    expect(regla('.social-slide__logo-distribuidora')).toContain('height: 172px');
    expect(regla('.social-slide__peu-distribuidora')).toContain('padding: 16px 48px 0 28px');
    expect(regla('.social-slide__peu-distribuidora')).toMatch(/bg-white/);
  });

  it('a la pel·lícula, el negre comença on acaba la pastilla i es degrada fins on comença la distribuïdora (tot blanc)', () => {
    const franja = regla('.social-slide__pelicula-franja');
    expect(franja).toMatch(/flex/);
    expect(franja).not.toMatch(/gradient/);
    const degradat = regla('.social-slide__pelicula-degradat');
    expect(degradat).toContain('linear-gradient(to right, #000 0%, #000 60%, #fff 100%)');
    expect(degradat).toMatch(/flex-1/);
    expect(regla('.social-slide__pelicula-distribuidora')).toMatch(/bg-white/);
  });
});

describe('filet gris de la portada de pel·lícula', () => {
  it('és el mateix filet gris discontinu (14 px) que la franja de dalt de Programació, just sota la franja', () => {
    const filet = regla('.social-slide__pelicula-filet');
    expect(filet).toContain('repeating-linear-gradient(90deg, var(--color-gray-400, #99a1af) 0 28px, transparent 28px 42px)');
    expect(filet).toContain('top: 120px'); // l'alçada de la franja
    expect(filet).toContain('height: 14px');
    expect(filet).toMatch(/pointer-events-none/);
    expect(regla('.social-slide__pelicula-franja')).toContain('height: 120px');
  });
});
