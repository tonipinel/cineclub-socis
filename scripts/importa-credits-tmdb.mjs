// Ús: TMDB_API_KEY="$(firebase functions:secrets:access TMDB_API_KEY)" node scripts/importa-credits-tmdb.mjs [--apply | --desfer <fitxer>] [--sessio <id>]
// S'executa des de l'arrel del repositori principal (/Users/tonipinel/socis), on hi ha `backups/` i la clau d'admin.
// Omple la fotografia, el muntatge, la música i la producció de TMDB a les propostes ja creades (amb `tmdbId`) que encara
// no els tenen, i a les sessions programades des d'aquestes propostes (`sessio.propostaId`).
// - Proposta: només els camps `fotografia`, `muntatge`, `musica` i `produccio` buits i que l'admin no ha editat a mà
//   (`campsEditats`), com a llistes (la mateixa extracció que la Cloud Function, `creditsPellicula` de functions/tmdb.js).
// - Sessió: només `publica.fotografia/muntatge/musica/produccio` buits, com a text (el de `construirSessioDesDeProposta`)
//   a partir dels valors de la proposta. Cap altre camp; `publica.actualitzatEl` només es mou si la sessió és publicada.
// Per defecte és un INFORME de només lectura. Amb `--apply` escriu, només si hi ha la còpia de seguretat d'avui
// (backups/<AAAA-MM-DD>/manifest.json). ABANS d'escriure afegeix una execució a backups/<AAAA-MM-DD>/credits-tmdb.json
// (valors d'abans i previstos de cada document) i després hi anota el resultat. Cada camp es torna a comprovar dins una
// transacció: si ja no és buit, no es toca. És idempotent: amb els camps plens no hi ha res a fer.
// `--desfer <fitxer>` torna cada camp escrit al valor d'abans, només si encara és el que hi va escriure l'script (si
// l'admin l'ha canviat, no es toca i s'avisa). Té la mateixa guarda de còpia. `--sessio <id>` ho limita a una sessió i a
// la seva proposta.
// Clau de TMDB: la variable d'entorn `TMDB_API_KEY` (el secret de les Cloud Functions; no l'escriguis literal al shell,
// i l'script no l'imprimeix mai).
// Sense clau, l'informe llista les propostes candidates però no pot dir-ne els valors, i `--apply` no s'executa.
// Credencials de Firebase: GOOGLE_APPLICATION_CREDENTIALS o la clau cineclub-socis-firebase-adminsdk-*.json de l'arrel.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tmdb from '../functions/tmdb.js';
import { construirSessioDesDeProposta, marcarActualitzada } from '../src/lib/sessioPublica.js';

const { creditsPellicula, esTmdbIdValid } = tmdb;
const ARREL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const US = 'Ús: TMDB_API_KEY="$(firebase functions:secrets:access TMDB_API_KEY)" node scripts/importa-credits-tmdb.mjs [--apply | --desfer <fitxer>] [--sessio <id>]';
const FITXER_REGISTRE = 'credits-tmdb.json';
export const CAMPS = ['fotografia', 'muntatge', 'musica', 'produccio'];

export function llegirOpcions(argv) {
  const opcions = { apply: false, desfer: null, sessio: null };
  for (let i = 0; i < argv.length; i++) {
    const valor = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
    if (argv[i] === '--apply') opcions.apply = true;
    else if (argv[i] === '--desfer' && valor) opcions.desfer = argv[++i];
    else if (argv[i] === '--sessio' && valor) opcions.sessio = argv[++i];
    else throw new Error(`Opció desconeguda o incompleta: ${argv[i]}`);
  }
  if (opcions.apply && opcions.desfer) throw new Error('--apply i --desfer no es poden combinar');
  return opcions;
}

export const esBuit = (v) => v == null
  || (Array.isArray(v) ? v.every((x) => typeof x !== 'string' || !x.trim()) : typeof v === 'string' && !v.trim());

const camiDe = (dades, cami) => cami.split('.').reduce((o, clau) => o?.[clau], dades);
const existeix = (dades, cami) => camiDe(dades, cami) !== undefined;
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Camps de la proposta que caldria omplir (buits i no editats a mà).
const campsPerOmplir = (proposta) => {
  const editats = Array.isArray(proposta.campsEditats) ? proposta.campsEditats : [];
  return CAMPS.filter((camp) => esBuit(proposta[camp]) && !editats.includes(camp));
};

// Pla de documents a escriure. `credits` (Map propostaId → crèdits de TMDB) només té les propostes consultades.
export function planificar({ sessions, propostes, credits, avui, nomesSessio = null }) {
  const pla = [];
  const perProposta = new Map();
  for (const s of sessions) {
    if (!s.dades.propostaId || (nomesSessio && s.id !== nomesSessio)) continue;
    perProposta.set(s.dades.propostaId, [...(perProposta.get(s.dades.propostaId) ?? []), s]);
  }
  for (const { id, dades } of propostes) {
    if (nomesSessio && !perProposta.has(id)) continue;
    if (!esTmdbIdValid(dades.tmdbId)) continue;
    const deTmdb = credits.get(id);
    const finals = { ...dades };
    const escrit = {};
    for (const camp of campsPerOmplir(dades)) {
      if (deTmdb && !esBuit(deTmdb[camp])) {
        escrit[camp] = deTmdb[camp];
        finals[camp] = deTmdb[camp];
      }
    }
    if (Object.keys(escrit).length) {
      pla.push({
        tipus: 'proposta', id, titol: dades.titol ?? '', escrit, abans: abansDe(dades, Object.keys(escrit)),
      });
    }
    const textos = construirSessioDesDeProposta(Object.fromEntries(CAMPS.map((c) => [c, finals[c]]))).sessio.publica;
    for (const s of perProposta.get(id) ?? []) {
      const escritSessio = {};
      for (const camp of CAMPS) {
        if (textos[camp] && esBuit(s.dades.publica?.[camp])) escritSessio[`publica.${camp}`] = textos[camp];
      }
      if (!Object.keys(escritSessio).length) continue;
      const publicada = Boolean(s.dades.publicada);
      if (publicada) escritSessio['publica.actualitzatEl'] = marcarActualitzada({}, avui).actualitzatEl;
      pla.push({
        tipus: 'sessio',
        id: s.id,
        propostaId: id,
        titol: s.dades.titol ?? '',
        publicada,
        escrit: escritSessio,
        abans: abansDe(s.dades, Object.keys(escritSessio)),
      });
    }
  }
  return pla;
}

const abansDe = (dades, camins) => Object.fromEntries(camins.map((cami) => [cami, existeix(dades, cami)
  ? { existia: true, valor: camiDe(dades, cami) } : { existia: false }]));

// Propostes amb `tmdbId` i algun camp per omplir: són les úniques que cal demanar a TMDB.
export function propostesACercar(propostes, sessions, nomesSessio = null) {
  const ambSessio = nomesSessio ? new Set(sessions.filter((s) => s.id === nomesSessio).map((s) => s.dades.propostaId)) : null;
  return propostes.filter(({ id, dades }) => (!ambSessio || ambSessio.has(id))
    && esTmdbIdValid(dades.tmdbId) && campsPerOmplir(dades).length > 0);
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
const mostra = (valor) => (Array.isArray(valor) ? valor.join(', ') : String(valor));

export async function executar({
  db, apply = false, sessio = null, credits = null, dirBackups = join(ARREL, 'backups'), avui = new Date(),
  log = console.log,
}) {
  if (apply) comprovarCopia(dirBackups, avui);
  log(`=== Crèdits de TMDB (fotografia, muntatge, música, producció) (${apply ? "MODE APPLY: s'escriu" : "MODE INFORME: no s'escriu res"}) ===`);
  const [snapSessions, snapPropostes] = await Promise.all([db.collection('sessions').get(), db.collection('propostes').get()]);
  const sessions = snapSessions.docs.map((d) => ({ id: d.id, dades: d.data() }));
  const propostes = snapPropostes.docs.map((d) => ({ id: d.id, dades: d.data() }));
  if (sessio) {
    const s = sessions.find((x) => x.id === sessio);
    if (!s) throw new Error(`No existeix la sessió ${sessio}.`);
    if (!s.dades.propostaId) throw new Error(`La sessió ${sessio} no s'ha programat des de cap proposta.`);
    const p = propostes.find((x) => x.id === s.dades.propostaId);
    if (!p) throw new Error(`No existeix la proposta ${s.dades.propostaId} de la sessió ${sessio}.`);
    if (!esTmdbIdValid(p.dades.tmdbId)) throw new Error(`La proposta ${p.id} no té cap pel·lícula de TMDB.`);
  }
  const aCercar = propostesACercar(propostes, sessions, sessio);
  if (aCercar.length && !credits) {
    if (apply) throw new Error('Cal la clau de TMDB a la variable d\'entorn TMDB_API_KEY.');
    log(`Sense TMDB_API_KEY: ${aCercar.length} propostes amb tmdbId i camps buits, però no se'n poden saber els valors:`);
    for (const { id, dades } of aCercar) log(`- propostes/${id} (${dades.titol ?? ''}, tmdbId ${dades.tmdbId}): ${campsPerOmplir(dades).join(', ')}`);
  }
  const deTmdb = new Map();
  const fallades = [];
  for (const { id, dades } of credits ? aCercar : []) {
    try {
      deTmdb.set(id, await credits(dades.tmdbId));
    } catch (err) {
      fallades.push(id);
      log(`  ERROR TMDB a propostes/${id} (tmdbId ${dades.tmdbId}): ${err.message}`);
    }
  }
  const pla = planificar({ sessions, propostes, credits: deTmdb, avui, nomesSessio: sessio });
  const nPropostes = pla.filter((e) => e.tipus === 'proposta').length;
  log(`Propostes: ${propostes.length} | consultades a TMDB: ${deTmdb.size}${fallades.length ? ` (${fallades.length} fallades)` : ''} | propostes a omplir: ${nPropostes} | sessions a omplir: ${pla.length - nPropostes}`);
  for (const e of pla) {
    log(`- ${col(e.tipus)}/${e.id} (${e.titol}${e.tipus === 'sessio' ? `, ${e.publicada ? 'publicada' : 'no publicada'}` : ''})`);
    for (const [cami, valor] of Object.entries(e.escrit)) log(`    ${cami}: ${mostra(valor)}`);
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
        // Torna a comprovar cada camp: el que ja no és buit (l'ha escrit algú altre) o que l'admin ha marcat com a
        // editat a mà a la proposta no es toca.
        const editats = entrada.tipus === 'proposta' && Array.isArray(dades.campsEditats) ? dades.campsEditats : [];
        const escrit = Object.fromEntries(Object.entries(entrada.previst)
          .filter(([cami]) => cami === 'publica.actualitzatEl' || (esBuit(camiDe(dades, cami)) && !editats.includes(cami))));
        const canvia = Object.keys(escrit).some((cami) => cami !== 'publica.actualitzatEl');
        if (!canvia) return { estat: 'sense canvis' };
        if (entrada.tipus === 'sessio' && !dades.publicada) delete escrit['publica.actualitzatEl'];
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
  fitxer, db, sessio = null, esborraCamp, dirBackups = join(ARREL, 'backups'), avui = new Date(), log = console.log,
}) {
  comprovarCopia(dirBackups, avui);
  const { execucions = [] } = JSON.parse(readFileSync(fitxer, 'utf8'));
  const documents = execucions.flatMap((e) => e.documents ?? []).filter((d) => d.resultat?.estat === 'omplert');
  const propostaDeSessio = sessio ? documents.find((d) => d.tipus === 'sessio' && d.id === sessio)?.propostaId : null;
  const triats = documents
    .filter((d) => !sessio || (d.tipus === 'sessio' ? d.id === sessio : d.id === propostaDeSessio))
    // De l'última execució a la primera: cada camp torna a l'estat d'abans de la que el va escriure.
    .reverse();
  log(`=== Desfer els crèdits de ${triats.length} documents des de ${fitxer} ===`);
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
      const restaura = (cami) => { camps[cami] = abans[cami]?.existia ? abans[cami].valor : esborraCamp(); };
      for (const [cami, valor] of Object.entries(resultat.escrit)) {
        if (cami === 'publica.actualitzatEl') continue;
        if (igual(camiDe(dades, cami), valor)) restaura(cami);
        else noTocats.push(cami);
      }
      // La data només torna enrere si no queda cap canvi de l'admin a la fitxa pública.
      const data = resultat.escrit['publica.actualitzatEl'];
      if (data && !noTocats.length && dades.publica?.actualitzatEl === data) restaura('publica.actualitzatEl');
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
      await desfer({ fitxer: opcions.desfer, db, sessio: opcions.sessio, esborraCamp: () => FieldValue.delete() });
    } else {
      await executar({
        db, apply: opcions.apply, sessio: opcions.sessio, credits: clau ? (tmdbId) => creditsPellicula(tmdbId, clau) : null,
      });
    }
  } catch (err) {
    console.error(`\nERROR: ${err.message}`);
    process.exitCode = 1;
  }
}
