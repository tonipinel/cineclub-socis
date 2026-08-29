import { describe, it, expect } from 'vitest';
import { mapExcelRowToSoci } from './importMapping.js';

describe('mapExcelRowToSoci', () => {
  it('mapeja les columnes de l\'Excel i fixa dataAlta/ultimPagament a la data d\'importació', () => {
    const row = {
      numeroSoci: 12, nom: 'Anna', cognoms: 'Vidal', poblacio: 'Roda de Berà',
      codiPostal: '43883', telefon: '600000000', correuElectronic: 'anna@example.com',
      estatPagament: 'Al dia', correuPagament: 'Transferència 12/01/2026', dni: '12345678A',
      grupWhatsapp: 'Diumenges',
    };
    const soci = mapExcelRowToSoci(row, '2026-08-29');
    expect(soci.numeroSoci).toBe(12);
    expect(soci.dataAlta).toBe('2026-08-29');
    expect(soci.ultimPagament).toBe('2026-08-29');
    expect(soci.notaImportacio).toContain('Al dia');
    expect(soci.notaImportacio).toContain('Transferència 12/01/2026');
    expect(soci.actiu).toBe(true);
  });

  it('deixa cadena buida als camps opcionals absents', () => {
    const soci = mapExcelRowToSoci(
      { numeroSoci: 1, nom: 'Marc', cognoms: 'Serra', poblacio: 'X', codiPostal: 'Y', telefon: 'Z' },
      '2026-08-29'
    );
    expect(soci.correuElectronic).toBe('');
    expect(soci.dni).toBe('');
    expect(soci.grupWhatsapp).toBe('');
  });

  it('desempaqueta el valor pla d\'una cel·la amb hipervincle auto-detectat (p. ex. un correu)', () => {
    const row = {
      numeroSoci: 12, nom: 'Anna', cognoms: 'Vidal', poblacio: 'Roda de Berà',
      codiPostal: '43883', telefon: '600000000',
      correuElectronic: { text: 'anna@example.com', hyperlink: 'mailto:anna@example.com' },
    };
    const soci = mapExcelRowToSoci(row, '2026-08-29');
    expect(soci.correuElectronic).toBe('anna@example.com');
  });
});
