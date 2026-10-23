// Ús: node scripts/sembra-entitats.mjs [--apply | --desfer <fitxer>]
// Sembra el catàleg `entitats` de Firestore (i en puja els logos a Storage) des de web/src/data/entitats.json
// i web/public/images/entitats/. Document: { nom, logo, url, creatEl }; `logo` és l'URL de descàrrega final.
// Per defecte és un INFORME: només llegeix i mostra el pla. Amb `--apply` puja i crea, només si hi ha la còpia
// de seguretat d'avui (backups/<AAAA-MM-DD>/manifest.json), i registra el que crea a
// backups/<AAAA-MM-DD>/entitats-creades.json (ids i camins de logo) abans de cada escriptura.
// És idempotent per `nom`. `--desfer <fitxer>` esborra NOMÉS els documents d'aquest fitxer (mai fitxers de
// Storage), amb la mateixa guarda de còpia.
// NOTA: la sembra inicial ja es va fer (23/10/2026). Les dades d'origen (web/src/data/entitats.json i els logos
// de web/public/images/entitats/) s'han esborrat del repositori: queden a l'historial de git (commit anterior a
// «eliminar el catàleg d'entitats fix»). Sense elles, el mode informe i `--apply` fallen; `--desfer` continua funcionant.
// Credencials: GOOGLE_APPLICATION_CREDENTIALS o la clau cineclub-socis-firebase-adminsdk-*.json de l'arrel.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ARREL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUCKET = 'cineclub-socis.firebasestorage.app';
const US = 'Ús: node scripts/sembra-entitats.mjs [--apply | --desfer <fitxer>]';
const FITXER_CREADES = 'entitats-creades.json';
const TIPUS = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const EXTENSIO = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

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

// Mateixa normalització que `validarEntitat` de l'admin: sense espais als extrems i sense majúscules.
const normalitza = (nom) => String(nom ?? '').trim().toLowerCase();

export const pla = (entitatsJson, existents) => {
  const noms = new Set(existents.map(normalitza));
  return Object.entries(entitatsJson).map(([nom, dades]) => ({ nom, ...dades, accio: noms.has(normalitza(nom)) ? 'saltar' : 'crear' }));
};

// Rèpliques mínimes de `generarSlug`/`camiLogoEntitat` (src/lib/entitats.js, sessioPublica.js) i `urlStorage`:
// aquests mòduls no es poden importar en Node pla (imports sense extensió). La prova en pinneja l'equivalència.
const TRANSLITERACIO = { ø: 'o', æ: 'ae', ß: 'ss', ł: 'l', đ: 'd', œ: 'oe' };
const slug = (nom) => String(nom ?? '').toLowerCase()
  .replace(/[øæßłđœ]/g, (c) => TRANSLITERACIO[c])
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  .slice(0, 60).replace(/-+$/, '');

const tipusDe = (fitxer) => TIPUS[extname(fitxer).toLowerCase()];

export const camiLogo = (nom, fitxer, instant) => `web/entitats/${slug(nom)}-${instant}.${EXTENSIO[tipusDe(fitxer)]}`;

export const urlLogo = (bucket, cami) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(cami)}?alt=media`;

export const construeixDoc = ({ nom, url }, logo, creatEl) => ({
  nom, ...(logo && { logo }), ...(url && { url }), creatEl,
});

const dirAvui = (dirBackups, avui) => join(dirBackups, avui.toISOString().slice(0, 10));

export function comprovarCopia(dirBackups, avui) {
  const manifest = join(dirAvui(dirBackups, avui), 'manifest.json');
  if (!existsSync(manifest)) {
    throw new Error(`No hi ha cap còpia de seguretat d'avui (${manifest}). Fes-la abans amb \`node scripts/backup-firestore.mjs\` i torna-ho a provar.`);
  }
}

function afegirCreada(fitxer, registre, avui) {
  const anterior = existsSync(fitxer) ? JSON.parse(readFileSync(fitxer, 'utf8')) : { entitats: [] };
  mkdirSync(dirname(fitxer), { recursive: true });
  writeFileSync(fitxer, `${JSON.stringify({ ...anterior, actualitzat: avui.toISOString(), entitats: [...anterior.entitats, registre] }, null, 2)}\n`);
}

export async function sembra({
  db, bucket, entitatsJson, dirLogos, apply = false, dirBackups = join(ARREL, 'backups'), avui = new Date(),
  instant = Date.now(), creatEl = () => new Date(), log = console.log,
}) {
  if (apply) comprovarCopia(dirBackups, avui);
  const col = db.collection('entitats');
  const existents = (await col.get()).docs.map((d) => d.data().nom);
  const accions = pla(entitatsJson, existents);
  const noves = accions.filter((a) => a.accio === 'crear');
  log(`=== Catàleg d'entitats (${apply ? "MODE APPLY: s'escriu" : "MODE INFORME: no s'escriu res"}) ===`);
  for (const a of accions) log(`- ${a.accio === 'crear' ? 'crear ' : 'saltar'} ${a.nom}${a.accio === 'saltar' ? ' (ja existeix, sense distingir majúscules ni espais)' : ''}`);
  log(`Entitats: ${accions.length} | a crear: ${noves.length}`);
  if (!apply) return { pla: accions, creades: [] };

  const fitxerCreades = join(dirAvui(dirBackups, avui), FITXER_CREADES);
  const creades = [];
  for (const entitat of noves) {
    let logo = null;
    let cami = null;
    if (entitat.logo) {
      const local = join(dirLogos, basename(entitat.logo));
      if (!tipusDe(local)) {
        log(`  tipus de logo no admès: ${local}: es crea ${entitat.nom} sense logo.`);
      } else if (existsSync(local)) {
        cami = camiLogo(entitat.nom, local, instant);
        const contentType = tipusDe(local);
        await bucket.file(cami).save(readFileSync(local), {
          contentType, metadata: { contentType, cacheControl: 'public, max-age=31536000' }, resumable: false,
        });
        logo = urlLogo(bucket.name, cami);
      } else {
        log(`  Falta el logo de ${entitat.nom} (${local}): es crea sense logo.`);
      }
    }
    const ref = col.doc();
    afegirCreada(fitxerCreades, { id: ref.id, nom: entitat.nom, ...(cami && { logo: cami }) }, avui);
    await ref.set(construeixDoc(entitat, logo, creatEl()));
    creades.push(ref.id);
    log(`  creada: ${entitat.nom} (${ref.id})`);
  }
  if (creades.length) log(`Creades ${creades.length} entitats. Registre a ${fitxerCreades}`);
  return { pla: accions, creades };
}

// Esborra només els documents de `entitats` llistats al fitxer. Mai toca Storage ni cap altre document.
export async function desfer({
  fitxer, db, dirBackups = join(ARREL, 'backups'), avui = new Date(), log = console.log,
}) {
  comprovarCopia(dirBackups, avui);
  const { entitats = [] } = JSON.parse(readFileSync(fitxer, 'utf8'));
  log(`=== Desfer ${entitats.length} entitats des de ${fitxer} (els logos de Storage no s'esborren) ===`);
  let esborrades = 0;
  let saltades = 0;
  for (const { id, nom } of entitats) {
    const ref = db.collection('entitats').doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      log(`  saltat: ${id} no existeix`);
      saltades++;
    } else if (snap.data().nom !== nom) {
      log(`  saltat: ${id} ha canviat de nom (${nom} → ${snap.data().nom})`);
      saltades++;
    } else {
      await ref.delete();
      log(`  esborrada: ${nom} (${id})`);
      esborrades++;
    }
  }
  log(`Esborrades ${esborrades}, saltades ${saltades}.`);
  return { esborrades, saltades };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { initializeApp, cert, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  const { getStorage } = await import('firebase-admin/storage');

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
  const app = initializeApp({ credential, storageBucket: BUCKET });
  const db = getFirestore(app);

  try {
    if (opcions.desfer) {
      await desfer({ fitxer: opcions.desfer, db });
    } else {
      await sembra({
        db,
        bucket: getStorage(app).bucket(),
        entitatsJson: JSON.parse(readFileSync(join(ARREL, 'web/src/data/entitats.json'), 'utf8')),
        dirLogos: join(ARREL, 'web/public/images/entitats'),
        apply: opcions.apply,
        creatEl: () => FieldValue.serverTimestamp(),
      });
    }
  } catch (err) {
    console.error(`\nERROR: ${err.message}`);
    process.exitCode = 1;
  }
}
