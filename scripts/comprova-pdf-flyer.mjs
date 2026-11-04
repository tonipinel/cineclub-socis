// Ús: node scripts/comprova-pdf-flyer.mjs <flyerId>
// COMPROVACIÓ DE NOMÉS LECTURA (no té cap mode d'escriptura): llegeix `flyers/<id>` i, per a cada variant de `pdfs`
// (`simple`: una tira de 210 × 99 mm per pàgina; `impremta`: A4 + sagnat 216 × 303 mm), descarrega el PDF de Storage en memòria i informa de
// si existeix, la mida en KB, el nombre de pàgines (han de ser 2) i la mida de cada pàgina en mm (tolerància ±1 mm), a
// més de `generatEl` i de si hi ha `firma`. Surt «OK» o «REVISAR» per línia. No imprimeix mai `clauPrevia`.
// Les pàgines es llegeixen amb una expressió regular (objectes `/Type /Page` i `/MediaBox [0 0 w h]` en punts, com
// els que escriu Chrome/Skia); si un PDF tingués l'arbre de pàgines dins d'un flux d'objectes comprimit, no se'n
// trobarien i la variant sortiria com a REVISAR.
// Credencials: GOOGLE_APPLICATION_CREDENTIALS o la clau
// cineclub-socis-firebase-adminsdk-*.json de l'arrel.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ARREL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUCKET = 'cineclub-socis.firebasestorage.app';
export const MIDES_MM = { simple: [210, 99], impremta: [216, 303] };
const TOLERANCIA_MM = 1;
const PUNT_MM = 25.4 / 72;

// Retorna [{ ample_mm, alt_mm }] amb una entrada per pàgina del PDF.
export function pagines(buffer) {
  const text = Buffer.from(buffer).toString('latin1');
  const res = [];
  for (const m of text.matchAll(/\/Type\s*\/Page(?![A-Za-z])/g)) {
    const inici = text.lastIndexOf(' obj', m.index);
    const fi = text.indexOf('endobj', m.index);
    const objecte = text.slice(inici < 0 ? 0 : inici, fi < 0 ? text.length : fi);
    const mb = objecte.match(/\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/);
    if (!mb) continue;
    const [x0, y0, x1, y1] = mb.slice(1).map(Number);
    res.push({ ample_mm: (x1 - x0) * PUNT_MM, alt_mm: (y1 - y0) * PUNT_MM });
  }
  return res;
}

const mm = (n) => n.toFixed(1);

export async function executar({ db, bucket, flyerId, log = console.log }) {
  const snap = await db.collection('flyers').doc(flyerId).get();
  if (!snap.exists) {
    log(`REVISAR: no existeix flyers/${flyerId}`);
    return { revisar: 1 };
  }
  const pdfs = snap.data().pdfs ?? {};
  log(`=== PDF del flyer ${flyerId} (INFORME: no s'escriu res) ===`);
  let revisar = 0;
  for (const [variant, [ample, alt]] of Object.entries(MIDES_MM)) {
    const info = pdfs[variant];
    const cami = info?.path;
    if (!cami) {
      log(`REVISAR ${variant}: no hi ha pdfs.${variant}.path`);
      revisar++;
      continue;
    }
    const [existeix] = await bucket.file(cami).exists();
    if (!existeix) {
      log(`REVISAR ${variant}: no existeix ${cami}`);
      revisar++;
      continue;
    }
    const [contingut] = await bucket.file(cami).download();
    const llista = pagines(contingut);
    const motius = [];
    if (llista.length !== 2) motius.push(`${llista.length} pàgines (n'hi ha de ser 2)`);
    llista.forEach((p, i) => {
      if (Math.abs(p.ample_mm - ample) > TOLERANCIA_MM || Math.abs(p.alt_mm - alt) > TOLERANCIA_MM) {
        motius.push(`pàgina ${i + 1} és ${mm(p.ample_mm)} × ${mm(p.alt_mm)} mm (hauria de ser ${ample} × ${alt})`);
      }
    });
    if (!info.generatEl) motius.push('falta generatEl');
    if (!info.firma) motius.push('falta firma');
    const mides = llista.map((p) => `${mm(p.ample_mm)} × ${mm(p.alt_mm)}`).join(' | ');
    log(`${motius.length ? 'REVISAR' : 'OK'} ${variant}: ${cami} | ${(contingut.length / 1024).toFixed(1)} KB`
      + ` | ${llista.length} pàgines (${mides} mm) | generatEl ${info.generatEl?.toDate?.().toISOString() ?? info.generatEl ?? '—'}`
      + ` | firma ${info.firma ? 'sí' : 'no'}${motius.length ? ` | ${motius.join('; ')}` : ''}`);
    if (motius.length) revisar++;
  }
  return { revisar };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const flyerId = process.argv[2];
  if (!flyerId) {
    console.error('Ús: node scripts/comprova-pdf-flyer.mjs <flyerId>');
    process.exit(1);
  }
  const { initializeApp, cert, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const { getStorage } = await import('firebase-admin/storage');
  let credential = applicationDefault();
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const key = readdirSync(ARREL).find((f) => /^cineclub-socis-firebase-adminsdk-.*\.json$/.test(f));
    if (key) credential = cert(JSON.parse(readFileSync(join(ARREL, key), 'utf8')));
  }
  try {
    const app = initializeApp({ credential, storageBucket: BUCKET });
    await executar({ db: getFirestore(app), bucket: getStorage(app).bucket(), flyerId });
  } catch (err) {
    console.error(`\nERROR: ${err.message}`);
    process.exitCode = 1;
  }
}
