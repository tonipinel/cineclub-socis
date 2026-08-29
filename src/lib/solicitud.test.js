import { describe, it, expect } from 'vitest';
import { validarSolicitud } from './solicitud';

describe('validarSolicitud', () => {
  it('retorna un error per cada camp obligatori buit', () => {
    const errors = validarSolicitud({});
    expect(Object.keys(errors)).toEqual([
      'nom', 'cognoms', 'poblacio', 'codiPostal', 'telefon',
      'acceptaPrivacitat', 'acceptaDadesPersonals',
    ]);
  });

  it('no retorna errors quan totes les dades obligatòries són vàlides', () => {
    const errors = validarSolicitud({
      nom: 'Anna', cognoms: 'Vidal', poblacio: 'Roda de Berà',
      codiPostal: '43883', telefon: '600000000',
      acceptaPrivacitat: true, acceptaDadesPersonals: true,
    });
    expect(errors).toEqual({});
  });

  it('correuElectronic i comentaris són opcionals', () => {
    const errors = validarSolicitud({
      nom: 'Anna', cognoms: 'Vidal', poblacio: 'Roda de Berà',
      codiPostal: '43883', telefon: '600000000',
      acceptaPrivacitat: true, acceptaDadesPersonals: true,
    });
    expect(errors.correuElectronic).toBeUndefined();
    expect(errors.comentaris).toBeUndefined();
  });
});
