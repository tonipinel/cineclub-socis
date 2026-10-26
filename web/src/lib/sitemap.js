import { getDb, llegir } from './db.js';
import { dataIso } from './format.js';
import { SLUGS_CONTINGUT, paginaPerSlug } from './pagines.js';
import { urlSessioCodificada, urlTerme } from './sessio-camps.js';
import { sessionsPubliques } from './sessions.js';
import { termeIndexable, termesDe } from './taxonomies.js';
import { creaMemo } from './memo.js';
import { escapaXml } from './xml.js';

const memo = creaMemo();

const TAXONOMIES = ['directors', 'generes', 'interprets'];
const PAGINES = [...SLUGS_CONTINGUT, 'fes-te-socia'];

// Data ISO vàlida (W3C datetime): `AAAA-MM-DD` o instant amb hora i, opcionalment, ofset.
const ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;
const isoValid = (valor) => typeof valor === 'string' && ISO.test(valor) && !Number.isNaN(Date.parse(valor));

// `publica.actualitzatEl`, més estricte: `AAAA-MM-DD` o instant amb hora I designador de zona (`Z` o
// `±HH:MM`; sense zona seria ambigu), i una data que existeix (el 30 de febrer no).
const MANUAL = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-](\d{2}):(\d{2})))?$/;
const manualValid = (valor) => {
  const m = typeof valor === 'string' ? MANUAL.exec(valor) : null;
  if (!m) return false;
  const [any, mes, dia, hh = 0, mm = 0, ss = 0, oh = 0, om = 0] = m.slice(1).map((x) => (x === undefined ? undefined : Number(x)));
  if (valor.length > 10 && !/(Z|[+-]\d{2}:\d{2})$/.test(valor)) return false;
  const d = new Date(Date.UTC(any, mes - 1, dia));
  return d.getUTCFullYear() === any && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia
    && hh <= 23 && mm <= 59 && ss <= 59 && oh <= 23 && om <= 59;
};
const instant = (lastmod) => Date.parse(lastmod);

// `lastmod` d'una sessió: quan va canviar el contingut de la fitxa, mai una data futura.
//   1. `publica.actualitzatEl` (`2026-11-02` o `2026-11-02T10:15:00+01:00`, amb zona): l'admin l'escriu en desar
//      canvis de contingut de la fitxa (també es pot posar a mà). Un valor que no és una data vàlida d'aquest
//      format, o que és futur, s'ignora.
//   2. La data i hora de la sessió, si ja ha passat.
//   3. Una sessió futura sense `actualitzatEl`: l'última escriptura del document (`updateTime`, `modificadaEl`),
//      sense mil·lisegons i limitada a ara. Va al final perquè també es mou amb escriptures que no són de
//      contingut (activar-la a l'escaneig, importacions); sense cap de les tres, no n'hi ha.
// Dia d'avui a Europe/Madrid (`AAAA-MM-DD`): l'admin escriu `actualitzatEl` amb el dia de Madrid, que pot anar
// per davant del dia UTC.
const diaMadrid = (ara) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ara);
const noFutur = (valor, ara) => (valor.length === 10 ? valor <= diaMadrid(ara) : instant(valor) <= ara.getTime());

export const lastmodSessio = (sessio, ara = new Date()) => {
  const manual = sessio.publica?.actualitzatEl;
  if (manualValid(manual) && noFutur(manual, ara)) return manual;
  const dataSessio = dataIso(sessio.data, sessio.hora);
  if (instant(dataSessio) <= ara.getTime()) return dataSessio;
  if (isoValid(sessio.modificadaEl)) {
    const ms = Math.min(instant(sessio.modificadaEl), ara.getTime());
    return new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
  }
  return null;
};

// `lastmod` d'una pàgina de contingut: el `date` del seu front matter (`pagines/*.dades.date`), amb el
// format de Hugo (`AAAA-MM-DDTHH:MM:SS+00:00`). Una data sense hora és mitjanit UTC. Sense data, null.
export const lastmodPagina = (pagina) => {
  const data = pagina?.dades?.date;
  if (!isoValid(data)) return null;
  if (data.length === 10) return `${data}T00:00:00+00:00`;
  const net = data.replace(/\.\d+/, '').replace(/(T\d{2}:\d{2})(?=Z|[+-]|$)/, '$1:00');
  return /(Z|[+-]\d{2}:\d{2})$/.test(net) ? net.replace(/Z$/, '+00:00') : `${net}+00:00`;
};

// `lastmod` de /propostes/: la proposta aprovada més recent (instant UTC sense mil·lisegons). Sense propostes
// aprovades, o si la lectura falla, la URL surt sense `lastmod`.
// Es memoritza ~60 s (vegeu memo.js); si la lectura falla no es desa i la següent petició ho torna a provar.
const lastmodPropostes = (db) => memo.obte(db, 'lastmod-propostes', async () => {
  const snap = await llegir(db.collection('propostes').where('estat', '==', 'aprovada').get());
  const instants = snap.docs.map((d) => d.data().timestamp?.toDate?.().getTime()).filter(Number.isFinite);
  return instants.length ? new Date(Math.max(...instants)).toISOString().replace(/\.\d+Z$/, 'Z') : null;
}).catch((err) => {
  console.error('error en llegir les propostes per al sitemap', err);
  return null;
});

const mesRecent = (lastmods) => lastmods.filter(Boolean).reduce((a, b) => (a === null || instant(b) > instant(a) ? b : a), null);

// Entrades `{ cami, lastmod? }` del sitemap (camins amb barra final i percent-encoded, com els de
// Hugo). Surten de les mateixes funcions que les pàgines (`sessionsPubliques`, `termesDe`,
// `paginaPerSlug`): una URL que aquí apareix també es resol allà, i un terme sense sessions
// publicades no hi apareix; tampoc els que no s'indexen (`termeIndexable`). `lastmod`: sessions =
// `lastmodSessio`; termes i índexs de taxonomia = la sessió amb el `lastmod` més recent que contenen;
// portada i programació (pinten les sessions) = el més recent entre el `date` del seu front matter i el
// de totes les sessions; pàgines = el `date` del seu front matter (les que no en tenen, no emeten
// `lastmod`); /propostes/ = la proposta aprovada més recent.
export async function entradesSitemap(db = getDb(), ara = new Date()) {
  const [sessions, portada, programacio, pagines, lastmodProp] = await Promise.all([
    sessionsPubliques(db),
    paginaPerSlug('portada', db),
    paginaPerSlug('programacio', db),
    Promise.all(PAGINES.map((slug) => paginaPerSlug(slug, db))),
    lastmodPropostes(db),
  ]);
  const lastmodsDe = (llista) => mesRecent(llista.map((s) => lastmodSessio(s, ara)));
  const lastmodSessions = lastmodsDe(sessions);
  const entrada = (cami, lastmod) => (lastmod ? { cami, lastmod } : { cami });
  return [
    entrada('/', mesRecent([lastmodPagina(portada), lastmodSessions])),
    entrada('/programacio/', mesRecent([lastmodPagina(programacio), lastmodSessions])),
    entrada('/propostes/', lastmodProp),
    ...sessions.map((s) => entrada(urlSessioCodificada(s), lastmodSessio(s, ara))),
    ...TAXONOMIES.flatMap((taxonomia) => {
      const termes = termesDe(sessions, taxonomia);
      return [
        entrada(`/${taxonomia}/`, lastmodsDe(termes.flatMap((t) => t.sessions))),
        ...termes.filter(termeIndexable).map((terme) => entrada(urlTerme(taxonomia, terme.nom), lastmodsDe(terme.sessions))),
      ];
    }),
    ...PAGINES.flatMap((slug, i) => (pagines[i] ? [entrada(`/${slug}/`, lastmodPagina(pagines[i]))] : [])),
  ];
}

export async function urlsSitemap(db = getDb()) {
  return (await entradesSitemap(db)).map((e) => e.cami);
}

// Mateixos espais de noms que el sitemap de Hugo (inclòs `xhtml`, que Hugo declara tot i no usar-lo).
export const xmlSitemap = (entrades, base) => '<?xml version="1.0" encoding="UTF-8"?>\n'
  + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
  + entrades.map(({ cami, lastmod }) => `<url><loc>${escapaXml(base + cami)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>\n`).join('')
  + '</urlset>\n';
