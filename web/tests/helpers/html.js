// Normalitza l'HTML minificat de Hugo (atributs sense cometes, sense salts de línia entre etiquetes)
// i el d'Astro perquè es puguin comparar com a text.
const ATRIBUT = /([^\s=/>]+)(?:=("[^"]*"|'[^']*'|[^\s>]+))?/g;

export const normalitza = (html) => html
  .replace(/&mldr;/g, '&hellip;')
  .replace(/>\s*\n\s*</g, '><')
  .replace(/<([a-zA-Z][\w-]*)((?:\s+[^\s=/>]+(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g, (_, nom, atributs, tanca) => {
    const llista = [...atributs.matchAll(ATRIBUT)].map(([, clau, valor]) => {
      const net = valor === undefined ? '' : valor.replace(/^["']|["']$/g, '');
      return `${clau}="${net}"`;
    });
    return `<${nom}${llista.length ? ` ${llista.join(' ')}` : ''}${tanca}>`;
  })
  .trim();
