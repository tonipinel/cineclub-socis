// Ús: node scripts/import-excel.js <fitxer.xlsx> [--apply] | node scripts/import-excel.js --desfer <fitxer>
// Importa el cens de l'Excel a Firestore: les files amb número de soci/a són socis (`socis`) i les que no en
// tenen, sol·licituds pendents (`solicituds`).
// Per defecte és un INFORME: només llegeix i mostra el pla (què es crearia, què es completaria, què se salta).
// Amb `--apply` escriu, només si hi ha la còpia de seguretat d'avui (backups/<AAAA-MM-DD>/manifest.json), i
// abans de cada escriptura anota el valor anterior (o el document creat) a
// backups/<AAAA-MM-DD>/import-excel-registre.json.
// És idempotent:
//  - Un soci que ja existeix (mateix `numeroSoci` i mateix nom) no es reescriu: només se n'omplen els camps de
//    contacte buits (mai un DNI o correu que ja sigui d'un altre soci), mai se'n sobreescriu cap valor. Si el
//    nom no coincideix, és un conflicte i no es toca. `ultimPagament`, `inicPeriode`, `actiu`, `tokenCarnet`, `dataAlta`
//    i `notaImportacio` d'un soci existent no es toquen mai (ni es reactiva un soci desactivat).
//  - Un número nou amb el mateix DNI, correu o nom complet que un soci existent és un conflicte: no es crea.
//  - Els socis nous es creen amb carnet (`tokenCarnet`) i la seva entrada a `socisPublic`.
//  - Una sol·licitud no es crea si ja n'hi ha una (de qualsevol estat) amb el mateix correu o el mateix nom
//    i telèfon, ni si la persona ja és sòcia (els socis es planifiquen primer). Es creen amb `importat: true`
//    perquè la funció `notificarNovaSolicitud` no enviï cap correu: CAL DESPLEGAR LES FUNCIONS ABANS DE `--apply`.
// `--desfer <fitxer>` esborra els documents creats (un soci, junt amb el seu socisPublic) i restableix els camps
// omplerts d'aquest fitxer, saltant el que hagi canviat després de la importació, amb la mateixa guarda de còpia.
// Credencials: GOOGLE_APPLICATION_CREDENTIALS o la clau cineclub-socis-firebase-adminsdk-*.json de l'arrel.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapExcelRowToSoci, mapExcelRowToSolicitud } from './importMapping.js';

const ARREL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const US = 'Ús: node scripts/import-excel.js <fitxer.xlsx> [--apply] | node scripts/import-excel.js --desfer <fitxer>';
const FITXER_REGISTRE = 'import-excel-registre.json';

export const CAPCALERES = {
  'Número de soci/a': 'numeroSoci',
  'Nom': 'nom',
  'Cognoms': 'cognoms',
  'Població': 'poblacio',
  'Codi postal': 'codiPostal',
  'Telèfon': 'telefon',
  'Correu electrònic': 'correuElectronic',
  'Estat pagament': 'estatPagament',
  'Correu pagament': 'correuPagament',
  'DNI': 'dni',
  'Grup whatsapp': 'grupWhatsapp',
};

// Camps que es poden completar en un soci existent, i només si hi són buits.
const CAMPS_OMPLIBLES = ['nom', 'cognoms', 'poblacio', 'codiPostal', 'telefon', 'correuElectronic', 'dni', 'grupWhatsapp'];

export function llegirOpcions(argv) {
  const opcions = { excel: null, apply: false, desfer: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') opcions.apply = true;
    else if (argv[i] === '--desfer' && argv[i + 1]) opcions.desfer = argv[++i];
    else if (!argv[i].startsWith('--') && opcions.excel === null) opcions.excel = argv[i];
    else throw new Error(`Opció desconeguda o incompleta: ${argv[i]}`);
  }
  if (opcions.desfer && (opcions.apply || opcions.excel)) throw new Error('--desfer no es pot combinar amb --apply ni amb un fitxer Excel');
  if (!opcions.desfer && !opcions.excel) throw new Error('Falta el fitxer Excel');
  return opcions;
}

// `valors`: les files del full com a llistes de valors (la primera, les capçaleres).
export function filesDeValors(valors) {
  const [capcaleres = [], ...resta] = valors;
  const avisos = capcaleres
    .filter((c) => c !== undefined && c !== null && !(c in CAPCALERES))
    .map((c) => `AVÍS: capçalera desconeguda, s'ignora: «${c}»`);
  const camps = capcaleres.map((c) => CAPCALERES[c] ?? null);
  const files = [];
  resta.forEach((fila, i) => {
    if (fila.every((v) => v === undefined || v === null)) return;
    const row = { fila: i + 2 };
    camps.forEach((camp, j) => {
      if (camp) row[camp] = fila[j];
    });
    files.push(row);
  });
  return { files, avisos };
}

// Rèplica mínima de `calcularNomPublic` (src/lib/propostes.js), que no es pot importar en Node pla (imports
// sense extensió). La prova en pinneja l'equivalència.
export function nomPublic(soci) {
  if (soci.organitzacio) return 'Organització Cineclub Roda de Berà';
  const cognoms = (soci.cognoms ?? '').trim();
  if (!cognoms) return soci.nom;
  return `${soci.nom} ${cognoms.charAt(0).toUpperCase()}.`;
}

const buit = (valor) => String(valor ?? '').trim() === '';
const sensAccents = (text) => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const clauCorreu = (c) => (buit(c) ? null : `correu:${String(c).trim().toLowerCase()}`);
const clauDni = (d) => (buit(d) ? null : `dni:${String(d).toUpperCase().replace(/[\s.-]/g, '')}`);
const nomComplet = (s) => sensAccents(`${s.nom ?? ''} ${s.cognoms ?? ''}`).toLowerCase().replace(/\s+/g, ' ').trim();
const clauNom = (s) => (nomComplet(s) ? `nom:${nomComplet(s)}` : null);
const clauNomTelefon = (s) => {
  const telefon = String(s.telefon ?? '').replace(/\D/g, '');
  return nomComplet(s) && telefon ? `nomtel:${nomComplet(s)}|${telefon}` : null;
};
const clausPersona = (s) => [clauDni(s.dni), clauCorreu(s.correuElectronic), clauNom(s)].filter(Boolean);
const clausSolicitud = (s) => [clauCorreu(s.correuElectronic), clauNomTelefon(s)].filter(Boolean);

export const numeroDe = (valor) => {
  const n = Number(String(valor ?? '').trim());
  return Number.isInteger(n) && n > 0 ? n : null;
};

// Índex clau -> [id] per detectar coincidències.
function indexa(docs, clausDe) {
  const index = new Map();
  for (const d of docs) for (const clau of clausDe(d)) index.set(clau, [...(index.get(clau) ?? []), d.id]);
  return index;
}
const coincidencia = (index, claus) => claus.map((c) => index.get(c)?.[0]).find(Boolean);

// El nom de l'Excel és el del soci si, sense accents ni majúscules, les paraules d'un són totes a l'altre
// («Anna Vidal» i «Anna Maria Vidal»). Si el soci no té nom, qualsevol nom de l'Excel hi encaixa.
function mateixNom(excel, actual) {
  const paraules = (s) => nomComplet(s).split(' ').filter(Boolean);
  const a = paraules(excel);
  const b = paraules(actual);
  if (!b.length) return a.length > 0;
  const [curt, llarg] = a.length <= b.length ? [a, b] : [b, a];
  return curt.length > 0 && curt.every((p) => llarg.includes(p));
}
const CLAU_CAMP = { dni: clauDni, correuElectronic: clauCorreu };

// `files`: sortida de `filesDeValors`. `existents`: { socis: [{ id, ...dades }], solicituds: [{ id, ...dades }] }.
export function pla(files, existents, dataImportacio) {
  const avisos = [];
  const perNumero = new Map();
  for (const s of existents.socis) {
    const n = numeroDe(s.numeroSoci);
    if (n) perNumero.set(n, [...(perNumero.get(n) ?? []), s]);
  }
  const persones = indexa(existents.socis, clausPersona);
  const solicitudsExistents = indexa(existents.solicituds, clausSolicitud);
  const numerosExcel = new Map();
  const solicitudsExcel = new Map();
  const socis = [];
  const solicituds = [];

  const ambFila = files.map((row, i) => ({ row, fila: row.fila ?? i + 2, soci: mapExcelRowToSoci(row, dataImportacio) }));
  // Primer els socis i després les sol·licituds: així una persona que surt a totes dues files no acaba sent
  // sòcia i sol·licitant alhora, sigui quin sigui l'ordre de l'Excel.
  for (const { fila, soci } of ambFila.filter((f) => !buit(f.soci.numeroSoci))) {
    const numero = numeroDe(soci.numeroSoci);
    if (!numero) {
      avisos.push(`AVÍS: fila ${fila}: número de soci/a no vàlid («${soci.numeroSoci}»), se salta`);
      socis.push({ fila, accio: 'conflicte', numeroSoci: soci.numeroSoci });
      continue;
    }
    if (numerosExcel.has(numero)) {
      avisos.push(`AVÍS: fila ${fila}: número ${numero} repetit a l'Excel (ja és a la fila ${numerosExcel.get(numero)}), se salta`);
      socis.push({ fila, accio: 'conflicte', numeroSoci: numero });
      continue;
    }
    numerosExcel.set(numero, fila);
    const mateixNumero = perNumero.get(numero) ?? [];
    if (mateixNumero.length > 1) {
      avisos.push(`AVÍS: fila ${fila}: número ${numero} duplicat a Firestore (${mateixNumero.map((s) => s.id).join(', ')}), no es toca`);
      socis.push({ fila, accio: 'conflicte', numeroSoci: numero });
      continue;
    }
    if (mateixNumero.length === 1) {
      const actual = mateixNumero[0];
      if (!mateixNom(soci, actual)) {
        const nomActual = `${actual.nom ?? ''} ${actual.cognoms ?? ''}`.trim();
        avisos.push(`AVÍS: fila ${fila}: soci ${numero}: l'Excel diu «${soci.nom} ${soci.cognoms}» però a Firestore (${actual.id}) és «${nomActual}»; no es toca`);
        socis.push({ fila, accio: 'conflicte', numeroSoci: numero, id: actual.id });
        continue;
      }
      const camps = {};
      for (const camp of CAMPS_OMPLIBLES.filter((c) => buit(actual[c]) && !buit(soci[c]))) {
        const clau = CLAU_CAMP[camp]?.(soci[camp]);
        const altre = clau && (persones.get(clau) ?? []).find((id) => id !== actual.id);
        if (altre) avisos.push(`AVÍS: fila ${fila}: no s'omple ${camp} del soci ${numero} perquè ja és de ${altre}`);
        else camps[camp] = soci[camp];
      }
      const omplir = Object.keys(camps).length > 0;
      socis.push({ fila, accio: omplir ? 'omplir' : 'saltar', id: actual.id, numeroSoci: numero, ...(omplir && { camps }) });
      if (actual.tokenCarnet && (camps.nom || camps.cognoms)) {
        avisos.push(`AVÍS: fila ${fila}: el nom públic del soci ${numero} no s'actualitza; desa'n la fitxa des de l'admin`);
      }
      continue;
    }
    const altre = coincidencia(persones, clausPersona(soci));
    if (altre) {
      avisos.push(`AVÍS: fila ${fila}: el número ${numero} no existeix però la persona coincideix (DNI, correu o nom) amb el soci ${altre}; no es crea`);
      socis.push({ fila, accio: 'conflicte', numeroSoci: numero, id: altre });
      continue;
    }
    clausPersona(soci).forEach((c) => persones.set(c, [`la fila ${fila}`]));
    socis.push({ fila, accio: 'crear', numeroSoci: numero, dades: { ...soci, numeroSoci: numero } });
  }

  for (const { row, fila, soci } of ambFila.filter((f) => buit(f.soci.numeroSoci))) {
    const dades = { ...mapExcelRowToSolicitud(row), importat: true };
    const claus = clausSolicitud(dades);
    if (!claus.length && !nomComplet(dades)) {
      avisos.push(`AVÍS: fila ${fila}: sense número, nom ni correu, se salta`);
      solicituds.push({ fila, accio: 'saltar' });
      continue;
    }
    const jaSoci = coincidencia(persones, clausPersona({ ...dades, dni: soci.dni }));
    const jaSolicitud = coincidencia(solicitudsExistents, claus);
    const filaAnterior = claus.map((c) => solicitudsExcel.get(c)).find(Boolean);
    const motiu = jaSoci ?? jaSolicitud ?? (filaAnterior && `fila ${filaAnterior}`);
    if (motiu) {
      solicituds.push({ fila, accio: 'saltar', motiu });
      continue;
    }
    claus.forEach((c) => solicitudsExcel.set(c, fila));
    solicituds.push({ fila, accio: 'crear', dades });
  }
  return { socis, solicituds, avisos };
}

const dirAvui = (dirBackups, avui) => join(dirBackups, avui.toISOString().slice(0, 10));

export function comprovarCopia(dirBackups, avui) {
  const manifest = join(dirAvui(dirBackups, avui), 'manifest.json');
  if (!existsSync(manifest)) {
    throw new Error(`No hi ha cap còpia de seguretat d'avui (${manifest}). Fes-la abans amb \`node scripts/backup-firestore.mjs\` i torna-ho a provar.`);
  }
}

function anotar(fitxer, canvis, avui) {
  const anterior = existsSync(fitxer) ? JSON.parse(readFileSync(fitxer, 'utf8')) : { canvis: [] };
  mkdirSync(dirname(fitxer), { recursive: true });
  // Primer a un temporal i després es reanomena: un tall a mig escriure no deixa el registre trencat.
  writeFileSync(`${fitxer}.tmp`, `${JSON.stringify({ ...anterior, actualitzat: avui.toISOString(), canvis: [...anterior.canvis, ...canvis] }, null, 2)}\n`);
  renameSync(`${fitxer}.tmp`, fitxer);
}

// Si qualsevol d'aquests camps d'un soci creat canvia (s'hi ha registrat un pagament, un escaneig o s'ha
// editat), `--desfer` ja no l'esborra.
const CONTROL_SOCI = ['numeroSoci', 'nom', 'cognoms', 'tokenCarnet', 'ultimPagament', 'inicPeriode', 'actiu'];

const valorAnterior = (valor) => (valor === undefined ? { abans: null, absent: true } : { abans: valor });

export async function importa({
  db, files, avisos: avisosExcel = [], apply = false, dirBackups = join(ARREL, 'backups'), avui = new Date(),
  nouToken = () => crypto.randomUUID(), ara = () => new Date(), log = console.log,
}) {
  if (apply) comprovarCopia(dirBackups, avui);
  const dataImportacio = avui.toISOString().slice(0, 10);
  const llegeix = async (col) => (await db.collection(col).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const socisExistents = await llegeix('socis');
  const p = pla(files, { socis: socisExistents, solicituds: await llegeix('solicituds') }, dataImportacio);
  const perId = new Map(socisExistents.map((s) => [s.id, s]));
  const compta = (llista, accio) => llista.filter((x) => x.accio === accio).length;

  log(`=== Importació del cens des de l'Excel (${apply ? "MODE APPLY: s'escriu" : "MODE INFORME: no s'escriu res"}) ===`);
  for (const avis of [...avisosExcel, ...p.avisos]) log(avis);
  for (const s of p.socis) {
    if (s.accio === 'crear') log(`- crear  soci ${s.numeroSoci}: ${s.dades.nom} ${s.dades.cognoms} (fila ${s.fila})`);
    if (s.accio === 'omplir') log(`- omplir soci ${s.numeroSoci} (${s.id}): ${Object.keys(s.camps).join(', ')} (fila ${s.fila})`);
  }
  for (const s of p.solicituds) {
    if (s.accio === 'crear') log(`- crear  sol·licitud: ${s.dades.nom} ${s.dades.cognoms} (fila ${s.fila})`);
    if (s.accio === 'saltar' && s.motiu) log(`- saltar sol·licitud de la fila ${s.fila}: ja hi és (${s.motiu})`);
  }
  log(`Socis: ${compta(p.socis, 'crear')} a crear, ${compta(p.socis, 'omplir')} a completar, ${compta(p.socis, 'saltar')} sense canvis, ${compta(p.socis, 'conflicte')} en conflicte`);
  log(`Sol·licituds: ${compta(p.solicituds, 'crear')} a crear, ${compta(p.solicituds, 'saltar')} saltades`);
  if (compta(p.socis, 'crear')) log(`Els socis nous es creen actius, amb ultimPagament ${dataImportacio} i amb carnet nou.`);
  if (!apply) return { pla: p };

  const fitxer = join(dirAvui(dirBackups, avui), FITXER_REGISTRE);
  let escrits = 0;
  for (const s of p.socis) {
    if (s.accio === 'omplir') {
      const actual = perId.get(s.id);
      anotar(fitxer, Object.entries(s.camps).map(([camp, despres]) => (
        { tipus: 'camp', coleccio: 'socis', id: s.id, camp, ...valorAnterior(actual[camp]), despres }
      )), avui);
      await db.collection('socis').doc(s.id).update(s.camps);
      escrits++;
    } else if (s.accio === 'crear') {
      const dades = { ...s.dades, tokenCarnet: nouToken() };
      const ref = db.collection('socis').doc();
      const refPublic = db.collection('socisPublic').doc(dades.tokenCarnet);
      // El soci i el seu socisPublic van junts: `--desfer` els esborra tots dos o cap.
      anotar(fitxer, [{
        tipus: 'creat', coleccio: 'socis', id: ref.id, socisPublic: refPublic.id,
        control: Object.fromEntries(CONTROL_SOCI.map((camp) => [camp, dades[camp] ?? null])),
      }], avui);
      const batch = db.batch();
      batch.set(ref, dades);
      batch.set(refPublic, { numeroSoci: dades.numeroSoci, nomPublic: nomPublic(dades) });
      await batch.commit();
      escrits++;
    }
  }
  for (const s of p.solicituds.filter((x) => x.accio === 'crear')) {
    const ref = db.collection('solicituds').doc();
    anotar(fitxer, [{ tipus: 'creat', coleccio: 'solicituds', id: ref.id, control: { nom: s.dades.nom, correuElectronic: s.dades.correuElectronic, estat: s.dades.estat } }], avui);
    await ref.set({ ...s.dades, timestamp: ara() });
    escrits++;
  }
  log(escrits ? `Escrits ${escrits} documents. Valors anteriors a ${fitxer}` : 'No hi havia res a canviar.');
  return { pla: p };
}

// Esborra els documents creats i restableix els camps omplerts del registre (un update per document);
// `esborraCamp()` és `FieldValue.delete()`. Se salta tot el que hagi canviat després de la importació.
export async function desfer({
  fitxer, db, dirBackups = join(ARREL, 'backups'), avui = new Date(), esborraCamp, log = console.log,
}) {
  comprovarCopia(dirBackups, avui);
  const { canvis = [] } = JSON.parse(readFileSync(fitxer, 'utf8'));
  log(`=== Desfer ${canvis.length} canvis des de ${fitxer} ===`);
  let restablerts = 0;
  let saltats = 0;
  const perDocument = new Map();
  for (const c of canvis.filter((x) => x.tipus === 'camp')) {
    const clau = `${c.coleccio}/${c.id}`;
    perDocument.set(clau, [...(perDocument.get(clau) ?? []), c]);
  }
  for (const [clau, delDocument] of perDocument) {
    const { coleccio, id } = delDocument[0];
    const ref = db.collection(coleccio).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      log(`  saltat: ${clau} no existeix`);
      saltats += delDocument.length;
      continue;
    }
    const restablir = {};
    for (const { camp, abans, absent, despres } of delDocument) {
      if (snap.data()[camp] !== despres) {
        log(`  saltat: ${clau} ${camp} ha canviat després de la importació`);
        saltats++;
      } else {
        restablir[camp] = absent ? esborraCamp() : abans;
        restablerts++;
      }
    }
    if (Object.keys(restablir).length) await ref.update(restablir);
  }
  for (const { coleccio, id, control = {}, socisPublic } of canvis.filter((x) => x.tipus === 'creat')) {
    const clau = `${coleccio}/${id}${socisPublic ? ` (i socisPublic/${socisPublic})` : ''}`;
    const ref = db.collection(coleccio).doc(id);
    const snap = await ref.get();
    const canviats = snap.exists ? Object.keys(control).filter((k) => (snap.data()[k] ?? null) !== control[k]) : [];
    if (!snap.exists) {
      log(`  saltat: ${clau} no existeix`);
      saltats++;
    } else if (canviats.length) {
      log(`  saltat: ${clau} ha canviat després de la importació (${canviats.join(', ')})`);
      saltats++;
    } else {
      const batch = db.batch();
      batch.delete(ref);
      if (socisPublic) batch.delete(db.collection('socisPublic').doc(socisPublic));
      await batch.commit();
      log(`  esborrat: ${clau}`);
      restablerts++;
    }
  }
  log(`Restablerts ${restablerts}, saltats ${saltats}.`);
  return { restablerts, saltats };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { initializeApp, cert, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore, FieldValue, Timestamp } = await import('firebase-admin/firestore');

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
    if (opcions.desfer) {
      await desfer({ fitxer: opcions.desfer, db, esborraCamp: () => FieldValue.delete() });
    } else {
      const { default: ExcelJS } = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(opcions.excel);
      const full = workbook.worksheets[0];
      const valors = [];
      for (let n = 1; n <= full.rowCount; n++) valors.push(full.getRow(n).values.slice(1));
      const { files, avisos } = filesDeValors(valors);
      await importa({ db, files, avisos, apply: opcions.apply, ara: () => Timestamp.now() });
    }
  } catch (err) {
    console.error(`\nERROR: ${err.message}`);
    process.exitCode = 1;
  }
}
