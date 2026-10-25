import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const zxing = vi.hoisted(() => ({
  prepareZXingModule: vi.fn(),
  purgeZXingModule: vi.fn(),
  BarcodeDetector: function BarcodeDetectorPolyfill() {},
}));
vi.mock('barcode-detector/polyfill', () => ({}));
vi.mock('barcode-detector/ponyfill', () => zxing);
vi.mock('zxing-wasm/reader/zxing_reader.wasm?url', () => ({ default: '/_astro/zxing_reader.abc123.wasm' }));

const { prepararLector, TEMPS_LIMIT_LECTOR_MS } = await import('../../src/lib/propostes/lectorCodis.js');
const require = createRequire(import.meta.url);

describe('lectorCodis', () => {
  const original = globalThis.BarcodeDetector;
  const overrides = zxing.prepareZXingModule.mock.calls[0][0].overrides;

  beforeEach(() => {
    zxing.prepareZXingModule.mockReset();
    zxing.purgeZXingModule.mockReset();
  });

  afterEach(() => {
    globalThis.BarcodeDetector = original;
    vi.useRealTimers();
  });

  it('en carregar, demana el WASM al nostre origen (fitxer del build), no a jsDelivr', () => {
    expect(overrides.locateFile('zxing_reader.wasm', 'https://fastly.jsdelivr.net/x/')).toBe('/_astro/zxing_reader.abc123.wasm');
    expect(overrides.locateFile('altre.data', '/pre/')).toBe('/pre/altre.data');
  });

  it('amb el detector natiu, no carrega cap WASM', async () => {
    globalThis.BarcodeDetector = function Natiu() {};
    await expect(prepararLector()).resolves.toBeUndefined();
    expect(zxing.prepareZXingModule).not.toHaveBeenCalled();
  });

  it('amb el polyfill, resol quan el WASM està carregat', async () => {
    globalThis.BarcodeDetector = zxing.BarcodeDetector;
    zxing.prepareZXingModule.mockResolvedValue({});
    await expect(prepararLector()).resolves.toEqual({});
    expect(zxing.prepareZXingModule).toHaveBeenCalledWith({ overrides, fireImmediately: true });
    expect(zxing.purgeZXingModule).not.toHaveBeenCalled();
  });

  it('si el WASM no es pot carregar, rebutja i deixa preparat un nou intent amb el mateix origen', async () => {
    globalThis.BarcodeDetector = zxing.BarcodeDetector;
    zxing.prepareZXingModule.mockImplementationOnce(() => Promise.reject(new Error('Failed to fetch')));
    await expect(prepararLector()).rejects.toThrow('Failed to fetch');
    expect(zxing.purgeZXingModule).toHaveBeenCalled();
    expect(zxing.prepareZXingModule).toHaveBeenLastCalledWith({ overrides });
  });

  it('si el WASM no acaba de carregar dins el temps límit, rebutja', async () => {
    vi.useFakeTimers();
    globalThis.BarcodeDetector = zxing.BarcodeDetector;
    zxing.prepareZXingModule.mockReturnValue(new Promise(() => {}));
    const resultat = prepararLector();
    const comprovacio = expect(resultat).rejects.toThrow('Temps límit');
    await vi.advanceTimersByTimeAsync(TEMPS_LIMIT_LECTOR_MS);
    await comprovacio;
    // Un nou intent ha de tornar a baixar el WASM, no esperar la mateixa càrrega penjada.
    expect(zxing.purgeZXingModule).toHaveBeenCalled();
    expect(zxing.prepareZXingModule).toHaveBeenLastCalledWith({ overrides });
  });

  // El polyfill porta incrustat el JS de zxing-wasm d'una versió concreta: el
  // .wasm que s'empaqueta ha de ser exactament el que espera.
  it('el zxing_reader.wasm instal·lat és la versió i el binari que espera barcode-detector', async () => {
    const real = await vi.importActual('barcode-detector/ponyfill');
    const rutaWasm = require.resolve('zxing-wasm/reader/zxing_reader.wasm');
    const paquet = JSON.parse(readFileSync(join(rutaWasm, '../../../package.json'), 'utf8'));
    expect(paquet.name).toBe('zxing-wasm');
    expect(paquet.version).toBe(real.ZXING_WASM_VERSION);
    const wasm = readFileSync(rutaWasm);
    expect(createHash('sha256').update(wasm).digest('hex')).toBe(real.ZXING_WASM_SHA256);
  });
});
