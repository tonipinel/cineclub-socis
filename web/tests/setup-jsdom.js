// Només té efecte als tests de jsdom (*.test.jsx); als de Node no hi ha `document`.
import { afterEach, beforeEach } from 'vitest';
import { reiniciaMemos } from '../src/lib/memo.js';

// Les lectures de Firestore es memoritzen ~60 s: cada test comença amb la memòria buida.
beforeEach(() => reiniciaMemos());

if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
  const { cleanup } = await import('@testing-library/react');

  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  afterEach(() => cleanup());
}
