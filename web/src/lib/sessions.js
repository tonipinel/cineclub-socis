import { getDb, llegir } from './db.js';
import { dataIso, horaNormal } from './format.js';
import { creaMemo } from './memo.js';

const memo = creaMemo();

// Els documents de `sessions` porten els camps de gestió (titol, data, hora, activa, ...) i
// `publica`, amb el front matter de Hugo en camelCase (el `description` de Hugo és `descripcio`).
const clau = (s) => `${s.data} ${horaNormal(s.hora) ?? '00:00'}`;
const ascendent = (a, b) => (clau(a) < clau(b) ? -1 : clau(a) > clau(b) ? 1 : 0);

// `AAAA-MM-DD` d'un dia que existeix (el 31 de febrer no).
const dataValida = (data) => {
  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(data)) return false;
  const [any, mes, dia] = data.slice(0, 10).split('-').map(Number);
  const d = new Date(Date.UTC(any, mes - 1, dia));
  return d.getUTCFullYear() === any && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
};
const horaValida = (hora) => horaNormal(hora) ?? '00:00';

// Un slug que pot anar tal qual en un segment de URL (els de Hugo poden dur accents).
const slugValid = (slug) => typeof slug === 'string' && /^[^\s/?#%\\]+$/.test(slug);

// `publica` l'edita l'admin a mà: qualsevol camp pot ser `null` o d'un altre tipus. Aquí cada camp
// pren el tipus que esperen les plantilles (textos nets, llistes només de textos, nombres vàlids) i
// el valor que no hi encaixa s'omet, només aquell camp. Els camps que no són aquí no arriben a la web.
const CAMPS_TEXT = [
  'titolEspanya', 'guio', 'pais', 'idioma', 'versioIdiomatica', 'fotografia', 'muntatge', 'musica', 'produccio',
  'premisDestacats', 'versioTipus', 'suportDistribucio', 'suportDistribucioId', 'seccio', 'organitza', 'descripcio',
  'hook', 'actualitzatEl',
];
// Títols i any: un nombre també val («1917», 2021 de YAML).
const CAMPS_TEXT_O_NOMBRE = ['titol', 'titolOriginal', 'titolTraduit', 'any'];
// Markdown i HTML: no es retallen (l'indentació inicial compta).
const CAMPS_TEXT_LLIURE = ['cos', 'sinopsiCartell'];
const CAMPS_LLISTA = ['directors', 'interprets', 'generes', 'participa', 'collabora', 'aliases'];

const buit = (v) => v === undefined || v === null || v === '';
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const textONombre = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : text(v));
const textLliure = (v) => (typeof v === 'string' && v.trim() ? v : undefined);
// Absoluta http(s) o relativa a l'arrel: res que no es pugui posar a un `src`.
const imatge = (v) => {
  const url = text(v);
  if (!url || !/^(https?:\/\/|\/(?!\/))/i.test(url)) return undefined;
  try {
    new URL(url, 'https://cineclubrodadebera.cat/');
    return url;
  } catch {
    return undefined;
  }
};
// Un sol valor també és una llista d'un element (com fa l'admin amb `llistaDe`).
const llistaDe = (v, element) => (Array.isArray(v) ? v : buit(v) ? [] : [v]).map(element).filter(Boolean);
// Nombre >= 0, també en text («5», «0», «4,5»).
const nombre = (v) => {
  const n = typeof v === 'number' ? v
    : typeof v === 'string' && /^\d+(?:[.,]\d+)?$/.test(v.trim()) ? Number(v.trim().replace(',', '.')) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
const NORMALITZADORS = {
  ...Object.fromEntries(CAMPS_TEXT.map((c) => [c, text])),
  ...Object.fromEntries(CAMPS_TEXT_O_NOMBRE.map((c) => [c, textONombre])),
  ...Object.fromEntries(CAMPS_TEXT_LLIURE.map((c) => [c, textLliure])),
  cartell: imatge,
  preu: nombre,
  durada: (v) => (nombre(v) > 0 ? nombre(v) : undefined),
  edatMinimaRecomanada: (v) => (Number.isInteger(nombre(v)) ? nombre(v) : undefined),
  queInclou: (v) => (v === true ? true : text(v)),
  trailerYoutubeId: (v) => (typeof v === 'string' && /^[A-Za-z0-9_-]{11}$/.test(v.trim()) ? v.trim() : undefined),
};

// La `publica` neta i els noms dels camps que duien un valor que no s'ha pogut fer servir (un camp
// buit, `null` o `false` no compta com a error).
function normalitzaPublica(brut) {
  const origen = brut && typeof brut === 'object' && !Array.isArray(brut) ? brut : {};
  const publica = {};
  const ignorats = [];
  for (const [camp, normalitza] of Object.entries(NORMALITZADORS)) {
    const valor = normalitza(origen[camp]);
    if (valor !== undefined) publica[camp] = valor;
    else if (!buit(origen[camp]) && origen[camp] !== false) ignorats.push(camp);
  }
  for (const camp of [...CAMPS_LLISTA, 'galeria']) {
    const valor = origen[camp];
    publica[camp] = llistaDe(valor, camp === 'galeria' ? imatge : text);
    const presents = Array.isArray(valor) ? valor.filter((x) => !buit(x)).length : buit(valor) ? 0 : 1;
    if (publica[camp].length < presents) ignorats.push(camp);
  }
  return { publica, ignorats };
}

// Sessió neta: `titol` de text (sense cap títol, el slug), `hora` HH:MM i `publica` normalitzada.
// Es registra quins camps s'han ignorat (mai els valors) per poder-los corregir a l'admin.
function normalitzaSessio(s) {
  const { publica, ignorats } = normalitzaPublica(s.publica);
  if (ignorats.length) console.warn(`sessió ${s.id}: camps de publica ignorats per tipus invàlid: ${ignorats.join(', ')}`);
  return { ...s, titol: textONombre(s.titol) ?? publica.titol ?? s.slug, hora: horaValida(s.hora), publica };
}

// Les no publicades no compten; una publicada que no es pot fer servir es registra (id i motiu, sense valors).
function publicable(s) {
  if (s.publicada !== true) return false;
  const motiu = !slugValid(s.slug) ? 'slug invàlid' : !dataValida(s.data) ? 'data invàlida' : null;
  if (motiu) console.warn(`sessió ${s.id} descartada: ${motiu}`);
  return !motiu;
}

// Una sessió publicada sense `data` vàlida o sense un slug que pugui anar a la URL s'ignora (no es
// pot ni ordenar ni enllaçar); la resta es normalitza (`normalitzaSessio`), perquè un sol document
// dolent no pugui fer caure tot el web. La lectura es memoritza ~60 s (vegeu memo.js).
export function sessionsPubliques(db = getDb()) {
  return memo.obte(db, 'sessions', async () => {
    const snap = await llegir(db.collection('sessions').get());
    return snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter(publicable)
      .map(normalitzaSessio)
      .sort(ascendent);
  });
}

export const trobaSessio = (sessions, any, slug) =>
  sessions.find((s) => s.slug === slug && s.data?.startsWith(`${any}-`)) ?? null;

export async function sessioPerSlug(any, slug, db = getDb()) {
  return trobaSessio(await sessionsPubliques(db), any, slug);
}

// Les `n` sessions amb data i hora >= `avui` (hora d'Europe/Madrid), de la més propera a la més llunyana.
export function properesSessions(sessions, avui, n = 3) {
  return sessions
    .filter((s) => new Date(dataIso(s.data, s.hora || '00:00')) >= avui)
    .sort(ascendent)
    .slice(0, n);
}

// Ordre per defecte de `RegularPages` a Hugo: de la més nova a la més antiga.
export const sessionsDescendents = (sessions) => [...sessions].sort(ascendent).reverse();

// Mosaic de la portada (`programming__mosaic`): les sessions de la més nova a la més antiga,
// llevant les `properes` (3) com a màxim, que s'afegeixen al final; es queden les `n` primeres.
// `avui` és l'instant de la petició: la portada es renderitza amb el mateix criteri que Hugo
// el dia de la compilació.
export function sessionsMosaic(sessions, avui, n = 9, properes = 3) {
  const properesIds = new Set(properesSessions(sessions, avui, properes).map((s) => s.id));
  const resta = sessionsDescendents(sessions).filter((s) => !properesIds.has(s.id));
  return [...resta, ...properesSessions(sessions, avui, properes)].slice(0, n);
}

// Agrupació de `programacio/list.html` (`GroupByDate "2006"`): anys descendents i, dins de
// cada any, les sessions de la més antiga a la més nova.
export function anysAmbSessions(sessions) {
  const perAny = new Map();
  for (const s of [...sessions].sort(ascendent)) {
    const any = s.data.slice(0, 4);
    if (!perAny.has(any)) perAny.set(any, []);
    perAny.get(any).push(s);
  }
  return [...perAny.entries()].sort(([a], [b]) => (a < b ? 1 : -1)).map(([any, grup]) => ({ any, sessions: grup }));
}

const coincideix = (a = [], b = []) => a.some((x) => b.includes(x));

// Mateixa lògica que `related-sessions.html`. Hugo recorre les sessions de la més nova a la més
// antiga i classifica cada candidata amb un sol criteri (director, si no intèrpret, si no secció,
// amb "cartellera" per defecte); es concatenen els grups en aquest ordre i es queden les 3 primeres.
export function sessionsRelacionades(sessio, sessions) {
  const actual = sessio.publica ?? {};
  const seccioActual = actual.seccio || 'cartellera';
  const perDirector = [];
  const perInterpret = [];
  const perSeccio = [];
  for (const candidata of [...sessions].sort(ascendent).reverse()) {
    if (candidata.id === sessio.id) continue;
    const c = candidata.publica ?? {};
    if (coincideix(actual.directors, c.directors)) perDirector.push(candidata);
    else if (coincideix(actual.interprets, c.interprets)) perInterpret.push(candidata);
    else if ((c.seccio || 'cartellera') === seccioActual) perSeccio.push(candidata);
  }
  return [...perDirector, ...perInterpret, ...perSeccio].slice(0, 3);
}
