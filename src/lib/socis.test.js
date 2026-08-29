import { describe, it, expect } from 'vitest';
import { filtrarSocis } from './socis';

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
});
