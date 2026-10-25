import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Cap referència a /images/<fitxer> (a la web o des de fora: correus, carnet imprimible) pot apuntar a un fitxer
// que ja no és a web/public.
const ARREL = new URL('..', import.meta.url).pathname;
const REFS = /(?:https:\/\/(?:cineclubrodadebera\.cat|cineclub-web\.web\.app))?(\/images\/[A-Za-z0-9_\-/]+\.(?:png|jpe?g|webp|svg|gif))/g;

const fitxers = (dir) => readdirSync(dir).flatMap((nom) => {
  const cami = join(dir, nom);
  return statSync(cami).isDirectory() ? fitxers(cami) : [cami];
});

describe('imatges estàtiques referenciades', () => {
  const origens = [
    ...fitxers(join(ARREL, 'src')).filter((f) => /\.(astro|js|jsx|css|json)$/.test(f)),
    join(ARREL, '../functions/solicituds.js'),
    join(ARREL, '../src/styles/components/_carnet.css'),
  ];

  it('cada /images/* citat existeix a web/public', () => {
    const trencades = [];
    for (const origen of origens) {
      for (const [, cami] of readFileSync(origen, 'utf8').matchAll(REFS)) {
        if (!existsSync(join(ARREL, 'public', cami))) trencades.push(`${origen}: ${cami}`);
      }
    }
    expect(trencades).toEqual([]);
  });

  it('conserva els fitxers que fan servir els correus i el carnet imprimible', () => {
    expect(existsSync(join(ARREL, 'public/images/logo.png'))).toBe(true);
    expect(existsSync(join(ARREL, 'public/images/cinema-pattern.jpg'))).toBe(true);
  });
});
