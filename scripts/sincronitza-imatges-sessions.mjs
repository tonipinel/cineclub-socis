// Ús: node scripts/sincronitza-imatges-sessions.mjs [--apply | --desfer <fitxer>]
// Posa `imatgeUrl = publica.cartell` a cada sessió que té `publica.cartell` i un `imatgeUrl` diferent,
// buit o absent (les sessions migrades de Hugo hi tenien URL del domini antic). No toca cap altre camp.
// Per defecte és un INFORME: només llegeix i mostra els canvis. Amb `--apply` els escriu, només si hi ha
// la còpia de seguretat d'avui (backups/<AAAA-MM-DD>/manifest.json), i abans guarda els valors anteriors a
// backups/<AAAA-MM-DD>/imatges-sessions-abans.json. És idempotent. `--desfer <fitxer>` restableix els valors
// d'aquest fitxer (esborra el camp a les sessions que no en tenien), amb la mateixa guarda de còpia.
// Credencials: GOOGLE_APPLICATION_CREDENTIALS o la clau cineclub-socis-firebase-adminsdk-*.json de l'arrel.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ARREL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const US = 'Ús: node scripts/sincronitza-imatges-sessions.mjs [--apply | --desfer <fitxer>]';
const MIDA_LOT = 400;
const FITXER_DESFER = 'imatges-sessions-abans.json';

export function llegirOpcions(argv) {
  const opcions = { apply: false, desfer: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') opcions.apply = true;
    else if (argv[i] === '--desfer' && argv[i + 1]) opcions.desfer = argv[++i];
    else throw new Error(`Opció desconeguda o incompleta: ${argv[i]}`);
  }
  if (opcions.apply && opcions.desfer) throw new Error('--apply i --desfer no es poden combinar');
  return opcions;
}

const urlHttp = (valor) => {
  try {
    return ['http:', 'https:'].includes(new URL(valor).protocol);
  } catch {
    return false;
  }
};

export function canvisImatges(docs) {
  return docs.flatMap((doc) => {
    const { titol = '', imatgeUrl, publica } = doc.data();
    const cartell = publica?.cartell;
    if (typeof cartell !== 'string' || !urlHttp(cartell) || imatgeUrl === cartell) return [];
    return [{ id: doc.id, titol, abans: imatgeUrl ?? null, ...(imatgeUrl === undefined && { absent: true }), despres: cartell }];
  });
}

const dirAvui = (dirBackups, avui) => join(dirBackups, avui.toISOString().slice(0, 10));

export function comprovarCopia(dirBackups, avui) {
  const manifest = join(dirAvui(dirBackups, avui), 'manifest.json');
  if (!existsSync(manifest)) {
    throw new Error(`No hi ha cap còpia de seguretat d'avui (${manifest}). Fes-la abans amb \`node scripts/backup-firestore.mjs\` i torna-ho a provar.`);
  }
}

// Afegeix els valors anteriors al fitxer de desfer; el primer valor guardat d'una sessió no es trepitja.
function guardarDesfer(fitxer, canvis, avui) {
  const anterior = existsSync(fitxer) ? JSON.parse(readFileSync(fitxer, 'utf8')) : { camp: 'imatgeUrl', sessions: {} };
  const sessions = { ...anterior.sessions };
  for (const c of canvis) sessions[c.id] ??= { titol: c.titol, imatgeUrl: c.abans, ...(c.absent && { absent: true }) };
  writeFileSync(fitxer, `${JSON.stringify({ ...anterior, actualitzat: avui.toISOString(), sessions }, null, 2)}\n`);
}

async function escriureEnLots(db, actualitzacions) {
  for (let i = 0; i < actualitzacions.length; i += MIDA_LOT) {
    const lot = db.batch();
    actualitzacions.slice(i, i + MIDA_LOT).forEach(([ref, camps]) => lot.update(ref, camps));
    await lot.commit();
  }
}

// Restableix `imatgeUrl` amb els valors del fitxer de desfer; `esborraCamp()` és `FieldValue.delete()`.
async function desferCanvis({ fitxer, db, esborraCamp, log }) {
  const { sessions = {} } = JSON.parse(readFileSync(fitxer, 'utf8'));
  const entrades = Object.entries(sessions);
  log(`=== Desfer imatgeUrl de ${entrades.length} sessions des de ${fitxer} ===`);
  await escriureEnLots(db, entrades.map(([id, { imatgeUrl, absent }]) => [
    db.collection('sessions').doc(id),
    { imatgeUrl: absent ? esborraCamp() : imatgeUrl },
  ]));
  log(`Restablertes ${entrades.length} sessions.`);
  return { restablertes: entrades.length };
}

export async function executar({
  apply = false, desfer = null, db, dirBackups = join(ARREL, 'backups'), avui = new Date(), log = console.log, esborraCamp,
}) {
  if (apply || desfer) comprovarCopia(dirBackups, avui);
  if (desfer) return desferCanvis({ fitxer: desfer, db, esborraCamp, log });
  const snap = await db.collection('sessions').get();
  const canvis = canvisImatges(snap.docs);
  const refs = new Map(snap.docs.map((d) => [d.id, d.ref]));
  log(`=== imatgeUrl de les sessions (${apply ? 'MODE APPLY: s\'escriu' : 'MODE INFORME: no s\'escriu res'}) ===`);
  log(`Sessions: ${snap.docs.length} | a sincronitzar: ${canvis.length}`);
  for (const c of canvis) log(`- ${c.id} (${c.titol})\n    abans:   ${c.absent ? '(absent)' : c.abans || '(buit)'}\n    després: ${c.despres}`);
  if (apply && canvis.length) {
    guardarDesfer(join(dirAvui(dirBackups, avui), FITXER_DESFER), canvis, avui);
    await escriureEnLots(db, canvis.map((c) => [refs.get(c.id), { imatgeUrl: c.despres }]));
    log(`Actualitzades ${canvis.length} sessions. Valors anteriors a ${join(dirAvui(dirBackups, avui), FITXER_DESFER)}`);
  } else if (apply) {
    log('No hi havia res a canviar.');
  }
  return { canvis };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { initializeApp, cert, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');

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
    await executar({ ...opcions, db: getFirestore(app), esborraCamp: () => FieldValue.delete() });
  } catch (err) {
    console.error(`\nERROR: ${err.message}`);
    process.exitCode = 1;
  }
}
