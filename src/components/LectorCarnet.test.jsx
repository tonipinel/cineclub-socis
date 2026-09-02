import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('barcode-detector/polyfill', () => ({}));
vi.mock('../firebase/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((...args) => args[args.length - 1]),
  getDoc: vi.fn(),
}));

import { getDoc } from 'firebase/firestore';
import LectorCarnet from './LectorCarnet';

describe('LectorCarnet', () => {
  beforeEach(() => {
    getDoc.mockReset();
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
      fireEvent.click(screen.getByRole('button', { name: 'Escanejar el meu carnet' }));

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
      fireEvent.click(screen.getByRole('button', { name: 'Escanejar el meu carnet' }));

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(400);

      expect(onIdentificat).toHaveBeenCalledWith({ numeroSoci: 7, nomPublic: 'Isabel M.', token: 'tok-1' });
    });
  });
});
