import { describe, it, expect, vi, beforeEach } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import RutaCartell from '../src/pages/programacio/[any]/[slug]/cartell.html.astro';
import Pagina404 from '../src/pages/404.astro';
import { entradesSitemap } from '../src/lib/sitemap.js';
import { fixaEntitatsDeProva } from '../src/lib/entitats.js';

vi.mock('../src/lib/db.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => globalThis.__dbFals,
}));

const STORAGE = 'https://firebasestorage.googleapis.com/v0/b/cineclub-socis.firebasestorage.app/o/web%2F';
const imatge = (src, w) => `/api/img.webp?w=${w}&amp;u=${encodeURIComponent(src)}`;
const LOGO = `${STORAGE}pagines%2Fportada%2Fhero-logo.png?alt=media`;

const pig = {
  id: 'pig-id',
  titol: 'Pig',
  slug: 'pig',
  publicada: true,
  data: '2026-06-25',
  hora: '19:00',
  publica: {
    titol: 'Pig',
    titolOriginal: 'Pig Original',
    directors: ['Michael Sarnoski'],
    idioma: 'Anglès',
    versioTipus: 'vose',
    preu: 5,
    seccio: 'cartellera',
    organitza: 'cineclub',
    participa: ["L'Ateneu Rodenc"],
    collabora: [],
    sinopsiCartell: 'En Rob és un xef.<br/>Segona línia.',
    cartell: `${STORAGE}sessions%2Fpig%2Fposter.jpg?alt=media`,
    galeria: [1, 2, 3, 4, 5].map((n) => `${STORAGE}sessions%2Fpig%2Fgallery-${n}.jpg?alt=media`),
    cos: "## Sinopsi\n\nEn Rob és un xef d'alta cuina. Vegeu [Hugo](https://exemple.cat).\n\n## Context\n\nAltres coses.\n",
  },
};
// El catàleg d'entitats el carrega el middleware (Firestore); aquí s'injecta directament.
beforeEach(() => fixaEntitatsDeProva({ "L'Ateneu Rodenc": { logo: '/images/entitats/ateneu-rodenc.jpg', url: 'https://www.instagram.com/ateneu_rodenc.rdb/' } }));

const ambPublica = (publica, extra = {}) => ({ ...pig, ...extra, publica: { ...pig.publica, ...publica } });

const ambDb = (sessions, imatges = { 'hero-logo.png': LOGO }) => {
  globalThis.__dbFals = {
    collection: (nom) => ({
      get: async () => ({ docs: sessions.map(({ id, ...dades }) => ({ id, data: () => dades })) }),
      doc: (id) => ({ get: async () => ({ exists: nom === 'pagines' && id === 'portada', data: () => ({ slug: 'portada', imatges }) }) }),
    }),
  };
};
const demana = async (params) => {
  const container = await AstroContainer.create();
  container.insertPageRoute('/404', Pagina404);
  return container.renderToResponse(RutaCartell, { params, routeType: 'page' });
};
const html = async (sessio, params = { any: '2026', slug: sessio.slug }) => {
  ambDb([sessio]);
  const resposta = await demana(params);
  expect(resposta.status).toBe(200);
  return resposta.text();
};

describe('ruta /programacio/<any>/<slug>/cartell.html', () => {
  it('serveix el cartell d\'una sessió publicada amb l\'estructura de classes de Hugo', async () => {
    const cos = await html(pig);
    expect(cos).toContain('<title>Cartell: Pig (Cineclub Roda de Berà)</title>');
    expect(cos).toContain('<body class="cartell-page">');
    expect(cos).toContain('<div class="cartell">');
    expect(cos).toContain('<header class="cartell__header">');
    expect(cos).toContain('<span class="cartell__web-url">www.CINECLUBRODADEBERA.CAT</span>');
    expect(cos).toContain(`<img class="cartell__logo" src="${imatge(LOGO, 600)}" alt="Cineclub Roda de Berà">`);
    expect(cos).toContain('<span class="cartell__version-badge">VERSIÓ ORIGINAL SUBTITULADA</span>');
    expect(cos).toContain('<div class="cartell__body">');
    expect(cos).toContain('<div class="cartell__synopsis"><p>En Rob és un xef.<br/>Segona línia.</p></div>');
    expect(cos).toContain(`<img class="cartell__poster" src="${imatge(pig.publica.cartell, 1400)}" alt="Pig Original">`);
    expect(cos).toContain('<footer class="cartell__footer">');
    expect(cos).toContain('<div class="cartell__date-line"><span class="cartell__date">Dijous 25 de juny</span> <span class="cartell__date-time">a les 19:00h</span></div>');
    expect(cos).toContain('<span class="cartell__venue">Teatre del Casino Municipal de Roda de Berà</span>');
  });

  it('no pinta la capçalera, el peu ni la canònica del web', async () => {
    const cos = await html(pig);
    expect(cos).toContain('family=Oswald:wght@200..700&family=Inter:wght@400;600');
    expect(cos).not.toContain('site-header');
    expect(cos).not.toContain('<link rel="canonical"');
  });

  it('és noindex, nofollow i porta el botó d\'impressió', async () => {
    const cos = await html(pig);
    expect(cos).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(cos).not.toContain('index,follow');
    expect(cos).toContain('<button type="button" class="cartell-print-btn" onclick="window.print()">Imprimeix / Desa PDF</button>');
  });

  it('mostra el preu de soci/a i no soci/a amb preu > 0', async () => {
    const cos = await html(pig);
    expect(cos).toContain('<div class="cartell__price">');
    expect(cos).toContain('<span class="cartell__price-line">Soci/a: <strong>Gratuït</strong></span>');
    expect(cos).toContain('<span class="cartell__price-line">No soci/a: <strong>5€</strong></span>');
    expect(cos).not.toContain('Entrada gratuïta');
  });

  it('mostra «Entrada gratuïta» amb preu 0', async () => {
    const cos = await html(ambPublica({ preu: 0 }));
    expect(cos).toContain('<div class="cartell__price cartell__price--free">');
    expect(cos).toContain('<span class="cartell__price-line cartell__price-line--free">Entrada gratuïta</span>');
    expect(cos).not.toContain('No soci/a');
  });

  it('sense preu (absent, null o no numèric) no pinta cap línia de preu i mai NaN, undefined ni «€» buit', async () => {
    const { preu, ...senseUnPreu } = pig.publica;
    for (const publica of [senseUnPreu, { ...senseUnPreu, preu: null }, { ...senseUnPreu, preu: 'cinc' }]) {
      const cos = await html({ ...pig, publica });
      expect(cos).not.toContain('cartell__price-line');
      expect(cos).not.toContain('Soci/a');
      expect(cos).not.toContain('Entrada gratuïta');
      expect(cos).toContain('cartell__web-url');
      expect(cos).not.toMatch(/NaN|undefined|null|<strong>€/);
    }
  });

  it('agrupa les entitats a «Amb la col·laboració de» amb logo i l\'Ajuntament al final', async () => {
    const cos = await html(pig);
    expect(cos).toContain('<span class="cartell__collab-label">Amb la col·laboració de:</span>');
    expect(cos).toMatch(/<div class="cartell__collab-logos"><img class="cartell__collab-logo" src="[^"]*ateneu-rodenc[^"]*" alt="L'Ateneu Rodenc"><img class="cartell__collab-logo" src="\/images\/entitats\/ajuntament-roda-de-bera-horitzontal.png" alt="Ajuntament de Roda de Berà"><\/div>/);
  });

  it('usa el nom en text si l\'entitat no té logo i no repeteix l\'Ajuntament ni el Cineclub', async () => {
    const cos = await html(ambPublica({ organitza: 'Cineclub Roda de Berà', participa: ['Cineclub Roda de Berà', 'Entitat Nova'], collabora: ['Ajuntament de Roda de Berà'] }));
    expect(cos).toContain('<span class="cartell__collab-entity">Entitat Nova</span>');
    expect(cos.match(/alt="Ajuntament de Roda de Berà"/g)).toHaveLength(1);
    expect(cos).not.toContain('>Cineclub Roda de Berà</span>');
  });

  it('a la secció xarxa pinta la franja Organitza/Participen/Col·laboren', async () => {
    const cos = await html(ambPublica({ seccio: 'xarxa', organitza: "L'Ateneu Rodenc", participa: ['Entitat Nova'], collabora: [] }));
    expect(cos).toContain('<div class="cartell__collab-strip">');
    expect(cos).toContain('<span class="cartell__collab-strip-label">Organitza</span>');
    expect(cos).toContain('<span class="cartell__collab-strip-label">Participen</span>');
    expect(cos).toContain('<span class="cartell__collab-strip-label">Col·laboren</span>');
    expect(cos).toContain('<span class="cartell__collab-strip-entity">Entitat Nova</span>');
    expect(cos).not.toContain('Amb la col·laboració de:');
  });

  it('pinta la tira de fotogrames amb les 4 primeres imatges de la galeria i 42 forats per banda', async () => {
    const cos = await html(pig);
    expect(cos.match(/class="cartell__filmstrip-image"/g)).toHaveLength(4);
    expect(cos).toContain(`<img class="cartell__filmstrip-image" src="${imatge(pig.publica.galeria[0], 400)}" alt="">`);
    expect(cos).not.toContain(encodeURIComponent(pig.publica.galeria[4]));
    expect(cos.match(/cartell__filmstrip-hole/g)).toHaveLength(84);
    const sense = await html(ambPublica({ galeria: [] }));
    expect(sense).not.toContain('cartell__filmstrip');
  });

  it('sense sinopsiCartell fa servir la secció «Sinopsi» del cos, sense enllaços', async () => {
    const cos = await html(ambPublica({ sinopsiCartell: undefined }));
    expect(cos).toContain('<p>En Rob és un xef d&#39;alta cuina. Vegeu Hugo.</p>');
    expect(cos).not.toContain('Altres coses');
  });

  it('badges de versió: V.O. amb l\'idioma, sense versió no en pinta', async () => {
    expect(await html(ambPublica({ versioTipus: 'vo', idioma: 'Francès' }))).toContain('<span class="cartell__version-badge">VERSIÓ ORIGINAL<br>EN FRANCÈS</span>');
    expect(await html(ambPublica({ versioTipus: 'vosc' }))).toContain('VERSIÓ ORIGINAL SUBTITULADA<br>EN CATALÀ');
    expect(await html(ambPublica({ versioTipus: 'doblada-cat' }))).toContain('DOBLADA AL CATALÀ');
    expect(await html(ambPublica({ versioTipus: undefined }))).not.toContain('cartell__version-badge');
  });

  it('sense cartell ni logo no pinta les imatges', async () => {
    ambDb([ambPublica({ cartell: undefined })], {});
    const cos = await (await demana({ any: '2026', slug: 'pig' })).text();
    expect(cos).not.toContain('cartell__poster');
    expect(cos).not.toContain('cartell__logo');
  });

  it('escapa els textos de l\'editor', async () => {
    const cos = await html(ambPublica({ sinopsiCartell: undefined, cos: '## Sinopsi\n\n<script>alert(1)</script>', participa: ['<b>x</b>'] }));
    expect(cos).not.toContain('<script>alert(1)</script>');
    expect(cos).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it('retorna 404 per a una sessió no publicada, inexistent o d\'un altre any', async () => {
    ambDb([{ ...pig, publicada: false }]);
    const resposta = await demana({ any: '2026', slug: 'pig' });
    expect(resposta.status).toBe(404);
    expect(await resposta.text()).toContain('Pàgina no trobada');
    ambDb([pig]);
    expect((await demana({ any: '2026', slug: 'no-existeix' })).status).toBe(404);
    expect((await demana({ any: '2025', slug: 'pig' })).status).toBe(404);
    expect((await demana({ any: 'abc', slug: 'pig' })).status).toBe(404);
  });

  it('no surt al sitemap', async () => {
    const urls = (await entradesSitemap({ collection: () => ({ get: async () => ({ docs: [{ id: 'pig', data: () => pig }] }), doc: () => ({ get: async () => ({ exists: false }) }), where: () => ({ get: async () => ({ docs: [] }) }) }) })).map((e) => e.cami);
    expect(urls.some((u) => u.includes('/programacio/2026/pig/'))).toBe(true);
    expect(urls.some((u) => u.includes('cartell'))).toBe(false);
  });
});
