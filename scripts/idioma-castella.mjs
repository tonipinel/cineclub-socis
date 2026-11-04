// Ús: node scripts/idioma-castella.mjs [--apply | --desfer <fitxer>]
// S'executa des de l'arrel del repositori principal (/Users/tonipinel/socis), on hi ha `backups/` i la clau d'admin.
// El nom de l'idioma és «Castellà», no «Espanyol». Canvia la paraula sencera «Espanyol»/«espanyol» per
// «Castellà»/«castellà» (no toca «espanyola», «Espanya»...) NOMÉS a:
// - `propostes.idiomes[]`
// - `sessions.publica.idioma` i `sessions.publica.versioIdiomatica` (`publica.actualitzatEl` només es mou si la sessió és publicada)
// La resta de camps són text lliure: l'informe hi llista les ocurrències (document, camp i fragment) però no els canvia.
// Per defecte és un INFORME de només lectura. Amb `--apply` escriu, només si hi ha la còpia de seguretat d'avui
// (backups/<AAAA-MM-DD>/manifest.json). ABANS d'escriure afegeix una execució a backups/<AAAA-MM-DD>/idioma-castella.json
// (valors d'abans i previstos) i després hi anota el resultat. Cada camp es torna a comprovar dins una transacció.
// És idempotent. `--desfer <fitxer>` torna cada camp al valor d'abans, només si encara és el que hi va escriure l'script.
// Credencials de Firebase: GOOGLE_APPLICATION_CREDENTIALS o la clau cineclub-socis-firebase-adminsdk-*.json de l'arrel.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marcarActualitzada } from '../src/lib/sessioPublica.js';

const ARREL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const US = 'Ús: node scripts/idioma-castella.mjs [--apply | --desfer <fitxer>]';
const FITXER_REGISTRE = 'idioma-castella.json';
const CAMPS = { proposta: ['idiomes'], sessio: ['publica.idioma', 'publica.versioIdiomatica'] };
const CAMP_ACTUALITZAT = 'publica.actualitzatEl';
const ESPANYOL = /(?<![\p{L}\p{N}])([Ee])spanyol(?![\p{L}\p{N}])/gu;

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

export const castella = (text) => text.replace(ESPANYOL, (_, e) => (e === 'E' ? 'Castellà' : 'castellà'));

const camiDe = (dades, cami) => cami.split('.').reduce((o, clau) => o?.[clau], dades);
const existeix = (dades, cami) => camiDe(dades, cami) !== undefined;
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const col = (tipus) => (tipus === 'proposta' ? 'propostes' : 'sessions');

// Valor nou d'un camp (string o llista de strings), o undefined si no canvia.
function valorNou(valor) {
  const nou = Array.isArray(valor) ? valor.map((v) => (typeof v === 'string' ? castella(v) : v))
    : typeof valor === 'string' ? castella(valor) : valor;
  return igual(nou, valor) ? undefined : nou;
}

const canvisDe = (tipus, dades) => Object.fromEntries(CAMPS[tipus]
  .map((cami) => [cami, valorNou(camiDe(dades, cami))]).filter(([, v]) => v !== undefined));

const abansDe = (dades, camins) => Object.fromEntries(camins.map((cami) => [cami, existeix(dades, cami)
  ? { existia: true, valor: camiDe(dades, cami) } : { existia: false }]));

export function planificar({ propostes, sessions, avui }) {
  const pla = [];
  for (const [tipus, docs] of [['proposta', propostes], ['sessio', sessions]]) {
    for (const { id, dades } of docs) {
      const escrit = canvisDe(tipus, dades);
      if (!Object.keys(escrit).length) continue;
      const publicada = tipus === 'sessio' && dades.publicada === true;
      if (publicada) escrit[CAMP_ACTUALITZAT] = marcarActualitzada({}, avui).actualitzatEl;
      pla.push({ tipus, id, titol: dades.titol ?? '', publicada, escrit, abans: abansDe(dades, Object.keys(escrit)) });
    }
  }
  return pla;
}

// «espanyol» als camps de text lliure (tots menys els que l'script canvia): `docs` és [{ col, id, dades }].
export function ocurrencies(docs) {
  const trobades = [];
  const exclosos = { propostes: CAMPS.proposta, sessions: CAMPS.sessio };
  const recorre = (doc, valor, cami) => {
    if (exclosos[doc.col].some((c) => cami === c || cami.startsWith(`${c}.`))) return;
    if (typeof valor === 'string') {
      for (const m of valor.matchAll(ESPANYOL)) {
        trobades.push({ doc: `${doc.col}/${doc.id}`, cami, fragment: valor.slice(Math.max(0, m.index - 40), m.index + 50).replace(/\s+/g, ' ') });
      }
    } else if (valor && typeof valor === 'object') {
      for (const [clau, v] of Object.entries(valor)) recorre(doc, v, cami ? `${cami}.${clau}` : clau);
    }
  };
  for (const doc of docs) recorre(doc, doc.dades, '');
  return trobades;
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
  db, apply = false, dirBackups = join(ARREL, 'backups'), avui = new Date(), log = console.log,
}) {
  if (apply) comprovarCopia(dirBackups, avui);
  log(`=== «Espanyol» -> «Castellà» (${apply ? "MODE APPLY: s'escriu" : "MODE INFORME: no s'escriu res"}) ===`);
  const [snapSessions, snapPropostes] = await Promise.all([db.collection('sessions').get(), db.collection('propostes').get()]);
  const sessions = snapSessions.docs.map((d) => ({ id: d.id, dades: d.data() }));
  const propostes = snapPropostes.docs.map((d) => ({ id: d.id, dades: d.data() }));
  const pla = planificar({ propostes, sessions, avui });
  for (const e of pla) {
    const detall = CAMPS[e.tipus].filter((c) => c in e.escrit)
      .map((c) => `${c} ${JSON.stringify(e.abans[c].valor)} -> ${JSON.stringify(e.escrit[c])}`).join('; ');
    log(`- ${col(e.tipus)}/${e.id} (${e.titol}${e.tipus === 'sessio' ? `, ${e.publicada ? 'publicada' : 'no publicada'}` : ''}): ${detall}`);
  }
  const lliure = ocurrencies([
    ...propostes.map((p) => ({ col: 'propostes', ...p })), ...sessions.map((s) => ({ col: 'sessions', ...s })),
  ]);
  if (lliure.length) {
    log(`«espanyol» en text lliure (no es toca, revisa-ho a mà): ${lliure.length}`);
    for (const o of lliure) log(`- ${o.doc} ${o.cami}: «…${o.fragment}…»`);
  }
  if (!apply || pla.length === 0) {
    log(pla.length === 0 ? 'Res a canviar.' : `Amb --apply es canviarien ${pla.length} documents.`);
    return { pla, resultats: [] };
  }

  const fitxer = join(dirAvui(dirBackups, avui), FITXER_REGISTRE);
  const previes = existsSync(fitxer) ? JSON.parse(readFileSync(fitxer, 'utf8')).execucions ?? [] : [];
  const execucio = {
    actualitzat: avui.toISOString(),
    documents: pla.map(({ tipus, id, escrit, abans }) => ({ tipus, id, previst: escrit, abans })),
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
        // Es recalcula des del valor actual: si l'admin l'ha canviat i ja no diu «Espanyol», no s'escriu.
        const escrit = Object.fromEntries(Object.entries(canvisDe(entrada.tipus, dades)).filter(([cami]) => cami in entrada.previst));
        if (!Object.keys(escrit).length) return { estat: 'sense canvis' };
        if (entrada.tipus === 'sessio' && dades.publicada === true && entrada.previst[CAMP_ACTUALITZAT]) {
          escrit[CAMP_ACTUALITZAT] = entrada.previst[CAMP_ACTUALITZAT];
        }
        tx.update(ref, escrit);
        return { estat: 'canviat', escrit };
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
  const triats = execucions.flatMap((e) => e.documents ?? []).filter((d) => d.resultat?.estat === 'canviat').reverse();
  log(`=== Desfer «Castellà» de ${triats.length} documents des de ${fitxer} ===`);
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

  try {
    if (opcions.desfer) {
      await desfer({ fitxer: opcions.desfer, db, esborraCamp: () => FieldValue.delete() });
    } else {
      await executar({ db, apply: opcions.apply });
    }
  } catch (err) {
    console.error(`\nERROR: ${err.message}`);
    process.exitCode = 1;
  }
}
