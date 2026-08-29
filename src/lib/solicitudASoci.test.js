import { describe, it, expect } from 'vitest';
import { solicitudASoci } from './solicitudASoci';

describe('solicitudASoci', () => {
  it('mapeja els camps de la sol·licitud i fixa dataAlta/ultimPagament a la data indicada', () => {
    const soci = solicitudASoci(
      { nom: 'Anna', cognoms: 'Vidal', poblacio: 'Roda de Berà', codiPostal: '43883', telefon: '600000000' },
      '2026-08-29'
    );
    expect(soci).toEqual({
      nom: 'Anna', cognoms: 'Vidal', poblacio: 'Roda de Berà', codiPostal: '43883',
      telefon: '600000000', correuElectronic: '', dni: '', grupWhatsapp: '',
      dataAlta: '2026-08-29', ultimPagament: '2026-08-29', actiu: true,
    });
  });
});
