import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// El client de Firebase només es carrega al navegador (illes client:only);
// aquí comprovem que importar-lo en Node no peta (SSR/build) i que usa la config pública.
describe('firebase/client', () => {
  it('es pot importar en Node i exporta app, db i functions', async () => {
    const mod = await import('../src/firebase/client.js');
    expect(mod.app.options.projectId).toBe('cineclub-socis');
    expect(mod.db.type).toBe('firestore');
    expect(mod.functions.region).toBe('us-central1');
  });

  it('usa la mateixa config pública que el formulari de fes-te-sòcia', async () => {
    const { app } = await import('../src/firebase/client.js');
    const formulari = readFileSync(new URL('../public/js/fes-te-socia-form.js', import.meta.url), 'utf8');
    for (const [clau, valor] of Object.entries(app.options)) {
      expect(formulari, clau).toContain(`"${valor}"`);
    }
  });
});
