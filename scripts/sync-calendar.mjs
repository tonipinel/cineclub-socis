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
// `googleapis` és una devDependency: l'script només s'executa des d'aquest repo.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ARREL = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const URL_WEB = 'https://cineclubrodadebera.cat';
export const LLOC = 'Teatre del Casino Municipal de Roda de Berà';
export const SOURCE_TAG = 'cineclub-website-sync';
const DURADA_HORES = 3;

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

export function credencialsCalendari(env) {
  const clau = env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_KEY;
  const calendarId = env.GOOGLE_CALENDAR_ID;
  if (!clau || !calendarId) {
    throw new Error('Falten GOOGLE_CALENDAR_SERVICE_ACCOUNT_KEY o GOOGLE_CALENDAR_ID (variables d\'entorn o .env local)');
  }
  let credencials;
  try {
    credencials = JSON.parse(clau);
  } catch {
    throw new Error('GOOGLE_CALENDAR_SERVICE_ACCOUNT_KEY no és un JSON vàlid');
  }
  return { credencials, calendarId };
}

// --- Sessions → esdeveniments -------------------------------------------------------------

const horaNormal = (hora) => {
  const m = typeof hora === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(hora.trim()) : null;
  return m && Number(m[1]) <= 23 && Number(m[2]) <= 59 ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
};

const dataValida = (data) => {
  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(data)) return false;
  const [any, mes, dia] = data.slice(0, 10).split('-').map(Number);
  const d = new Date(Date.UTC(any, mes - 1, dia));
  return d.getUTCFullYear() === any && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
};

// Mateix criteri que `sessionsPubliques` de la web: publicada, amb slug i data vàlida; hora absent = 00:00.
export function sessionsPubliques(docs) {
  return docs
    .filter((s) => s.publicada === true && s.slug && dataValida(s.data))
    .map((s) => ({ ...s, hora: horaNormal(s.hora) ?? '00:00' }));
}

function desfasamentMadrid(instantMs) {
  const valor = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', timeZoneName: 'longOffset' })
    .formatToParts(new Date(instantMs)).find((p) => p.type === 'timeZoneName').value; // "GMT+02:00"
  const m = valor.match(/GMT([+-])(\d{2}):(\d{2})/);
  return m ? (m[1] === '+' ? 1 : -1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

// Instant (Date) d'una data 'AAAA-MM-DD' i una hora 'HH:MM' d'Europe/Madrid.
function instantMadrid(data, hora) {
  const [any, mes, dia] = data.slice(0, 10).split('-').map(Number);
  const [h, min] = hora.split(':').map(Number);
  const local = Date.UTC(any, mes - 1, dia, h, min);
  let ofset = desfasamentMadrid(local);
  ofset = desfasamentMadrid(local - ofset * 60000);
  return new Date(local - ofset * 60000);
}

const extreuSinopsi = (cos) => cos.match(/## Sinopsi\s*\n([\s\S]*?)(?:\n##\s|$)/)?.[1].trim() ?? '';

function titolEvent(sessio) {
  const original = sessio.publica?.titol || sessio.titol;
  const espanya = sessio.publica?.titolEspanya;
  return espanya && espanya.trim().toLowerCase() !== original.trim().toLowerCase()
    ? `${original} (${espanya})`
    : original;
}

function sinopsiEvent(publica = {}) {
  const sinopsi = (publica.sinopsiCartell || extreuSinopsi(publica.cos ?? ''))
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return sinopsi.length > 200 ? `${sinopsi.slice(0, 200).trim()}…` : sinopsi;
}

// Recurs de Google Calendar d'una sessió publicada, igual que el de l'script de Hugo (títol, descripció,
// lloc, 3 hores de durada, `source`) més l'id de la sessió. `iCalUID` només s'envia en crear.
export function esdevenimentDesDeSessio(sessio, { urlBase = URL_WEB, duradaHores = DURADA_HORES } = {}) {
  const inici = instantMadrid(sessio.data, horaNormal(sessio.hora) ?? '00:00');
  const fi = new Date(inici.getTime() + duradaHores * 3600000);
  const url = `${urlBase}/programacio/${sessio.data.slice(0, 4)}/${sessio.slug}/`;
  const dia = inici.toISOString().slice(0, 10).replace(/-/g, '');
  return {
    iCalUID: `${sessio.slug}-${dia}@cineclubrodadebera.cat`,
    summary: titolEvent(sessio),
    location: LLOC,
    description: `${sinopsiEvent(sessio.publica)}\n\nMés informació i entrades: ${url}`,
    start: { dateTime: inici.toISOString() },
    end: { dateTime: fi.toISOString() },
    source: { title: 'Fitxa de la sessió', url },
    extendedProperties: { private: { source: SOURCE_TAG, cineclubSessioId: sessio.id } },
  };
}

// --- Pla de canvis ------------------------------------------------------------------------

const instant = (v) => (v?.dateTime ? Date.parse(v.dateTime) : null);

function difereix(esperat, actual) {
  const privat = actual.extendedProperties?.private ?? {};
  return esperat.summary !== actual.summary
    || esperat.location !== actual.location
    || esperat.description !== actual.description
    || instant(esperat.start) !== instant(actual.start)
    || instant(esperat.end) !== instant(actual.end)
    || esperat.source.title !== actual.source?.title
    || esperat.source.url !== actual.source?.url
    || privat.source !== SOURCE_TAG
    || privat.cineclubSessioId !== esperat.extendedProperties.private.cineclubSessioId;
}

export function calcularCanvis(sessions, existents, opcions) {
  const gestionats = existents.filter((e) => e.extendedProperties?.private?.source === SOURCE_TAG);
  const ignorats = existents.filter((e) => !gestionats.includes(e));
  const perSessio = new Map();
  const perUid = new Map();
  for (const e of gestionats) {
    const id = e.extendedProperties.private.cineclubSessioId;
    if (id && !perSessio.has(id)) perSessio.set(id, e);
    if (e.iCalUID && !perUid.has(e.iCalUID)) perUid.set(e.iCalUID, e);
  }

  const usats = new Set();
  const crear = [];
  const actualitzar = [];
  let iguals = 0;
  for (const sessio of sessions) {
    const esdeveniment = esdevenimentDesDeSessio(sessio, opcions);
    const trobat = [perSessio.get(sessio.id), perUid.get(esdeveniment.iCalUID)].find((e) => e && !usats.has(e));
    if (!trobat) {
      crear.push({ sessio, esdeveniment });
      continue;
    }
    usats.add(trobat);
    if (difereix(esdeveniment, trobat)) actualitzar.push({ id: trobat.id, sessio, esdeveniment });
    else iguals += 1;
  }
  const sobrants = gestionats.filter((e) => !usats.has(e));
  const esPlaceholder = (e) => e.iCalUID?.startsWith('placeholder-');
  const placeholders = sobrants.filter(esPlaceholder);
  const esborrar = sobrants.filter((e) => !esPlaceholder(e));
  return { crear, actualitzar, esborrar, iguals, ignorats, placeholders };
}

// --- Informe i execució -------------------------------------------------------------------

const quan = (ev) => {
  if (!ev.start?.dateTime) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ev.start.dateTime)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
};

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
    for (const { esdeveniment } of canvis.crear) await calendari.crear(esdeveniment);
    for (const { id, esdeveniment } of canvis.actualitzar) {
      const { iCalUID, ...cos } = esdeveniment;
      await calendari.actualitzar(id, cos);
    }
    for (const e of canvis.esborrar) await calendari.esborrar(e.id);
    log('\nCalendari sincronitzat.');
  }
  return { sessions, canvis };
}

async function calendariGoogle({ credencials, calendarId }) {
  const { google } = await import('googleapis');
  const auth = new google.auth.JWT({
    email: credencials.client_email,
    key: credencials.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  const api = google.calendar({ version: 'v3', auth });
  return {
    async llistar() {
      const esdeveniments = [];
      let pageToken;
      do {
        const res = await api.events.list({ calendarId, showDeleted: false, singleEvents: true, maxResults: 250, pageToken });
        esdeveniments.push(...(res.data.items ?? []).filter((e) => (e.eventType ?? 'default') === 'default'));
        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken);
      return esdeveniments;
    },
    crear: (requestBody) => api.events.insert({ calendarId, requestBody }),
    actualitzar: (eventId, requestBody) => api.events.patch({ calendarId, eventId, requestBody }),
    esborrar: (eventId) => api.events.delete({ calendarId, eventId }),
  };
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
    const calendari = opcions.apply || ambCredencials ? await calendariGoogle(credencialsCalendari(process.env)) : null;

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
