import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { feedPortada, feedProgramacio, feedTaxonomia, feedTerme, resumHtml, rfc822, xmlFeed } from '../src/lib/feeds.js';

const dir = new URL('./fixtures/hugo-feeds/', import.meta.url);
const llegeix = (nom) => readFileSync(new URL(nom, dir), 'utf8');
const contingut = JSON.parse(llegeix('contingut.json'));

// Db fals amb el contingut real de les sessions i pàgines de Hugo (fixture generat des de ~/sites/cineclub).
function dbFals({ sessions, pagines }) {
  return {
    collection: (nom) => ({
      get: async () => ({ docs: (nom === 'sessions' ? sessions : []).map(({ id, ...dades }) => ({ id, data: () => dades })) }),
      doc: (id) => ({
        get: async () => {
          const dades = nom === 'pagines' ? pagines[id] : undefined;
          return { exists: dades !== undefined, data: () => dades };
        },
      }),
    }),
  };
}
const sessionsHugo = contingut.sessions.map(({ slug, titol, data, hora, cos, ...llistes }) => ({
  id: slug, titol, slug, publicada: true, data, hora, publica: { ...llistes, cos },
}));
const pagines = { ...contingut.pagines, programacio: { slug: 'programacio', titol: 'Programació' } };
const db = dbFals({ sessions: sessionsHugo, pagines });

const BASE = 'https://cineclubrodadebera.cat';
const desescapa = (text) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;|&#34;/g, '"').replace(/&amp;/g, '&');
const camp = (xml, nom) => {
  const m = xml.match(new RegExp(`<${nom}(?:\\s[^>]*)?>([\\s\\S]*?)</${nom}>|<${nom}(?:\\s[^>]*)?/>`));
  return m ? desescapa(m[1] ?? '') : undefined;
};
function llegeixFeed(xml) {
  const [capcalera] = xml.split('<item>');
  return {
    xml: xml.match(/^<\?xml[^>]*\?>/)?.[0],
    rss: xml.match(/<rss[^>]*>/)[0],
    canal: {
      title: camp(capcalera, 'title'),
      link: camp(capcalera, 'link'),
      description: camp(capcalera, 'description'),
      language: camp(capcalera, 'language'),
      lastBuildDate: camp(capcalera, 'lastBuildDate'),
      atom: capcalera.match(/<atom:link href="([^"]*)" rel="self" type="application\/rss\+xml"\/>/)?.[1],
    },
    items: [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => ({
      title: camp(it, 'title'), link: camp(it, 'link'), pubDate: camp(it, 'pubDate'), guid: camp(it, 'guid'), description: camp(it, 'description'),
    })),
  };
}
// Hugo emet «Mon, 01 Jan 0001» per a les pàgines sense data i per als termes que només tenen sessions futures.
const senseData = (pubDate) => pubDate === undefined || pubDate.includes(' 0001 ');

async function comparaAmbHugo(feed, fixture) {
  const nou = llegeixFeed(xmlFeed(feed, BASE));
  const hugo = llegeixFeed(llegeix(fixture));
  expect(nou.xml).toBe('<?xml version="1.0" encoding="utf-8" standalone="yes"?>');
  expect(nou.rss).toBe(hugo.rss);
  expect(nou.canal).toEqual(hugo.canal);
  expect(nou.items.map((i) => [i.title, i.link, i.guid])).toEqual(hugo.items.map((i) => [i.title, i.link, i.guid]));
  nou.items.forEach((item, i) => {
    expect(item.description, `${item.title}: description`).toBe(hugo.items[i].description);
    if (!senseData(hugo.items[i].pubDate)) expect(item.pubDate, `${item.title}: pubDate`).toBe(hugo.items[i].pubDate);
  });
  return nou;
}

describe('feeds RSS: comparació amb els de Hugo (fixtures)', () => {
  it('portada (index.xml): sessions de la més nova a la més antiga i després les pàgines, per títol', async () => {
    const nou = await comparaAmbHugo(await feedPortada(db), 'index.xml');
    expect(nou.items).toHaveLength(14);
    // Les pàgines no tenen data: no s'hi inventa un pubDate.
    expect(nou.items.slice(-3).every((i) => i.pubDate === undefined)).toBe(true);
  });

  it('índex d\'una taxonomia (directors/index.xml): un element per terme, el de la sessió més recent primer', async () => {
    const nou = await comparaAmbHugo(await feedTaxonomia('directors', db), 'directors-index.xml');
    expect(nou.items).toHaveLength(10);
    // Hugo hi posa l'any 0001 per als termes de sessions futures; aquí sempre és la data de la sessió més recent.
    expect(nou.items[0].pubDate).toBe('Thu, 22 Oct 2026 19:00:00 +0200');
  });

  it('terme (generes/documental/index.xml): les seves sessions, de la més nova a la més antiga', async () => {
    const nou = await comparaAmbHugo(await feedTerme('generes', 'documental', db), 'generes-documental-index.xml');
    expect(nou.items.map((i) => i.title)).toEqual(['La presó invisible / Executada', 'Carretera a Gusen']);
  });
});

describe('feeds RSS: dades i casos límit', () => {
  it('programació: títol del canal amb el títol de la pàgina i només les sessions', async () => {
    const f = llegeixFeed(xmlFeed(await feedProgramacio(db), BASE));
    expect(f.canal.title).toBe('Programació on Cineclub Roda de Berà');
    expect(f.canal.description).toBe('Recent content in Programació on Cineclub Roda de Berà');
    expect(f.canal.link).toBe(`${BASE}/programacio/`);
    expect(f.canal.atom).toBe(`${BASE}/programacio/index.xml`);
    expect(f.items).toHaveLength(11);
    expect(f.items[0].link).toBe(`${BASE}/programacio/2026/night-of-the-living-dead/`);
  });

  it('un terme amb accents: el canal i els enllaços van percent-encoded i el paràmetre pot ser decodificat', async () => {
    const f = llegeixFeed(xmlFeed(await feedTerme('directors', 'alauda-ruiz-de-azúa', db), BASE));
    expect(f.canal.title).toBe('Alauda Ruiz de Azúa on Cineclub Roda de Berà');
    expect(f.canal.link).toBe(`${BASE}/directors/alauda-ruiz-de-az%C3%BAa/`);
    expect(f.canal.atom).toBe(`${BASE}/directors/alauda-ruiz-de-az%C3%BAa/index.xml`);
    expect(f.items.map((i) => i.link)).toEqual([`${BASE}/programacio/2026/los-domingos/`]);
  });

  it('mai no hi surten sessions no publicades ni els termes que només aporten elles', async () => {
    const oculta = { id: 'oculta', titol: 'Sessio Fantasma', slug: 'sessio-fantasma', publicada: false, data: '2026-12-01', hora: '19:00', publica: { directors: ['Director Fantasma'], generes: ['Terror'], interprets: [], cos: '## Sinopsi\n\nContingut fantasma.' } };
    const amb = dbFals({ sessions: [...sessionsHugo, oculta], pagines });
    for (const feed of [await feedPortada(amb), await feedProgramacio(amb), await feedTaxonomia('directors', amb), await feedTerme('generes', 'terror', amb)]) {
      expect(xmlFeed(feed, BASE)).not.toMatch(/fantasma/i);
    }
    expect(await feedTerme('directors', 'director-fantasma', amb)).toBeNull();
    // El gènere compartit només mostra les sessions publicades.
    expect(llegeixFeed(xmlFeed(await feedTerme('generes', 'terror', amb), BASE)).items).toHaveLength(1);
  });

  it('terme o taxonomia desconeguts: null (404)', async () => {
    expect(await feedTerme('directors', 'no-existeix', db)).toBeNull();
    expect(await feedTerme('directors', '', db)).toBeNull();
    expect(await feedTerme('actors', 'x', db)).toBeNull();
    expect(await feedTaxonomia('actors', db)).toBeNull();
  });

  it('un segment amb forma impossible dona null SENSE llegir Firestore', async () => {
    const llegeix = { collection: () => { throw new Error('no s\'ha de llegir Firestore'); } };
    for (const dolent of ['', 'a'.repeat(201), 'a\u0000b', 'a\nb', '\u007f', undefined, 5]) {
      expect(await feedTerme('directors', dolent, llegeix), JSON.stringify(dolent)).toBeNull();
    }
  });

  it('sense sessions publicades el feed és vàlid, sense elements ni lastBuildDate', async () => {
    const buida = dbFals({ sessions: [], pagines });
    const f = llegeixFeed(xmlFeed(await feedProgramacio(buida), BASE));
    expect(f.items).toEqual([]);
    expect(f.canal.lastBuildDate).toBeUndefined();
  });

  it('una pàgina inexistent no surt a la portada', async () => {
    const { privacitat, ...resta } = contingut.pagines;
    const f = llegeixFeed(xmlFeed(await feedPortada(dbFals({ sessions: sessionsHugo, pagines: resta })), BASE));
    expect(f.items.map((i) => i.link)).not.toContain(`${BASE}/privacitat/`);
    expect(f.items).toHaveLength(13);
  });

  it('escapa &, < i > dels títols i de les descripcions', () => {
    const xml = xmlFeed({
      titolCanal: 'A & B', cami: '/', descripcio: '<x>',
      items: [{ titol: 'Secrets & Lies', cami: '/p/', descripcio: '<p>a &amp; b</p>' }],
    }, BASE);
    expect(xml).toContain('<title>A &amp; B</title>');
    expect(xml).toContain('<title>Secrets &amp; Lies</title>');
    expect(xml).toContain('<description>&lt;p&gt;a &amp;amp; b&lt;/p&gt;</description>');
  });
});

describe('rfc822', () => {
  it('format RFC 822 amb l\'ofset d\'Europe/Madrid (estiu i hivern)', () => {
    expect(rfc822('2026-10-22', '19:00')).toBe('Thu, 22 Oct 2026 19:00:00 +0200');
    expect(rfc822('2026-03-05', '19:00')).toBe('Thu, 05 Mar 2026 19:00:00 +0100');
    expect(rfc822('2026-05-09', '18:30')).toBe('Sat, 09 May 2026 18:30:00 +0200');
  });
});

describe('resumHtml (el .Summary de Hugo)', () => {
  const p = (n) => `<p>${Array.from({ length: n }, (_, i) => `w${i}`).join(' ')}</p>`;

  it('s\'atura al primer </p> un cop passades les 70 paraules, comptant també els atributs de les etiquetes', () => {
    expect(resumHtml(`<h2 id="a">T</h2>${p(30)}${p(30)}${p(30)}${p(30)}`)).toBe(`<h2 id="a">T</h2>${p(30)}${p(30)}${p(30)}`);
    const icona = '<svg xmlns="x" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true" class="icon">'
      + `<path ${'d="M1 1" '.repeat(30)}/>`;
    // L'encapçalament amb icona ja arriba a 70: el resum és el primer paràgraf.
    expect(resumHtml(`<h2>${icona}</svg></span> Sinopsi</h2>${p(5)}${p(5)}`)).toBe(`<h2>${icona}</svg>\n</span> Sinopsi</h2>${p(5)}`);
  });

  it('un contingut curt es deixa sencer, sense el salt de línia final', () => {
    expect(resumHtml(`${p(10)}\n`)).toBe(p(10));
  });

  it('només acaba en un </p>: una llista que supera el límit s\'inclou fins al paràgraf següent', () => {
    const llista = `<ul>${'<li>una dues tres quatre cinc</li>\n'.repeat(15)}</ul>`;
    expect(resumHtml(`${llista}${p(3)}${p(3)}`)).toBe(`${llista}${p(3)}`);
  });

  it('reprodueix el salt de línia que Hugo deixa després de la icona de l\'encapçalament', () => {
    expect(resumHtml('<h2><span class="prose-heading__icon"><svg a b c></svg></span> Sinopsi</h2><p>x</p>', 1))
      .toBe('<h2><span class="prose-heading__icon"><svg a b c></svg>\n</span> Sinopsi</h2><p>x</p>');
  });
});

describe('feeds (endpoints)', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => { vi.doUnmock('../src/lib/db.js'); vi.unstubAllEnvs(); });

  async function carrega(modul) {
    vi.stubEnv('PUBLIC_SITE_URL', BASE);
    vi.doMock('../src/lib/db.js', async (importOriginal) => ({ ...(await importOriginal()), getDb: () => db }));
    return import(modul);
  }

  it('portada, programació i índexs: application/rss+xml, caché curta i URL sobre SITE_URL', async () => {
    const { CACHE_AVUI } = await import('../src/lib/cache.js');
    for (const [modul, canal] of [
      ['../src/pages/index.xml.js', `${BASE}/`],
      ['../src/pages/programacio/index.xml.js', `${BASE}/programacio/`],
      ['../src/pages/directors/index.xml.js', `${BASE}/directors/`],
      ['../src/pages/generes/index.xml.js', `${BASE}/generes/`],
      ['../src/pages/interprets/index.xml.js', `${BASE}/interprets/`],
    ]) {
      const { GET } = await carrega(modul);
      const res = await GET({ params: {} });
      expect(res.status, modul).toBe(200);
      expect(res.headers.get('Content-Type'), modul).toBe('application/rss+xml; charset=utf-8');
      expect(res.headers.get('Cache-Control'), modul).toBe(CACHE_AVUI);
      expect(llegeixFeed(await res.text()).canal.link, modul).toBe(canal);
    }
  });

  it('termes: el feed del terme i 404 si no existeix', async () => {
    for (const [modul, terme, titol] of [
      ['../src/pages/directors/[terme]/index.xml.js', 'mike-leigh', 'Mike Leigh'],
      ['../src/pages/generes/[terme]/index.xml.js', 'drama', 'Drama'],
      ['../src/pages/interprets/[terme]/index.xml.js', 'miguel-garcés', 'Miguel Garcés'],
    ]) {
      const { GET } = await carrega(modul);
      const res = await GET({ params: { terme } });
      expect(res.status, modul).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/rss+xml; charset=utf-8');
      expect(llegeixFeed(await res.text()).canal.title).toBe(`${titol} on Cineclub Roda de Berà`);
      const absent = await GET({ params: { terme: 'no-existeix' } });
      expect(absent.status, modul).toBe(404);
      expect(absent.headers.get('Content-Type')).not.toContain('rss');
    }
  });
});
