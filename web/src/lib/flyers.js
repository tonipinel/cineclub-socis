import { getDb, llegir } from './db.js';
import { ascendent, dataValida, normalitzaSessio, publicable } from './sessions.js';
import { subtitolSessio, titolSessio } from './sessio-camps.js';

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
  hora: sessio.hora && sessio.hora !== '00:00' ? sessio.hora : '',
  seccio: sessio.publica?.seccio || 'cartellera',
  imatge: sessio.publica?.cartell ?? '',
  versio: etiquetaVersio(sessio).text,
  idioma: etiquetaVersio(sessio).idioma,
});

// Preu per sessió per als NO socis (els socis entren sempre gratis) a partir de `publica.preu` de les sessions del flyer.
// Cada sessió ha de dur un preu numèric (0 = gratuïta); si QUALSEVOL en falta o no és vàlid, el preu es desconeix i es retorna
// `null` (el flyer cau al text provisional de `flyer.json`): mai no s'afirma «gratis» o un import que no és de totes.
const euros = (n) => `${String(n).replace('.', ',')} €`;
export const preuFlyer = (sessions) => {
  const preus = sessions.map((s) => s.publica?.preu);
  if (!preus.length || preus.some((p) => typeof p !== 'number' || !Number.isFinite(p) || p < 0)) return null;
  const pagats = preus.filter((p) => p > 0);
  const gratis = pagats.length < preus.length;
  if (!pagats.length) return { text: 'gratis' };
  const min = Math.min(...pagats);
  const max = Math.max(...pagats);
  const quantitat = min === max ? euros(min) : `de ${String(min).replace('.', ',')} a ${euros(max)}`;
  return { text: gratis ? `gratis o ${quantitat} segons la sessió` : `${quantitat} per sessió` };
};

export async function flyerPerId(id, db = getDb()) {
  const doc = await llegir(db.collection('flyers').doc(id).get());
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

// Mateix filtre i normalització que `sessionsPubliques`, perquè una sessió trencada no tombi la pàgina.
// `totes` (previsualització amb la `clau`): també les NO publicades, mentre el document existeixi i tingui una `data` vàlida.
export async function sessionsDelFlyer(flyer, db = getDb(), { totes = false } = {}) {
  const ids = flyer.sessionsIds ?? [];
  if (!ids.length) return [];
  const docs = await llegir(db.getAll(...ids.map((id) => db.collection('sessions').doc(id))));
  return docs
    .filter((doc) => doc.exists)
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((s) => (totes ? dataValida(s.data) : publicable(s)))
    .map(normalitzaSessio)
    .sort(ascendent);
}

// Actiu = publicat, amb alguna sessió i totes les ids de `sessionsIds` corresponents a sessions que existeixen i són publicades.
// Només un flyer actiu es veu sense la `clau` (pàgina, PDF i impressió) i es promociona a /programacio/.
export async function flyerActiu(flyer, db = getDb()) {
  if (flyer?.estat !== 'publicat') return false;
  const ids = flyer.sessionsIds ?? [];
  if (!ids.length) return false;
  const docs = await llegir(db.getAll(...ids.map((id) => db.collection('sessions').doc(id))));
  return docs.every((doc) => doc.exists && doc.data()?.publicada === true);
}

// El flyer ACTIU i vigent de `publicatEl` més recent (un flyer retocat després no el supera: només compta quan es va
// publicar). Si el més nou no és actiu o ja ha acabat, el següent; si cap, null.
export async function darrerFlyerPublicat(db = getDb(), ara = new Date()) {
  const snap = await llegir(db.collection('flyers').where('estat', '==', 'publicat').get());
  const flyers = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const ms = (f) => f.publicatEl?.toMillis?.() ?? 0;
  for (const flyer of flyers.sort((a, b) => ms(b) - ms(a))) {
    if (flyerVigent(flyer, ara) && await flyerActiu(flyer, db)) return flyer;
  }
  return null;
}

// Un programa que ja ha acabat (`fins` anterior a avui, a Europe/Madrid) no es promociona. `fins` és YYYY-MM-DD.
export const flyerVigent = (flyer, ara = new Date()) => {
  if (!flyer?.fins) return true;
  const avui = ara.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
  return flyer.fins >= avui;
};

// La `clau` de previsualització (admin i generació dels PDF): obre el flyer encara que no sigui actiu. Una clau buida mai.
export const teClau = (flyer, clau) => Boolean(clau) && clau === flyer.clauPrevia;
