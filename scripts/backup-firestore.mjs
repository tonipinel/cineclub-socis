// Ús: node scripts/backup-firestore.mjs [--out <carpeta>]   (per defecte <arrel del repo>/backups/<data>)
// Còpia de seguretat NOMÉS DE LECTURA de totes les col·leccions de Firestore.
// Credencials: GOOGLE_APPLICATION_CREDENTIALS o la clau cineclub-socis-firebase-adminsdk-*.json de l'arrel.
import { mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp, GeoPoint, DocumentReference } from 'firebase-admin/firestore';

// Arrel del repo (la carpeta que conté `scripts/`), perquè l'script funcioni des de qualsevol directori.
export const ARREL = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// `--out <carpeta>` (un camí relatiu es resol des del directori actual); per defecte `<arrel>/backups/<data>`.
// Llança si `--out` no porta valor o si hi ha una opció desconeguda.
export function llegirArguments(argv, avui = new Date()) {
  let out = join(ARREL, 'backups', avui.toISOString().slice(0, 10));
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== '--out') throw new Error(`Opció desconeguda: ${argv[i]}`);
    const valor = argv[i + 1];
    if (!valor || valor.startsWith('--')) throw new Error('Falta el valor de --out <carpeta>');
    out = resolve(valor);
    i += 1;
  }
  return { out };
}

// Serialitza els tipus de Firestore perquè es puguin restaurar.
function serialize(value) {
  if (value instanceof Timestamp) return { __timestamp: value.toDate().toISOString() };
  if (value instanceof GeoPoint) return { __geopoint: { latitude: value.latitude, longitude: value.longitude } };
  if (value instanceof DocumentReference) return { __ref: value.path };
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialize(v)]));
  }
  return value;
}

async function exportDocument(docRef) {
  const snap = await docRef.get();
  const subcolleccions = {};
  for (const sub of await docRef.listCollections()) {
    subcolleccions[sub.id] = await exportDocuments(sub);
  }
  return { id: docRef.id, data: snap.exists ? serialize(snap.data()) : null, subcolleccions };
}

async function exportDocuments(colRef) {
  const docs = [];
  for (const docRef of await colRef.listDocuments()) {
    docs.push(await exportDocument(docRef));
  }
  return docs;
}

export async function exportCollection(db, name, dir) {
  const docs = await exportDocuments(db.collection(name));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(docs, null, 2));
  return docs.length;
}

export async function backupFirestore(db, dir) {
  // El manifest és la prova que la còpia està completa: un d'una execució anterior no pot sobreviure
  // a una execució que falli a mig camí.
  rmSync(join(dir, 'manifest.json'), { force: true });
  const manifest = {};
  for (const col of await db.listCollections()) {
    manifest[col.id] = await exportCollection(db, col.id, dir);
  }
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let out;
  try {
    ({ out } = llegirArguments(process.argv.slice(2)));
  } catch (err) {
    console.error(`${err.message}\nÚs: node scripts/backup-firestore.mjs [--out <carpeta>]`);
    process.exit(2);
  }

  let credential = applicationDefault();
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const key = readdirSync(ARREL).find((f) => /^cineclub-socis-firebase-adminsdk-.*\.json$/.test(f));
    if (key) credential = cert(JSON.parse(readFileSync(join(ARREL, key), 'utf8')));
  }
  const db = getFirestore(initializeApp({ credential }));

  const manifest = await backupFirestore(db, out);
  console.log(`Còpia desada a ${out}`);
  console.table(manifest);
}
