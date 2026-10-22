// Ús: node scripts/sync-calendar.mjs [--apply]     (o: npm run sync-calendar -- --apply)
// Sincronitza el Google Calendar del club amb les sessions publicades de Firestore (`sessions`).
// Per defecte és un INFORME: llegeix Firestore i el calendari i mostra què crearia, actualitzaria i
// esborraria, sense escriure res. Amb `--apply` ho aplica.
// Només gestiona els esdeveniments amb l'etiqueta `extendedProperties.private.source = cineclub-website-sync`
// (la mateixa que posava l'script de Hugo, així s'adopten els que ja hi ha); la resta no es toca mai.
// Una sessió publicada es parella amb el seu esdeveniment per `cineclubSessioId` o, per als de Hugo,
// pel seu `iCalUID` (`<slug>-<AAAAMMDD>@cineclubrodadebera.cat`). Un esdeveniment etiquetat que no
// correspon a cap sessió publicada (despublicada, esborrada) s'esborra,
// llevat dels «Sessió per determinar» de Hugo (`iCalUID` `placeholder-...`), que es conserven.
// Variables (també en un `.env` local, ignorat per git; la clau en JSON d'una sola línia entre cometes simples):
//   GOOGLE_CALENDAR_SERVICE_ACCOUNT_KEY  JSON del compte de servei (el calendari s'ha de compartir amb ell)
//   GOOGLE_CALENDAR_ID                   id del calendari
// Sense aquestes variables l'informe només llista les sessions que se sincronitzarien; `--apply` falla.
// Firestore: GOOGLE_APPLICATION_CREDENTIALS o la clau cineclub-socis-firebase-adminsdk-*.json de l'arrel.
// La lògica i el client de Google Calendar són a `functions/calendari*.js` (els comparteix la Cloud Function).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import logica from '../functions/calendari.js';
import calendariGoogle from '../functions/calendari-google.js';

const ARREL = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const { credencialsCalendari, sessionsPubliques, calcularCanvis, aplicarCanvis, quan } = logica;

const US = 'Ús: node scripts/sync-calendar.mjs [--apply]';

export function llegirOpcions(argv) {
  const opcions = { apply: false };
  let dryRun = false;
  for (const arg of argv) {
    if (arg === '--apply') opcions.apply = true;
    else if (arg === '--dry-run') dryRun = true;
    else throw new Error(`Opció desconeguda: ${arg}`);
  }
  if (opcions.apply && dryRun) throw new Error('--apply i --dry-run no es poden usar alhora');
  return opcions;
}

// --- Informe i execució -------------------------------------------------------------------

function informe({ crear, actualitzar, esborrar, iguals, ignorats, placeholders }, apply, ambCalendari) {
  const linies = [apply ? 'APLICANT canvis al calendari.' : 'INFORME (no s\'escriu res; usa --apply per aplicar).'];
  if (!ambCalendari) {
    linies.push('Sense credencials del calendari: no es compara amb els esdeveniments existents; només es mostren les sessions que se sincronitzarien.');
  }
  const llista = (titol, items, text) => {
    linies.push(`\n${titol} (${items.length})`);
    for (const item of items) linies.push(`  - ${text(item)}`);
  };
  llista('Crear', crear, (c) => `${c.esdeveniment.summary} (${quan(c.esdeveniment)})`);
  if (ambCalendari) {
    llista('Actualitzar', actualitzar, (a) => `${a.esdeveniment.summary} (${quan(a.esdeveniment)})`);
    llista('Esborrar', esborrar, (e) => `${e.summary ?? e.id} (${quan(e)})`);
    linies.push(`\nSense canvis: ${iguals}`);
    llista('Placeholders de Hugo conservats', placeholders, (e) => `${e.summary ?? e.id} (${quan(e)})`);
    llista('No gestionats (sense l\'etiqueta; s\'ignoren) — total', ignorats, (e) => `${e.summary ?? e.id} (${quan(e)})`);
  }
  return linies.join('\n');
}

// `calendari` és `{ llistar(), crear(ev), actualitzar(id, ev), esborrar(id) }` o null si no hi ha credencials.
export async function executar({ apply, db, calendari, log = console.log, urlBase }) {
  if (apply && !calendari) credencialsCalendari({});
  const snap = await db.collection('sessions').get();
  const sessions = sessionsPubliques(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  const existents = calendari ? await calendari.llistar() : [];
  const canvis = calcularCanvis(sessions, existents, { urlBase });
  log(informe(canvis, apply, Boolean(calendari)));

  if (apply) {
    await aplicarCanvis(calendari, canvis);
    log('\nCalendari sincronitzat.');
  }
  return { sessions, canvis };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let opcions;
  try {
    opcions = llegirOpcions(process.argv.slice(2));
  } catch (err) {
    console.error(`${err.message}\n${US}`);
    process.exit(2);
  }

  try {
    if (existsSync(join(ARREL, '.env'))) process.loadEnvFile(join(ARREL, '.env'));
    const ambCredencials = process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_KEY && process.env.GOOGLE_CALENDAR_ID;
    const calendari = opcions.apply || ambCredencials ? calendariGoogle.clientCalendari(credencialsCalendari(process.env)) : null;

    const { initializeApp, cert, applicationDefault } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    let credential = applicationDefault();
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const clau = readdirSync(ARREL).find((f) => /^cineclub-socis-firebase-adminsdk-.*\.json$/.test(f));
      if (clau) credential = cert(JSON.parse(readFileSync(join(ARREL, clau), 'utf8')));
    }
    await executar({ apply: opcions.apply, db: getFirestore(initializeApp({ credential })), calendari });
  } catch (err) {
    console.error(`\nERROR: ${err.message}`);
    process.exitCode = 1;
  }
}
