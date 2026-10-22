// Ús: node scripts/esborra-vots-antics.mjs [--apply]
// Esborra el sistema antic de votació: els documents `propostes/{id}/vots/{n}`.
// Per defecte és un INFORME: només llegeix i mostra quants documents hi ha i de quantes propostes.
// Amb `--apply` els esborra, només si hi ha la còpia de seguretat d'avui (backups/<AAAA-MM-DD>/manifest.json).
// És idempotent: una segona execució no en troba cap i no fa res. No toca cap altra col·lecció `vots`.
// Credencials: GOOGLE_APPLICATION_CREDENTIALS o la clau cineclub-socis-firebase-adminsdk-*.json de l'arrel.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ARREL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const US = 'Ús: node scripts/esborra-vots-antics.mjs [--apply]';
const MIDA_LOT = 400;
const RUTA_VOT_ANTIC = /^propostes\/([^/]+)\/vots\/[^/]+$/;

export function llegirOpcions(argv) {
  const opcions = { apply: false };
  for (const arg of argv) {
    if (arg === '--apply') opcions.apply = true;
    else throw new Error(`Opció desconeguda: ${arg}`);
  }
  return opcions;
}

// Només els documents `propostes/*/vots/*`: el grup de col·leccions `vots` pot existir en altres llocs.
export function votsAntics(docs) {
  return docs.filter((d) => RUTA_VOT_ANTIC.test(d.ref.path));
}

export function resum(docs) {
  const propostes = new Set(docs.map((d) => d.ref.path.match(RUTA_VOT_ANTIC)[1]));
  return { documents: docs.length, propostes: propostes.size };
}

export function comprovarCopia(dirBackups, avui) {
  const manifest = join(dirBackups, avui.toISOString().slice(0, 10), 'manifest.json');
  if (!existsSync(manifest)) {
    throw new Error(`No hi ha cap còpia de seguretat d'avui (${manifest}). Fes-la abans amb \`node scripts/backup-firestore.mjs\` i torna-ho a provar.`);
  }
}

export async function esborrar(docs, db) {
  for (let i = 0; i < docs.length; i += MIDA_LOT) {
    const lot = db.batch();
    docs.slice(i, i + MIDA_LOT).forEach((d) => lot.delete(d.ref));
    await lot.commit();
  }
}

export async function executar({
  apply = false, db, dirBackups = join(ARREL, 'backups'), avui = new Date(), log = console.log,
}) {
  if (apply) comprovarCopia(dirBackups, avui);
  const docs = votsAntics((await db.collectionGroup('vots').get()).docs);
  const { documents, propostes } = resum(docs);
  log(`=== Vots antics (${apply ? 'MODE APPLY: s\'esborren' : 'MODE INFORME: no s\'esborra res'}) ===`);
  log(`Documents propostes/*/vots/*: ${documents} (de ${propostes} propostes)`);
  if (apply) {
    await esborrar(docs, db);
    log(documents ? `Esborrats ${documents} documents.` : 'No hi havia res a esborrar.');
  }
  return { documents, propostes };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { initializeApp, cert, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  let opcions;
  try {
    opcions = llegirOpcions(process.argv.slice(2));
  } catch (err) {
    console.error(`${err.message}\n${US}`);
    process.exit(2);
  }

  let credential = applicationDefault();
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const key = readdirSync(ARREL).find((f) => /^cineclub-socis-firebase-adminsdk-.*\.json$/.test(f));
    if (key) credential = cert(JSON.parse(readFileSync(join(ARREL, key), 'utf8')));
  }
  const app = initializeApp({ credential });

  try {
    await executar({ apply: opcions.apply, db: getFirestore(app) });
  } catch (err) {
    console.error(`\nERROR: ${err.message}`);
    process.exitCode = 1;
  }
}
