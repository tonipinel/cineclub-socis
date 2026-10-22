// Salutació de la capçalera («Hola, {nom}!») quan el soci s'ha identificat amb el carnet.
// La identitat viu a sessionStorage (la desa l'illa de React de /propostes/) i l'illa avisa amb
// l'esdeveniment `identitat-canviada`. Sense dependències: es carrega com a mòdul a totes les pàgines.
const CLAU_IDENTITAT = 'cineclub.identitat';
const SELECTOR = '.capcalera-publica__salutacio';
const MARCA = '.site-header__brand';

const MAX_NOM = 100;
const MAX_TOKEN = 200;
// Text de l'storage: cadena, retallada, no buida i dins del límit (com `textAcotat` de src/lib/identitat.js).
const textAcotat = (valor, max) => {
  if (typeof valor !== 'string') return null;
  const net = valor.trim();
  return net && net.length <= max ? net : null;
};

// Mateixa validació que `llegirIdentitat` de src/lib/identitat.js (duplicada: aquest fitxer no passa pel
// bundler; tests/salutacio.test.js comprova que les dues coincideixen).
export function llegirIdentitat(storage) {
  try {
    const brut = storage?.getItem(CLAU_IDENTITAT);
    if (!brut) return null;
    const dades = JSON.parse(brut) ?? {};
    const { numeroSoci } = dades;
    const nomPublic = textAcotat(dades.nomPublic, MAX_NOM);
    const token = textAcotat(dades.token, MAX_TOKEN);
    if (typeof numeroSoci !== 'number' || !nomPublic || !token) return null;
    return { numeroSoci, nomPublic, token };
  } catch {
    return null;
  }
}

// Un nom que no és cadena o és en blanc no saluda.
export const textSalutacio = (identitat) => {
  const nom = textAcotat(identitat?.nomPublic, MAX_NOM);
  return nom ? `Hola, ${nom}!` : '';
};

// L'element de la salutació no és al marcatge de la capçalera: es crea només quan hi ha identitat (entre la
// marca i el menú, com a l'administració) i s'esborra quan no n'hi ha, de manera que les pàgines sense
// identitat conserven exactament el mateix DOM que Hugo.
export function actualitzaSalutacio(doc, storage) {
  const text = textSalutacio(llegirIdentitat(storage));
  let element = doc.querySelector(SELECTOR);
  if (!text) {
    element?.remove();
    return;
  }
  if (!element) {
    const marca = doc.querySelector(MARCA);
    if (!marca) return;
    element = doc.createElement('span');
    element.className = 'capcalera-publica__salutacio';
    marca.after(element);
  }
  element.textContent = text;
}

function emmagatzematge() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

// Només s'activa a pàgines amb la capçalera de la web.
if (typeof document !== 'undefined' && document.querySelector(MARCA)) {
  const actualitza = () => actualitzaSalutacio(document, emmagatzematge());
  actualitza();
  window.addEventListener('identitat-canviada', actualitza);
}
