import { describe, it, expect } from 'vitest';
import {
  calcularNomPublic, NOM_ORGANITZACIO, ordenarPerData,
} from '../../src/lib/propostes/propostes.js';

describe('calcularNomPublic', () => {
  it('per a una persona de l\'organització, torna el nom de l\'organització', () => {
    expect(calcularNomPublic({ nom: 'Toni', cognoms: 'Pinel', organitzacio: true })).toBe('Organització Cineclub Roda de Berà');
    expect(NOM_ORGANITZACIO).toBe('Organització Cineclub Roda de Berà');
  });

  it('si organitzacio és fals o no hi és, torna el nom i la inicial', () => {
    expect(calcularNomPublic({ nom: 'Toni', cognoms: 'Pinel', organitzacio: false })).toBe('Toni P.');
  });

  it('combina el nom i la inicial del primer cognom', () => {
    expect(calcularNomPublic({ nom: 'Isabel', cognoms: 'Mondéjar Ruiz' })).toBe('Isabel M.');
  });

  it('retorna només el nom si no hi ha cognoms', () => {
    expect(calcularNomPublic({ nom: 'Isabel', cognoms: '' })).toBe('Isabel');
    expect(calcularNomPublic({ nom: 'Isabel' })).toBe('Isabel');
  });
});

describe('ordenarPerData', () => {
  const timestamp = (data) => ({ toDate: () => new Date(data) });

  it('ordena les propostes de més recent a més antiga', () => {
    const propostes = [
      { id: 'a', timestamp: timestamp('2026-01-01') },
      { id: 'b', timestamp: timestamp('2026-06-01') },
      { id: 'c', timestamp: timestamp('2026-03-01') },
    ];
    expect(ordenarPerData(propostes).map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });

  it('tracta com les més antigues les propostes sense timestamp', () => {
    const propostes = [{ id: 'a' }, { id: 'b', timestamp: timestamp('2026-01-01') }];
    expect(ordenarPerData(propostes).map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('no muta l\'array original', () => {
    const propostes = [{ id: 'a', timestamp: timestamp('2026-01-01') }, { id: 'b', timestamp: timestamp('2026-06-01') }];
    ordenarPerData(propostes);
    expect(propostes.map((p) => p.id)).toEqual(['a', 'b']);
  });
});
