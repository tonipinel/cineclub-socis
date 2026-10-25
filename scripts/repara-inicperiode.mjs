// Ús: node scripts/repara-inicperiode.mjs [--apply | --desfer <fitxer>]
// Repara l'activació del carnet (`inicPeriode` de `socis`) dels socis que van escanejar amb la taquilla abans que la
// desés la Cloud Function `activarCarnetEnEscanejar`: la taquilla no podia escriure a `socis` i l'activació no es
// desava mai. Per a cada soci actiu, agafa la primera entrada de soci de l'`accessLog` (data a Europe/Madrid, la mateixa
// que fa servir la funció) amb data >= l'inici de la quota i hi aplica `inicPeriodeEnEscanejar`: només canvia els que
// ara no tenen cap activació d'aquesta quota (i no la d'una quota encadenada, que no en té). Les activacions ja desades
// no es toquen; si una és posterior a la primera entrada, només s'informa.
// Per defecte és un INFORME de només lectura: quants socis es corregirien i, per a cadascun (només el número), la
// diferència de venciment en dies i si passa a «Vençut». Cap dada personal.
// Amb `--apply` escriu els canvis, només si hi ha la còpia de seguretat d'avui (backups/<AAAA-MM-DD>/manifest.json).
// Abans d'escriure afegeix una entrada (valor anterior i escrit de cada fitxa) a
// backups/<AAAA-MM-DD>/repara-inicperiode.json, sense esborrar les d'execucions anteriors del mateix dia. És idempotent:
// una segona execució ja no troba res per corregir.
// `--desfer <fitxer>` torna cada fitxa al valor d'abans de la PRIMERA execució del fitxer, amb la mateixa guarda de
// còpia, però només les que encara tenen el valor de la DARRERA execució (si ha canviat, p. ex. per un pagament nou,
// es deixa i s'avisa).
// Credencials: GOOGLE_APPLICATION_CREDENTIALS o la clau cineclub-socis-firebase-adminsdk-*.json de l'arrel.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import activacio from '../functions/activacio-carnet.js';
import { calcularEstatSoci, calcularVenciment, estaActiu, ESTAT_VENCUT } from '../src/lib/estatSoci.js';

const { dataEntrada, dataMadrid, inicPeriodeEnEscanejar } = activacio;
const ARREL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const US = 'Ús: node scripts/repara-inicperiode.mjs [--apply | --desfer <fitxer>]';
const FITXER_REGISTRE = 'repara-inicperiode.json';
const MIDA_LOT = 400;
const MS_PER_DIA = 24 * 60 * 60 * 1000;

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

function numero(valor) {
  const n = Number(valor);
  return valor !== null && valor !== undefined && valor !== '' && Number.isInteger(n) && n > 0 ? n : null;
}

// Dates (AAAA-MM-DD, ordenades) de les entrades vàlides de cada número de soci, amb el mateix filtre que la funció.
export function datesPerNumero(docsEntrades) {
  const perNumero = new Map();
  for (const d of docsEntrades) {
    const entrada = d.data();
    const data = dataEntrada(entrada, d.createTime);
    if (!data) continue;
    const n = numero(entrada.numeroSoci);
    if (!perNumero.has(n)) perNumero.set(n, []);
    perNumero.get(n).push(data);
  }
  for (const dates of perNumero.values()) dates.sort();
  return perNumero;
}

const vencimentIso = (soci) => calcularVenciment(soci).toLocaleDateString('sv-SE');

// Fitxes a corregir. `avui` és la data (Date) amb què es calcula l'estat abans i després.
export function planificar(docsSocis, docsEntrades, avui) {
  const dates = datesPerNumero(docsEntrades);
  const comptador = new Map();
  for (const d of docsSocis) {
    const n = numero(d.data().numeroSoci);
    if (n) comptador.set(n, (comptador.get(n) ?? 0) + 1);
  }
  const corregir = [];
  const posteriors = [];
  const duplicats = new Set();
  let desactivats = 0;
  for (const d of docsSocis) {
    const soci = d.data();
    const n = numero(soci.numeroSoci);
    if (!n || !(soci.vigenciaDes || soci.ultimPagament)) continue;
    const inici = soci.vigenciaDes || soci.ultimPagament;
    const primera = (dates.get(n) ?? []).find((data) => data >= inici);
    if (!primera) continue;
    const inicPeriode = inicPeriodeEnEscanejar(soci, primera);
    if ((inicPeriode ?? null) === (soci.inicPeriode ?? null)) {
      if (soci.inicPeriode && soci.inicPeriode > primera && soci.modeVigencia !== 'encadenada') {
        posteriors.push({ id: d.id, numeroSoci: n, dies: Math.round((Date.parse(primera) - Date.parse(soci.inicPeriode)) / MS_PER_DIA) });
      }
      continue;
    }
    if (comptador.get(n) > 1) {
      duplicats.add(n);
      continue;
    }
    if (!estaActiu(soci)) {
      desactivats++;
      continue;
    }
    const despres = { ...soci, inicPeriode };
    const vencimentAbans = vencimentIso(soci);
    const vencimentDespres = vencimentIso(despres);
    corregir.push({
      id: d.id,
      numeroSoci: n,
      anterior: soci.inicPeriode === undefined ? { absent: true } : { valor: soci.inicPeriode },
      inicPeriode,
      vencimentAbans,
      vencimentDespres,
      dies: Math.round((Date.parse(vencimentDespres) - Date.parse(vencimentAbans)) / MS_PER_DIA),
      passaAVencut: calcularEstatSoci(soci, avui) !== ESTAT_VENCUT && calcularEstatSoci(despres, avui) === ESTAT_VENCUT,
    });
  }
  corregir.sort((a, b) => a.numeroSoci - b.numeroSoci);
  posteriors.sort((a, b) => a.numeroSoci - b.numeroSoci);
  return {
    corregir, posteriors, duplicats: [...duplicats].sort((a, b) => a - b), desactivats, total: docsSocis.length,
  };
}

function informa(pla, entrades, log) {
  log(`Socis: ${pla.total} | entrades de soci a l'accessLog: ${entrades}`);
  log(`Per corregir: ${pla.corregir.length} | passarien a «Vençut» avui: ${pla.corregir.filter((c) => c.passaAVencut).length}`);
  for (const c of pla.corregir) {
    const signe = c.dies > 0 ? '+' : '';
    log(`  soci ${c.numeroSoci}: inicPeriode ${c.inicPeriode} | venciment ${c.vencimentAbans} -> ${c.vencimentDespres} (${signe}${c.dies} dies)${c.passaAVencut ? ' | passa a Vençut' : ''}`);
  }
  if (pla.desactivats) log(`Desactivats amb activació pendent (no es toquen): ${pla.desactivats}`);
  for (const n of pla.duplicats) log(`DUPLICAT: número ${n} (no s'escriu; cal arreglar-ho a mà)`);
  if (pla.posteriors.length) {
    log(`Informatiu, no es toquen: ${pla.posteriors.length} socis amb una activació desada posterior a la primera entrada de la quota:`);
    for (const p of pla.posteriors) log(`  soci ${p.numeroSoci}: primera entrada ${-p.dies} dies abans`);
  }
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
    for (const { id, canvis } of operacions.slice(i, i + MIDA_LOT)) lot.update(db.collection('socis').doc(id), canvis);
    await lot.commit();
  }
}

async function llegir(db) {
  const [socis, entrades] = await Promise.all([
    db.collection('socis').get(),
    db.collection('accessLog').where('tipus', '==', 'soci').select('tipus', 'numeroSoci', 'timestamp', 'escanejatPer').get(),
  ]);
  return { socis: socis.docs, entrades: entrades.docs };
}

export async function executar({
  db, apply = false, dirBackups = join(ARREL, 'backups'), avui = new Date(), log = console.log,
}) {
  if (apply) comprovarCopia(dirBackups, avui);
  log(`=== Reparar inicPeriode (${apply ? "MODE APPLY: s'escriu" : "MODE INFORME: no s'escriu res"}) — avui ${dataMadrid(avui)} ===`);
  const { socis, entrades } = await llegir(db);
  const pla = planificar(socis, entrades, avui);
  informa(pla, entrades.length, log);
  const resum = {
    corregir: pla.corregir.length, posteriors: pla.posteriors.length, duplicats: pla.duplicats, escrit: false,
  };
  if (!apply || pla.corregir.length === 0) {
    log(pla.corregir.length === 0 ? 'Res per corregir.' : `Amb --apply s'escriurien ${pla.corregir.length} fitxes.`);
    return resum;
  }

  const fitxer = join(dirAvui(dirBackups, avui), FITXER_REGISTRE);
  const execucionsPrevies = existsSync(fitxer) ? JSON.parse(readFileSync(fitxer, 'utf8')).execucions ?? [] : [];
  const canvis = pla.corregir.map(({ id, numeroSoci, anterior, inicPeriode }) => ({ id, numeroSoci, anterior, escrit: inicPeriode }));
  const execucions = [...execucionsPrevies, { actualitzat: avui.toISOString(), canvis }];
  mkdirSync(dirname(fitxer), { recursive: true });
  writeFileSync(fitxer, `${JSON.stringify({ actualitzat: avui.toISOString(), execucions }, null, 2)}\n`);
  await escriureEnLots(db, canvis.map(({ id, escrit }) => ({ id, canvis: { inicPeriode: escrit } })));
  log(`Escrites ${canvis.length} fitxes de socis. Registre a ${fitxer}`);
  return { ...resum, escrit: true };
}

// `esborrarCamp`: el valor que esborra un camp (FieldValue.delete() de l'Admin SDK), per a les fitxes que no en tenien.
export async function desfer({
  fitxer, db, esborrarCamp, dirBackups = join(ARREL, 'backups'), avui = new Date(), log = console.log,
}) {
  comprovarCopia(dirBackups, avui);
  const { execucions } = JSON.parse(readFileSync(fitxer, 'utf8'));
  const perId = new Map();
  for (const { canvis } of execucions) {
    for (const { id, anterior, escrit } of canvis) {
      perId.set(id, { anterior: perId.has(id) ? perId.get(id).anterior : anterior, escrit });
    }
  }
  log(`=== Desfer inicPeriode des de ${fitxer} ===`);
  const restaurar = [];
  let saltats = 0;
  for (const [id, { anterior, escrit }] of perId) {
    const snap = await db.collection('socis').doc(id).get();
    if (!snap.exists || snap.data().inicPeriode !== escrit) {
      log(`No es desfà socis/${id}: ha canviat des d'aleshores.`);
      saltats++;
      continue;
    }
    restaurar.push({ id, canvis: { inicPeriode: anterior.absent ? esborrarCamp : anterior.valor } });
  }
  await escriureEnLots(db, restaurar);
  log(`Restaurades ${restaurar.length} fitxes; ${saltats} sense tocar.`);
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
