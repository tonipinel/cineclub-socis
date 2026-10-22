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

// Una sessió publicada sense `data` vàlida s'ignora (no es pot ni ordenar ni pintar) i una
// `hora` absent val 00:00, perquè un sol document dolent no pugui fer caure tot el web.
// La lectura es memoritza ~60 s (vegeu memo.js).
export function sessionsPubliques(db = getDb()) {
  return memo.obte(db, 'sessions', async () => {
    const snap = await llegir(db.collection('sessions').get());
    return snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((s) => s.publicada === true && s.slug && dataValida(s.data))
      .map((s) => ({ ...s, hora: horaValida(s.hora) }))
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
