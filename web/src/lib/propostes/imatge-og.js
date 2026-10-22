import { getDb, llegir } from '../db.js';
import { fetchImage } from '../resize.js';
import { componCollage } from '../collage.js';
import { triaTanda } from './tandes.js';

const ESTATS_EFECTIUS = ['aprovada', 'programada'];
const HOSTS_CARTELLS = ['image.tmdb.org', 'firebasestorage.googleapis.com', 'storage.googleapis.com'];
const MAX_CARTELLS = 24;
const LECTURA_MS = 5000;
const CARTELL = { timeoutMs: 4000, maxBytes: 5 * 1024 * 1024 };

// Adreça normalitzada d'un cartell si és https d'un dels hosts permesos (sense credencials ni port), o null.
export const urlCartell = (valor) => {
  try {
    const url = new URL(valor);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !HOSTS_CARTELLS.includes(url.hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
};

// Adreces dels cartells de les propostes efectives (aprovades o programades) de la tanda que
// mostra la votació, en l'ordre de la tanda. Només llegeix de Firestore.
export async function cartellsDeLaTanda(db, ara = new Date()) {
  const snap = await llegir(db.collection('tandes').get(), LECTURA_MS);
  const tanda = triaTanda(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })), ara);
  const idsTanda = (Array.isArray(tanda?.propostes) ? tanda.propostes : [])
    .filter((id) => typeof id === 'string' && id !== '' && !id.includes('/'));
  const propostes = await Promise.all(idsTanda.map(async (id) => {
    const proposta = await llegir(db.doc(`propostes/${id}`).get(), LECTURA_MS);
    return proposta.exists ? proposta.data() : null;
  }));
  return propostes
    .filter((proposta) => ESTATS_EFECTIUS.includes(proposta?.estat))
    .map((proposta) => urlCartell(proposta.imatgeUrl))
    .filter(Boolean)
    .slice(0, MAX_CARTELLS);
}

// Descarrega els cartells en paral·lel; els que fallen es salten.
export async function baixaCartells(urls) {
  const baixats = await Promise.all(urls.map((url) => fetchImage(url, fetch, CARTELL).catch(() => null)));
  return baixats.filter(Boolean);
}

// JPEG del collage de la tanda, o null si no hi ha tanda o no s'ha pogut baixar cap cartell.
export async function imatgeOgDeLaTanda(logo, db = getDb()) {
  const cartells = await baixaCartells(await cartellsDeLaTanda(db));
  return cartells.length > 0 ? componCollage(cartells, logo) : null;
}
