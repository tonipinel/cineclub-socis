import { describe, it, expect } from 'vitest';
import { escapaXml } from '../src/lib/xml.js';
import { xmlSitemap } from '../src/lib/sitemap.js';

describe('escapaXml', () => {
  it('escapa &, < i >', () => {
    expect(escapaXml('a & <b>')).toBe('a &amp; &lt;b&gt;');
  });
  it('converteix els valors que no són text amb String', () => {
    expect(escapaXml(42)).toBe('42');
    expect(escapaXml(null)).toBe('null');
    expect(escapaXml(undefined)).toBe('undefined');
  });
  it('treu els caràcters de control que XML 1.0 no admet i manté tab, LF i CR', () => {
    expect(escapaXml('a\u0000b\u0008c\u000Bd\u001Fe\uFFFFf')).toBe('abcdef');
    expect(escapaXml('a\tb\nc\rd')).toBe('a\tb\nc\rd');
  });
  it('el sitemap no emet caràcters de control ni trenca amb una ruta que no és text', () => {
    const xml = xmlSitemap([{ cami: '/a\u0001b/' }, { cami: 7 }], 'https://x.cat');
    expect(xml).toContain('<loc>https://x.cat/ab/</loc>');
    expect(xml).toContain('<loc>https://x.cat7</loc>');
    expect(xml).not.toMatch(/\u0001/);
  });
});

describe('escapaHtml', () => {
  it('escapa el text per a set:html', async () => {
    const { escapaHtml } = await import('../src/lib/xml.js');
    expect(escapaHtml('<img src=x onerror="a()"> & \'b\'')).toBe('&lt;img src=x onerror=&quot;a()&quot;&gt; &amp; &#39;b&#39;');
    expect(escapaHtml(3)).toBe('3');
  });
});
