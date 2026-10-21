import { describe, it, expect } from 'vitest';
import { entitatPerNom, distribuidoraPerNom } from '../src/lib/entitats.js';

describe('entitats i distribuïdores', () => {
  it('troba una entitat pel nom', () => {
    expect(entitatPerNom("L'Ateneu Rodenc")).toEqual({
      logo: '/images/entitats/ateneu-rodenc.jpg',
      url: 'https://www.instagram.com/ateneu_rodenc.rdb/',
    });
  });
  it('troba una distribuïdora pel nom', () => {
    expect(distribuidoraPerNom('BTeam Pictures')).toEqual({
      logo: '/images/distribuidors/bteam-pictures.png',
      url: 'https://bteampictures.es/',
    });
  });
  it('retorna null si el nom no existeix', () => {
    expect(entitatPerNom('Ningú')).toBeNull();
    expect(distribuidoraPerNom('Ningú')).toBeNull();
    expect(entitatPerNom('BTeam Pictures')).toBeNull();
    expect(entitatPerNom(undefined)).toBeNull();
  });
});
