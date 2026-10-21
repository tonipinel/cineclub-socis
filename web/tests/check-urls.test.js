import { describe, it, expect } from 'vitest';
import {
  llegeixSitemap,
  extreuTitol,
  extreuCanonical,
  extreuDescripcio,
  extreuJsonLd,
  comparaPagines,
  pathDe,
  llegeixAliases,
  aplicaPermet,
} from '../scripts/check-urls-lib.mjs';

// HTML minificat com el de Hugo (atributs sense cometes) i HTML com el d'Astro (amb cometes).
const hugo = '<!doctype html><html lang=ca><head><title>Pig · Cineclub Roda de Berà</title>'
  + '<meta name=description content="Una història d\'un cuiner &amp; el seu porc.">'
  + '<link rel=canonical href=https://cineclubrodadebera.cat/programacio/2026/pig/>'
  + '<script type=application/ld+json>{"@type":"Event","name":"Pig","url":"https://cineclubrodadebera.cat/programacio/2026/pig/","a":1,"b":2}</script>'
  + '<script type=application/ld+json>{"@type":"BreadcrumbList"}</script></head><body></body></html>';
const nova = `<!DOCTYPE html><html lang="ca"><head>
<meta charset="utf-8">
<title>Pig · Cineclub Roda de Berà</title>
<meta name="description" content="Una història d&#39;un cuiner &amp; el seu porc.">
<link rel="canonical" href="https://cineclub-web.web.app/programacio/2026/pig/">
<script type="application/ld+json">{"b":2,"a":1,"url":"https://cineclub-web.web.app/programacio/2026/pig/","name":"Pig","@type":"Event"}</script>
<script type="application/ld+json">{"@type":"BreadcrumbList"}</script>
</head><body></body></html>`;

describe('extractors', () => {
  it('extreuTitol', () => {
    expect(extreuTitol(hugo)).toBe('Pig · Cineclub Roda de Berà');
    expect(extreuTitol(nova)).toBe('Pig · Cineclub Roda de Berà');
    expect(extreuTitol('<p>res</p>')).toBeNull();
    expect(extreuTitol('<title>Tom &amp; Jerry</title>')).toBe('Tom & Jerry');
  });

  it('extreuCanonical retorna l\'href, amb o sense cometes', () => {
    expect(extreuCanonical(hugo)).toBe('https://cineclubrodadebera.cat/programacio/2026/pig/');
    expect(extreuCanonical(nova)).toBe('https://cineclub-web.web.app/programacio/2026/pig/');
    expect(extreuCanonical('<link rel="icon" href="/x.ico">')).toBeNull();
  });

  it('extreuDescripcio decodifica les entitats i no es confon amb og:description', () => {
    expect(extreuDescripcio(hugo)).toBe('Una història d\'un cuiner & el seu porc.');
    expect(extreuDescripcio(nova)).toBe('Una història d\'un cuiner & el seu porc.');
    expect(extreuDescripcio('<meta property="og:description" content="x">')).toBeNull();
  });

  it('extreuJsonLd retorna cada bloc parsejat, en ordre', () => {
    expect(extreuJsonLd(hugo)).toEqual([
      { '@type': 'Event', name: 'Pig', url: 'https://cineclubrodadebera.cat/programacio/2026/pig/', a: 1, b: 2 },
      { '@type': 'BreadcrumbList' },
    ]);
    expect(extreuJsonLd('<p>res</p>')).toEqual([]);
  });

  it('extreuJsonLd marca els blocs que no són JSON vàlid', () => {
    const [bloc] = extreuJsonLd('<script type="application/ld+json">{trencat</script>');
    expect(bloc).toEqual({ __errorJson: '{trencat' });
  });

  it('pathDe treu l\'origen i conserva el camí tal com ve', () => {
    expect(pathDe('https://cineclubrodadebera.cat/directors/alauda-ruiz-de-az%C3%BAa/')).toBe('/directors/alauda-ruiz-de-az%C3%BAa/');
    expect(pathDe('/programacio/')).toBe('/programacio/');
  });
});

describe('llegeixSitemap', () => {
  it('retorna el camí de cada <loc>, amb o sense <lastmod>', () => {
    const xml = '<?xml version="1.0"?><urlset><url><loc>https://cineclubrodadebera.cat/</loc><lastmod>2026-08-20T00:00:00+00:00</lastmod></url>'
      + '<url><loc>https://cineclubrodadebera.cat/generes/%C3%A8poca/</loc></url></urlset>';
    expect(llegeixSitemap(xml)).toEqual(['/', '/generes/%C3%A8poca/']);
  });
  it('desescapa &amp; dels <loc>', () => {
    expect(llegeixSitemap('<urlset><url><loc>https://x.cat/a&amp;b/</loc></url></urlset>')).toEqual(['/a&b/']);
  });
});

describe('comparaPagines', () => {
  it('no troba diferències entre equivalents (orígens diferents, ordre de claus, entitats)', () => {
    expect(comparaPagines(hugo, nova)).toEqual([]);
  });

  it('detecta títol, canonical, descripció i JSON-LD diferents', () => {
    const diferent = nova
      .replace('<title>Pig', '<title>Porc')
      .replace('programacio/2026/pig/">\n<script', 'programacio/pig/">\n<script')
      .replace('cuiner', 'xef')
      .replace('"name":"Pig"', '"name":"Porc"');
    const camps = comparaPagines(hugo, diferent).map((d) => d.camp);
    expect(camps).toEqual(['title', 'canonical', 'description', 'jsonld']);
  });

  it('el canonical es compara pel camí, no per l\'origen, i amb els accents normalitzats', () => {
    const a = '<link rel=canonical href=https://a.cat/directors/alauda-ruiz-de-az%C3%BAa/>';
    const b = '<link rel="canonical" href="https://b.cat/directors/alauda-ruiz-de-azúa/">';
    expect(comparaPagines(a, b)).toEqual([]);
  });

  it('detecta un bloc JSON-LD que falta o sobra', () => {
    const senseBreadcrumb = nova.replace('<script type="application/ld+json">{"@type":"BreadcrumbList"}</script>', '');
    const [d] = comparaPagines(hugo, senseBreadcrumb);
    expect(d.camp).toBe('jsonld');
  });

  it('un camp que falta a un costat és una diferència', () => {
    expect(comparaPagines(hugo, '<title>Pig · Cineclub Roda de Berà</title>').map((d) => d.camp)).toEqual(['canonical', 'description', 'jsonld']);
  });
});

describe('llegeixAliases', () => {
  it('troba les pàgines de redirecció de Hugo (meta refresh)', () => {
    const fitxers = {
      'programacio/25-de-juny-pig/index.html': '<!doctype html><html lang=ca><head><title>https://cineclubrodadebera.cat/programacio/2026/pig/</title><link rel=canonical href=https://cineclubrodadebera.cat/programacio/2026/pig/><meta charset=utf-8><meta http-equiv=refresh content="0; url=https://cineclubrodadebera.cat/programacio/2026/pig/"></head></html>',
      'programacio/5-de-març-the-artist/index.html': '<meta http-equiv="refresh" content="0; url=https://cineclubrodadebera.cat/programacio/2026/the-artist/">',
      'programacio/2026/pig/index.html': hugo,
    };
    expect(llegeixAliases(fitxers)).toEqual([
      { alias: '/programacio/25-de-juny-pig/', desti: '/programacio/2026/pig/' },
      { alias: '/programacio/5-de-març-the-artist/', desti: '/programacio/2026/the-artist/' },
    ]);
  });
});

describe('aplicaPermet', () => {
  const permet = [
    { path: '/interprets/judith-odea/', estat: 404, motiu: 'Sessió Xarxa no migrada' },
    { path: '/programacio/2026/x/', camps: ['description'], motiu: 'Descripció diferent a propòsit' },
  ];

  it('un estat esperat convertit en coneguda s\'etiqueta amb el motiu', () => {
    const r = aplicaPermet([{ path: '/interprets/judith-odea/', camp: 'status', hugo: 200, nova: 404 }], permet);
    expect(r.inesperades).toEqual([]);
    expect(r.conegudes).toEqual([{ path: '/interprets/judith-odea/', camp: 'status', hugo: 200, nova: 404, motiu: 'Sessió Xarxa no migrada' }]);
  });

  it('un altre estat al mateix camí és inesperat', () => {
    const r = aplicaPermet([{ path: '/interprets/judith-odea/', camp: 'status', hugo: 200, nova: 500 }], permet);
    expect(r.inesperades).toHaveLength(1);
  });

  it('només permet els camps llistats', () => {
    const r = aplicaPermet([
      { path: '/programacio/2026/x/', camp: 'description', hugo: 'a', nova: 'b' },
      { path: '/programacio/2026/x/', camp: 'title', hugo: 'a', nova: 'b' },
    ], permet);
    expect(r.conegudes.map((d) => d.camp)).toEqual(['description']);
    expect(r.inesperades.map((d) => d.camp)).toEqual(['title']);
  });

  it('diferències sense entrada al permet són inesperades', () => {
    const r = aplicaPermet([{ path: '/altra/', camp: 'title', hugo: 'a', nova: 'b' }], permet);
    expect(r.conegudes).toEqual([]);
    expect(r.inesperades).toHaveLength(1);
  });
});
