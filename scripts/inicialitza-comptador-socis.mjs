// Ús: node scripts/inicialitza-comptador-socis.mjs [--apply | --desfer <fitxer>]
// Inicialitza el comptador de números de soci `configuracio/socis.ultimNumeroSoci` al número de soci més alt que hi ha
// ara a `socis`. L'admin el llegeix i l'avança dins de la mateixa transacció que dona un número nou (aprovar una
// sol·licitud o registrar el primer pagament, vegeu src/lib/numeroSoci.js) i, si no existeix, no assigna cap número.
// Per defecte és un INFORME de només lectura: mostra el màxim, el valor actual del comptador, els socis sense número,
// els números no vàlids i els números REPETITS (serveix per comprovar duplicats a producció sense escriure res).
// Amb `--apply` crea el comptador o l'avança (mai el fa baixar), només si hi ha la còpia de seguretat d'avui
// (backups/<AAAA-MM-DD>/manifest.json), dins d'una transacció de l'Admin SDK que llegeix tota la col·lecció `socis`
// (l'Admin SDK sí que pot fer consultes dins d'una transacció; el client no, i per això es fa aquí). Abans de
// confirmar afegeix una entrada (valor anterior i valor escrit) a backups/<AAAA-MM-DD>/comptador-socis.json, sense
// esborrar les d'execucions anteriors del mateix dia. És idempotent.
// `--desfer <fitxer>` restaura el valor d'abans de la primera execució del fitxer (o esborra el comptador si no n'hi
// havia), amb la mateixa guarda de còpia, però només si el comptador encara té el valor de la darrera execució: si
// l'app ja ha assignat números des d'aleshores, desfer-ho podria tornar a donar números repetits i es nega a fer-ho.
// Credencials: GOOGLE_APPLICATION_CREDENTIALS o la clau cineclub-socis-firebase-adminsdk-*.json de l'arrel.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ARREL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const US = 'Ús: node scripts/inicialitza-comptador-socis.mjs [--apply | --desfer <fitxer>]';
const FITXER_REGISTRE = 'comptador-socis.json';

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

const buit = (valor) => valor === undefined || valor === null || valor === '';

// Mateix criteri que `maximNumeroSoci` (src/lib/numeroSoci.js): els números en text compten com a números.
export function analitzar(docs) {
  const perNumero = new Map();
  const noValids = [];
  let senseNumero = 0;
  for (const d of docs) {
    const { numeroSoci, nom = '', cognoms = '' } = d.data();
    if (buit(numeroSoci)) {
      senseNumero++;
      continue;
    }
    const numero = Number(numeroSoci);
    if (!Number.isInteger(numero) || numero <= 0) {
      noValids.push({ id: d.id, valor: numeroSoci });
      continue;
    }
    if (!perNumero.has(numero)) perNumero.set(numero, []);
    perNumero.get(numero).push({ id: d.id, nom: `${nom} ${cognoms}`.trim() });
  }
  const duplicats = [...perNumero]
    .filter(([, socis]) => socis.length > 1)
    .sort(([a], [b]) => a - b)
    .map(([numero, socis]) => ({ numero, socis }));
  const maxim = perNumero.size ? Math.max(...perNumero.keys()) : 0;
  return { maxim, duplicats, noValids, senseNumero, total: docs.length };
}

// Valor que cal escriure al comptador, o null si ja és vàlid i està al dia o per davant (mai es fa baixar).
export function valorNou(maxim, comptador) {
  const actual = comptador?.ultimNumeroSoci;
  if (Number.isInteger(actual) && actual >= 0 && actual >= maxim) return null;
  return maxim;
}

const dirAvui = (dirBackups, avui) => join(dirBackups, avui.toISOString().slice(0, 10));

export function comprovarCopia(dirBackups, avui) {
  const manifest = join(dirAvui(dirBackups, avui), 'manifest.json');
  if (!existsSync(manifest)) {
    throw new Error(`No hi ha cap còpia de seguretat d'avui (${manifest}). Fes-la abans amb \`node scripts/backup-firestore.mjs\` i torna-ho a provar.`);
  }
}

function informa(analisi, comptador, log) {
  log(`Socis: ${analisi.total} | sense número: ${analisi.senseNumero} | número més alt: ${analisi.maxim}`);
  for (const { id, valor } of analisi.noValids) log(`AVÍS: ${id} té un número de soci no vàlid («${valor}»)`);
  for (const { numero, socis } of analisi.duplicats) {
    log(`DUPLICAT: número ${numero}: ${socis.map((s) => `${s.id} (${s.nom})`).join(', ')}`);
  }
  log(analisi.duplicats.length
    ? `ATENCIÓ: ${analisi.duplicats.length} números repetits. Cal arreglar-los a mà (el comptador no els corregeix).`
    : 'Cap número repetit.');
  log(`Comptador configuracio/socis: ${comptador ? JSON.stringify(comptador) : 'no existeix'}`);
}

export async function executar({
  db, apply = false, dirBackups = join(ARREL, 'backups'), avui = new Date(), log = console.log,
}) {
  if (apply) comprovarCopia(dirBackups, avui);
  log(`=== Comptador de números de soci (${apply ? "MODE APPLY: s'escriu" : "MODE INFORME: no s'escriu res"}) ===`);
  const ref = db.collection('configuracio').doc('socis');
  const llegir = async (lector) => {
    const [socis, snap] = await Promise.all([lector(db.collection('socis')), lector(ref)]);
    const anterior = snap.exists ? snap.data() : null;
    const analisi = analitzar(socis.docs);
    return { analisi, anterior, nou: valorNou(analisi.maxim, anterior) };
  };

  if (!apply) {
    const { analisi, anterior, nou } = await llegir((r) => r.get());
    informa(analisi, anterior, log);
    log(nou === null ? 'El comptador ja està al dia: no caldria fer res.' : `Amb --apply s'inicialitzaria a ${nou}.`);
    return { maxim: analisi.maxim, duplicats: analisi.duplicats, anterior, nou, escrit: false };
  }

  const fitxer = join(dirAvui(dirBackups, avui), FITXER_REGISTRE);
  // Si avui ja s'ha executat, s'hi afegeix una entrada: la primera conserva el valor d'abans de tot (el punt de retorn).
  const execucionsPrevies = existsSync(fitxer) ? JSON.parse(readFileSync(fitxer, 'utf8')).execucions ?? [] : [];
  const resultat = await db.runTransaction(async (t) => {
    const lectura = await llegir((r) => t.get(r));
    if (lectura.nou !== null) {
      // Es desa abans de confirmar; si la transacció es reintenta, es reescriu a partir de les mateixes entrades prèvies.
      const execucions = [...execucionsPrevies, { actualitzat: avui.toISOString(), anterior: lectura.anterior, escrit: lectura.nou }];
      mkdirSync(dirname(fitxer), { recursive: true });
      writeFileSync(fitxer, `${JSON.stringify({ actualitzat: avui.toISOString(), execucions }, null, 2)}\n`);
      t.set(ref, { ultimNumeroSoci: lectura.nou }, { merge: true });
    }
    return lectura;
  });
  const { analisi, anterior, nou } = resultat;
  informa(analisi, anterior, log);
  log(nou === null ? 'El comptador ja està al dia: no s\'ha escrit res.' : `Comptador escrit: ultimNumeroSoci = ${nou}. Registre a ${fitxer}`);
  return { maxim: analisi.maxim, duplicats: analisi.duplicats, anterior, nou, escrit: nou !== null };
}

export async function desfer({
  fitxer, db, dirBackups = join(ARREL, 'backups'), avui = new Date(), log = console.log,
}) {
  comprovarCopia(dirBackups, avui);
  // Torna al valor d'abans de la PRIMERA execució, però només si el comptador encara val el que va escriure la DARRERA.
  const { execucions } = JSON.parse(readFileSync(fitxer, 'utf8'));
  const { anterior } = execucions[0];
  const { escrit } = execucions[execucions.length - 1];
  const ref = db.collection('configuracio').doc('socis');
  log(`=== Desfer el comptador de números de soci des de ${fitxer} ===`);
  const desfet = await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    const actual = snap.exists ? snap.data().ultimNumeroSoci : undefined;
    if (actual !== escrit) {
      log(`No es desfà: el comptador val ${actual ?? 'res'} i no ${escrit}; ja s'han assignat números des d'aleshores.`);
      return false;
    }
    if (anterior) t.set(ref, anterior);
    else t.delete(ref);
    return true;
  });
  if (desfet) log(anterior ? `Restaurat: ${JSON.stringify(anterior)}` : 'Comptador esborrat (abans no existia).');
  return { desfet };
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
