import { Marked } from 'marked';
import { iconaSvg } from './icones.js';

// Reprodueix el Markdown de Hugo (goldmark): tipografia, ids dels encapçalaments, HTML en brut
// omès i els render hooks de layouts/_default/_markup/ (render-heading.html i render-link.html).

const ICONES_ENCAPCALAMENT = [
  ['Sinopsi', 'book-open'],
  ['Context', 'map'],
  ['Curiositats', 'light-bulb'],
];
const iconaEncapcalament = (text) => {
  const exacta = ICONES_ENCAPCALAMENT.find(([titol]) => titol === text);
  if (exacta) return exacta[1];
  return text.startsWith('Per què') ? 'academic-cap' : '';
};

const ENTITATS = { '&#39;': "'", '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>' };
const text = (html) => html.replace(/<[^>]*>/g, '').replace(/&#39;|&quot;|&amp;|&lt;|&gt;/g, (e) => ENTITATS[e]);

// Id automàtic d'encapçalament com el de goldmark (`autoHeadingIDType: github`): minúscules,
// espais a "-", només lletres, xifres, "-" i "_". Els repetits reben -1, -2...
function creaIds() {
  const usats = new Map();
  return (html) => {
    const base = text(html).toLowerCase().trim().replace(/\s/g, '-').replace(/[^\p{L}\p{N}\p{M}\-_]/gu, '') || 'heading';
    const n = usats.get(base) ?? 0;
    usats.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  };
}

const escapaAtribut = (valor) => valor.replace(/&(?!amp;)/g, '&amp;').replace(/"/g, '&quot;');

// Equivalent al `typographer` de goldmark (substitucions per defecte de Hugo). Només toca el text:
// no els atributs ni `<code>`, `<pre>` o els comentaris. Les cometes s'obren o es tanquen segons
// els caràcters del voltant, amb el criteri de flanc de CommonMark.
const INLINE = /^<\/?(a|strong|em|del|span|img)[\s>/]/i;
const esBlanc = (c) => c === '' || /\s/.test(c);
const esPuntuacio = (c) => c !== '' && /[\p{P}\p{S}]/u.test(c);

function tipografia(html) {
  let anterior = '';
  return html.split(/(<!--[\s\S]*?-->|<pre[\s\S]*?<\/pre>|<code>[\s\S]*?<\/code>|<[^>]+>)/).map((tros, i) => {
    if (i % 2) {
      if (!INLINE.test(tros)) anterior = '';
      return tros;
    }
    const net = tros.replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    let sortida = '';
    for (let j = 0; j < net.length; j += 1) {
      const c = net[j];
      if (c === '"' || c === "'") {
        const abans = j ? net[j - 1] : anterior;
        const despres = net[j + 1] ?? '';
        const esquerra = !esBlanc(despres) && (!esPuntuacio(despres) || esBlanc(abans) || esPuntuacio(abans));
        const dreta = !esBlanc(abans) && (!esPuntuacio(abans) || esBlanc(despres) || esPuntuacio(despres));
        const obre = esquerra && (!dreta || esPuntuacio(despres));
        sortida += c === '"' ? (obre ? '&ldquo;' : '&rdquo;') : (obre ? '&lsquo;' : '&rsquo;');
      } else {
        sortida += c;
      }
    }
    if (net) anterior = net[net.length - 1];
    return sortida
      .replace(/---/g, '&mdash;')
      .replace(/--/g, '&ndash;')
      .replace(/\.\.\./g, '&hellip;')
      .replace(/&lt;&lt;/g, '&laquo;')
      .replace(/&gt;&gt;/g, '&raquo;');
  }).join('');
}

const OMES = '<!-- raw HTML omitted -->';

export function renderMarkdown(origen) {
  if (!origen) return '';
  const idDe = creaIds();
  const marked = new Marked({
    gfm: true,
    renderer: {
      html: ({ block }) => (block ? `${OMES}\n` : OMES),
      heading({ tokens, depth }) {
        const contingut = this.parser.parseInline(tokens);
        const id = idDe(contingut);
        const titol = text(contingut);
        if (titol === 'Un nou espai de cinema a Roda de Berà') {
          return `<h${depth} id="${id}">Un nou espai de cinema<br><span class="text-gold">A Roda de Berà</span></h${depth}>`;
        }
        if (titol === 'Com funciona la programació') {
          return `<h${depth} id="${id}">Com funciona<br><span class="text-gold">la programació</span></h${depth}>`;
        }
        const icona = iconaEncapcalament(titol);
        const prefix = icona ? `<span class="prose-heading__icon">${iconaSvg(icona)}</span> ` : '';
        return `<h${depth} id="${id}">${prefix}${contingut}</h${depth}>`;
      },
      link({ href, text, tokens }) {
        // Autoenllaç `www.x.cat` sense protocol: Hugo (`linkifyProtocol`) el fa https, marked http.
        if (/^http:\/\/www\./.test(href) && text === href.slice('http://'.length)) href = `https://${text}`;
        const extern = href.startsWith('http') ? ' target="_blank" rel="noopener"' : '';
        return `<a href="${escapaAtribut(href)}"${extern}>${this.parser.parseInline(tokens)}</a>`;
      },
    },
  });
  return tipografia(marked.parse(origen));
}

// `markdownify` de Hugo: com `renderMarkdown`, però si el resultat té un sol paràgraf se li treu el
// `<p>` (`TrimShortHTML`: un únic `<p>` al resultat; es treuen el `<p>` inicial i el `</p>` final).
export function renderMarkdownInline(origen) {
  const html = renderMarkdown(origen).trim();
  if (html.split('<p>').length - 1 !== 1) return html;
  return html.replace(/^<p>/, '').replace(/<\/p>$/, '');
}

// `plainify` de Hugo (`StripHTML`): els salts de línia passen a espai, `</p>` i `<br>` a salt de
// línia, s'eliminen les etiquetes i els blancs consecutius es redueixen al primer. Les entitats
// (`&rsquo;`) no es desfan.
export function textPla(html) {
  const net = html.replace(/\r|\n|<\/p>|<br>|<br \/>/g, (m) => (m === '\r' || m === '\n' ? ' ' : '\n'));
  let sortida = '';
  let dinsEtiqueta = false;
  let blancAnterior = false;
  for (const c of net) {
    if (c === '<') dinsEtiqueta = true;
    else if (c === '>') dinsEtiqueta = false;
    else if (!dinsEtiqueta) {
      const blanc = /\s/.test(c);
      if (!blanc || !blancAnterior) sortida += c;
      blancAnterior = blanc;
    }
  }
  return sortida;
}
