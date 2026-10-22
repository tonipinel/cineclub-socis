// Funcions pures de `visual-snapshot.mjs`: quines pàgines es capturen, com es diuen els fitxers i
// com es comparen dues captures. No toquen ni el navegador ni el disc, per poder-les provar.
import { llegeixSitemap } from './check-urls-lib.mjs';

// Propietats calculades que es guarden de cada element.
export const PROPIETATS = [
  'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing',
  'text-transform', 'text-decoration-line', 'text-decoration-style', 'text-decoration-color',
  'text-align', 'text-shadow', 'white-space', 'vertical-align', 'list-style-type',
  'color', 'background-color', 'background-image', 'background-size', 'background-position',
  'background-repeat', 'background-blend-mode',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
  'outline-width', 'outline-style', 'outline-color', 'outline-offset',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index', 'box-sizing',
  'row-gap', 'column-gap', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
  'justify-content', 'align-items', 'align-self', 'align-content',
  'grid-template-columns', 'grid-template-rows', 'grid-column-start', 'grid-column-end',
  'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height', 'aspect-ratio',
  'overflow-x', 'overflow-y', 'object-fit', 'visibility', 'opacity', 'filter', 'cursor', 'pointer-events',
  'box-shadow', 'transform', 'translate', 'scale', 'rotate',
  'transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay',
  'scroll-snap-type', 'scroll-snap-align', 'text-overflow', 'overflow-wrap', 'word-break', 'list-style-position',
  '-webkit-line-clamp', 'user-select', 'resize', 'mix-blend-mode', 'isolation', 'backdrop-filter',
  'background-clip', 'background-origin', 'font-feature-settings', 'font-variation-settings',
  '-webkit-font-smoothing', 'text-rendering', 'tab-size', '-webkit-text-size-adjust', '-webkit-tap-highlight-color',
  'appearance', 'accent-color', 'caret-color', 'fill', 'stroke', 'stroke-width', 'object-position',
];

// Propietats dels pseudoelements (només dels que existeixen: `content` diferent de `none`).
export const PROPIETATS_PSEUDO = [
  'content', 'display', 'position', 'color', 'background-color', 'width', 'height',
  'top', 'right', 'bottom', 'left', 'transform', 'translate',
  'border-top-width', 'border-top-style', 'border-top-color',
  'border-left-width', 'border-left-color', 'border-right-width', 'border-right-color',
];

// Pàgines fixes; s'hi afegeixen totes les sessions i el primer terme de cada taxonomia del sitemap.
export const CAMINS_FIXOS = [
  '/', '/programacio/', '/preguntes-frequents/', '/privacitat/', '/fes-te-socia/',
  '/directors/', '/generes/', '/interprets/',
];
export const AMPLADES = [1280, 768, 375];
const TAXONOMIES = ['directors', 'generes', 'interprets'];

// Camins a capturar a partir del sitemap de la web: fixos, sessions (`/programacio/<any>/<slug>/`)
// i un terme de cada taxonomia (el primer per ordre alfabètic, perquè sigui estable).
export function seleccionaCamins(xmlSitemap) {
  const camins = llegeixSitemap(xmlSitemap);
  const sessions = camins.filter((c) => /^\/programacio\/\d{4}\/[^/]+\/$/.test(c)).sort();
  const termes = TAXONOMIES.map((t) =>
    camins.filter((c) => new RegExp(`^/${t}/[^/]+/$`).test(c)).sort()[0]).filter(Boolean);
  return [...CAMINS_FIXOS.slice(0, 2), ...sessions, ...CAMINS_FIXOS.slice(2), ...termes];
}

// Nom de fitxer (sense extensió) d'una captura: `/programacio/2026/pig/` a 375 -> `programacio_2026_pig@375`.
export function nomCaptura(cami, amplada) {
  const net = decodeURIComponent(cami).normalize('NFC').replace(/^\/|\/$/g, '').replace(/[^\p{L}\p{N}.-]+/gu, '_');
  return `${net || 'inici'}@${amplada}`;
}

const RECT = ['x', 'y', 'width', 'height'];

// Compara dues captures (`{ scrollHeight, elements: [{ cami, classe, rect, estil, pseudo }] }`) i torna
// la llista de diferències `{ element, propietat, abans, despres }`. Els rectangles admeten
// `tolerancia` px; la resta de valors han de ser idèntics.
export function comparaCaptures(abans, despres, { tolerancia = 0.5 } = {}) {
  const dif = [];
  const afegeix = (element, propietat, a, d) => dif.push({ element, propietat, abans: a, despres: d });
  if (abans.scrollHeight !== despres.scrollHeight) afegeix('document', 'scrollHeight', abans.scrollHeight, despres.scrollHeight);

  const mapaDespres = new Map(despres.elements.map((e) => [e.cami, e]));
  const vistos = new Set();
  for (const a of abans.elements) {
    const nom = etiqueta(a);
    const d = mapaDespres.get(a.cami);
    if (!d) { afegeix(nom, '(element)', 'present', 'absent'); continue; }
    vistos.add(a.cami);
    for (const k of RECT) {
      if (Math.abs(a.rect[k] - d.rect[k]) > tolerancia) afegeix(nom, `rect.${k}`, a.rect[k], d.rect[k]);
    }
    comparaMapes(a.estil, d.estil, (p, va, vd) => afegeix(nom, p, va, vd));
    const pseudos = new Set([...Object.keys(a.pseudo ?? {}), ...Object.keys(d.pseudo ?? {})]);
    for (const ps of pseudos) {
      const pa = a.pseudo?.[ps];
      const pd = d.pseudo?.[ps];
      if (!pa || !pd) { afegeix(nom, ps, pa ? 'present' : 'absent', pd ? 'present' : 'absent'); continue; }
      comparaMapes(pa, pd, (p, va, vd) => afegeix(nom, `${ps} ${p}`, va, vd));
    }
  }
  for (const d of despres.elements) {
    if (!vistos.has(d.cami)) afegeix(etiqueta(d), '(element)', 'absent', 'present');
  }
  return dif;
}

// Camí de l'element amb la primera classe, perquè la diferència es pugui llegir.
const etiqueta = (e) => (e.classe ? `${e.cami} (.${e.classe})` : e.cami);

function comparaMapes(a, d, avisa) {
  for (const p of new Set([...Object.keys(a), ...Object.keys(d)])) {
    if (a[p] !== d[p]) avisa(p, a[p], d[p]);
  }
}

// Text curt per a una llista de diferències d'una captura (`maxim` línies com a molt).
export function formataDiferencies(nom, diferencies, { maxim = 40 } = {}) {
  const linies = diferencies.slice(0, maxim).map(({ element, propietat, abans, despres }) =>
    `  ${element}  ${propietat}: ${abans} → ${despres}`);
  if (diferencies.length > maxim) linies.push(`  … i ${diferencies.length - maxim} més`);
  return [`${nom}: ${diferencies.length} diferències`, ...linies].join('\n');
}
