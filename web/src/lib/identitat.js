// Identitat del soci a la web pública: viu a sessionStorage (es perd en tancar la pestanya).
export const CLAU_IDENTITAT = 'cineclub.identitat';

function emmagatzematgePerDefecte() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

const MAX_NOM = 100;
const MAX_TOKEN = 200;
// Text recuperat de l'storage: ha de ser cadena, es retalla i no pot ser buida ni passar del límit.
const textAcotat = (valor, max) => {
  if (typeof valor !== 'string') return null;
  const net = valor.trim();
  return net && net.length <= max ? net : null;
};

export function llegirIdentitat(storage = emmagatzematgePerDefecte()) {
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

export function desarIdentitat(identitat, storage = emmagatzematgePerDefecte()) {
  try {
    storage?.setItem(CLAU_IDENTITAT, JSON.stringify(identitat));
  } catch {
    // Sense storage (mode privat, bloquejat): la identitat només dura mentre la pàgina és oberta.
  }
}

export function esborrarIdentitat(storage = emmagatzematgePerDefecte()) {
  try {
    storage?.removeItem(CLAU_IDENTITAT);
  } catch {
    // Vegeu desarIdentitat.
  }
}
