import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase/client.js';

async function cridar(nom, dades) {
  const { data } = await httpsCallable(functions, nom)(dades);
  return data;
}

export const carregarEstat = (token) => cridar('estatVotacio', { token });

export const votar = (token, tandaId, propostaId, valor) =>
  cridar('votarProposta', { token, tandaId, propostaId, valor });

export const carregarRanking = (token, tandaId) => cridar('rankingTanda', { token, tandaId });

function xmur3(text) {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

function mulberry32(llavor) {
  let a = llavor;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function ordreBarrejat(ids, llavor) {
  const resultat = [...ids];
  const aleatori = mulberry32(xmur3(String(llavor)));
  for (let i = resultat.length - 1; i > 0; i--) {
    const j = Math.floor(aleatori() * (i + 1));
    [resultat[i], resultat[j]] = [resultat[j], resultat[i]];
  }
  return resultat;
}
