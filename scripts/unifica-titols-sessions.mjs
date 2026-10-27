// Ús: node scripts/unifica-titols-sessions.mjs [--apply | --desfer <fitxer>]
// Fa que el títol principal de cada sessió sigui el títol original: per a cada sessió amb `publica.titolOriginal`,
// si `titol` o `publica.titol` en són diferents, els posa iguals a l'original. Si el títol que es mostrava fins ara
// (`publica.titol`, o `titol` si no n'hi ha) és un altre (p. ex. el d'Espanya), no és el títol en català i
// `publica.titolEspanya` és buit, el copia a `publica.titolEspanya`. A les publicades també mou `publica.actualitzatEl`
// (el `lastmod` del sitemap) quan canvia el que es veu a la web, com un desat normal. No toca `titolTraduit`, `titolOriginal`, slug, data, URL ni aliases.
// Les sessions sense `publica.titolOriginal` no es toquen: l'informe les llista per revisar-les a mà.
// Per defecte és un INFORME de només lectura (títols de pel·lícules, cap dada personal).
// Amb `--apply` escriu els canvis, només si hi ha la còpia de seguretat d'avui (backups/<AAAA-MM-DD>/manifest.json).
// Abans d'escriure afegeix una entrada (valors anteriors i escrits de cada sessió) a
// backups/<AAAA-MM-DD>/unifica-titols-sessions.json, sense esborrar les d'execucions anteriors del mateix dia.
// És idempotent: una segona execució ja no troba res per canviar.
// `--desfer <fitxer>` torna cada sessió als valors d'abans de la PRIMERA execució del fitxer, amb la mateixa guarda de
// còpia, però només les que encara tenen els valors de la DARRERA execució (si algú l'ha editada, es deixa i s'avisa).
// Credencials: GOOGLE_APPLICATION_CREDENTIALS o la clau cineclub-socis-firebase-adminsdk-*.json de l'arrel.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marcarActualitzada } from '../src/lib/sessioPublica.js';

const ARREL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const US = 'Ús: node scripts/unifica-titols-sessions.mjs [--apply | --desfer <fitxer>]';
const FITXER_REGISTRE = 'unifica-titols-sessions.json';
const MIDA_LOT = 400;

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

const text = (valor) => (typeof valor === 'string' ? valor.trim() : '');
const mateix = (a, b) => a.toLowerCase() === b.toLowerCase();

// Valor d'un camp amb punts (`publica.titol`) com el desa el registre: `{ valor }` o `{ absent: true }`.
function valorDe(sessio, cami) {
  const valor = cami.split('.').reduce((obj, clau) => (obj && typeof obj === 'object' ? obj[clau] : undefined), sessio);
  return valor === undefined ? { absent: true } : { valor };
}
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Sessions a canviar (amb els camps a escriure, amb punts) i sessions sense títol original.
export function planificar(docsSessions, avui) {
  const canviar = [];
  const senseOriginal = [];
  for (const d of docsSessions) {
    const sessio = d.data();
    const publica = sessio.publica ?? {};
    const resum = { id: d.id, data: sessio.data ?? '', slug: sessio.slug ?? '', publicada: Boolean(sessio.publicada) };
    const original = text(publica.titolOriginal);
    if (!original) {
      senseOriginal.push({ ...resum, titol: text(publica.titol) || text(sessio.titol) });
      continue;
    }
    if (sessio.titol === original && publica.titol === original) continue;
    const mostrat = text(publica.titol) || text(sessio.titol);
    const escrit = { titol: original, 'publica.titol': original };
    const traduit = text(publica.titolTraduit);
    if (mostrat && !mateix(mostrat, original) && !(traduit && mateix(mostrat, traduit)) && !text(publica.titolEspanya)) {
      escrit['publica.titolEspanya'] = mostrat;
    }
    const canviaLaWeb = mostrat !== original || 'publica.titolEspanya' in escrit;
    if (sessio.publicada && canviaLaWeb) escrit['publica.actualitzatEl'] = marcarActualitzada({}, avui).actualitzatEl;
    const anterior = Object.fromEntries(Object.keys(escrit).map((cami) => [cami, valorDe(sessio, cami)]));
    canviar.push({
      ...resum, titolAbans: sessio.titol ?? null, titolPublicAbans: publica.titol ?? null, anterior, escrit,
    });
  }
  const perData = (a, b) => String(a.data).localeCompare(String(b.data));
  return { canviar: canviar.sort(perData), senseOriginal: senseOriginal.sort(perData), total: docsSessions.length };
}

function informa(pla, log) {
  log(`Sessions: ${pla.total} | per canviar: ${pla.canviar.length} | sense títol original (no es toquen): ${pla.senseOriginal.length}`);
  for (const c of pla.canviar) {
    log(`  ${c.data} ${c.slug || c.id}${c.publicada ? '' : ' (no publicada)'}:`);
    if (c.titolAbans !== c.escrit.titol) log(`    titol: «${c.titolAbans ?? ''}» -> «${c.escrit.titol}»`);
    if (c.titolPublicAbans !== c.escrit['publica.titol']) log(`    publica.titol: «${c.titolPublicAbans ?? ''}» -> «${c.escrit['publica.titol']}»`);
    if (c.escrit['publica.titolEspanya']) log(`    publica.titolEspanya (era buit): «${c.escrit['publica.titolEspanya']}»`);
    if (c.escrit['publica.actualitzatEl']) log(`    publica.actualitzatEl: ${c.anterior['publica.actualitzatEl'].valor ?? '—'} -> ${c.escrit['publica.actualitzatEl']}`);
  }
  for (const s of pla.senseOriginal) log(`  SENSE TÍTOL ORIGINAL: ${s.data} ${s.slug || s.id} «${s.titol}» (cal revisar-la a mà)`);
}

const dirAvui = (dirBackups, avui) => join(dirBackups, avui.toISOString().slice(0, 10));

export function comprovarCopia(dirBackups, avui) {
  const manifest = join(dirAvui(dirBackups, avui), 'manifest.json');
  if (!existsSync(manifest)) {
    throw new Error(`No hi ha cap còpia de seguretat d'avui (${manifest}). Fes-la abans amb \`node scripts/backup-firestore.mjs\` i torna-ho a provar.`);
  }
}

async function escriureEnLots(db, operacions) {
  for (let i = 0; i < operacions.length; i += MIDA_LOT) {
    const lot = db.batch();
    for (const { id, canvis } of operacions.slice(i, i + MIDA_LOT)) lot.update(db.collection('sessions').doc(id), canvis);
    await lot.commit();
  }
}

export async function executar({
  db, apply = false, dirBackups = join(ARREL, 'backups'), avui = new Date(), log = console.log,
}) {
  if (apply) comprovarCopia(dirBackups, avui);
  log(`=== Unificar els títols de les sessions (${apply ? "MODE APPLY: s'escriu" : "MODE INFORME: no s'escriu res"}) ===`);
  const snap = await db.collection('sessions').get();
  const pla = planificar(snap.docs, avui);
  informa(pla, log);
  const resum = { canviar: pla.canviar.length, senseOriginal: pla.senseOriginal.length, escrit: false };
  if (!apply || pla.canviar.length === 0) {
    log(pla.canviar.length === 0 ? 'Res per canviar.' : `Amb --apply s'escriurien ${pla.canviar.length} sessions.`);
    return { ...resum, pla };
  }

  const fitxer = join(dirAvui(dirBackups, avui), FITXER_REGISTRE);
  const execucionsPrevies = existsSync(fitxer) ? JSON.parse(readFileSync(fitxer, 'utf8')).execucions ?? [] : [];
  const canvis = pla.canviar.map(({ id, anterior, escrit }) => ({ id, anterior, escrit }));
  const execucions = [...execucionsPrevies, { actualitzat: avui.toISOString(), canvis }];
  mkdirSync(dirname(fitxer), { recursive: true });
  writeFileSync(fitxer, `${JSON.stringify({ actualitzat: avui.toISOString(), execucions }, null, 2)}\n`);
  await escriureEnLots(db, canvis.map(({ id, escrit }) => ({ id, canvis: escrit })));
  log(`Escrites ${canvis.length} sessions. Registre a ${fitxer}`);
  return { ...resum, escrit: true, pla };
}

// `esborrarCamp`: el valor que esborra un camp (FieldValue.delete() de l'Admin SDK), per als que no hi eren.
export async function desfer({
  fitxer, db, esborrarCamp, dirBackups = join(ARREL, 'backups'), avui = new Date(), log = console.log,
}) {
  comprovarCopia(dirBackups, avui);
  const { execucions } = JSON.parse(readFileSync(fitxer, 'utf8'));
  const perId = new Map();
  for (const { canvis } of execucions) {
    for (const { id, anterior, escrit } of canvis) {
      const previ = perId.get(id);
      perId.set(id, { anterior: { ...anterior, ...previ?.anterior }, escrit: { ...previ?.escrit, ...escrit } });
    }
  }
  log(`=== Desfer els títols de les sessions des de ${fitxer} ===`);
  const restaurar = [];
  let saltats = 0;
  for (const [id, { anterior, escrit }] of perId) {
    const snap = await db.collection('sessions').doc(id).get();
    const actual = snap.exists ? snap.data() : null;
    if (!actual || !Object.entries(escrit).every(([cami, valor]) => igual(valorDe(actual, cami), { valor }))) {
      log(`No es desfà sessions/${id}: ha canviat des d'aleshores.`);
      saltats++;
      continue;
    }
    restaurar.push({
      id,
      canvis: Object.fromEntries(Object.entries(anterior).map(([cami, a]) => [cami, a.absent ? esborrarCamp : a.valor])),
    });
  }
  await escriureEnLots(db, restaurar);
  log(`Restaurades ${restaurar.length} sessions; ${saltats} sense tocar.`);
  return { desfets: restaurar.length, saltats };
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
  const db = getFirestore(initializeApp({ credential }));

  try {
    if (opcions.desfer) await desfer({ fitxer: opcions.desfer, db, esborrarCamp: FieldValue.delete() });
    else await executar({ db, apply: opcions.apply });
  } catch (err) {
    console.error(`\nERROR: ${err.message}`);
    process.exitCode = 1;
  }
}
