import { describe, it, expect, vi, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import NextSessions from '../src/components/NextSessions.astro';

const sessio = (id, data) => ({ id, titol: id, slug: id, publicada: true, data, hora: '19:00', publica: { seccio: 'cartellera', organitza: 'cineclub' } });

// HTML que el servidor va pintar a `servidor`, executat en un navegador (jsdom) a l'hora real.
async function alNavegador(sessions, servidor) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(servidor);
  const container = await AstroContainer.create();
  const html = await container.renderToString(NextSessions, { props: { sessions } });
  vi.useRealTimers();
  return new JSDOM(`<body>${html}</body>`, { runScripts: 'dangerously' }).window.document;
}

afterEach(() => vi.useRealTimers());

describe('script de «Properes sessions» (pàgina guardada al CDN)', () => {
  it('amaga les sessions que ja han passat i, si no en queda cap, tot el bloc', async () => {
    const doc = await alNavegador([sessio('a', '2020-03-05'), sessio('b', '2020-04-02')], new Date('2020-03-01T12:00:00Z'));
    const items = [...doc.querySelectorAll('.next-session__item')];
    expect(items).toHaveLength(2);
    expect(items.every((el) => el.hidden)).toBe(true);
    expect(doc.querySelector('[data-next-session-wrapper]').hidden).toBe(true);
  });

  it('deixa visibles les futures i el bloc', async () => {
    const doc = await alNavegador([sessio('a', '2020-03-05'), sessio('b', '2099-04-02')], new Date('2020-03-01T12:00:00Z'));
    const [passada, futura] = doc.querySelectorAll('.next-session__item');
    expect(passada.hidden).toBe(true);
    expect(futura.hidden).toBe(false);
    expect(doc.querySelector('[data-next-session-wrapper]').hidden).toBe(false);
  });
});
