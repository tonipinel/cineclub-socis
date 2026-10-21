import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import IndexDirectors from '../src/pages/directors/index.astro';
import TermeDirectors from '../src/pages/directors/[terme].astro';
import IndexGeneres from '../src/pages/generes/index.astro';
import TermeGeneres from '../src/pages/generes/[terme].astro';
import IndexInterprets from '../src/pages/interprets/index.astro';
import TermeInterprets from '../src/pages/interprets/[terme].astro';
import Pagina404 from '../src/pages/404.astro';

vi.mock('../src/lib/db.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => globalThis.__dbFals,
}));

const termesHugo = JSON.parse(readFileSync(new URL('./fixtures/hugo-termes.json', import.meta.url), 'utf8'));
const ST = 'https://firebasestorage.googleapis.com/v0/b/cineclub-socis.firebasestorage.app/o/web%2Fsessions%2F';

const sessio = (id, data, publica, extra = {}) => ({
  id: `${id}-id`,
  titol: id,
  slug: id,
  publicada: true,
  data,
  hora: '19:00',
  publica: { seccio: 'cartellera', organitza: 'cineclub', cartell: `${ST}${id}%2Fposter.jpg?alt=media`, directors: [], generes: [], interprets: [], ...publica },
  ...extra,
});

const sessions = [
  sessio('domingos', '2026-09-03', { directors: ['Alauda Ruiz de Azúa'], generes: ['Drama'], interprets: ['Patricia López Arnaiz', "Judith O'Dea"] }),
  sessio('abejas', '2026-10-08', { directors: ['Estibaliz Urresola Solaguren'], generes: ['Drama'], interprets: ['Patricia López Arnaiz'] }),
  sessio('the-artist', '2026-03-05', { directors: ['Michel Hazanavicius'], generes: ['Comèdia', 'Drama', 'Romàntic'] }),
  sessio('esborrany', '2026-11-12', { directors: ['Director ocult'], generes: ['Ocult'], interprets: ['Ningú'] }, { publicada: false }),
];

const ambDb = (docs = sessions) => {
  globalThis.__dbFals = {
    collection: (nom) => ({
      get: async () => ({ docs: (nom === 'sessions' ? docs : []).map(({ id, ...dades }) => ({ id, data: () => dades })) }),
    }),
  };
};
const renderitza = async (Ruta, ruta, params) => {
  const container = await AstroContainer.create();
  container.insertPageRoute('/404', Pagina404);
  const resposta = await container.renderToResponse(Ruta, { routeType: 'page', params, request: new Request(`https://cineclub-web.web.app${ruta}`) });
  return { status: resposta.status, html: await resposta.text() };
};
const terme = (Ruta, taxonomia, slug) => renderitza(Ruta, `/${taxonomia}/${encodeURIComponent(slug)}/`, { terme: slug });

beforeEach(() => ambDb());

describe('índex de taxonomies', () => {
  it('/directors/ té el títol «directors» al head i el h1 de Hugo', async () => {
    const { status, html } = await renderitza(IndexDirectors, '/directors/');
    expect(status).toBe(200);
    expect(html).toContain('<title>directors · Cineclub Roda de Berà</title>');
    expect(html).toContain('<meta property="og:title" content="directors">');
    expect(html).toContain('<meta name="description" content="Un espai per viure i compartir cinema durant tot l\'any!">');
    expect(html).toContain('<link rel="canonical" href="https://cineclub-web.web.app/directors/">');
    expect(html).toContain('<h1 class="page-hero__title">Directors i directores</h1>');
    expect(html).toContain('<p class="page-hero__hook">Totes les directores i directors de les pel·lícules programades pel Cineclub Roda de Berà.</p>');
  });

  it('llista els termes en ordre alfabètic, amb l\'enllaç percent-encoded i el nombre de sessions', async () => {
    const { html } = await renderitza(IndexDirectors, '/directors/');
    const files = [...html.matchAll(/<a class="taxonomy-list__link" href="([^"]+)">([^<]+)<\/a>\n?\s*<span class="taxonomy-list__count">(\d+)<\/span>/g)];
    expect(files.map((m) => [m[1], m[2], m[3]])).toEqual([
      ['/directors/alauda-ruiz-de-az%C3%BAa/', 'Alauda Ruiz de Azúa', '1'],
      ['/directors/estibaliz-urresola-solaguren/', 'Estibaliz Urresola Solaguren', '1'],
      ['/directors/michel-hazanavicius/', 'Michel Hazanavicius', '1'],
    ]);
    expect(html).not.toContain('Director ocult');
  });

  it('/generes/ i /interprets/ tenen els seus textos i comptadors', async () => {
    const generes = await renderitza(IndexGeneres, '/generes/');
    expect(generes.html).toContain('<h1 class="page-hero__title">Gèneres</h1>');
    expect(generes.html).toContain('Tots els gèneres de les pel·lícules programades pel Cineclub Roda de Berà.');
    expect(generes.html).toMatch(/href="\/generes\/drama\/">Drama<\/a>\n?\s*<span class="taxonomy-list__count">3</);
    expect(generes.html).not.toContain('Ocult');
    const interprets = await renderitza(IndexInterprets, '/interprets/');
    expect(interprets.html).toContain('<h1 class="page-hero__title">Intèrprets</h1>');
    expect(interprets.html).toMatch(/href="\/interprets\/patricia-l%C3%B3pez-arnaiz\/">Patricia López Arnaiz<\/a>\n?\s*<span class="taxonomy-list__count">2</);
    expect(interprets.html).toContain('href="/interprets/judith-odea/">Judith O&#39;Dea</a>');
  });

  it('amb els termes reals de Hugo, l\'índex els llista en el seu ordre', async () => {
    const reals = termesHugo.interprets.map((t, i) => sessio(`s${i}`, `2026-01-${String(i % 28 + 1).padStart(2, '0')}`, { interprets: [t.nom] }));
    ambDb(reals.reverse());
    const { html } = await renderitza(IndexInterprets, '/interprets/');
    const enllacos = [...html.matchAll(/taxonomy-list__link" href="\/interprets\/([^"]+)\//g)].map((m) => decodeURIComponent(m[1]));
    expect(enllacos).toEqual(termesHugo.interprets.map((t) => t.carpeta));
  });

  it('sense cap sessió publicada, l\'índex és buit però existeix', async () => {
    ambDb([]);
    const { status, html } = await renderitza(IndexGeneres, '/generes/');
    expect(status).toBe(200);
    expect(html).toContain('<ul class="taxonomy-list"></ul>');
  });
});

describe('pàgina d\'un terme', () => {
  it('resol la forma amb accents', async () => {
    const { status, html } = await terme(TermeDirectors, 'directors', 'alauda-ruiz-de-azúa');
    expect(status).toBe(200);
    expect(html).toContain('<title>Alauda Ruiz de Azúa · Cineclub Roda de Berà</title>');
    expect(html).toContain('<link rel="canonical" href="https://cineclub-web.web.app/directors/alauda-ruiz-de-az%C3%BAa/">');
    expect(html).toContain('<h1 class="page-hero__title">Alauda Ruiz de Azúa</h1>');
    expect(html).toContain('<p class="page-hero__hook">Pel·lícules dirigides per Alauda Ruiz de Azúa programades pel Cineclub Roda de Berà\n(1 sessió).</p>');
  });

  it('resol la forma percent-encoded tal com la lliura el router d\'Astro (decodificada)', async () => {
    // Astro decodifica els paràmetres de ruta: `az%C3%BAa` arriba com `azúa`.
    const decodificat = decodeURIComponent('alauda-ruiz-de-az%C3%BAa');
    const { status, html } = await terme(TermeDirectors, 'directors', decodificat);
    expect(status).toBe(200);
    expect(html).toContain('<h1 class="page-hero__title">Alauda Ruiz de Azúa</h1>');
  });

  it('la mateixa canònica tant si la petició és literal com codificada', async () => {
    const literal = await renderitza(TermeDirectors, '/directors/alauda-ruiz-de-azúa/', { terme: 'alauda-ruiz-de-azúa' });
    const codificada = await renderitza(TermeDirectors, '/directors/alauda-ruiz-de-az%C3%BAa/', { terme: 'alauda-ruiz-de-azúa' });
    const canonica = (html) => html.match(/<link rel="canonical" href="([^"]+)"/)[1];
    expect(canonica(literal.html)).toBe('https://cineclub-web.web.app/directors/alauda-ruiz-de-az%C3%BAa/');
    expect(canonica(codificada.html)).toBe(canonica(literal.html));
  });

  it('un gènere llista les seves sessions, de la més nova a la més antiga, i el recompte en plural', async () => {
    const { html } = await terme(TermeGeneres, 'generes', 'drama');
    expect(html).toContain('<p class="page-hero__hook">Sessions de gènere Drama programades pel Cineclub Roda de Berà\n(3 sessions).</p>');
    const urls = [...html.matchAll(/session-card__link" href="([^"]+)"/g)].map((m) => m[1]);
    expect(urls).toEqual(['/programacio/2026/abejas/', '/programacio/2026/domingos/', '/programacio/2026/the-artist/']);
    expect(html.match(/<article class="session-card"/g)).toHaveLength(3);
    expect(html).toContain('<div class="taxonomy-grid-wrapper"><div class="session-grid">');
  });

  it('un intèrpret té el text «al repartiment» i el nom original amb apòstrof', async () => {
    const { html } = await terme(TermeInterprets, 'interprets', 'judith-odea');
    expect(html).toContain('<h1 class="page-hero__title">Judith O&#39;Dea</h1>');
    expect(html).toContain('Pel·lícules amb Judith O&#39;Dea al repartiment, programades pel Cineclub Roda de Berà\n(1 sessió).');
    const dos = await terme(TermeInterprets, 'interprets', 'patricia-lópez-arnaiz');
    expect(dos.html).toContain('(2 sessions).');
  });

  it('un terme inexistent és un 404 real', async () => {
    const { status, html } = await terme(TermeDirectors, 'directors', 'ningu');
    expect(status).toBe(404);
    expect(html).toContain('Pàgina no trobada');
    expect((await terme(TermeGeneres, 'generes', 'alauda-ruiz-de-azúa')).status).toBe(404);
  });

  it('un terme que només té sessions no publicades és un 404', async () => {
    expect((await terme(TermeDirectors, 'directors', 'director-ocult')).status).toBe(404);
    expect((await terme(TermeGeneres, 'generes', 'ocult')).status).toBe(404);
    expect((await terme(TermeInterprets, 'interprets', 'ningú')).status).toBe(404);
  });

  it('no accepta majúscules ni parts del slug', async () => {
    expect((await terme(TermeGeneres, 'generes', 'Drama')).status).toBe(404);
    expect((await terme(TermeDirectors, 'directors', 'alauda')).status).toBe(404);
  });
});
