import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { resizeRequest } from '../src/lib/resize.js';
import { resizedUrl, RESIZE_WIDTHS } from '../src/lib/images.js';
import { sessionsPubliques } from '../src/lib/sessions.js';
import { conWhere } from './helpers/firestore.js';

vi.mock('../src/lib/storage.js', () => ({ getBucket: vi.fn() }));

// La galeria que escriu la callable `importarGaleriaSessio` (functions/galeria-sessio.js) ha de passar pels filtres de
// la web: `imatge()` de sessions.js i el redimensionador (/api/img.webp).
const { planificarGaleria } = createRequire(import.meta.url)('../../functions/galeria-sessio.js');
const BUCKET = 'cineclub-socis.firebasestorage.app';
const { imatges } = planificarGaleria('proposta-Xo6NJJybeMfQHKSW7fpW', ['/s7xmwFJQj99lICSGQkr8sQ7G9IA.jpg', '/x-Y_9.png'], BUCKET);
const urls = imatges.map((i) => i.url);

describe('galeria importada de TMDB a la web', () => {
  it.each(urls)('%s es pot redimensionar', (url) => {
    for (const w of RESIZE_WIDTHS) {
      const redimensionada = resizedUrl(url, w);
      expect(redimensionada).toMatch(/^\/api\/img\.webp\?/);
      expect(resizeRequest(new URLSearchParams(redimensionada.split('?')[1]))).toEqual({ url, width: w });
    }
  });

  it('la sessió publicada en conserva totes les URL', async () => {
    const db = {
      collection: () => conWhere({
        get: async () => ({
          docs: [{
            id: 's', data: () => ({ titol: 'S', slug: 's', publicada: true, data: '2026-11-05', hora: '19:00', publica: { galeria: urls } }),
          }],
        }),
      }),
    };
    const [sessio] = await sessionsPubliques(db);
    expect(sessio.publica.galeria).toEqual(urls);
  });
});
