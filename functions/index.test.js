import { describe, it, expect } from 'vitest';
import funcions from './index.js';

// Sense límit, una funció v2 pot arribar a 100 instàncies: amb aquests, un abús costa poc.
describe('maxInstances', () => {
  it('les callables en tenen 10 com a màxim i els disparadors 5', () => {
    const limits = Object.fromEntries(Object.entries(funcions).map(([nom, f]) => [nom, f.__endpoint.maxInstances]));
    expect(limits).toEqual({
      notificarNovaSolicitud: 5,
      desarFitxaNovaProposta: 5,
      cercarPellicules: 10,
      assignarPellicula: 10,
      estatVotacio: 10,
      votarProposta: 10,
      rankingTanda: 10,
      rankingPublic: 10,
      crearProposta: 10,
      sincronitzarCalendari: 5,
      sincronitzarSociPorta: 5,
      activarCarnetEnEscanejar: 5,
      sincronitzarCalendariTot: 10,
      llistarUsuarisTaquilla: 10,
      crearUsuariTaquilla: 10,
      editarUsuariTaquilla: 10,
      canviarEstatUsuariTaquilla: 10,
      restablirContrasenyaUsuariTaquilla: 10,
      eliminarUsuariTaquilla: 10,
    });
  });
});

// La porta depèn de socisPorta: si una execució falla, Eventarc la reintenta (el gestor és idempotent).
describe('sincronitzarSociPorta', () => {
  it('es reintenta si falla', () => {
    expect(funcions.sincronitzarSociPorta.__endpoint.eventTrigger.retry).toBe(true);
  });
});

// Si falla, el soci no venceria mai: es reintenta (el gestor és idempotent).
describe('activarCarnetEnEscanejar', () => {
  it('es dispara en crear una entrada de l\'accessLog i es reintenta si falla', () => {
    const { eventTrigger } = funcions.activarCarnetEnEscanejar.__endpoint;
    expect(eventTrigger.eventFilters).toEqual({ database: '(default)', namespace: '(default)' });
    expect(eventTrigger.eventFilterPathPatterns).toEqual({ document: 'accessLog/{id}' });
    expect(eventTrigger.eventType).toBe('google.cloud.firestore.document.v1.created');
    expect(eventTrigger.retry).toBe(true);
  });
});

// Sense Firestore: aquests casos es resolen abans de llegir cap document.
describe('cercarPellicules: carnet', () => {
  const cercar = (data) => funcions.cercarPellicules.run({ data, auth: null });

  it('amb una consulta massa curta no comprova res i torna una llista buida', async () => {
    await expect(cercar({ consulta: 'a' })).resolves.toEqual([]);
  });

  it.each([undefined, '', 'a/b', '..', { a: 1 }])('rebutja el token %s amb permission-denied', async (token) => {
    await expect(cercar({ consulta: 'dune', token })).rejects.toMatchObject({
      code: 'permission-denied', message: 'Identifica\'t amb el carnet per cercar pel·lícules.',
    });
  });
});
