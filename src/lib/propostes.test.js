import { describe, it, expect, vi } from 'vitest';
import {
  calcularNomPublic, NOM_ORGANITZACIO, sincronitzarSociPublic, esborrarSociPublic,
} from './propostes';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((...args) => args[args.length - 1]),
}));

const db = {};

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

  it('no escriu mai socisPublic per a un soci desactivat', () => {
    const batch = { set: vi.fn(), delete: vi.fn() };
    sincronitzarSociPublic(batch, db, {
      nom: 'Isabel', cognoms: 'Mondéjar', numeroSoci: '7', tokenCarnet: 'tok-1', actiu: false,
    });
    expect(batch.set).not.toHaveBeenCalled();
    expect(batch.delete).not.toHaveBeenCalled();
  });

  it('escriu socisPublic per a un soci explícitament actiu', () => {
    const batch = { set: vi.fn(), delete: vi.fn() };
    sincronitzarSociPublic(batch, db, {
      nom: 'Isabel', cognoms: 'Mondéjar', numeroSoci: '7', tokenCarnet: 'tok-1', actiu: true,
    });
    expect(batch.set).toHaveBeenCalledWith('tok-1', { numeroSoci: 7, nomPublic: 'Isabel M.' });
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
