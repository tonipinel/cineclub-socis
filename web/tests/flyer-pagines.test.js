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
const sessions = [
  sessio('a', '2026-11-05'), sessio('b', '2026-11-12'), sessio('c', '2026-11-19'), sessio('d', '2026-11-26', false),
  { ...sessio('f', '2026-11-05', false), slug: undefined, hora: '17:00' },
  { ...sessio('p1', '2026-12-03'), publica: { ...sessio('p1', '2026-12-03').publica, preu: 5 } },
  { ...sessio('p2', '2026-12-10'), publica: { ...sessio('p2', '2026-12-10').publica, preu: 3 } },
  ...['k1', 'k2', 'k3'].map((id, i) => ({ ...sessio(id, `2027-01-0${i + 1}`), publica: { ...sessio(id, '').publica, cartell: `https://exemple.cat/${id}.jpg` } })),
];
const flyers = [
  { id: 'pub', nom: 'Flyer novembre', estat: 'publicat', sessionsIds: ['a', 'b', 'c'], clauPrevia: 'secreta' },
  { id: 'esb', nom: 'Flyer esborrany', estat: 'esborrany', sessionsIds: ['a', 'b', 'c'], clauPrevia: 'secreta' },
  { id: 'trencat', nom: 'Amb una despublicada', estat: 'publicat', sessionsIds: ['a', 'b', 'd'], clauPrevia: 'secreta' },
  { id: 'sense-clau', nom: 'Sense clau', estat: 'esborrany', sessionsIds: ['a', 'b', 'c'] },
  { id: 'clau-buida', nom: 'Clau buida', estat: 'esborrany', sessionsIds: ['a', 'b', 'c'], clauPrevia: '' },
  { id: 'amb-no-publicades', nom: 'Amb no publicades', estat: 'publicat', sessionsIds: ['a', 'd', 'f'], clauPrevia: 'secreta' },
  { id: 'amb-preus', nom: 'Amb preus', estat: 'publicat', sessionsIds: ['p1', 'p2'], clauPrevia: 'secreta' },
  { id: 'sis', nom: 'Sis sessions', estat: 'publicat', sessionsIds: ['a', 'b', 'c', 'd', 'p1', 'p2'], clauPrevia: 'secreta' },
  { id: 'buit', nom: 'Sense pelis', estat: 'publicat', sessionsIds: ['d'], clauPrevia: 'secreta' },
  {
    id: 'enquadrat', nom: 'Amb enquadraments', estat: 'publicat', sessionsIds: ['k1', 'k2', 'k3'], clauPrevia: 'secreta',
    enquadraments: { k2: 'centre', k3: 'baix' },
  },
  { id: 'amb-esborrada', nom: 'Amb una esborrada', estat: 'publicat', sessionsIds: ['a', 'b', 'zz'], clauPrevia: 'secreta' },
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
    expect(html).toMatch(/<a class="flyer-pagina__boto" href="\/flyer\/pub\/flyer.pdf" download="flyer-cineclub.pdf">Descarrega en PDF<\/a>/);
    expect(html).toContain('onclick="window.print()">Imprimeix els flyers en A4</button>');
    expect(html).not.toContain('Imprimeix aquesta pàgina');
    expect(html).not.toContain('>Imprimeix</a>');
    expect(html).toContain(`https://wa.me/?text=${encodeURIComponent('Flyer novembre https://cineclub-web.web.app/flyer/pub/')}`);
  });

  it('esborrany: 404 sense clau o amb clau errònia; amb la clau es veu, no-store i els enllaços la conserven', async () => {
    expect((await demana(PaginaFlyer, 'esb')).status).toBe(404);
    expect((await demana(PaginaFlyer, 'esb', '?clau=altra')).status).toBe(404);
    const { status, cache, html } = await demana(PaginaFlyer, 'esb', '?clau=secreta&totes=1');
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

  it('amb una clau vàlida la resposta és no-store encara que el flyer sigui actiu', async () => {
    expect((await demana(PaginaFlyer, 'pub', '?clau=secreta')).cache).toBe('no-store');
    expect((await demana(PaginaFlyer, 'pub', '?clau=altra')).cache).toBe(CACHE_OK);
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

  it('amb la clau (sense totes=1) una sessió despublicada no surt ni trenca la pàgina', async () => {
    const { status, html } = await demana(PaginaFlyer, 'trencat', '?clau=secreta');
    expect(status).toBe(200);
    expect(html).toContain('Peli a');
    expect(html).not.toContain('Peli d');
  });

  it('sense cap pel·lícula pinta un missatge i la cara B', async () => {
    const { status, html } = await demana(PaginaFlyer, 'buit', '?clau=secreta');
    expect(status).toBe(200);
    expect(html).toContain('encara no té cap pel·lícula');
    expect(html).toContain('flyer-tira--corporativa');
    expect(html).not.toContain('flyer-columna"');
  });
});

describe('/flyer/<id>/ imprimible directament', () => {
  const css = readFileSync(new URL('../src/styles/flyer.css', import.meta.url), 'utf8').replace(/\s+/g, ' ');

  it('porta els dos fulls A4 (cara A i cara B, 3 tires cadascun) sense marques de tall ni botons dins', async () => {
    const { html } = await demana(PaginaFlyer, 'pub');
    const fulls = html.split('<section class="flyer-full').slice(1);
    expect(fulls).toHaveLength(2);
    for (const full of fulls) {
      expect(full.match(/class="flyer-tira[ "]/g)).toHaveLength(3);
      expect(full).not.toContain('flyer-pagina__boto');
      expect(full).not.toContain('<a ');
      expect(full).not.toContain('<button');
    }
    expect(fulls[0]).not.toContain('flyer-tira--corporativa');
    expect(fulls[1].match(/flyer-tira--corporativa/g)).toHaveLength(3);
    expect(html).not.toContain('flyer-marca-tall');
    expect(html).toContain('@page { size: 210mm 297mm; margin: 0; }');
    expect(html).toContain('window.print()');
  });

  it('el CSS amaga els fulls a la pantalla i, en imprimir, els mostra i amaga la vista de pantalla', () => {
    const [pantalla, imprimint] = css.split('@media print');
    expect(pantalla).toMatch(/\.flyer-pagina__fulls \{[^}]*\bhidden\b/);
    expect(imprimint).toMatch(/\.flyer-pagina__contingut \{[^}]*\bhidden\b/);
    expect(imprimint).toMatch(/\.flyer-pagina__fulls \{[^}]*\bblock\b/);
  });

  it('el logo del club surt com a <img> a les dues cares (a la vista i als fulls)', async () => {
    const { html } = await demana(PaginaFlyer, 'pub');
    // 3 pel·lícules: lateral esquerre + dret (mirall) a cada tira, a la vista (1) i als fulls (3).
    expect(html.match(/class="flyer-tira__logo"/g)).toHaveLength(8);
    expect(html.match(/class="flyer-marca__logo"/g)).toHaveLength(4);
    expect(html).not.toContain('flyer-marca__nom');
    expect((await demana(PaginaImprimir, 'pub')).html.match(/<img class="flyer-(tira|marca)__logo"/g)).toHaveLength(3);
  });
});

describe('sessions no publicades amb la clau (previsualització)', () => {
  const ordre = (html, ...titols) => titols.map((t) => html.indexOf(t));

  it.each([['imprimir', PaginaImprimir], ['pàgina', PaginaFlyer]])('%s: amb la clau correcta surten, ordenades per data i hora, i sense slug no trenca', async (_nom, Pagina) => {
    const { status, html } = await demana(Pagina, 'amb-no-publicades', '?clau=secreta&totes=1');
    expect(status).toBe(200);
    const [f, a, d] = ordre(html, 'Peli f', 'Peli a', 'Peli d');
    expect(f).toBeGreaterThan(-1);
    expect(f).toBeLessThan(a);
    expect(a).toBeLessThan(d);
  });

  it.each([['imprimir', PaginaImprimir], ['pàgina', PaginaFlyer]])('%s: amb la clau sense totes=1, només les publicades', async (_nom, Pagina) => {
    const { status, html } = await demana(Pagina, 'amb-no-publicades', '?clau=secreta');
    expect(status).toBe(200);
    expect(html).toContain('Peli a');
    expect(html).not.toContain('Peli d');
    expect(html).not.toContain('Peli f');
  });

  it('les respostes d\'un flyer no actiu (només amb la clau) no es cachegen', async () => {
    expect((await demana(PaginaFlyer, 'amb-no-publicades', '?clau=secreta&totes=1')).cache).toBe('no-store');
    expect((await demana(PaginaImprimir, 'amb-no-publicades', '?clau=secreta&totes=1')).cache).toBe('no-store');
    expect((await demana(PaginaFlyer, 'amb-no-publicades', '?clau=secreta')).cache).toBe('no-store');
  });

  it('un esborrany amb clau errònia o sense, també amb totes=1, dona el mateix 404 que abans', async () => {
    for (const Pagina of [PaginaFlyer, PaginaImprimir]) {
      for (const consulta of ['?totes=1', '?clau=altra&totes=1', '?clau=&totes=1']) expect((await demana(Pagina, 'esb', consulta)).status).toBe(404);
      expect((await demana(Pagina, 'esb', '?clau=secreta&totes=1')).status).toBe(200);
    }
  });
});

describe('flyer actiu (publicat i amb totes les sessions publicades)', () => {
  const rutes = [['pàgina', PaginaFlyer], ['imprimir', PaginaImprimir]];

  it.each(rutes)('%s: un flyer publicat amb una sessió sense publicar, sense clau o amb clau errònia, dona el 404 d\'un esborrany', async (_nom, Pagina) => {
    for (const id of ['amb-no-publicades', 'trencat', 'buit']) {
      for (const consulta of ['', '?clau=', '?clau=altra', '?totes=1', '?clau=altra&totes=1']) {
        const resposta = await demana(Pagina, id, consulta);
        expect(resposta.status).toBe(404);
        expect(resposta.html).not.toContain('Peli a');
      }
    }
  });

  it.each(rutes)('%s: una sessió esborrada fa el flyer no actiu (404 sense clau; amb la clau, 200)', async (_nom, Pagina) => {
    expect((await demana(Pagina, 'amb-esborrada')).status).toBe(404);
    const { status, html } = await demana(Pagina, 'amb-esborrada', '?clau=secreta&totes=1');
    expect(status).toBe(200);
    expect(html).toContain('Peli a');
  });

  it('la pàgina d\'un flyer no actiu amb la clau i totes=1 la conserva a l\'enllaç del PDF i no ofereix WhatsApp', async () => {
    const { html } = await demana(PaginaFlyer, 'trencat', '?clau=secreta&totes=1');
    expect(html).toContain('href="/flyer/trencat/flyer.pdf?clau=secreta"');
    expect(html).not.toContain('wa.me');
  });

  it('sense totes=1 la pàgina d\'un flyer no actiu no ofereix el PDF (porta sessions que la pàgina no mostra)', async () => {
    const { status, html } = await demana(PaginaFlyer, 'trencat', '?clau=secreta');
    expect(status).toBe(200);
    expect(html).not.toContain('flyer.pdf');
  });

  it('un flyer actiu es veu sense clau com sempre', async () => {
    expect((await demana(PaginaFlyer, 'pub')).status).toBe(200);
    expect((await demana(PaginaImprimir, 'pub')).status).toBe(200);
  });
});

describe('flyer sense pel·lícules', () => {
  it('no té fulls i el contingut de pantalla és imprimible (no surt un full en blanc)', async () => {
    const { html } = await demana(PaginaFlyer, 'buit', '?clau=secreta');
    expect(html).not.toContain('flyer-full');
    expect(html).toContain('flyer-pagina__contingut--buit');
    expect((await demana(PaginaFlyer, 'pub')).html).not.toContain('flyer-pagina__contingut--buit');
    expect(readFileSync(new URL('../src/styles/flyer.css', import.meta.url), 'utf8')).toMatch(/@media print[^]*\.flyer-pagina__contingut--buit\s*\{[^}]*flex/);
  });
});

describe('flyer fora de rang (més de 5 sessions)', () => {
  it.each([['imprimir', PaginaImprimir], ['pàgina', PaginaFlyer]])('%s: un document antic amb 6 sessions en pinta les 5 primeres per data, sense petar', async (_nom, Pagina) => {
    const { status, html } = await demana(Pagina, 'sis', '?clau=secreta&totes=1');
    expect(status).toBe(200);
    for (const t of ['Peli a', 'Peli b', 'Peli c', 'Peli d', 'Peli p1']) expect(html).toContain(t);
    expect(html).not.toContain('Peli p2');
  });
});

describe('preu a la cara B', () => {
  it('es calcula de les sessions del flyer (les mostrades) i surt a la pàgina i a la ruta d\'imprimir', async () => {
    for (const Pagina of [PaginaFlyer, PaginaImprimir]) {
      const { html } = await demana(Pagina, 'amb-preus');
      expect(html).toContain('Aportació <strong class="flyer-info__import">de 3 a 5 €</strong> segons sessió');
      expect(html).toContain('>Entrada gratuïta:</strong> Fes-te soci/a per 30 €/any!');
    }
  });
});

describe('geometria dels fulls', () => {
  const llegeix = (nom) => readFileSync(new URL(`../src/styles/${nom}`, import.meta.url), 'utf8');
  const imprimir = llegeix('flyer-imprimir.css');

  it('la ranura és una tira de 210 × 99 mm sense escalat i el full simple fa 297 mm; el disseny queda a 6 mm de les vores', () => {
    expect(imprimir).toMatch(/\.flyer-full__tira\s*\{[^}]*width:\s*210mm;[^}]*height:\s*99mm;/);
    expect(imprimir).toMatch(/height:\s*297mm/);
    expect(imprimir + llegeix('flyer.css')).not.toMatch(/scale\(/);
    expect(llegeix('flyer.css')).toMatch(/--marge:\s*6mm/);
  });

  it('els pseudoelements de guia només existeixen per a la variant simple (cap a impremta) i són entre ranures', () => {
    const selectors = [...imprimir.matchAll(/([^{}]+)::(?:before|after)\s*\{/g)].map((m) => m[1]);
    expect(selectors.length).toBeGreaterThan(0);
    for (const sel of selectors) expect(sel).toContain(':not(.flyer-full--impremta)');
    expect(selectors.join(' ')).toContain('.flyer-full__tira + .flyer-full__tira');
  });

  it('cada full porta 3 caixes de tira; impremta conserva les 24 marques i la mida de 216 × 303 mm', async () => {
    for (const [Pagina, consulta] of [[PaginaFlyer, ''], [PaginaImprimir, '?variant=impremta&clau=secreta']]) {
      const { html } = await demana(Pagina, 'pub', consulta);
      const fulls = html.split('<section class="flyer-full').slice(1);
      for (const full of fulls) expect(full.match(/class="flyer-full__tira"/g)).toHaveLength(3);
    }
    const { html } = await demana(PaginaImprimir, 'pub', '?variant=impremta&clau=secreta');
    expect(html).toContain('flyer-full flyer-full--impremta');
    expect(html.match(/flyer-marca-tall /g)).toHaveLength(24);
    expect(html).toContain('size: 216mm 303mm');
    expect(imprimir).toMatch(/\.flyer-full--impremta\s*\{[^}]*width:\s*216mm;[^}]*padding:\s*3mm;/);
  });
});

describe('/flyer/<id>/imprimir/', () => {
  it('simple (per defecte): 2 pàgines de 210 × 99 mm, una tira de la cara A i una de la cara B, no-store', async () => {
    const { status, cache, html } = await demana(PaginaImprimir, 'pub');
    expect(status).toBe(200);
    expect(cache).toBe('no-store');
    expect(html).toContain('@page { size: 210mm 99mm; margin: 0; }');
    expect(html).not.toContain('297mm');
    expect(html).toContain('noindex, nofollow');
    const fulls = html.split('<section class="flyer-full').slice(1);
    expect(fulls).toHaveLength(2);
    for (const full of fulls) {
      expect(full).toMatch(/^ flyer-full--una-tira"/);
      expect(full.match(/class="flyer-tira[ "]/g)).toHaveLength(1);
      expect(full.match(/class="flyer-full__tira"/g)).toHaveLength(1);
    }
    expect(fulls[0]).not.toContain('flyer-tira--corporativa');
    expect(fulls[1].match(/flyer-tira--corporativa/g)).toHaveLength(1);
    expect(html).not.toContain('flyer-marca-tall');
    expect((await demana(PaginaImprimir, 'pub', '?variant=rara')).html).toContain('size: 210mm 99mm');
  });

  it('el full d\'una tira fa exactament 210 × 99 mm (sense guies de tall)', () => {
    const css = readFileSync(new URL('../src/styles/flyer-imprimir.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.flyer-full\.flyer-full--una-tira\s*\{[^}]*height:\s*99mm;/);
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
    expect((await demana(PaginaImprimir, 'buit', '?clau=secreta')).status).toBe(404);
    const { html } = await demana(PaginaImprimir, 'trencat', '?clau=secreta');
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

describe('enquadrament del cartell', () => {
  it('la pàgina i la ruta d\'imprimir pinten cada cartell amb l\'enquadrament del flyer', async () => {
    for (const html of [(await demana(PaginaFlyer, 'enquadrat')).html, (await demana(PaginaImprimir, 'enquadrat')).html]) {
      expect(html).toMatch(/class="flyer-columna__imatge" src="[^"]*k1/);
      expect(html).toMatch(/class="flyer-columna__imatge flyer-columna__imatge--centre" src="[^"]*k2/);
      expect(html).toMatch(/class="flyer-columna__imatge flyer-columna__imatge--baix" src="[^"]*k3/);
    }
  });
});

describe('franja de logos a la cara B', () => {
  it('pàgina i imprimir: logos de les distribuïdores de les sessions mostrades, sense les de fora del flyer', async () => {
    const { fixaDistribuidoresDeProva } = await import('../src/lib/distribuidores.js');
    fixaDistribuidoresDeProva({ Avalon: { id: 'd1', logo: 'https://x/avalon.png' }, Fora: { id: 'd2', logo: 'https://x/fora.png' } });
    sessions.push(
      { ...sessio('dl1', '2027-02-01'), publica: { ...sessio('dl1', '').publica, suportDistribucioId: 'd1' } },
      { ...sessio('dl2', '2027-02-02', false), publica: { ...sessio('dl2', '').publica, suportDistribucioId: 'd2' } },
    );
    flyers.push({ id: 'amb-dist', nom: 'Amb distribuïdores', estat: 'publicat', sessionsIds: ['dl1', 'dl2'], clauPrevia: 'secreta' });
    for (const Pagina of [PaginaFlyer, PaginaImprimir]) {
      const { html } = await demana(Pagina, 'amb-dist', '?clau=secreta');
      expect(html).toContain('src="https://x/avalon.png" alt="Avalon"');
      expect(html).not.toContain('fora.png');
      const totes = (await demana(Pagina, 'amb-dist', '?clau=secreta&totes=1')).html;
      expect(totes).toContain('fora.png');
    }
  });
});
