import { getDb, llegir } from './db.js';
import { ascendent, normalitzaSessio, publicable } from './sessions.js';
import { subtitolSessio, titolSessio, urlSessio } from './sessio-camps.js';

const VERSIONS = {
  vose: 'VOSE',
  vosc: 'VOSC',
  vo: 'VO',
  'doblada-cat': 'En català',
  'doblada-cast': 'En castellà',
};

// Sense `versioTipus` el text queda buit: el cridant decideix què en fa.
export const etiquetaVersio = (sessio) => ({
  text: VERSIONS[sessio.publica?.versioTipus] ?? '',
  idioma: sessio.publica?.idioma ?? '',
});

const DIES = ['Dg', 'Dl', 'Dt', 'Dc', 'Dj', 'Dv', 'Ds'];
const MESOS = ['gen', 'febr', 'març', 'abr', 'maig', 'juny', 'jul', 'ag', 'set', 'oct', 'nov', 'des'];

// «Dj 5 nov». `dataCaCurta` dóna «Dijous 5 de novembre», massa llarg per al flyer.
const dataCurtaFlyer = (data) => {
  const [any, mes, dia] = data.slice(0, 10).split('-').map(Number);
  return `${DIES[new Date(Date.UTC(any, mes - 1, dia)).getUTCDay()]} ${dia} ${MESOS[mes - 1]}`;
};

export const peliculaFlyer = (sessio) => ({
  id: sessio.id,
  titol: titolSessio(sessio),
  titolTraduit: subtitolSessio(sessio),
  dataText: dataCurtaFlyer(sessio.data),
  imatge: sessio.publica?.cartell ?? '',
  generes: (sessio.publica?.generes ?? []).join(' · '),
  versio: etiquetaVersio(sessio).text,
  idioma: etiquetaVersio(sessio).idioma,
  url: urlSessio(sessio),
});

export async function flyerPerId(id, db = getDb()) {
  const doc = await llegir(db.collection('flyers').doc(id).get());
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

// Mateix filtre i normalització que `sessionsPubliques`, perquè una sessió trencada no tombi la pàgina.
export async function sessionsDelFlyer(flyer, db = getDb()) {
  const ids = flyer.sessionsIds ?? [];
  if (!ids.length) return [];
  const docs = await llegir(db.getAll(...ids.map((id) => db.collection('sessions').doc(id))));
  return docs
    .filter((doc) => doc.exists)
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter(publicable)
    .map(normalitzaSessio)
    .sort(ascendent);
}

// El de `publicatEl` més recent (un flyer retocat després no el supera: només compta quan es va publicar).
export async function darrerFlyerPublicat(db = getDb()) {
  const snap = await llegir(db.collection('flyers').where('estat', '==', 'publicat').get());
  const flyers = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const ms = (f) => f.publicatEl?.toMillis?.() ?? 0;
  return flyers.sort((a, b) => ms(b) - ms(a))[0] ?? null;
}

// Un programa que ja ha acabat (`fins` anterior a avui, a Europe/Madrid) no es promociona. `fins` és YYYY-MM-DD.
export const flyerVigent = (flyer, ara = new Date()) => {
  if (!flyer?.fins) return true;
  const avui = ara.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
  return flyer.fins >= avui;
};

export const potVeure = (flyer, clau) =>
  flyer.estat === 'publicat' || (Boolean(clau) && clau === flyer.clauPrevia);
