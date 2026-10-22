// Caràcters que XML 1.0 no admet (controls tret de tab, LF i CR).
// eslint-disable-next-line no-control-regex
const CONTROLS_ILLEGALS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

// Escapa el text per a un contingut XML; accepta qualsevol valor.
export const escapaXml = (valor) => String(valor)
  .replace(CONTROLS_ILLEGALS, '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

// Escapa text per inserir-lo com a HTML (`set:html`), també dins d'atributs.
export const escapaHtml = (valor) => String(valor)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
