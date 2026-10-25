// Ús: node scripts/omple-socis-porta.mjs [--apply | --desfer <fitxer>]
// Omple `socisPorta/{numeroSoci}` (el que pot llegir la porta, vegeu firestore.rules) a partir de tots els `socis`, amb
// la MATEIXA funció que fa servir la Cloud Function `sincronitzarSociPorta` (functions/socis-porta.js): llista blanca
// de camps i el SHA-256 del token del carnet, mai el token ni el DNI o el contacte. Cal fer-ho una vegada ABANS de
// desplegar les regles noves (la porta deixarà de llegir `socis`); després el disparador els manté al dia. També
// serveix per reparar desajustos (p. ex. si un disparador ha fallat).
// Per defecte és un INFORME de només lectura: quants n'hi ha per crear, actualitzar, esborrar (documents de porta que ja
// no corresponen a cap soci) o al dia, i els números de soci REPETITS (no s'escriu cap dels dos: cal arreglar-ho a mà).
// L'informe no mostra cap dada personal: només ids de document i números.
// Amb `--apply` escriu els canvis, només si hi ha la còpia de seguretat d'avui (backups/<AAAA-MM-DD>/manifest.json).
// Abans d'escriure afegeix una entrada (estat anterior i estat escrit de cada document) a
// backups/<AAAA-MM-DD>/socis-porta.json, sense esborrar les d'execucions anteriors del mateix dia. És idempotent.
// `--desfer <fitxer>` torna cada document a l'estat d'abans de la PRIMERA execució del fitxer, amb la mateixa guarda de
// còpia, però només els que encara tenen el valor de la DARRERA execució: si la Cloud Function n'ha actualitzat algun
// des d'aleshores, aquell es deixa (és més nou) i s'avisa.
// Credencials: GOOGLE_APPLICATION_CREDENTIALS o la clau cineclub-socis-firebase-adminsdk-*.json de l'arrel.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import porta from '../functions/socis-porta.js';

const { docPorta, idPorta } = porta;
const ARREL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const US = 'Ús: node scripts/omple-socis-porta.mjs [--apply | --desfer <fitxer>]';
const FITXER_REGISTRE = 'socis-porta.json';
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

// Canvis perquè `socisPorta` quadri amb `socis`. Un número repetit no s'escriu ni s'esborra (no se sap quin és el bo).
export function planificar(docsSocis, docsPorta) {
  const perNumero = new Map();
  let senseNumero = 0;
  for (const d of docsSocis) {
    const id = idPorta(d.data());
    if (!id) {
      senseNumero++;
      continue;
    }
    if (!perNumero.has(id)) perNumero.set(id, []);
    perNumero.get(id).push(d);
  }
  const existents = new Map(docsPorta.map((d) => [d.id, d.data()]));
  const duplicats = [...perNumero]
    .filter(([, socis]) => socis.length > 1)
    .map(([numero, socis]) => ({ numero, socis: socis.map((s) => s.id) }));
  const escriure = [];
  let alDia = 0;
  for (const [id, socis] of perNumero) {
    if (socis.length > 1) continue;
    const dades = docPorta(socis[0].data());
    const anterior = existents.get(id) ?? null;
    if (isDeepStrictEqual(anterior, dades)) alDia++;
    else escriure.push({ id, dades, anterior });
  }
  const esborrar = [...existents]
    .filter(([id]) => !perNumero.has(id))
    .map(([id, anterior]) => ({ id, anterior }));
  return { escriure, esborrar, alDia, senseNumero, duplicats, total: docsSocis.length };
}

const dirAvui = (dirBackups, avui) => join(dirBackups, avui.toISOString().slice(0, 10));

export function comprovarCopia(dirBackups, avui) {
  const manifest = join(dirAvui(dirBackups, avui), 'manifest.json');
  if (!existsSync(manifest)) {
    throw new Error(`No hi ha cap còpia de seguretat d'avui (${manifest}). Fes-la abans amb \`node scripts/backup-firestore.mjs\` i torna-ho a provar.`);
  }
}

function informa(pla, log) {
  const creats = pla.escriure.filter((c) => !c.anterior).length;
  log(`Socis: ${pla.total} | sense número: ${pla.senseNumero} | documents de porta al dia: ${pla.alDia}`);
  log(`Per crear: ${creats} | per actualitzar: ${pla.escriure.length - creats} | per esborrar (sense soci): ${pla.esborrar.length}`);
  for (const { id } of pla.esborrar) log(`  esborrar socisPorta/${id}`);
  for (const { numero, socis } of pla.duplicats) log(`DUPLICAT: número ${numero}: ${socis.join(', ')} (no s'escriu)`);
  log(pla.duplicats.length
    ? `ATENCIÓ: ${pla.duplicats.length} números repetits. Cal arreglar-los a mà i tornar-ho a executar.`
    : 'Cap número repetit.');
}

async function escriureEnLots(db, operacions) {
  for (let i = 0; i < operacions.length; i += MIDA_LOT) {
    const lot = db.batch();
    for (const { id, dades } of operacions.slice(i, i + MIDA_LOT)) {
      const ref = db.collection('socisPorta').doc(id);
      if (dades) lot.set(ref, dades);
      else lot.delete(ref);
    }
    await lot.commit();
  }
}

export async function executar({
  db, apply = false, dirBackups = join(ARREL, 'backups'), avui = new Date(), log = console.log,
}) {
  if (apply) comprovarCopia(dirBackups, avui);
  log(`=== Omplir socisPorta (${apply ? "MODE APPLY: s'escriu" : "MODE INFORME: no s'escriu res"}) ===`);
  const [socis, existents] = await Promise.all([db.collection('socis').get(), db.collection('socisPorta').get()]);
  const pla = planificar(socis.docs, existents.docs);
  informa(pla, log);
  const canvis = [
    ...pla.escriure.map(({ id, dades, anterior }) => ({ id, anterior, escrit: dades })),
    ...pla.esborrar.map(({ id, anterior }) => ({ id, anterior, escrit: null })),
  ];
  const resum = {
    escriure: pla.escriure.length, esborrar: pla.esborrar.length, duplicats: pla.duplicats, escrit: false,
  };
  if (!apply || canvis.length === 0) {
    log(canvis.length === 0 ? 'Tot al dia: no cal escriure res.' : `Amb --apply s'escriurien ${canvis.length} documents.`);
    return resum;
  }

  const fitxer = join(dirAvui(dirBackups, avui), FITXER_REGISTRE);
  // Si avui ja s'ha executat, s'hi afegeix una entrada: la primera conserva l'estat d'abans de tot (el punt de retorn).
  const execucionsPrevies = existsSync(fitxer) ? JSON.parse(readFileSync(fitxer, 'utf8')).execucions ?? [] : [];
  const execucions = [...execucionsPrevies, { actualitzat: avui.toISOString(), canvis }];
  mkdirSync(dirname(fitxer), { recursive: true });
  writeFileSync(fitxer, `${JSON.stringify({ actualitzat: avui.toISOString(), execucions }, null, 2)}\n`);
  await escriureEnLots(db, canvis.map(({ id, escrit }) => ({ id, dades: escrit })));
  log(`Escrits ${canvis.length} documents de socisPorta. Registre a ${fitxer}`);
  return { ...resum, escrit: true };
}

export async function desfer({
  fitxer, db, dirBackups = join(ARREL, 'backups'), avui = new Date(), log = console.log,
}) {
  comprovarCopia(dirBackups, avui);
  const { execucions } = JSON.parse(readFileSync(fitxer, 'utf8'));
  // Per a cada document: l'estat d'abans de la primera execució que el va tocar i el de la darrera que el va escriure.
  const perId = new Map();
  for (const { canvis } of execucions) {
    for (const { id, anterior, escrit } of canvis) {
      perId.set(id, { anterior: perId.has(id) ? perId.get(id).anterior : anterior, escrit });
    }
  }
  log(`=== Desfer socisPorta des de ${fitxer} ===`);
  const restaurar = [];
  let saltats = 0;
  for (const [id, { anterior, escrit }] of perId) {
    const snap = await db.collection('socisPorta').doc(id).get();
    const actual = snap.exists ? snap.data() : null;
    if (!isDeepStrictEqual(actual, escrit)) {
      log(`No es desfà socisPorta/${id}: ha canviat des d'aleshores.`);
      saltats++;
      continue;
    }
    restaurar.push({ id, dades: anterior });
  }
  await escriureEnLots(db, restaurar);
  log(`Restaurats ${restaurar.length} documents; ${saltats} sense tocar.`);
  return { desfets: restaurar.length, saltats };
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
  const db = getFirestore(initializeApp({ credential }));

  try {
    if (opcions.desfer) await desfer({ fitxer: opcions.desfer, db });
    else await executar({ db, apply: opcions.apply });
  } catch (err) {
    console.error(`\nERROR: ${err.message}`);
    process.exitCode = 1;
  }
}
