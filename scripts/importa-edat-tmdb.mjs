// Ús: TMDB_API_KEY="$(firebase functions:secrets:access TMDB_API_KEY)" node scripts/importa-edat-tmdb.mjs [--apply | --desfer <fitxer>]
// S'executa des de l'arrel del repositori principal (/Users/tonipinel/socis), on hi ha `backups/` i la clau d'admin.
// Omple l'edat mínima (qualificació d'Espanya de TMDB) de les propostes ja creades (amb `tmdbId`) que no en tenen, i
// `publica.edatMinimaRecomanada` de les sessions programades des d'aquestes propostes (`sessio.propostaId`).
// - Proposta: només si `edatMinima` és null/absent i l'admin no l'ha editat a mà (`campsEditats`). Un nombre (0 inclòs) és
//   un valor posat a mà o ja omplert i no es toca mai.
// - Sessió: només si `publica.edatMinimaRecomanada` no és un nombre (0 inclòs), amb l'edat que la proposta tindrà o ja té
//   (també si la proposta ja tenia l'edat). Cap altre camp; `publica.actualitzatEl` (lastmod del sitemap) només es mou si la
//   sessió és publicada.
// - Si TMDB no en sap l'edat (null), la proposta se salta i s'esmenta a l'informe.
// Per defecte és un INFORME de només lectura. Amb `--apply` escriu, només si hi ha la còpia de seguretat d'avui
// (backups/<AAAA-MM-DD>/manifest.json). ABANS d'escriure afegeix una execució a backups/<AAAA-MM-DD>/edat-tmdb.json
// (valors d'abans i previstos) i després hi anota el resultat. Cada camp es torna a comprovar dins una transacció.
// És idempotent. `--desfer <fitxer>` torna cada camp al valor d'abans, només si encara és el que hi va escriure l'script.
// Clau de TMDB: la variable d'entorn `TMDB_API_KEY` (no l'escriguis literal al shell; l'script no l'imprimeix mai).
// Sense clau, l'informe llista les propostes candidates però no pot dir-ne l'edat, i `--apply` no s'executa.
// Credencials de Firebase: GOOGLE_APPLICATION_CREDENTIALS o la clau cineclub-socis-firebase-adminsdk-*.json de l'arrel.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tmdb from '../functions/tmdb.js';
import { marcarActualitzada } from '../src/lib/sessioPublica.js';

const { edatMinimaPellicula, esTmdbIdValid } = tmdb;
const ARREL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const US = 'Ús: TMDB_API_KEY="$(firebase functions:secrets:access TMDB_API_KEY)" node scripts/importa-edat-tmdb.mjs [--apply | --desfer <fitxer>]';
const FITXER_REGISTRE = 'edat-tmdb.json';
const CAMP_PROPOSTA = 'edatMinima';
const CAMP_SESSIO = 'publica.edatMinimaRecomanada';
const CAMP_ACTUALITZAT = 'publica.actualitzatEl';

export function llegirOpcions(argv) {
  const opcions = { apply: false, desfer: null };
  for (let i = 0; i < argv.length; i++) {
    const valor = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
    if (argv[i] === '--apply') opcions.apply = true;
    else if (argv[i] === '--desfer' && valor) opcions.desfer = argv[++i];
    else throw new Error(`Opció desconeguda o incompleta: ${argv[i]}`);
  }
  if (opcions.apply && opcions.desfer) throw new Error('--apply i --desfer no es poden combinar');
  return opcions;
}

const camiDe = (dades, cami) => cami.split('.').reduce((o, clau) => o?.[clau], dades);
const existeix = (dades, cami) => camiDe(dades, cami) !== undefined;
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const esNombre = (v) => typeof v === 'number' && Number.isFinite(v);

const propostaOmplible = (dades) => esTmdbIdValid(dades.tmdbId) && !esNombre(dades.edatMinima)
  && !(Array.isArray(dades.campsEditats) && dades.campsEditats.includes(CAMP_PROPOSTA));

const abansDe = (dades, camins) => Object.fromEntries([camins].flat().map((cami) => [cami, existeix(dades, cami)
  ? { existia: true, valor: camiDe(dades, cami) } : { existia: false }]));

// Propostes que cal demanar a TMDB.
export const propostesACercar = (propostes) => propostes.filter(({ dades }) => propostaOmplible(dades));

// Pla de documents a escriure. `edats` (Map propostaId → edat | null) només té les propostes consultades.
// Les sessions vinculades s'omplen amb l'edat que la proposta tindrà (`origen: 'tmdb'`) o ja té (`origen: 'proposta'`).
export function planificar({ sessions, propostes, edats, avui }) {
  const pla = [];
  for (const { id, dades } of propostes) {
    let edat;
    let origen;
    if (esNombre(dades.edatMinima)) {
      edat = dades.edatMinima;
      origen = 'proposta';
    } else if (propostaOmplible(dades) && esNombre(edats.get(id))) {
      edat = edats.get(id);
      origen = 'tmdb';
      pla.push({
        tipus: 'proposta', id, titol: dades.titol ?? '', escrit: { [CAMP_PROPOSTA]: edat }, abans: abansDe(dades, CAMP_PROPOSTA),
      });
    } else continue;
    for (const s of sessions) {
      if (s.dades.propostaId !== id || esNombre(s.dades.publica?.edatMinimaRecomanada)) continue;
      const publicada = s.dades.publicada === true;
      const escrit = { [CAMP_SESSIO]: edat };
      if (publicada) escrit[CAMP_ACTUALITZAT] = marcarActualitzada({}, avui).actualitzatEl;
      pla.push({
        tipus: 'sessio', id: s.id, propostaId: id, origen, titol: s.dades.titol ?? '', publicada, escrit, abans: abansDe(s.dades, Object.keys(escrit)),
      });
    }
  }
  return pla;
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

const col = (tipus) => (tipus === 'proposta' ? 'propostes' : 'sessions');
const valorActual = (dades, cami) => (esNombre(camiDe(dades, cami)) ? camiDe(dades, cami) : 'buit');

// `edat` és (tmdbId) => Promise<number | null>; null si no hi ha clau de TMDB.
export async function executar({
  db, apply = false, edat = null, dirBackups = join(ARREL, 'backups'), avui = new Date(), log = console.log,
}) {
  if (apply) comprovarCopia(dirBackups, avui);
  log(`=== Edat mínima de TMDB (${apply ? "MODE APPLY: s'escriu" : "MODE INFORME: no s'escriu res"}) ===`);
  const [snapSessions, snapPropostes] = await Promise.all([db.collection('sessions').get(), db.collection('propostes').get()]);
  const sessions = snapSessions.docs.map((d) => ({ id: d.id, dades: d.data() }));
  const propostes = snapPropostes.docs.map((d) => ({ id: d.id, dades: d.data() }));
  const aCercar = propostesACercar(propostes);
  if (aCercar.length && !edat) {
    if (apply) throw new Error('Cal la clau de TMDB a la variable d\'entorn TMDB_API_KEY.');
    log(`Sense TMDB_API_KEY: ${aCercar.length} propostes amb tmdbId i sense edat, però no se'n pot saber el valor:`);
    for (const { id, dades } of aCercar) log(`- propostes/${id} (${dades.titol ?? ''}, tmdbId ${dades.tmdbId})`);
  }
  const edats = new Map();
  const fallades = [];
  const desconegudes = [];
  for (const { id, dades } of edat ? aCercar : []) {
    try {
      const valor = await edat(dades.tmdbId);
      edats.set(id, valor);
      if (!esNombre(valor)) desconegudes.push(`${id} (${dades.titol ?? ''})`);
    } catch (err) {
      fallades.push(id);
      log(`  ERROR TMDB a propostes/${id} (tmdbId ${dades.tmdbId}): ${err.message}`);
    }
  }
  const pla = planificar({ sessions, propostes, edats, avui });
  const nPropostes = pla.filter((e) => e.tipus === 'proposta').length;
  const nExistents = pla.filter((e) => e.origen === 'proposta').length;
  log(`Propostes: ${propostes.length} | consultades a TMDB: ${edats.size}${fallades.length ? ` (${fallades.length} fallades)` : ''} | sense edat a TMDB: ${desconegudes.length} | propostes a omplir: ${nPropostes} | sessions a omplir: ${pla.length - nPropostes - nExistents} | sessions amb l'edat ja a la proposta: ${nExistents}`);
  if (desconegudes.length) log(`Sense edat a TMDB (se salten): ${desconegudes.join(', ')}`);
  const perId = new Map(propostes.map((p) => [p.id, p.dades]));
  const linia = (e) => {
    const dades = e.tipus === 'proposta' ? perId.get(e.id) : sessions.find((s) => s.id === e.id).dades;
    const cami = e.tipus === 'proposta' ? CAMP_PROPOSTA : CAMP_SESSIO;
    return `- ${col(e.tipus)}/${e.id} (${e.titol}${e.tipus === 'sessio' ? `, proposta ${e.propostaId}, ${e.publicada ? 'publicada' : 'no publicada'}` : ''}): ${cami} ${valorActual(dades, cami)} -> ${e.escrit[cami]}`;
  };
  for (const e of pla.filter((x) => x.origen !== 'proposta')) log(linia(e));
  if (nExistents) {
    log("Sessions amb l'edat ja a la proposta:");
    for (const e of pla.filter((x) => x.origen === 'proposta')) log(linia(e));
  }
  if (!apply || pla.length === 0) {
    log(pla.length === 0 ? 'Res a omplir.' : `Amb --apply s'omplirien ${pla.length} documents.`);
    return { pla, resultats: [] };
  }

  const fitxer = join(dirAvui(dirBackups, avui), FITXER_REGISTRE);
  const previes = existsSync(fitxer) ? JSON.parse(readFileSync(fitxer, 'utf8')).execucions ?? [] : [];
  const execucio = {
    actualitzat: avui.toISOString(),
    documents: pla.map(({ tipus, id, propostaId, escrit, abans }) => ({ tipus, id, ...(propostaId && { propostaId }), previst: escrit, abans })),
  };
  desarRegistre(fitxer, [...previes, execucio], avui);
  const resultats = [];
  for (const entrada of execucio.documents) {
    const ref = db.collection(col(entrada.tipus)).doc(entrada.id);
    try {
      entrada.resultat = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return { estat: 'no existeix' };
        const dades = snap.data();
        const editada = entrada.tipus === 'proposta' && Array.isArray(dades.campsEditats) && dades.campsEditats.includes(CAMP_PROPOSTA);
        const escrit = Object.fromEntries(Object.entries(entrada.previst)
          .filter(([cami]) => cami === CAMP_ACTUALITZAT || (!esNombre(camiDe(dades, cami)) && !editada)));
        if (!(CAMP_PROPOSTA in escrit) && !(CAMP_SESSIO in escrit)) return { estat: 'sense canvis' };
        if (entrada.tipus === 'sessio' && dades.publicada !== true) delete escrit[CAMP_ACTUALITZAT];
        tx.update(ref, escrit);
        return { estat: 'omplert', escrit };
      });
    } catch (err) {
      entrada.resultat = { estat: 'error', error: err.message };
    }
    const r = entrada.resultat;
    resultats.push({ tipus: entrada.tipus, id: entrada.id, ...r });
    log(`  ${col(entrada.tipus)}/${entrada.id}: ${r.estat}${r.error ? `: ${r.error}` : ''}`);
    desarRegistre(fitxer, [...previes, execucio], avui);
  }
  log(`Fet. Registre a ${fitxer}`);
  return { pla, resultats };
}

export async function desfer({
  fitxer, db, esborraCamp, dirBackups = join(ARREL, 'backups'), avui = new Date(), log = console.log,
}) {
  comprovarCopia(dirBackups, avui);
  const { execucions = [] } = JSON.parse(readFileSync(fitxer, 'utf8'));
  // De l'última execució a la primera: cada camp torna a l'estat d'abans de la que el va escriure.
  const triats = execucions.flatMap((e) => e.documents ?? []).filter((d) => d.resultat?.estat === 'omplert').reverse();
  log(`=== Desfer l'edat mínima de ${triats.length} documents des de ${fitxer} ===`);
  let desfets = 0;
  let saltats = 0;
  for (const { tipus, id, abans, resultat } of triats) {
    const ref = db.collection(col(tipus)).doc(id);
    const { restaurats, canviats } = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { restaurats: [], canviats: [] };
      const dades = snap.data();
      const camps = {};
      const noTocats = [];
      for (const [cami, valor] of Object.entries(resultat.escrit)) {
        if (cami === CAMP_ACTUALITZAT) continue;
        if (igual(camiDe(dades, cami), valor)) camps[cami] = abans[cami]?.existia ? abans[cami].valor : esborraCamp();
        else noTocats.push(cami);
      }
      // La data només torna enrere si no queda cap canvi de l'admin i encara és la que va escriure l'script.
      const data = resultat.escrit[CAMP_ACTUALITZAT];
      if (data && !noTocats.length && camiDe(dades, CAMP_ACTUALITZAT) === data) {
        camps[CAMP_ACTUALITZAT] = abans[CAMP_ACTUALITZAT]?.existia ? abans[CAMP_ACTUALITZAT].valor : esborraCamp();
      }
      if (Object.keys(camps).length) tx.update(ref, camps);
      return { restaurats: Object.keys(camps), canviats: noTocats };
    });
    if (canviats.length) {
      log(`No es desfà a ${col(tipus)}/${id}: ${canviats.join(', ')} (l'admin ho ha canviat).`);
      saltats++;
    }
    if (restaurats.length) {
      log(`${col(tipus)}/${id}: restaurat ${restaurats.join(', ')}.`);
      desfets++;
    }
  }
  log(`Desfets ${desfets} documents; ${saltats} amb camps sense tocar.`);
  return { desfets, saltats };
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
  const clau = process.env.TMDB_API_KEY?.trim();

  try {
    if (opcions.desfer) {
      await desfer({ fitxer: opcions.desfer, db, esborraCamp: () => FieldValue.delete() });
    } else {
      await executar({ db, apply: opcions.apply, edat: clau ? (tmdbId) => edatMinimaPellicula(tmdbId, clau) : null });
    }
  } catch (err) {
    console.error(`\nERROR: ${err.message}`);
    process.exitCode = 1;
  }
}
