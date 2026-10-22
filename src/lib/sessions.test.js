import { describe, it, expect } from 'vitest';
import { imatgeDeSessio, sessionsAmbControl } from './sessions';

describe('sessionsAmbControl', () => {
  it('descarta només les sessions amb senseControl === true', () => {
    const sessions = [
      { id: 'a' },
      { id: 'b', senseControl: true },
      { id: 'c', senseControl: false },
    ];
    expect(sessionsAmbControl(sessions).map((s) => s.id)).toEqual(['a', 'c']);
  });
});

describe('imatgeDeSessio', () => {
  const CARTELL = 'https://firebasestorage.googleapis.com/v0/b/b/o/web%2Fsessions%2Fpig%2Fposter.jpg?alt=media';
  const ANTIGA = 'https://cineclubrodadebera.cat/programacio/2026/pig/poster_hu123.jpg';

  it('fa servir el cartell públic encara que imatgeUrl sigui una altra o sigui buida', () => {
    expect(imatgeDeSessio({ imatgeUrl: ANTIGA, publica: { cartell: CARTELL } })).toBe(CARTELL);
    expect(imatgeDeSessio({ imatgeUrl: '', publica: { cartell: CARTELL } })).toBe(CARTELL);
  });

  it('sense cartell públic fa servir imatgeUrl', () => {
    expect(imatgeDeSessio({ imatgeUrl: ANTIGA })).toBe(ANTIGA);
    expect(imatgeDeSessio({ imatgeUrl: ANTIGA, publica: { cartell: '' } })).toBe(ANTIGA);
  });

  it('retorna null si no hi ha cap URL http(s) vàlida', () => {
    expect(imatgeDeSessio({})).toBeNull();
    expect(imatgeDeSessio(undefined)).toBeNull();
    expect(imatgeDeSessio({ imatgeUrl: '   ' })).toBeNull();
    expect(imatgeDeSessio({ imatgeUrl: 'poster.jpg' })).toBeNull();
    expect(imatgeDeSessio({ imatgeUrl: 'javascript:alert(1)' })).toBeNull();
    expect(imatgeDeSessio({ imatgeUrl: 'https://' })).toBeNull();
    expect(imatgeDeSessio({ imatgeUrl: 42, publica: { cartell: null } })).toBeNull();
  });
});
