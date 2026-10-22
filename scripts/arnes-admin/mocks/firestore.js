// Firestore en memòria per a l'arnès: les dades surten de `../dades.js` i les escriptures només
// viuen a la pestanya (es perden en recarregar). Cap operació de Firestore surt del navegador.
import { dadesInicials, Timestamp } from '../dades.js';

export { Timestamp };

const magatzem = new Map(Object.entries(dadesInicials()));
const oients = new Set();

let comptador = 0;
const nouId = () => `arnes${Date.now().toString(36)}${(comptador += 1)}`;

export const getFirestore = () => ({ tipus: 'firestore' });

export function collection(base, ...segments) {
  const prefix = base?.tipus === 'doc' ? `${base.path}/` : '';
  return { tipus: 'collection', path: prefix + segments.join('/') };
}

export function doc(base, ...segments) {
  if (base?.tipus === 'collection') {
    const id = segments.length ? segments.join('/') : nouId();
    return refDoc(`${base.path}/${id}`);
  }
  return refDoc(segments.join('/'));
}

function refDoc(path) {
  return { tipus: 'doc', path, id: path.split('/').pop() };
}

export const where = (camp, op, valor) => ({ tipus: 'where', camp, op, valor });
export const orderBy = (camp, direccio = 'asc') => ({ tipus: 'orderBy', camp, direccio });
export const limit = (n) => ({ tipus: 'limit', n });
export const documentId = () => '__name__';

export function query(base, ...restriccions) {
  return { tipus: 'query', path: base.path, restriccions: [...(base.restriccions ?? []), ...restriccions] };
}

const valorComparable = (v) => (v instanceof Timestamp ? v.toMillis() : v);

function compleix(dades, { camp, op, valor }) {
  const v = valorComparable(dades[camp]);
  const w = valorComparable(valor);
  switch (op) {
    case '==': return v === w;
    case '!=': return v !== w;
    case '<': return v < w;
    case '<=': return v <= w;
    case '>': return v > w;
    case '>=': return v >= w;
    case 'in': return w.includes(v);
    case 'not-in': return !w.includes(v);
    case 'array-contains': return Array.isArray(v) && v.includes(w);
    default: return true;
  }
}

function snapDoc(path) {
  const dades = magatzem.get(path);
  return {
    id: path.split('/').pop(),
    ref: refDoc(path),
    exists: () => dades !== undefined,
    data: () => (dades === undefined ? undefined : { ...dades }),
    get: (camp) => dades?.[camp],
  };
}

function resolQuery(ref) {
  const fondaria = ref.path.split('/').length + 1;
  let docs = [...magatzem.keys()]
    .filter((p) => p.startsWith(`${ref.path}/`) && p.split('/').length === fondaria)
    .map(snapDoc);
  const restriccions = ref.restriccions ?? [];
  for (const r of restriccions.filter((x) => x.tipus === 'where')) docs = docs.filter((d) => compleix(d.data(), r));
  for (const r of restriccions.filter((x) => x.tipus === 'orderBy').reverse()) {
    const factor = r.direccio === 'desc' ? -1 : 1;
    docs.sort((a, b) => {
      const va = valorComparable(a.data()[r.camp]);
      const vb = valorComparable(b.data()[r.camp]);
      if (va === vb) return 0;
      return (va > vb ? 1 : -1) * factor;
    });
  }
  const lim = restriccions.find((x) => x.tipus === 'limit');
  if (lim) docs = docs.slice(0, lim.n);
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
    forEach: (fn) => docs.forEach(fn),
    docChanges: () => docs.map((d) => ({ type: 'added', doc: d })),
    metadata: { fromCache: false, hasPendingWrites: false },
  };
}

const snapshotDe = (ref) => (ref.tipus === 'doc' ? snapDoc(ref.path) : resolQuery(ref));

export const getDoc = async (ref) => snapDoc(ref.path);
export const getDocs = async (ref) => resolQuery(ref);
export const getDocFromServer = getDoc;
export const getDocsFromServer = getDocs;
export const getCountFromServer = async (ref) => ({ data: () => ({ count: resolQuery(ref).size }) });

// onSnapshot(ref, [opcions], next | { next }, [error]): l'error no es crida mai.
export function onSnapshot(ref, ...args) {
  if (args[0] && typeof args[0] === 'object' && !args[0].next) args.shift();
  const next = typeof args[0] === 'function' ? args[0] : args[0]?.next;
  const oient = () => next?.(snapshotDe(ref));
  oients.add(oient);
  setTimeout(oient, 0);
  return () => oients.delete(oient);
}

const notifica = () => setTimeout(() => oients.forEach((o) => o()), 0);

class Sentinella {
  constructor(aplica) { this.aplica = aplica; }
}
export const serverTimestamp = () => Timestamp.now();
export const arrayUnion = (...valors) => new Sentinella((actual = []) => [...actual, ...valors.filter((v) => !actual.includes(v))]);
export const arrayRemove = (...valors) => new Sentinella((actual = []) => actual.filter((v) => !valors.includes(v)));
export const increment = (n) => new Sentinella((actual = 0) => actual + n);
export const deleteField = () => new Sentinella(() => undefined);

function aplicaCanvis(actual, canvis) {
  const resultat = { ...actual };
  for (const [camp, valor] of Object.entries(canvis)) {
    if (valor instanceof Sentinella) {
      const nou = valor.aplica(resultat[camp]);
      if (nou === undefined) delete resultat[camp]; else resultat[camp] = nou;
    } else resultat[camp] = valor;
  }
  return resultat;
}

const escriu = {
  set(ref, dades, opcions) {
    const base = opcions?.merge ? magatzem.get(ref.path) ?? {} : {};
    magatzem.set(ref.path, aplicaCanvis(base, dades));
  },
  update(ref, dades) {
    if (!magatzem.has(ref.path)) throw new Error(`No existeix ${ref.path}`);
    magatzem.set(ref.path, aplicaCanvis(magatzem.get(ref.path), dades));
  },
  delete(ref) {
    magatzem.delete(ref.path);
  },
};

export async function setDoc(ref, dades, opcions) { escriu.set(ref, dades, opcions); notifica(); }
export async function updateDoc(ref, dades) { escriu.update(ref, dades); notifica(); }
export async function deleteDoc(ref) { escriu.delete(ref); notifica(); }
export async function addDoc(col, dades) {
  const ref = doc(col);
  escriu.set(ref, dades);
  notifica();
  return ref;
}

export function writeBatch() {
  const operacions = [];
  const batch = {
    set: (ref, dades, opcions) => { operacions.push(() => escriu.set(ref, dades, opcions)); return batch; },
    update: (ref, dades) => { operacions.push(() => escriu.update(ref, dades)); return batch; },
    delete: (ref) => { operacions.push(() => escriu.delete(ref)); return batch; },
    commit: async () => { operacions.forEach((op) => op()); notifica(); },
  };
  return batch;
}

export async function runTransaction(_db, fn) {
  const tx = {
    get: async (ref) => snapDoc(ref.path),
    set: (ref, dades, opcions) => { escriu.set(ref, dades, opcions); return tx; },
    update: (ref, dades) => { escriu.update(ref, dades); return tx; },
    delete: (ref) => { escriu.delete(ref); return tx; },
  };
  const resultat = await fn(tx);
  notifica();
  return resultat;
}

export const enableIndexedDbPersistence = async () => {};
export const initializeFirestore = () => getFirestore();
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});
export const connectFirestoreEmulator = () => {};
