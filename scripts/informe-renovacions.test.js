// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { comparar, executar } from './informe-renovacions.mjs';

const quota = (numeroSoci, data, extra = {}) => ({ categoria: 'Quotes socis', tipus: 'ingres', numeroSoci, data, ...extra });

describe('comparar', () => {
  it('no llista els socis on res canvia (alta, renovació antiga desada amb el venciment, activació normal)', () => {
    const socis = [
      { id: 'a', numeroSoci: 1, nom: 'Anna', ultimPagament: '2026-03-01', inicPeriode: '2026-03-10' },
      { id: 'b', numeroSoci: 2, nom: 'Bet', ultimPagament: '2026-05-01' },
    ];
    const moviments = [quota(1, '2026-03-01'), quota(2, '2025-05-01'), quota(2, '2026-05-01')];
    expect(comparar(socis, moviments)).toEqual({ canvis: [], senseQuotes: 0 });
  });

  it('llista el bug de l\'escaneig abans de la data pagada (canvia ja en desplegar)', () => {
    const socis = [{ id: 'a', numeroSoci: 1, nom: 'Anna', cognoms: 'Vidal', ultimPagament: '2026-12-01', inicPeriode: '2026-11-02' }];
    expect(comparar(socis, [quota(1, '2025-12-01'), quota(1, '2026-12-01')]).canvis).toEqual([{
      numeroSoci: 1, abans: '2027-11-02', ara: '2027-12-01', historial: '2027-12-01',
    }]);
  });

  it('llista una renovació antiga desada amb la data real d\'un pagament anticipat (canviaria en resincronitzar)', () => {
    const socis = [{ id: 'c', numeroSoci: 3, nom: 'Carles', ultimPagament: '2026-09-01', inicPeriode: '2026-09-02' }];
    expect(comparar(socis, [quota(3, '2025-11-15'), quota(3, '2026-09-01')]).canvis).toEqual([{
      numeroSoci: 3, abans: '2027-09-02', ara: '2027-09-02', historial: '2027-11-15',
    }]);
  });

  // Executat després del desplegament: una renovació anticipada desada per l'app nova té ultimPagament = data real i
  // vigenciaDes posterior. La fórmula anterior hi donaria un «canvi» fals (ultimPagament + 1 any).
  it('una fitxa amb vigenciaDes (ja de l\'app nova) no es compara amb la fórmula anterior', () => {
    const socis = [{ numeroSoci: 5, ultimPagament: '2026-10-20', vigenciaDes: '2026-11-15' }];
    const moviments = [quota(5, '2025-11-15'), quota(5, '2026-10-20', { vencimentAnterior: '2026-11-15' })];
    expect(comparar(socis, moviments)).toEqual({ canvis: [], senseQuotes: 0 });
  });

  it('si una fitxa de l\'app nova no quadra amb l\'historial, surt amb «abans» buit', () => {
    const socis = [{ numeroSoci: 5, ultimPagament: '2026-10-20', vigenciaDes: '2026-10-20' }];
    const moviments = [quota(5, '2025-11-15'), quota(5, '2026-10-20', { vencimentAnterior: '2026-11-15' })];
    expect(comparar(socis, moviments).canvis).toEqual([
      { numeroSoci: 5, abans: null, ara: '2027-10-20', historial: '2027-11-15' },
    ]);
  });

  it('compta els socis amb número però sense cap moviment de quota, i salta els que no tenen número o data', () => {
    const socis = [
      { id: 'a', numeroSoci: 1, ultimPagament: '2026-01-01' },
      { id: 'b', numeroSoci: '', ultimPagament: '2026-01-01' },
      { id: 'c', numeroSoci: 4 },
    ];
    expect(comparar(socis, [])).toEqual({ canvis: [], senseQuotes: 1 });
  });
});

describe('executar', () => {
  it('només llegeix (el Firestore fals no té cap mètode d\'escriptura) i informa dels canvis sense noms ni ids', async () => {
    const consultes = [];
    const snap = (llista) => ({ docs: llista.map(([id, dades]) => ({ id, data: () => dades })) });
    const db = {
      collection: (nom) => ({
        get: async () => { consultes.push(nom); return snap([['a', { numeroSoci: 1, nom: 'Anna', ultimPagament: '2026-12-01', inicPeriode: '2026-11-02' }]]); },
        where: (...condicio) => ({
          get: async () => { consultes.push([nom, ...condicio]); return snap([['m1', quota(1, '2026-12-01')]]); },
        }),
      }),
    };
    const linies = [];
    const resultat = await executar({ db, log: (l) => linies.push(l) });
    expect(consultes).toEqual(['socis', ['moviments', 'categoria', '==', 'Quotes socis']]);
    expect(resultat.canvis).toHaveLength(1);
    expect(linies.join('\n')).not.toMatch(/Anna|\(a\)/);
    expect(linies).toEqual([
      "=== Venciments amb la regla de renovacions anticipades (INFORME: no s'escriu res) ===",
      'Socis: 1 | amb algun canvi: 1 | amb número però sense cap quota: 0',
      "Soci 1: abans 2027-11-02 | ara 2027-12-01 | amb l'historial 2027-12-01",
    ]);
  });
});
