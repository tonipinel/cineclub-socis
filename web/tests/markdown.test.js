import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderMarkdown, renderMarkdownInline, textPla } from '../src/lib/markdown.js';
import { normalitza } from './helpers/html.js';

const fixture = (nom) => JSON.parse(readFileSync(new URL(`./fixtures/${nom}`, import.meta.url), 'utf8'));

describe('renderMarkdown', () => {
  it('renderitza paràgrafs amb la tipografia de Hugo (apòstrofs i cometes)', () => {
    expect(renderMarkdown("En Rob és un xef d'alta cuina.")).toBe('<p>En Rob és un xef d&rsquo;alta cuina.</p>\n');
    expect(renderMarkdown('Diu "hola" i se\'n va...')).toBe('<p>Diu &ldquo;hola&rdquo; i se&rsquo;n va&hellip;</p>\n');
  });

  it('afegeix la icona i l\'id als encapçalaments de secció de la sessió', () => {
    const html = renderMarkdown('## Sinopsi\n\nText');
    expect(html).toMatch(/^<h2 id="sinopsi"><span class="prose-heading__icon"><svg [^>]*icon--book-open"/);
    expect(html).toContain('</svg></span> Sinopsi</h2>');
    expect(renderMarkdown('## Context')).toContain('icon--map"');
    expect(renderMarkdown('## Curiositats')).toContain('icon--light-bulb"');
    expect(renderMarkdown("## Per què l'hem programat?")).toContain('icon--academic-cap"');
  });

  it('calcula l\'id com Hugo (minúscules, accents, sense apòstrof ni signes) i desduplica', () => {
    expect(renderMarkdown("## Per què l'hem programat?")).toContain('<h2 id="per-què-lhem-programat">');
    expect(renderMarkdown('## Altra\n\n## Altra')).toBe('<h2 id="altra">Altra</h2><h2 id="altra-1">Altra</h2>');
  });

  it('no posa icona als altres encapçalaments', () => {
    expect(renderMarkdown('### Altre títol')).toBe('<h3 id="altre-títol">Altre títol</h3>');
  });

  it('reprodueix els dos encapçalaments especials de la portada', () => {
    expect(renderMarkdown('# Un nou espai de cinema a Roda de Berà'))
      .toBe('<h1 id="un-nou-espai-de-cinema-a-roda-de-berà">Un nou espai de cinema<br><span class="text-gold">A Roda de Berà</span></h1>');
    expect(renderMarkdown('## Com funciona la programació'))
      .toBe('<h2 id="com-funciona-la-programació">Com funciona<br><span class="text-gold">la programació</span></h2>');
  });

  it('els autoenllaços «www.» s\'emeten amb https, com el linkify de Hugo', () => {
    expect(renderMarkdown('Mira www.aepd.es.'))
      .toBe('<p>Mira <a href="https://www.aepd.es" target="_blank" rel="noopener">www.aepd.es</a>.</p>\n');
    expect(renderMarkdown('[web](http://www.aepd.es)')).toContain('href="http://www.aepd.es"');
  });

  it('obre en pestanya nova només els enllaços externs', () => {
    expect(renderMarkdown('[web](https://exemple.cat/a?x=1&y=2)'))
      .toBe('<p><a href="https://exemple.cat/a?x=1&amp;y=2" target="_blank" rel="noopener">web</a></p>\n');
    expect(renderMarkdown('[socia](/fes-te-socia/)')).toBe('<p><a href="/fes-te-socia/">socia</a></p>\n');
  });

  it('omet l\'HTML en brut, com Hugo sense unsafe', () => {
    expect(renderMarkdown('<script>alert(1)</script>\n\nText')).toBe('<!-- raw HTML omitted -->\n<p>Text</p>\n');
    expect(renderMarkdown('Hola <b>tu</b>')).toBe('<p>Hola <!-- raw HTML omitted -->tu<!-- raw HTML omitted --></p>\n');
  });

  it('renderitza llistes, èmfasi i text buit', () => {
    expect(renderMarkdown('- **A**\n- B')).toBe('<ul>\n<li><strong>A</strong></li>\n<li>B</li>\n</ul>\n');
    expect(renderMarkdown('')).toBe('');
    expect(renderMarkdown(undefined)).toBe('');
  });
});

describe('renderMarkdown amb el contingut real de privacitat', () => {
  it('produeix el mateix HTML que Hugo per a la política de privacitat', () => {
    const { cos, html } = fixture('hugo-privacitat.json');
    expect(normalitza(renderMarkdown(cos))).toBe(normalitza(html));
  });
});

describe('renderMarkdownInline (markdownify de Hugo)', () => {
  it('treu el <p> quan el resultat és un sol paràgraf', () => {
    expect(renderMarkdownInline("Hola d'aquí.\n")).toBe('Hola d&rsquo;aquí.');
    expect(renderMarkdownInline('**negreta** i [enllaç](/a/)')).toBe('<strong>negreta</strong> i <a href="/a/">enllaç</a>');
  });
  it('conserva els <p> quan hi ha diversos paràgrafs o altres blocs', () => {
    expect(renderMarkdownInline('A\n\nB')).toBe('<p>A</p>\n<p>B</p>');
    expect(renderMarkdownInline('- A\n- B')).toBe('<ul>\n<li>A</li>\n<li>B</li>\n</ul>');
  });
  it('tolera text buit', () => {
    expect(renderMarkdownInline('')).toBe('');
    expect(renderMarkdownInline(null)).toBe('');
  });
  it('coincideix amb Hugo en les 16 respostes de les preguntes freqüents', () => {
    for (const { resposta, html, pregunta } of fixture('hugo-faq.json')) {
      expect(normalitza(renderMarkdownInline(resposta)), pregunta).toBe(normalitza(html));
    }
  });
});

describe('textPla (plainify de Hugo)', () => {
  it('treu les etiquetes, separa paràgrafs amb salt de línia i col·lapsa els espais', () => {
    expect(textPla('<p>A</p>\n<p>B</p>\n')).toBe('A\nB\n');
    expect(textPla('<p>Llista:</p>\n<ul>\n<li>U</li>\n<li>Dos</li>\n</ul>\n')).toBe('Llista:\nU Dos ');
    expect(textPla('a<br>b <b>c</b>')).toBe('a\nb c');
  });
  it('no desescapa les entitats (com Hugo)', () => {
    expect(textPla('<p>d&rsquo;alta</p>')).toBe('d&rsquo;alta\n');
  });
  it('coincideix amb el JSON-LD de Hugo en les 16 respostes de les preguntes freqüents', () => {
    for (const { resposta, text, pregunta } of fixture('hugo-faq.json')) {
      expect(textPla(renderMarkdownInline(resposta)), pregunta).toBe(text);
    }
  });
});
