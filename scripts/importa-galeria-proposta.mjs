// Ús: node scripts/importa-galeria-proposta.mjs [--apply | --desfer <fitxer>] [--sessio <id>]
// Posa a `publica.galeria` les escenes de TMDB de la proposta (`propostes/{id}.imatges`) a les sessions programades
// des d'una proposta que encara no tenen galeria, amb la MATEIXA lògica que la callable `importarGaleriaSessio`
// (functions/galeria-sessio.js): només de image.tmdb.org, amb paths validats, màxim 5, a
// `web/sessions/<id de la sessió>/gallery-N.<jpg|png>`, i sense tocar mai una galeria que ja tingui imatges.
// Per defecte és un INFORME de només lectura: les sessions afectades, amb el nombre d'imatges.
// Amb `--apply` les importa, només si hi ha la còpia de seguretat d'avui (backups/<AAAA-MM-DD>/manifest.json). ABANS
// d'escriure afegeix una execució a backups/<AAAA-MM-DD>/galeria-proposta.json (galeria i `actualitzatEl` d'abans i els
// fitxers previstos de cada sessió) i després hi anota el resultat. És idempotent: una sessió amb galeria no es toca.
// `--desfer <fitxer>` només desfà les sessions amb resultat «importada»: torna la galeria a l'estat d'abans de la
// PRIMERA execució, l'`actualitzatEl` també si encara és el que s'hi va escriure, i esborra els fitxers que s'hi van
// posar (també els dels registres antics, amb noms `gallery-N`). Té la mateixa guarda de còpia; si la galeria actual té
// alguna imatge que no és d'aquest script (l'admin l'ha canviada), aquella sessió no es toca i s'avisa.
// `--sessio <id>` ho limita a una sessió.
// Credencials: GOOGLE_APPLICATION_CREDENTIALS o la clau cineclub-socis-firebase-adminsdk-*.json de l'arrel.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import galeria from '../functions/galeria-sessio.js';

const { galeriaDe, planificarGaleria, importarGaleria } = galeria;
const ARREL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const US = 'Ús: node scripts/importa-galeria-proposta.mjs [--apply | --desfer <fitxer>] [--sessio <id>]';
const BUCKET = 'cineclub-socis.firebasestorage.app';
const FITXER_REGISTRE = 'galeria-proposta.json';

export function llegirOpcions(argv) {
  const opcions = { apply: false, desfer: null, sessio: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') opcions.apply = true;
    else if (argv[i] === '--desfer' && argv[i + 1]) opcions.desfer = argv[++i];
    else if (argv[i] === '--sessio' && argv[i + 1]) opcions.sessio = argv[++i];
    else throw new Error(`Opció desconeguda o incompleta: ${argv[i]}`);
  }
  if (opcions.apply && opcions.desfer) throw new Error('--apply i --desfer no es poden combinar');
  return opcions;
}

// Sessions amb proposta, sense galeria, la proposta de les quals té `imatges`.
export function candidates(docsSessions, propostes, bucket, nomesSessio = null) {
  return docsSessions.flatMap((doc) => {
    const sessio = doc.data();
    if (nomesSessio && doc.id !== nomesSessio) return [];
    if (!sessio.propostaId || galeriaDe(sessio).length > 0) return [];
    const imatges = propostes.get(sessio.propostaId)?.imatges;
    if (!Array.isArray(imatges) || imatges.length === 0) return [];
    const pla = planificarGaleria(doc.id, imatges, bucket);
    return [{
      id: doc.id,
      titol: sessio.titol ?? '',
      propostaId: sessio.propostaId,
      imatges: pla.imatges.length,
      rebutjats: pla.rebutjats,
      previstos: pla.imatges.map(({ cami, url }) => ({ cami, url })),
      abans: {
        galeria: sessio.publica?.galeria ?? null,
        actualitzatEl: sessio.publica?.actualitzatEl ?? null,
        publicada: Boolean(sessio.publicada),
      },
    }];
  });
}

const dirAvui = (dirBackups, avui) => join(dirBackups, avui.toISOString().slice(0, 10));

export function comprovarCopia(dirBackups, avui) {
  const manifest = join(dirAvui(dirBackups, avui), 'manifest.json');
  if (!existsSync(manifest)) {
    throw new Error(`No hi ha cap còpia de seguretat d'avui (${manifest}). Fes-la abans amb \`node scripts/backup-firestore.mjs\` i torna-ho a provar.`);
  }
}

const desarRegistre = (fitxer, execucions, avui) => {
  mkdirSync(dirname(fitxer), { recursive: true });
  writeFileSync(fitxer, `${JSON.stringify({ actualitzat: avui.toISOString(), execucions }, null, 2)}\n`);
};

export async function executar({
  db, bucket, apply = false, sessio = null, fetchFn = fetch, dirBackups = join(ARREL, 'backups'), avui = new Date(),
  log = console.log,
}) {
  if (apply) comprovarCopia(dirBackups, avui);
  log(`=== Galeria de TMDB de les sessions programades (${apply ? "MODE APPLY: s'escriu" : "MODE INFORME: no s'escriu res"}) ===`);
  const [sessions, propostes] = await Promise.all([db.collection('sessions').get(), db.collection('propostes').get()]);
  const perId = new Map(propostes.docs.map((d) => [d.id, d.data()]));
  const llista = candidates(sessions.docs, perId, bucket?.name ?? BUCKET, sessio);
  const ambProposta = sessions.docs.filter((d) => d.data().propostaId).length;
  log(`Sessions: ${sessions.docs.length} | amb proposta: ${ambProposta} | sense galeria i amb imatges a la proposta: ${llista.length}`);
  for (const c of llista) {
    log(`- sessions/${c.id} (${c.titol}) ← propostes/${c.propostaId}: ${c.imatges} imatges${c.rebutjats ? `, ${c.rebutjats} paths invàlids` : ''}`);
  }
  if (!apply || llista.length === 0) {
    log(llista.length === 0 ? 'Res a importar.' : `Amb --apply s'importarien les imatges de ${llista.length} sessions.`);
    return { candidates: llista, resultats: [] };
  }

  const fitxer = join(dirAvui(dirBackups, avui), FITXER_REGISTRE);
  const previes = existsSync(fitxer) ? JSON.parse(readFileSync(fitxer, 'utf8')).execucions ?? [] : [];
  const execucio = { actualitzat: avui.toISOString(), sessions: llista.map(({ id, abans, previstos }) => ({ id, abans, previstos })) };
  desarRegistre(fitxer, [...previes, execucio], avui);
  const resultats = [];
  for (const entrada of execucio.sessions) {
    try {
      const {
        estat, galeria: urls, fallades, actualitzatEl,
      } = await importarGaleria({ db, bucket, fetchFn, ara: () => avui.getTime(), log }, entrada.id);
      entrada.resultat = { estat, galeria: urls, fallades, ...(actualitzatEl && { actualitzatEl }) };
    } catch (err) {
      entrada.resultat = { estat: 'error', error: err.message };
    }
    const r = entrada.resultat;
    resultats.push({ id: entrada.id, ...r });
    log(`  sessions/${entrada.id}: ${r.estat}${r.error ? `: ${r.error}` : ` (${r.galeria.length} imatges, ${r.fallades} fallades)`}`);
    desarRegistre(fitxer, [...previes, execucio], avui);
  }
  log(`Fet. Registre a ${fitxer}`);
  return { candidates: llista, resultats };
}

export async function desfer({
  fitxer, db, bucket, sessio = null, esborraCamp, dirBackups = join(ARREL, 'backups'), avui = new Date(), log = console.log,
}) {
  comprovarCopia(dirBackups, avui);
  const { execucions = [] } = JSON.parse(readFileSync(fitxer, 'utf8'));
  // Per sessió, només de les execucions que la van importar: l'estat d'abans de la primera, les URL i els fitxers
  // escrits (els previstos que van entrar a la galeria) i l'`actualitzatEl` de la darrera.
  const perId = new Map();
  for (const { sessions = [] } of execucions) {
    for (const { id, abans, previstos = [], resultat } of sessions) {
      if ((sessio && id !== sessio) || resultat?.estat !== 'importada') continue;
      const actual = perId.get(id) ?? { abans, urls: new Set(), camins: new Set(), actualitzatEl: null };
      for (const p of previstos.filter((q) => resultat.galeria?.includes(q.url))) {
        actual.urls.add(p.url);
        actual.camins.add(p.cami);
      }
      actual.actualitzatEl = resultat.actualitzatEl ?? null;
      perId.set(id, actual);
    }
  }
  log(`=== Desfer la galeria de ${perId.size} sessions des de ${fitxer} ===`);
  let desfets = 0;
  let saltats = 0;
  for (const [id, { abans, urls, camins, actualitzatEl }] of perId) {
    const ref = db.collection('sessions').doc(id);
    const restaurat = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return 'esborrada';
      const dades = snap.data();
      if (!galeriaDe(dades).every((u) => urls.has(u))) return 'canviada';
      const camps = { 'publica.galeria': abans.galeria ?? esborraCamp() };
      // Només si ningú no l'ha mogut des d'aleshores (els registres antics no el tenen: no es toca).
      if (actualitzatEl && dades.publica?.actualitzatEl === actualitzatEl) {
        camps['publica.actualitzatEl'] = abans.actualitzatEl ?? esborraCamp();
      }
      tx.update(ref, camps);
      return 'ok';
    });
    if (restaurat === 'canviada') {
      log(`No es desfà sessions/${id}: la galeria té imatges que no són d'aquest script.`);
      saltats++;
      continue;
    }
    await Promise.all([...camins].map((cami) => bucket.file(cami).delete({ ignoreNotFound: true })));
    log(`sessions/${id}: ${restaurat === 'ok' ? 'galeria restaurada' : 'la sessió ja no hi és'}; ${camins.size} fitxers esborrats.`);
    desfets++;
  }
  log(`Desfetes ${desfets} sessions; ${saltats} sense tocar.`);
  return { desfets, saltats };
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
  const bucket = getStorage(app).bucket();

  try {
    if (opcions.desfer) {
      await desfer({ fitxer: opcions.desfer, db, bucket, sessio: opcions.sessio, esborraCamp: () => FieldValue.delete() });
    } else {
      await executar({ db, bucket, apply: opcions.apply, sessio: opcions.sessio });
    }
  } catch (err) {
    console.error(`\nERROR: ${err.message}`);
    process.exitCode = 1;
  }
}
