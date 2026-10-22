import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const llegeix = (ruta) => JSON.parse(readFileSync(new URL(ruta, import.meta.url), 'utf8'));
const pkg = llegeix('../package.json');
const arrel = llegeix('../../package.json');
const lock = llegeix('../package-lock.json');

// Tailwind es fixa a la mateixa versió exacta que l'admin (arrel) perquè no divergeixin.
describe('versions de Tailwind', () => {
  for (const nom of ['tailwindcss', '@tailwindcss/vite']) {
    it(`${nom} és exacte i igual al de l'arrel`, () => {
      const versio = pkg.devDependencies[nom];
      expect(versio).toMatch(/^\d+\.\d+\.\d+$/);
      expect(versio).toBe(arrel.devDependencies[nom] ?? arrel.dependencies?.[nom]);
    });
    it(`${nom}: el lockfile coincideix amb el package.json`, () => {
      expect(lock.packages[''].devDependencies[nom]).toBe(pkg.devDependencies[nom]);
      expect(lock.packages[`node_modules/${nom}`].version).toBe(pkg.devDependencies[nom]);
    });
  }
});
