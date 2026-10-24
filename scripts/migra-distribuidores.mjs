// Ús: node scripts/migra-distribuidores.mjs [--apply | --desfer <fitxer>]
// Migra el catàleg fix de distribuïdores del web (web/src/data/distribuidors.json i els logos de
// web/public/images/distribuidors/) al catàleg `distribuidores` de Firestore:
//  1. Per cada entrada amb nom a MAPA_NOMS, puja el logo a Storage (web/distribuidores/<slug>-<instant>.<ext>)
//     i afegeix al document NOMÉS `logo` i `urlPublica` si no hi són (mai els sobreescriu). Si la
//     distribuïdora no és al catàleg, ho diu i se la salta (no la crea).
//  2. A les sessions sense `publica.suportDistribucioId` que tenen un nom antic (MAPA_NOMS) o ja el `nom` exacte
//     d'un document del catàleg, escriu l'id del document a `publica.suportDistribucioId` i, si cal, canvia
//     `publica.suportDistribucio` al `nom` exacte del catàleg, tot en un sol update per sessió. Si la
//     distribuïdora no és al catàleg, no les toca; les que ja tenen id i els valors desconeguts tampoc. Ull:
//     l'update d'una sessió publicada dispara la sincronització del calendari.
// Per defecte és un INFORME: només llegeix i mostra el pla. Amb `--apply` escriu, només si hi ha la còpia de
// seguretat d'avui (backups/<AAAA-MM-DD>/manifest.json), i abans de cada escriptura anota el valor anterior a
// backups/<AAAA-MM-DD>/distribuidores-migracio.json. És idempotent. `--desfer <fitxer>` restableix els valors
// d'aquest fitxer (esborra `logo`/`urlPublica` i els `suportDistribucioId` afegits i torna els noms antics a les
// sessions, un update per document) amb la mateixa guarda de còpia; mai esborra fitxers de Storage.
// NOTA: la migració ja es va fer (24/10/2026). Les dades d'origen (web/src/data/distribuidors.json i els logos de
// web/public/images/distribuidors/) s'han esborrat del repositori: queden a l'historial de git (commit anterior a
// «eliminar el catàleg de distribuïdores fix»). Sense elles, el mode informe i `--apply` fallen; `--desfer` continua funcionant.
// Credencials: GOOGLE_APPLICATION_CREDENTIALS o la clau cineclub-socis-firebase-adminsdk-*.json de l'arrel.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ARREL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUCKET = 'cineclub-socis.firebasestorage.app';
const US = 'Ús: node scripts/migra-distribuidores.mjs [--apply | --desfer <fitxer>]';
const FITXER_REGISTRE = 'distribuidores-migracio.json';
const CAMP_SESSIO = 'publica.suportDistribucio';
const CAMP_SESSIO_ID = 'publica.suportDistribucioId';
const TIPUS = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const EXTENSIO = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Nom del catàleg fix del web -> nom de la distribuïdora al catàleg de Firestore.
export const MAPA_NOMS = {
  'A Contracorriente Films': 'A Contracorriente',
  'BTeam Pictures': 'B-team',
  'Arlong Productions': 'Arlong Productions',
};

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

export const normalitza = (nom) => String(nom ?? '').trim().toLowerCase();

const CANONICS = new Map(Object.entries(MAPA_NOMS).map(([antic, nou]) => [normalitza(antic), nou]));
export const nomCanonic = (nom) => CANONICS.get(normalitza(nom)) ?? null;

const buit = (valor) => String(valor ?? '').trim() === '';

// `distribuidores` i `sessions`: [{ id, ...dades }]. Les sessions sense id passen al `nom` exacte del document
// del catàleg (no al de MAPA_NOMS) i en reben l'id; si la distribuïdora no és al catàleg, no es toquen.
export function pla(distribuidorsJson, distribuidores, sessions) {
  const perNom = new Map();
  for (const d of distribuidores) {
    const clau = normalitza(d.nom);
    perNom.set(clau, [...(perNom.get(clau) ?? []), d]);
  }
  const docDe = (nom) => perNom.get(normalitza(nom))?.[0];
  const exacte = new Map();
  for (const d of distribuidores) if (!exacte.has(d.nom)) exacte.set(d.nom, d);
  const avisos = [];
  for (const docs of perNom.values()) {
    if (docs.length > 1) {
      avisos.push(`AVÍS: noms duplicats al catàleg (sense majúscules ni espais): ${docs.map((d) => `«${d.nom}» (${d.id})`).join(', ')}; s'usa ${docs[0].id}`);
    }
  }
  for (const canonic of new Set(Object.values(MAPA_NOMS))) {
    const doc = docDe(canonic);
    if (doc && doc.nom !== canonic) {
      avisos.push(`AVÍS: «${canonic}» de MAPA_NOMS és «${doc.nom}» al catàleg (${doc.id}): les sessions hi passaran tal com és al catàleg`);
    }
  }
  const sessionsACanviar = [];
  const sessionsSaltades = [];
  for (const { id, titol = '', publicada, publica } of sessions) {
    const abans = publica?.suportDistribucio;
    const idAbans = publica?.suportDistribucioId;
    if (typeof abans !== 'string' || !buit(idAbans)) continue;
    const canonic = nomCanonic(abans);
    const doc = canonic ? docDe(canonic) : exacte.get(abans);
    if (canonic && !doc) sessionsSaltades.push({ id, titol, abans, canonic });
    else if (doc) {
      sessionsACanviar.push({ id, titol, abans, despres: doc.nom, distribuidoraId: doc.id, idAbans, publicada: publicada === true });
    }
  }
  return {
    distribuidores: Object.entries(distribuidorsJson).map(([nomAntic, dades]) => {
      const nom = nomCanonic(nomAntic);
      const doc = nom ? docDe(nom) : undefined;
      const camps = doc ? [dades.logo && buit(doc.logo) && 'logo', dades.url && buit(doc.urlPublica) && 'urlPublica'].filter(Boolean) : [];
      return { nomAntic, nom, id: doc?.id ?? null, ...dades, camps };
    }),
    sessions: sessionsACanviar,
    sessionsSaltades,
    avisos,
  };
}

// Rèpliques mínimes de `generarSlug`/`camiLogoDistribuidora` (src/lib/distribuidores.js, sessioPublica.js) i
// `urlStorage`: aquests mòduls no es poden importar en Node pla (imports sense extensió). La prova en pinneja
// l'equivalència.
const TRANSLITERACIO = { ø: 'o', æ: 'ae', ß: 'ss', ł: 'l', đ: 'd', œ: 'oe' };
const slug = (nom) => String(nom ?? '').toLowerCase()
  .replace(/[øæßłđœ]/g, (c) => TRANSLITERACIO[c])
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  .slice(0, 60).replace(/-+$/, '');

const tipusDe = (fitxer) => TIPUS[extname(fitxer).toLowerCase()];

export const camiLogo = (nom, fitxer, instant) => `web/distribuidores/${slug(nom)}-${instant}.${EXTENSIO[tipusDe(fitxer)]}`;

export const urlLogo = (bucket, cami) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(cami)}?alt=media`;

const dirAvui = (dirBackups, avui) => join(dirBackups, avui.toISOString().slice(0, 10));

export function comprovarCopia(dirBackups, avui) {
  const manifest = join(dirAvui(dirBackups, avui), 'manifest.json');
  if (!existsSync(manifest)) {
    throw new Error(`No hi ha cap còpia de seguretat d'avui (${manifest}). Fes-la abans amb \`node scripts/backup-firestore.mjs\` i torna-ho a provar.`);
  }
}

// Afegeix canvis al registre. D'un camp ja anotat es conserva el primer `abans`/`absent` (el valor original)
// però s'actualitzen `despres`/`cami` a l'últim escrit, perquè `--desfer` funcioni després d'una execució
// parcial reintentada o d'un apply → desfer → apply.
function anotar(fitxer, canvis, avui) {
  const anterior = existsSync(fitxer) ? JSON.parse(readFileSync(fitxer, 'utf8')) : { canvis: [] };
  const clau = (c) => `${c.coleccio}/${c.id}/${c.camp}`;
  const llista = [...anterior.canvis];
  for (const c of canvis) {
    const i = llista.findIndex((x) => clau(x) === clau(c));
    if (i === -1) llista.push(c);
    else llista[i] = { ...llista[i], despres: c.despres, ...(c.cami && { cami: c.cami }) };
  }
  mkdirSync(dirname(fitxer), { recursive: true });
  writeFileSync(fitxer, `${JSON.stringify({ ...anterior, actualitzat: avui.toISOString(), canvis: llista }, null, 2)}\n`);
}

// Fitxer local del logo i el seu estat: 'ok', 'falta' (no és al disc) o 'tipus' (extensió no admesa).
const logoLocal = (dirLogos, logo) => {
  const local = join(dirLogos, basename(logo));
  return { local, estat: !tipusDe(local) ? 'tipus' : existsSync(local) ? 'ok' : 'falta' };
};

const valorAnterior = (valor) => (valor === undefined ? { abans: null, absent: true } : { abans: valor });

export async function migra({
  db, bucket, distribuidorsJson, dirLogos, apply = false, dirBackups = join(ARREL, 'backups'), avui = new Date(),
  instant = Date.now(), log = console.log,
}) {
  if (apply) comprovarCopia(dirBackups, avui);
  const llegeix = async (col) => (await db.collection(col).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const distribuidores = await llegeix('distribuidores');
  const sessions = await llegeix('sessions');
  const p = pla(distribuidorsJson, distribuidores, sessions);
  const perId = new Map(distribuidores.map((d) => [d.id, d]));

  log(`=== Logos, URL públiques i noms de sessions de les distribuïdores (${apply ? "MODE APPLY: s'escriu" : "MODE INFORME: no s'escriu res"}) ===`);
  for (const avis of p.avisos) log(avis);
  for (const d of p.distribuidores) {
    if (!d.nom) log(`- ${d.nomAntic}: sense mapatge a MAPA_NOMS, se salta`);
    else if (!d.id) log(`- ${d.nom}: no existeix al catàleg, se salta (no es crea)`);
    else if (!d.camps.length) log(`- ${d.nom} (${d.id}): ja té logo i URL pública, res a fer`);
    else {
      log(`- ${d.nom} (${d.id}): afegir ${d.camps.join(' i ')}`);
      if (d.camps.includes('logo')) {
        const { local, estat } = logoLocal(dirLogos, d.logo);
        if (estat === 'tipus') log(`  tipus de logo no admès: ${local}: ${d.nom} es quedarà sense logo.`);
        if (estat === 'falta') log(`  Falta el logo de ${d.nom} (${local}): es quedarà sense logo.`);
      }
    }
  }
  const publicades = p.sessions.filter((s) => s.publicada).length;
  const ambNomNou = p.sessions.filter((s) => s.abans !== s.despres).length;
  log(`Sessions a canviar: ${p.sessions.length} (${ambNomNou} de nom, ${p.sessions.length} amb id nou)`);
  for (const s of p.sessions) {
    const nom = s.abans !== s.despres ? `«${s.abans}» → «${s.despres}», ` : '';
    log(`- ${s.id} (${s.titol})${s.publicada ? ' [publicada]' : ''}: ${nom}id → ${s.distribuidoraId}`);
  }
  for (const s of p.sessionsSaltades) {
    log(`- saltada: ${s.id} (${s.titol}): «${s.abans}» no es canvia perquè «${s.canonic}» no existeix al catàleg`);
  }
  log(`${publicades} sessions publicades: es dispararà la sincronització del calendari (no hauria de canviar cap esdeveniment, perquè el suport de distribució no hi surt)`);
  if (!apply) return { pla: p };

  const fitxer = join(dirAvui(dirBackups, avui), FITXER_REGISTRE);
  let escrits = 0;
  for (const d of p.distribuidores.filter((x) => x.camps.length)) {
    const actual = perId.get(d.id);
    const camps = {};
    const canvis = [];
    if (d.camps.includes('logo')) {
      const { local, estat } = logoLocal(dirLogos, d.logo);
      if (estat === 'ok') {
        const cami = camiLogo(actual.nom, local, instant);
        const contentType = tipusDe(local);
        await bucket.file(cami).save(readFileSync(local), {
          contentType, metadata: { contentType, cacheControl: 'public, max-age=31536000' }, resumable: false,
        });
        camps.logo = urlLogo(bucket.name, cami);
        canvis.push({ coleccio: 'distribuidores', id: d.id, camp: 'logo', ...valorAnterior(actual.logo), despres: camps.logo, cami });
      }
    }
    if (d.camps.includes('urlPublica')) {
      camps.urlPublica = d.url;
      canvis.push({ coleccio: 'distribuidores', id: d.id, camp: 'urlPublica', ...valorAnterior(actual.urlPublica), despres: d.url });
    }
    if (!canvis.length) continue;
    anotar(fitxer, canvis, avui);
    await db.collection('distribuidores').doc(d.id).update(camps);
    escrits++;
    log(`  actualitzada: ${d.nom} (${Object.keys(camps).join(', ')})`);
  }
  for (const s of p.sessions) {
    const canvis = [
      ...(s.abans !== s.despres ? [{ coleccio: 'sessions', id: s.id, camp: CAMP_SESSIO, abans: s.abans, despres: s.despres }] : []),
      { coleccio: 'sessions', id: s.id, camp: CAMP_SESSIO_ID, ...valorAnterior(s.idAbans), despres: s.distribuidoraId },
    ];
    anotar(fitxer, canvis, avui);
    await db.collection('sessions').doc(s.id).update(Object.fromEntries(canvis.map((c) => [c.camp, c.despres])));
    escrits++;
  }
  log(escrits ? `Actualitzats ${escrits} documents. Valors anteriors a ${fitxer}` : 'No hi havia res a canviar.');
  return { pla: p };
}

const valorA = (dades, camp) => camp.split('.').reduce((o, k) => o?.[k], dades);

// Restableix els valors del registre amb un sol update per document; `esborraCamp()` és `FieldValue.delete()`.
// Cada camp se salta si ha canviat després de la migració. Mai toca Storage.
export async function desfer({
  fitxer, db, dirBackups = join(ARREL, 'backups'), avui = new Date(), esborraCamp, log = console.log,
}) {
  comprovarCopia(dirBackups, avui);
  const { canvis = [] } = JSON.parse(readFileSync(fitxer, 'utf8'));
  log(`=== Desfer ${canvis.length} canvis des de ${fitxer} (els logos de Storage no s'esborren) ===`);
  let restablerts = 0;
  let saltats = 0;
  const perDocument = new Map();
  for (const c of canvis) {
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
    const camps = {};
    for (const { camp, abans, absent, despres } of delDocument) {
      if (valorA(snap.data(), camp) !== despres) {
        log(`  saltat: ${clau} ${camp} ha canviat després de la migració`);
        saltats++;
      } else {
        camps[camp] = absent ? esborraCamp() : abans;
        restablerts++;
      }
    }
    if (Object.keys(camps).length) await ref.update(camps);
  }
  log(`Restablerts ${restablerts}, saltats ${saltats}.`);
  return { restablerts, saltats };
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
      await desfer({ fitxer: opcions.desfer, db, esborraCamp: () => FieldValue.delete() });
    } else {
      await migra({
        db,
        bucket: getStorage(app).bucket(),
        distribuidorsJson: JSON.parse(readFileSync(join(ARREL, 'web/src/data/distribuidors.json'), 'utf8')),
        dirLogos: join(ARREL, 'web/public/images/distribuidors'),
        apply: opcions.apply,
      });
    }
  } catch (err) {
    console.error(`\nERROR: ${err.message}`);
    process.exitCode = 1;
  }
}
