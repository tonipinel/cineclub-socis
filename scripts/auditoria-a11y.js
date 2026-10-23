// Comprovacions d'accessibilitat i estructura de l'auditoria (`audit-overflow-mobil.mjs`).
// Cada funció és autònoma (no fa servir res de fora): l'script les executa dins la pàgina amb
// `page.evaluate(fn)` i les proves les executen sobre el DOM de jsdom.

// Camps visibles (<input>, <select>, <textarea>, no `type=hidden`) sense nom accessible: aria-label,
// aria-labelledby o <label> (associada o que l'envolta) amb text. `title` i `placeholder` no compten.
// L'input de fitxer ocult visualment (clip) de `SelectorFitxer` s'hi inclou: només s'ignora el que
// té `display: none`/`visibility: hidden` o `hidden`.
export function campsSenseNom(doc = document) {
  const text = (node) => {
    const clon = node.cloneNode(true);
    clon.querySelectorAll('input, select, textarea, option').forEach((c) => c.remove());
    return (clon.textContent ?? '').replace(/\s+/g, ' ').trim();
  };
  const visible = (el) => {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      if (e.hasAttribute('hidden') || e.getAttribute('aria-hidden') === 'true' && e !== el) return false;
      const estil = e.ownerDocument.defaultView.getComputedStyle(e);
      if (estil.display === 'none' || estil.visibility === 'hidden') return false;
    }
    return true;
  };
  const nom = (el) => {
    if ((el.getAttribute('aria-label') ?? '').trim()) return true;
    const ids = (el.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
    if (ids.some((id) => { const n = doc.getElementById(id); return n && text(n); })) return true;
    if (['submit', 'button', 'reset'].includes(el.type) && el.value) return true;
    return [...(el.labels ?? [])].some((l) => text(l));
  };
  const descriu = (el) => {
    const etiqueta = el.tagName.toLowerCase();
    const tipus = etiqueta === 'input' ? `[type=${el.type}]` : '';
    const id = el.id ? `#${el.id}` : '';
    const nomAttr = el.getAttribute('name') ? `[name=${el.getAttribute('name')}]` : '';
    const classe = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
    const pista = el.getAttribute('placeholder') ?? el.getAttribute('title') ?? '';
    return `${etiqueta}${tipus}${id}${nomAttr}${classe}${pista ? ` «${pista}»` : ''}`;
  };
  return [...doc.querySelectorAll('input, select, textarea')]
    .filter((el) => el.type !== 'hidden' && visible(el) && !nom(el))
    .map(descriu);
}

// Nombre de <h1> visibles.
export function nombreH1(doc = document) {
  return [...doc.querySelectorAll('h1')].filter((h) => {
    const estil = h.ownerDocument.defaultView.getComputedStyle(h);
    return estil.display !== 'none' && estil.visibility !== 'hidden' && !h.closest('[hidden]');
  }).length;
}

// Amplada (px) del contenidor principal `.pagina-admin`, o null si la pàgina no en té.
export function ampladaContenidor(doc = document) {
  const el = doc.querySelector('.pagina-admin');
  return el ? Math.round(el.getBoundingClientRect().width) : null;
}

export const AMPLADES_ESTANDARD = [1280, 1024, 768];
export const TOLERANCIA_AMPLADA = 2;
export const ampladaEstandard = (px) => AMPLADES_ESTANDARD.some((a) => Math.abs(px - a) <= TOLERANCIA_AMPLADA);
