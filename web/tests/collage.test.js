import { describe, it, expect } from 'vitest';
import { calcularLayoutCollage, CANVAS } from '../src/lib/collage.js';

const dins = (r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= CANVAS.width && r.y + r.h <= CANVAS.height;
const solapen = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('calcularLayoutCollage', () => {
  it('el llenç és de 1200 × 630', () => {
    expect(CANVAS).toEqual({ width: 1200, height: 630 });
  });

  it('sense cartells no hi ha cel·les i el logo queda centrat al llenç', () => {
    const { cells, logo } = calcularLayoutCollage(0);
    expect(cells).toEqual([]);
    expect(dins(logo)).toBe(true);
    expect(logo.x + logo.w / 2).toBeCloseTo(CANVAS.width / 2, -1);
    expect(logo.y + logo.h / 2).toBeCloseTo(CANVAS.height / 2, -1);
  });

  it.each([1, 2, 3, 5, 7, 8, 10, 12, 13, 20, 24])('n=%i: una cel·la per cartell, dins del llenç, sense solapaments i sense tapar el logo', (n) => {
    const { cells, logo } = calcularLayoutCollage(n);
    expect(cells).toHaveLength(n);
    expect(dins(logo)).toBe(true);
    for (const c of cells) {
      expect(dins(c)).toBe(true);
      expect(Number.isInteger(c.x + c.y + c.w + c.h)).toBe(true);
      expect(Math.abs(c.w / c.h - 2 / 3)).toBeLessThan(0.01);
      expect(solapen(c, logo)).toBe(false);
    }
    cells.forEach((a, i) => cells.slice(i + 1).forEach((b) => expect(solapen(a, b)).toBe(false)));
    expect(new Set(cells.map((c) => `${c.w}x${c.h}`)).size).toBe(1);
  });

  it('separa les cel·les com a mínim 6 px i deixa un marge de 16 px al voltant del collage', () => {
    for (const n of [3, 8, 12, 24]) {
      const { cells } = calcularLayoutCollage(n);
      for (const c of cells) {
        expect(c.x).toBeGreaterThanOrEqual(16);
        expect(c.y).toBeGreaterThanOrEqual(16);
        expect(c.x + c.w).toBeLessThanOrEqual(CANVAS.width - 16);
        expect(c.y + c.h).toBeLessThanOrEqual(CANVAS.height - 16);
      }
      cells.forEach((a, i) => cells.slice(i + 1).forEach((b) => {
        const separacio = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
        expect(separacio).toBeGreaterThanOrEqual(6);
      }));
    }
  });

  it('aprofita l\'espai: 8 cartells fan almenys 270 px d\'alçada i cap cartell passa del llenç', () => {
    expect(calcularLayoutCollage(8).cells[0].h).toBeGreaterThanOrEqual(270);
    expect(calcularLayoutCollage(3).cells[0].h).toBeGreaterThanOrEqual(380);
    for (const n of [1, 2, 3, 8, 12, 24]) {
      expect(calcularLayoutCollage(n).cells[0].h).toBeLessThanOrEqual(CANVAS.height - 32);
    }
  });

  it('en tenir més cartells, cadascun és igual o més petit', () => {
    let anterior = Infinity;
    for (const n of [1, 3, 8, 12, 24]) {
      const { h } = calcularLayoutCollage(n).cells[0];
      expect(h).toBeLessThanOrEqual(anterior);
      anterior = h;
    }
  });

  it('el collage queda centrat verticalment i la darrera fila incompleta, centrada', () => {
    const { cells } = calcularLayoutCollage(7);
    const dalt = Math.min(...cells.map((c) => c.y));
    const baix = Math.max(...cells.map((c) => c.y + c.h));
    expect(Math.abs(dalt - (CANVAS.height - baix))).toBeLessThanOrEqual(1);
    const files = [...new Set(cells.map((c) => c.y))].sort((a, b) => a - b);
    const centre = (y) => {
      const fila = cells.filter((c) => c.y === y);
      return (Math.min(...fila.map((c) => c.x)) + Math.max(...fila.map((c) => c.x + c.w))) / 2;
    };
    expect(Math.abs(centre(files[0]) - centre(files[files.length - 1]))).toBeLessThanOrEqual(1);
  });

  it('el conjunt logo + collage queda centrat horitzontalment', () => {
    for (const n of [1, 3, 5, 8, 12, 24]) {
      const { cells, logo } = calcularLayoutCollage(n);
      const dreta = Math.max(...cells.map((c) => c.x + c.w));
      expect(Math.abs(logo.x - (CANVAS.width - dreta))).toBeLessThanOrEqual(2);
    }
  });
});
