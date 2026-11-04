import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import Programacio from '../src/pages/programacio/index.astro';
import { conWhere } from './helpers/firestore.js';

vi.mock('../src/lib/db.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => globalThis.__dbFals,
}));

const sessio = (id, data) => ({
  id, titol: id, slug: id, publicada: true, data, hora: '19:00',
  publica: { titol: `Peli ${id}`, versioTipus: 'vose', generes: ['Drama'], seccio: 'cartellera' },
});
const sessions = [sessio('futura', '2099-11-05')];
const ts = (ms) => ({ toMillis: () => ms });

let flyers;
let flyersFalla;
const doc = (id, dades) => ({ id, exists: Boolean(dades), data: () => dades });
globalThis.__dbFals = {
  collection: (nom) => {
    if (nom === 'flyers' && flyersFalla) return { where: () => ({ get: async () => { throw new Error('boom'); } }) };
    const docs = nom === 'sessions' ? sessions : nom === 'flyers' ? flyers : [];
    return conWhere({
      doc: (id) => ({ id, get: async () => doc(id, docs.find((d) => d.id === id)) }),
      get: async () => ({ docs: docs.map(({ id, ...dades }) => doc(id, dades)) }),
    });
  },
  getAll: async (...refs) => Promise.all(refs.map((r) => r.get())),
};

const demana = async () => {
  const container = await AstroContainer.create();
  const resposta = await container.renderToResponse(Programacio, {
    routeType: 'page',
    request: new Request('https://cineclub-web.web.app/programacio/'),
  });
  return resposta.text();
};

beforeEach(() => { flyers = []; flyersFalla = false; });
afterEach(() => vi.restoreAllMocks());

describe('/programacio/: bloc de difusió', () => {
  it('amb un flyer publicat: bloc entre les properes sessions i el calendari, amb PDF i WhatsApp', async () => {
    flyers = [
      { id: 'vell', nom: 'Flyer vell', estat: 'publicat', publicatEl: ts(1000) },
      { id: 'nou', nom: 'Flyer novembre', estat: 'publicat', publicatEl: ts(2000) },
      { id: 'esb', nom: 'Esborrany', estat: 'esborrany', publicatEl: ts(3000) },
    ];
    const html = await demana();
    expect(html).toContain("Ajuda'ns a fer difusió");
    expect(html).toContain('href="/flyer/nou/flyer.pdf"');
    expect(html).toContain(`https://wa.me/?text=${encodeURIComponent('Flyer novembre https://cineclub-web.web.app/flyer/nou/')}`);
    expect(html).not.toContain('/flyer/vell/');
    expect(html).not.toContain('/flyer/esb/');
    const bloc = html.indexOf('class="difusio"');
    expect(html.indexOf('next-session-wrapper')).toBeGreaterThan(-1);
    expect(bloc).toBeGreaterThan(html.indexOf('next-session-wrapper'));
    expect(bloc).toBeLessThan(html.indexOf('calendar-wrapper'));
  });

  it('un flyer amb fins en el passat no es promociona', async () => {
    flyers = [{ id: 'vell', nom: 'Flyer vell', estat: 'publicat', publicatEl: ts(1000), fins: '2020-01-31' }];
    const html = await demana();
    expect(html).not.toContain('difusio');
    expect(html).not.toContain('/flyer/vell/');
    expect(html).toContain('calendar-wrapper');
  });

  it('un flyer que acaba avui (Madrid) encara es promociona; ahir ja no', async () => {
    const avui = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
    const ahir = new Date(Date.parse(`${avui}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
    flyers = [{ id: 'avui', nom: 'Flyer avui', estat: 'publicat', publicatEl: ts(1000), fins: avui }];
    expect(await demana()).toContain('href="/flyer/avui/flyer.pdf"');
    flyers = [{ id: 'ahir', nom: 'Flyer ahir', estat: 'publicat', publicatEl: ts(1000), fins: ahir }];
    expect(await demana()).not.toContain('difusio');
  });

  it('l\'id del flyer es codifica als enllaços', async () => {
    flyers = [{ id: 'a b/c', nom: 'X', estat: 'publicat', publicatEl: ts(1000), fins: '2099-01-01' }];
    const html = await demana();
    expect(html).toContain('href="/flyer/a%20b%2Fc/flyer.pdf"');
  });

  it('sense cap flyer publicat no es pinta res', async () => {
    flyers = [{ id: 'esb', nom: 'Esborrany', estat: 'esborrany' }];
    const html = await demana();
    expect(html).not.toContain('difusio');
    expect(html).not.toContain('wa.me');
    expect(html).toContain('calendar-wrapper');
  });

  it("si la lectura del flyer falla, la pàgina es renderitza sense el bloc", async () => {
    flyersFalla = true;
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const html = await demana();
    expect(html).toContain('calendar-wrapper');
    expect(html).toContain('Peli futura');
    expect(html).not.toContain('difusio');
    expect(error).toHaveBeenCalled();
  });
});
