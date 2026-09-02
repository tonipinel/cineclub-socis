import { describe, it, expect, vi } from 'vitest';
import {
  calcularNomPublic, ordenarPerVots, sincronitzarSociPublic, esborrarSociPublic,
} from './propostes';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((...args) => args[args.length - 1]),
}));

const db = {};

describe('calcularNomPublic', () => {
  it('combina el nom i la inicial del primer cognom', () => {
    expect(calcularNomPublic({ nom: 'Isabel', cognoms: 'Mondéjar Ruiz' })).toBe('Isabel M.');
  });

  it('retorna només el nom si no hi ha cognoms', () => {
    expect(calcularNomPublic({ nom: 'Isabel', cognoms: '' })).toBe('Isabel');
    expect(calcularNomPublic({ nom: 'Isabel' })).toBe('Isabel');
  });
});

describe('ordenarPerVots', () => {
  it('ordena les propostes de més a menys vots', () => {
    const propostes = [{ id: 'a', vots: 2 }, { id: 'b', vots: 5 }, { id: 'c', vots: 0 }];
    expect(ordenarPerVots(propostes).map((p) => p.id)).toEqual(['b', 'a', 'c']);
  });

  it('tracta com a 0 les propostes sense el camp vots', () => {
    const propostes = [{ id: 'a' }, { id: 'b', vots: 1 }];
    expect(ordenarPerVots(propostes).map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('no muta l\'array original', () => {
    const propostes = [{ id: 'a', vots: 1 }, { id: 'b', vots: 2 }];
    ordenarPerVots(propostes);
    expect(propostes.map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('sincronitzarSociPublic', () => {
  it('escriu el doc socisPublic amb el numeroSoci i el nom públic', () => {
    const batch = { set: vi.fn(), delete: vi.fn() };
    sincronitzarSociPublic(batch, db, { nom: 'Isabel', cognoms: 'Mondéjar', numeroSoci: '7', tokenCarnet: 'tok-1' });
    expect(batch.set).toHaveBeenCalledWith('tok-1', { numeroSoci: 7, nomPublic: 'Isabel M.' });
  });

  it('no fa res si no hi ha numeroSoci', () => {
    const batch = { set: vi.fn(), delete: vi.fn() };
    sincronitzarSociPublic(batch, db, { nom: 'Isabel', cognoms: 'Mondéjar', tokenCarnet: 'tok-1' });
    expect(batch.set).not.toHaveBeenCalled();
  });

  it('no fa res si no hi ha tokenCarnet', () => {
    const batch = { set: vi.fn(), delete: vi.fn() };
    sincronitzarSociPublic(batch, db, { nom: 'Isabel', cognoms: 'Mondéjar', numeroSoci: '7' });
    expect(batch.set).not.toHaveBeenCalled();
  });
});

describe('esborrarSociPublic', () => {
  it('elimina el doc socisPublic del token indicat', () => {
    const batch = { set: vi.fn(), delete: vi.fn() };
    esborrarSociPublic(batch, db, 'tok-1');
    expect(batch.delete).toHaveBeenCalledWith('tok-1');
  });

  it('no fa res si no hi ha tokenCarnet', () => {
    const batch = { set: vi.fn(), delete: vi.fn() };
    esborrarSociPublic(batch, db, undefined);
    expect(batch.delete).not.toHaveBeenCalled();
  });
});
