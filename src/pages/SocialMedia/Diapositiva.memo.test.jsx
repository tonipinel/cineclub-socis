import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('../../lib/social', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    composaFonsTires: vi.fn(original.composaFonsTires),
    composaTires: vi.fn(original.composaTires),
    disposicioMosaic: vi.fn(original.disposicioMosaic),
  };
});

import { composaFonsTires, composaTires, disposicioMosaic } from '../../lib/social';
import Diapositiva from './Diapositiva';

// Cada vista prèvia es torna a pintar a cada tecla i a cada imatge convertida: la disposició no s'ha de refer si les entrades són les mateixes.
describe('Diapositiva: la disposició no es recalcula si no canvien les entrades', () => {
  const sessio = { data: '2026-12-03', hora: '19:00', publica: { titol: 'Her', cartell: 'https://x/c.jpg', galeria: ['https://x/g1.jpg', 'https://x/g2.jpg', 'https://x/g3.jpg'] } };

  it('el fons de tires de la portada de pel·lícula', () => {
    vi.clearAllMocks();
    const diapositiva = { tipus: 'portada-pelicula' };
    const { rerender } = render(<Diapositiva sessio={sessio} diapositiva={diapositiva} />);
    rerender(<Diapositiva sessio={sessio} diapositiva={diapositiva} imatges={{ 'https://x/g1.jpg': 'data:image/jpeg;base64,AAA' }} />);
    rerender(<Diapositiva sessio={sessio} diapositiva={diapositiva} imatges={{ 'https://x/g1.jpg': 'data:image/jpeg;base64,AAA', 'https://x/g2.jpg': 'data:image/jpeg;base64,BBB' }} />);
    expect(composaFonsTires).toHaveBeenCalledTimes(1);
  });

  it('les tires de l\'obertura de Programació', () => {
    vi.clearAllMocks();
    const diapositiva = { tipus: 'obertura-programacio', format: 'fotogrames', imatges: ['https://x/a.jpg', 'https://x/b.jpg'], interval: 'el 3 de desembre' };
    const { rerender } = render(<Diapositiva sessio={{ publica: {} }} diapositiva={diapositiva} />);
    rerender(<Diapositiva sessio={{ publica: {} }} diapositiva={diapositiva} imatges={{ 'https://x/a.jpg': 'data:image/jpeg;base64,AAA' }} />);
    expect(composaTires).toHaveBeenCalledTimes(1);
  });

  it('el mosaic de cartells de l\'obertura', () => {
    vi.clearAllMocks();
    const diapositiva = { tipus: 'obertura-programacio', format: 'cartells', imatges: ['https://x/a.jpg', 'https://x/b.jpg'], interval: 'el 3 de desembre' };
    const { rerender } = render(<Diapositiva sessio={{ publica: {} }} diapositiva={diapositiva} />);
    rerender(<Diapositiva sessio={{ publica: {} }} diapositiva={diapositiva} imatges={{ 'https://x/a.jpg': 'data:image/jpeg;base64,AAA' }} />);
    expect(disposicioMosaic).toHaveBeenCalledTimes(1);
  });
});
