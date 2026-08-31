import { describe, it, expect } from 'vitest';
import { filtrarSocis, ordenarSocis, teNumeroSoci, cercaCoincideix } from './socis';

const socis = [
  { numeroSoci: 1, nom: 'Anna', cognoms: 'Vidal', ultimPagament: '2026-01-01' },
  { numeroSoci: 2, nom: 'Marc', cognoms: 'Serra', ultimPagament: '2024-01-01' },
];

describe('filtrarSocis', () => {
  it('retorna tots els socis sense filtres', () => {
    expect(filtrarSocis(socis, {}, new Date('2026-06-01'))).toHaveLength(2);
  });

  it('filtra per text de cerca en nom o cognoms', () => {
    const resultat = filtrarSocis(socis, { cerca: 'serra' }, new Date('2026-06-01'));
    expect(resultat).toEqual([socis[1]]);
  });

  it('filtra per estat calculat', () => {
    const resultat = filtrarSocis(socis, { estat: 'vencut' }, new Date('2026-06-01'));
    expect(resultat).toEqual([socis[1]]);
  });

  it('filtra per pròxima renovació (al dia i a menys de 30 dies del venciment)', () => {
    const propAVencer = { numeroSoci: 3, nom: 'Pau', cognoms: 'Roca', ultimPagament: '2025-06-15' };
    const llunyDeVencer = { numeroSoci: 4, nom: 'Eva', cognoms: 'Puig', ultimPagament: '2026-01-01' };
    const resultat = filtrarSocis(
      [...socis, propAVencer, llunyDeVencer],
      { estat: 'proxima-renovacio' },
      new Date('2026-06-01')
    );
    expect(resultat).toEqual([propAVencer]);
  });
});

describe('teNumeroSoci', () => {
  it('és fals quan el soci encara no té número assignat', () => {
    expect(teNumeroSoci({ numeroSoci: '' })).toBe(false);
    expect(teNumeroSoci({})).toBe(false);
  });

  it('és cert quan el soci ja té número assignat', () => {
    expect(teNumeroSoci({ numeroSoci: 12 })).toBe(true);
    expect(teNumeroSoci({ numeroSoci: '12' })).toBe(true);
  });
});

describe('cercaCoincideix', () => {
  const soci = { numeroSoci: 7, nom: 'Anna', cognoms: 'Vidal' };

  it('coincideix per nom, cognoms o número', () => {
    expect(cercaCoincideix(soci, 'anna')).toBe(true);
    expect(cercaCoincideix(soci, 'Vidal')).toBe(true);
    expect(cercaCoincideix(soci, '7')).toBe(true);
  });

  it('no coincideix quan el text no hi és', () => {
    expect(cercaCoincideix(soci, 'Serra')).toBe(false);
  });

  it('coincideix amb tothom quan la cerca és buida', () => {
    expect(cercaCoincideix(soci, '')).toBe(true);
  });
});

describe('ordenarSocis', () => {
  const tresSocis = [
    { numeroSoci: 2, nom: 'Marc', cognoms: 'Serra', ultimPagament: '2024-01-01' },
    { numeroSoci: 10, nom: 'Anna', cognoms: 'Vidal', ultimPagament: '2026-01-01' },
    { numeroSoci: 1, nom: 'Berta', cognoms: 'Puig', ultimPagament: '2025-06-01' },
  ];

  it('per defecte ordena per número de soci descendent (més nou primer)', () => {
    expect(ordenarSocis(tresSocis).map((s) => s.numeroSoci)).toEqual([10, 2, 1]);
  });

  it('ordena per número de soci ascendent', () => {
    const resultat = ordenarSocis(tresSocis, { columna: 'numeroSoci', direccio: 'asc' });
    expect(resultat.map((s) => s.numeroSoci)).toEqual([1, 2, 10]);
  });

  it('ordena per nom alfabèticament', () => {
    const resultat = ordenarSocis(tresSocis, { columna: 'nom', direccio: 'asc' });
    expect(resultat.map((s) => s.nom)).toEqual(['Anna', 'Berta', 'Marc']);
  });

  it('no muta l\'array original', () => {
    const original = [...tresSocis];
    ordenarSocis(tresSocis, { columna: 'nom', direccio: 'asc' });
    expect(tresSocis).toEqual(original);
  });

  it('ordena per assistències recents descendent', () => {
    const ambAssistencies = [
      { numeroSoci: 1, nom: 'Anna', cognoms: 'Vidal', assistencies: 2 },
      { numeroSoci: 2, nom: 'Marc', cognoms: 'Serra', assistencies: 5 },
      { numeroSoci: 3, nom: 'Berta', cognoms: 'Puig' },
    ];
    const resultat = ordenarSocis(ambAssistencies, { columna: 'assistencies', direccio: 'desc' });
    expect(resultat.map((s) => s.numeroSoci)).toEqual([2, 1, 3]);
  });
});
