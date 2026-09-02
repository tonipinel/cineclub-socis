import { describe, it, expect, vi } from 'vitest';
import { solicitudASoci } from './solicitudASoci';

describe('solicitudASoci', () => {
  it('mapeja els camps de la sol·licitud i fixa dataAlta/ultimPagament/numeroSoci a les dades indicades', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('token-fixe');
    const soci = solicitudASoci(
      { nom: 'Anna', cognoms: 'Vidal', poblacio: 'Roda de Berà', codiPostal: '43883', telefon: '600000000' },
      '2026-08-29',
      '42'
    );
    expect(soci).toEqual({
      numeroSoci: '42',
      nom: 'Anna', cognoms: 'Vidal', poblacio: 'Roda de Berà', codiPostal: '43883',
      telefon: '600000000', correuElectronic: '', comentaris: '', dni: '', grupWhatsapp: '',
      dataAlta: '2026-08-29', ultimPagament: '2026-08-29', actiu: true,
      tokenCarnet: 'token-fixe',
    });
  });

  it('conserva els comentaris de la sol·licitud si n\'hi ha', () => {
    const soci = solicitudASoci(
      {
        nom: 'Anna', cognoms: 'Vidal', poblacio: 'Roda de Berà', codiPostal: '43883',
        telefon: '600000000', comentaris: 'Ve recomanat per un altre soci',
      },
      '2026-08-29',
      '42'
    );
    expect(soci.comentaris).toBe('Ve recomanat per un altre soci');
  });

  it('fixa dataAlta a partir de la data original de la sol·licitud, no de la data de pagament', () => {
    const soci = solicitudASoci(
      {
        nom: 'Anna', cognoms: 'Vidal', poblacio: 'Roda de Berà', codiPostal: '43883',
        telefon: '600000000', timestamp: { toDate: () => new Date(2026, 1, 15) },
      },
      '2026-08-29',
      '42'
    );
    expect(soci.dataAlta).toBe('2026-02-15');
    expect(soci.ultimPagament).toBe('2026-08-29');
  });
});
