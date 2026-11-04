import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import PaginaFlyer from '../src/pages/flyer/[id]/index.astro';
import PaginaImprimir from '../src/pages/flyer/[id]/imprimir.astro';
import Pagina404 from '../src/pages/404.astro';
import { CACHE_OK } from '../src/lib/cache.js';
import { entradesSitemap } from '../src/lib/sitemap.js';
import { conWhere } from './helpers/firestore.js';

vi.mock('../src/lib/db.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => globalThis.__dbFals,
}));

const sessio = (id, data, publicada = true) => ({
  id, titol: id, slug: id, publicada, data, hora: '19:00',
  publica: { titol: `Peli ${id}`, versioTipus: 'vose', idioma: 'Anglès', generes: ['Drama'], seccio: 'cartellera' },
});
const sessions = [sessio('a', '2026-11-05'), sessio('b', '2026-11-12'), sessio('c', '2026-11-19'), sessio('d', '2026-11-26', false)];
const flyers = [
  { id: 'pub', nom: 'Flyer novembre', estat: 'publicat', sessionsIds: ['a', 'b', 'c'], clauPrevia: 'secreta' },
  { id: 'esb', nom: 'Flyer esborrany', estat: 'esborrany', sessionsIds: ['a', 'b', 'c'], clauPrevia: 'secreta' },
  { id: 'trencat', nom: 'Amb una despublicada', estat: 'publicat', sessionsIds: ['a', 'b', 'd'], clauPrevia: 'secreta' },
  { id: 'sense-clau', nom: 'Sense clau', estat: 'esborrany', sessionsIds: ['a', 'b', 'c'] },
  { id: 'clau-buida', nom: 'Clau buida', estat: 'esborrany', sessionsIds: ['a', 'b', 'c'], clauPrevia: '' },
  { id: 'buit', nom: 'Sense pelis', estat: 'publicat', sessionsIds: ['d'], clauPrevia: 'secreta' },
];

const doc = (id, dades) => ({ id, exists: Boolean(dades), data: () => dades });
globalThis.__dbFals = {
  collection: (nom) => {
    const docs = nom === 'sessions' ? sessions : nom === 'flyers' ? flyers : [];
    return conWhere({
      doc: (id) => ({ id, get: async () => doc(id, docs.find((d) => d.id === id)) }),
      get: async () => ({ docs: docs.map(({ id, ...dades }) => doc(id, dades)) }),
    });
  },
  getAll: async (...refs) => Promise.all(refs.map((r) => r.get())),
};

const demana = async (Pagina, id, consulta = '') => {
  const container = await AstroContainer.create();
  container.insertPageRoute('/404', Pagina404);
  const resposta = await container.renderToResponse(Pagina, {
    params: { id },
    routeType: 'page',
    request: new Request(`https://cineclub-web.web.app/flyer/${id}/${consulta}`),
  });
  return { status: resposta.status, cache: resposta.headers.get('Cache-Control'), html: await resposta.text() };
};

describe('/flyer/<id>/', () => {
  it('flyer publicat: títols de les pel·lícules, noindex, PDF i WhatsApp amb la URL de la pàgina', async () => {
    const { status, cache, html } = await demana(PaginaFlyer, 'pub');
    expect(status).toBe(200);
    expect(cache).toBe(CACHE_OK);
    for (const t of ['Peli a', 'Peli b', 'Peli c']) expect(html).toContain(t);
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).toContain('href="/flyer/pub/flyer.pdf"');
    expect(html).toContain(`https://wa.me/?text=${encodeURIComponent('Flyer novembre https://cineclub-web.web.app/flyer/pub/')}`);
  });

  it('esborrany: 404 sense clau o amb clau errònia; amb la clau es veu, no-store i els enllaços la conserven', async () => {
    expect((await demana(PaginaFlyer, 'esb')).status).toBe(404);
    expect((await demana(PaginaFlyer, 'esb', '?clau=altra')).status).toBe(404);
    const { status, cache, html } = await demana(PaginaFlyer, 'esb', '?clau=secreta');
    expect(status).toBe(200);
    expect(cache).toBe('no-store');
    expect(html).toContain('href="/flyer/esb/flyer.pdf?clau=secreta"');
    // L'esborrany no es comparteix: l'URL duria la clau.
    expect(html).not.toContain('wa.me');
    expect(html).not.toContain('WhatsApp');
  });

  it('flyer publicat: no repeteix cap clau de la petició a l\'HTML', async () => {
    const { html } = await demana(PaginaFlyer, 'pub', '?clau=qualsevol');
    expect(html).not.toContain('clau');
    expect(html).toContain('href="/flyer/pub/flyer.pdf"');
    expect((await demana(PaginaFlyer, 'pub', '?clau=secreta')).html).not.toContain('clau');
  });

  it('una clau buida no obre un esborrany sense clauPrevia o amb clauPrevia buida', async () => {
    for (const id of ['sense-clau', 'clau-buida']) {
      expect((await demana(PaginaFlyer, id, '?clau=')).status).toBe(404);
      expect((await demana(PaginaFlyer, id)).status).toBe(404);
      expect((await demana(PaginaImprimir, id, '?clau=')).status).toBe(404);
      expect((await demana(PaginaImprimir, id, '?variant=impremta&clau=')).status).toBe(404);
    }
  });

  it('flyer inexistent: 404', async () => {
    expect((await demana(PaginaFlyer, 'no-existeix')).status).toBe(404);
  });

  it('una sessió despublicada no surt ni trenca la pàgina', async () => {
    const { status, html } = await demana(PaginaFlyer, 'trencat');
    expect(status).toBe(200);
    expect(html).toContain('Peli a');
    expect(html).not.toContain('Peli d');
  });

  it('sense cap pel·lícula pinta un missatge i la cara B', async () => {
    const { status, html } = await demana(PaginaFlyer, 'buit');
    expect(status).toBe(200);
    expect(html).toContain('encara no té cap pel·lícula');
    expect(html).toContain('flyer-tira--corporativa');
    expect(html).not.toContain('flyer-columna"');
  });
});

describe('/flyer/<id>/imprimir/', () => {
  it('simple (per defecte): A4, 2 pàgines amb 3 tires cadascuna, no-store', async () => {
    const { status, cache, html } = await demana(PaginaImprimir, 'pub');
    expect(status).toBe(200);
    expect(cache).toBe('no-store');
    expect(html).toContain('size: 210mm 297mm');
    expect(html).toContain('noindex, nofollow');
    const fulls = html.split('<section class="flyer-full').slice(1);
    expect(fulls).toHaveLength(2);
    for (const full of fulls) expect(full.match(/class="flyer-tira[ "]/g)).toHaveLength(3);
    expect(fulls[0]).not.toContain('flyer-tira--corporativa');
    expect(fulls[1].match(/flyer-tira--corporativa/g)).toHaveLength(3);
    expect(html).not.toContain('flyer-marca-tall');
    expect((await demana(PaginaImprimir, 'pub', '?variant=rara')).html).toContain('size: 210mm 297mm');
  });

  it('el botó d\'imprimir no és dins cap full i el CSS d\'impressió l\'amaga (no surt al PDF)', async () => {
    for (const consulta of ['', '?variant=impremta&clau=secreta']) {
      const { html } = await demana(PaginaImprimir, 'pub', consulta);
      const fulls = html.split('<section class="flyer-full').slice(1);
      expect(fulls).toHaveLength(2);
      expect(html).toContain('flyer-imprimir__boto');
      for (const full of fulls) expect(full).not.toContain('flyer-imprimir__boto');
    }
    const css = readFileSync(new URL('../src/styles/flyer-imprimir.css', import.meta.url), 'utf8').replace(/\s+/g, ' ');
    expect(css).toMatch(/@media print \{.*\.flyer-imprimir__boto \{ display: none;? \}/);
  });

  it('impremta: 404 sense clau (també amb clau errònia); amb clau, 216 × 303 mm i marques de tall', async () => {
    expect((await demana(PaginaImprimir, 'pub', '?variant=impremta')).status).toBe(404);
    expect((await demana(PaginaImprimir, 'pub', '?variant=impremta&clau=altra')).status).toBe(404);
    const { status, html } = await demana(PaginaImprimir, 'pub', '?variant=impremta&clau=secreta');
    expect(status).toBe(200);
    expect(html).toContain('size: 216mm 303mm');
    expect(html).toContain('flyer-marca-tall');
    expect(html.match(/flyer-marca-tall /g)).toHaveLength(2 * 12);
    expect(html).toContain('left:0mm;top:2.925mm');
    expect(html).toContain('left:2.925mm;top:301mm');
  });

  it('esborrany i inexistent: 404; sense pel·lícules: 404; sessió despublicada exclosa', async () => {
    expect((await demana(PaginaImprimir, 'esb')).status).toBe(404);
    const esb = await demana(PaginaImprimir, 'esb', '?clau=secreta');
    expect(esb.status).toBe(200);
    expect(esb.cache).toBe('no-store');
    const esbImpremta = await demana(PaginaImprimir, 'esb', '?variant=impremta&clau=secreta');
    expect(esbImpremta.status).toBe(200);
    expect(esbImpremta.cache).toBe('no-store');
    expect((await demana(PaginaImprimir, 'no-existeix')).status).toBe(404);
    expect((await demana(PaginaImprimir, 'buit')).status).toBe(404);
    const { html } = await demana(PaginaImprimir, 'trencat');
    expect(html).toContain('Peli a');
    expect(html).not.toContain('Peli d');
  });
});

describe('sitemap', () => {
  it('no inclou cap pàgina de flyer encara que n\'hi hagi de publicats', async () => {
    const llista = (nom) => (nom === 'flyers' ? flyers : nom === 'sessions' ? sessions : []);
    const db = {
      collection: (nom) => ({
        doc: () => ({ get: async () => ({ exists: false }) }),
        get: async () => ({ docs: llista(nom).map(({ id, ...d }) => ({ id, data: () => d })) }),
        where: (camp, op, valor) => ({ get: async () => ({ docs: llista(nom).filter((d) => d[camp] === valor).map(({ id, ...d }) => ({ id, data: () => d })) }) }),
      }),
    };
    const urls = (await entradesSitemap(db)).map((e) => e.cami);
    expect(urls.some((u) => u.includes('/programacio/'))).toBe(true);
    expect(urls.some((u) => u.includes('flyer'))).toBe(false);
  });
});
