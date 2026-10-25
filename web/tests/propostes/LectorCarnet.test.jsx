// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const lector = vi.hoisted(() => ({ prepararLector: null }));
vi.mock('../../src/lib/propostes/lectorCodis.js', () => ({ prepararLector: (...args) => lector.prepararLector(...args) }));
vi.mock('../../src/firebase/client.js', () => ({ db: {} }));
vi.mock('firebase/firestore/lite', () => ({
  doc: vi.fn((...args) => args[args.length - 1]),
  getDoc: vi.fn(),
}));

import { getDoc } from 'firebase/firestore/lite';
import LectorCarnet from '../../src/components/propostes/LectorCarnet.jsx';

// jsdom deixa el vídeo sempre a readyState 0: per defecte, la càmera ja té imatge.
const video = vi.hoisted(() => ({ readyState: 4 }));
Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => video.readyState });

// El lector es carrega amb `import()` en tocar el botó: cal esperar que s'acabi abans de mirar res.
const clicaEscanejar = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Escanejar el meu carnet' }));
  await act(() => vi.dynamicImportSettled());
};

describe('LectorCarnet', () => {
  beforeEach(() => {
    getDoc.mockReset();
    lector.prepararLector = vi.fn().mockResolvedValue(undefined);
    video.readyState = 4;
  });

  it('mostra un botó per començar a escanejar, sense cap camp de text', () => {
    render(<LectorCarnet onIdentificat={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Escanejar el meu carnet' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('si el navegador no permet llegir codis QR, mostra un error en clicar', async () => {
    const original = window.BarcodeDetector;
    delete window.BarcodeDetector;
    const user = userEvent.setup();
    render(<LectorCarnet onIdentificat={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Escanejar el meu carnet' }));
    expect(await screen.findByText(/Aquest navegador no permet escanejar/)).toBeInTheDocument();
    window.BarcodeDetector = original;
  });

  describe('debounce de la càmera', () => {
    const originalBarcodeDetector = window.BarcodeDetector;
    const originalGetUserMedia = navigator.mediaDevices?.getUserMedia;
    const originalPlay = window.HTMLMediaElement?.prototype.play;

    beforeEach(() => {
      vi.useFakeTimers();
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) },
      });
      window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
      window.BarcodeDetector = vi.fn().mockImplementation(function BarcodeDetectorMock() {
        this.detect = vi.fn().mockResolvedValue([{ rawValue: 'CARNET-tok-1' }]);
      });
    });

    afterEach(() => {
      vi.useRealTimers();
      window.BarcodeDetector = originalBarcodeDetector;
      window.HTMLMediaElement.prototype.play = originalPlay;
      if (originalGetUserMedia) {
        Object.defineProperty(navigator, 'mediaDevices', {
          configurable: true,
          value: { getUserMedia: originalGetUserMedia },
        });
      }
    });

    // Simula el bucle real que provocava el bug: un escaneig fallit (carnet
    // no vàlid) posava `verificant` a false, cosa que reconstruïa la càmera
    // i el detector el reenganxava immediatament al mateix QR (que encara és
    // davant la càmera). Sense debounce, això dispararia un segon getDoc.
    it('no torna a verificar el mateix codi dins la finestra de debounce, encara que un escaneig fallit reconstrueixi la càmera', async () => {
      getDoc.mockResolvedValue({ exists: () => false });
      render(<LectorCarnet onIdentificat={vi.fn()} />);
      await clicaEscanejar();

      await vi.advanceTimersByTimeAsync(0); // resol getUserMedia i inicia la reproducció
      await vi.advanceTimersByTimeAsync(400); // 1a detecció: carnet no vàlid -> verificant torna a false
      await vi.advanceTimersByTimeAsync(400); // la càmera es reconstrueix i detecta el mateix codi de nou

      expect(getDoc).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Aquest carnet no és vàlid.')).toBeInTheDocument();
    });

    it('inclou el token del carnet identificat a la crida a onIdentificat', async () => {
      getDoc.mockResolvedValue({ exists: () => true, data: () => ({ numeroSoci: 7, nomPublic: 'Isabel M.' }) });
      const onIdentificat = vi.fn();
      render(<LectorCarnet onIdentificat={onIdentificat} />);
      await clicaEscanejar();

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(400);

      expect(onIdentificat).toHaveBeenCalledWith({ numeroSoci: 7, nomPublic: 'Isabel M.', token: 'tok-1' });
    });
  });

  describe('lector no disponible', () => {
    const TEXT_LECTOR = "No s'ha pogut carregar el lector. Torna-ho a provar.";
    const originalBarcodeDetector = window.BarcodeDetector;
    const originalPlay = window.HTMLMediaElement?.prototype.play;
    let stop;

    beforeEach(() => {
      stop = vi.fn();
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) },
      });
      window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
      window.BarcodeDetector = vi.fn().mockImplementation(function BarcodeDetectorMock() {
        this.detect = vi.fn().mockResolvedValue([]);
      });
    });

    afterEach(() => {
      vi.useRealTimers();
      window.BarcodeDetector = originalBarcodeDetector;
      window.HTMLMediaElement.prototype.play = originalPlay;
    });

    it('si el WASM del lector no es pot carregar, avisa amb role=alert, para la càmera i ofereix tornar-ho a provar', async () => {
      lector.prepararLector = vi.fn().mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValue(undefined);
      render(<LectorCarnet onIdentificat={vi.fn()} />);
      await clicaEscanejar();

      expect(await screen.findByRole('alert')).toHaveTextContent(TEXT_LECTOR);
      expect(document.querySelector('video')).toBeNull();
      await vi.waitFor(() => expect(stop).toHaveBeenCalled());

      fireEvent.click(screen.getByRole('button', { name: 'Tornar-ho a provar' }));
      await act(() => vi.dynamicImportSettled());
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(document.querySelector('video')).not.toBeNull();
      expect(lector.prepararLector).toHaveBeenCalledTimes(2);
    });

    it('si el detector falla a cada fotograma, després de 5 errors seguits avisa', async () => {
      const detect = vi.fn().mockRejectedValue(new Error('Barcode detection service unavailable.'));
      window.BarcodeDetector = vi.fn().mockImplementation(function BarcodeDetectorMock() { this.detect = detect; });
      vi.useFakeTimers();
      render(<LectorCarnet onIdentificat={vi.fn()} />);
      await clicaEscanejar();

      await act(() => vi.advanceTimersByTimeAsync(400 * 4));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      await act(() => vi.advanceTimersByTimeAsync(400));
      expect(screen.getByRole('alert')).toHaveTextContent(TEXT_LECTOR);
      await act(() => vi.advanceTimersByTimeAsync(4000));
      expect(detect).toHaveBeenCalledTimes(5);
    });

    it('mentre la càmera s\'escalfa (readyState < 2) no detecta ni compta errors; després, 5 errors reals sí que avisen', async () => {
      video.readyState = 1;
      const detect = vi.fn().mockRejectedValue(new Error('Barcode detection service unavailable.'));
      window.BarcodeDetector = vi.fn().mockImplementation(function BarcodeDetectorMock() { this.detect = detect; });
      vi.useFakeTimers();
      render(<LectorCarnet onIdentificat={vi.fn()} />);
      await clicaEscanejar();

      await act(() => vi.advanceTimersByTimeAsync(400 * 10));
      expect(detect).not.toHaveBeenCalled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();

      video.readyState = 4;
      await act(() => vi.advanceTimersByTimeAsync(400 * 4));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      await act(() => vi.advanceTimersByTimeAsync(400));
      expect(screen.getByRole('alert')).toHaveTextContent(TEXT_LECTOR);
    });

    it('un InvalidStateError (fotograma encara no disponible) no compta com a error del lector', async () => {
      const detect = vi.fn().mockRejectedValue(new DOMException('Invalid element or state.', 'InvalidStateError'));
      window.BarcodeDetector = vi.fn().mockImplementation(function BarcodeDetectorMock() { this.detect = detect; });
      vi.useFakeTimers();
      render(<LectorCarnet onIdentificat={vi.fn()} />);
      await clicaEscanejar();

      await act(() => vi.advanceTimersByTimeAsync(400 * 20));
      expect(detect.mock.calls.length).toBeGreaterThanOrEqual(10);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('no intenta detectar res fins que el lector està llest', async () => {
      let llest;
      lector.prepararLector = vi.fn(() => new Promise((resolve) => { llest = resolve; }));
      const detect = vi.fn().mockResolvedValue([]);
      window.BarcodeDetector = vi.fn().mockImplementation(function BarcodeDetectorMock() { this.detect = detect; });
      vi.useFakeTimers();
      render(<LectorCarnet onIdentificat={vi.fn()} />);
      await clicaEscanejar();

      await act(() => vi.advanceTimersByTimeAsync(2000));
      expect(detect).not.toHaveBeenCalled();
      llest();
      await act(() => vi.advanceTimersByTimeAsync(400));
      expect(detect).toHaveBeenCalledTimes(1);
    });
  });
});
