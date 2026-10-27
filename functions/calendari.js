// Lògica pura de la sincronització del Google Calendar del club amb les sessions de Firestore.
// La comparteixen la Cloud Function (`calendari-handlers.js`) i `scripts/sync-calendar.mjs`.
const URL_WEB = 'https://cineclubrodadebera.cat';
const LLOC = 'Teatre del Casino Municipal de Roda de Berà';
const SOURCE_TAG = 'cineclub-website-sync';
const DURADA_HORES = 3;

function credencialsCalendari(env) {
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
function sessionsPubliques(docs) {
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
  const original = String(sessio.publica?.titol || sessio.titol || sessio.slug);
  // Entre parèntesis, el títol en català si n'hi ha un de diferent; si no, el d'Espanya si és diferent.
  const diferent = (t) => typeof t === 'string' && t.trim() && t.trim().toLowerCase() !== original.trim().toLowerCase();
  const segon = [sessio.publica?.titolTraduit, sessio.publica?.titolEspanya].find(diferent);
  return segon ? `${original} (${segon.trim()})` : original;
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
function esdevenimentDesDeSessio(sessio, { urlBase = URL_WEB, duradaHores = DURADA_HORES } = {}) {
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

function calcularCanvis(sessions, existents, opcions) {
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

// `calendari` és `{ crear(ev), actualitzar(id, ev), esborrar(id) }`.
async function aplicarCanvis(calendari, { crear, actualitzar, esborrar }) {
  for (const { esdeveniment } of crear) await calendari.crear(esdeveniment);
  for (const { id, esdeveniment } of actualitzar) {
    const cos = { ...esdeveniment };
    delete cos.iCalUID;
    await calendari.actualitzar(id, cos);
  }
  for (const e of esborrar) await calendari.esborrar(e.id);
}

// Finestra de temps de les llistes del calendari (amb `singleEvents` cal acotar-les): d'un any enrere a dos endavant.
function finestra(ara = new Date()) {
  const dia = 86400000;
  return {
    timeMin: new Date(ara.getTime() - 365 * dia).toISOString(),
    timeMax: new Date(ara.getTime() + 730 * dia).toISOString(),
  };
}

// Data i hora d'Europe/Madrid ('AAAA-MM-DD HH:MM') de l'inici d'un esdeveniment.
const quan = (ev) => {
  if (!ev.start?.dateTime) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ev.start.dateTime)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
};

module.exports = {
  URL_WEB,
  LLOC,
  SOURCE_TAG,
  credencialsCalendari,
  sessionsPubliques,
  esdevenimentDesDeSessio,
  calcularCanvis,
  aplicarCanvis,
  finestra,
  quan,
};
