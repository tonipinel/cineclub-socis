import { describe, it, expect } from 'vitest';
import { sessionsAmbControl } from './sessions';

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
