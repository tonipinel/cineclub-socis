import { getDb, llegir } from './db.js';
import { dataIso } from './format.js';
import { SLUGS_CONTINGUT, paginaPerSlug } from './pagines.js';
import { urlSessioCodificada, urlTerme } from './sessio-camps.js';
import { sessionsPubliques } from './sessions.js';
import { termesDe } from './taxonomies.js';
import { escapaXml } from './xml.js';

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

// `lastmod` d'una sessió. Com Hugo, és la data i hora de la sessió amb l'ofset d'Europe/Madrid.
// Un editor pot forçar una altra data amb `publica.actualitzatEl` (`2026-11-02` o
// `2026-11-02T10:15:00+01:00`, amb zona) quan canvia el contingut de la fitxa; un valor que no és
// una data vàlida d'aquest format s'ignora.
export const lastmodSessio = (sessio) => {
  const manual = sessio.publica?.actualitzatEl;
  return manualValid(manual) ? manual : dataIso(sessio.data, sessio.hora);
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
async function lastmodPropostes(db) {
  try {
    const snap = await llegir(db.collection('propostes').where('estat', '==', 'aprovada').get());
    const instants = snap.docs.map((d) => d.data().timestamp?.toDate?.().getTime()).filter(Number.isFinite);
    return instants.length ? new Date(Math.max(...instants)).toISOString().replace(/\.\d+Z$/, 'Z') : null;
  } catch (err) {
    console.error('error en llegir les propostes per al sitemap', err);
    return null;
  }
}

const mesRecent = (lastmods) => lastmods.reduce((a, b) => (a === null || instant(b) > instant(a) ? b : a), null);

// Entrades `{ cami, lastmod? }` del sitemap (camins amb barra final i percent-encoded, com els de
// Hugo). Surten de les mateixes funcions que les pàgines (`sessionsPubliques`, `termesDe`,
// `paginaPerSlug`): una URL que aquí apareix també es resol allà, i un terme sense sessions
// publicades no hi apareix. `lastmod` reprodueix el de Hugo: sessions = la seva data; termes i
// índexs de taxonomia = la sessió més recent que contenen; portada, programació i pàgines = el
// `date` del seu front matter (les que no en tenen, no emeten `lastmod`); /propostes/ (pàgina nova,
// no és a Hugo) = la proposta aprovada més recent.
export async function entradesSitemap(db = getDb()) {
  const [sessions, portada, programacio, pagines, lastmodProp] = await Promise.all([
    sessionsPubliques(db),
    paginaPerSlug('portada', db),
    paginaPerSlug('programacio', db),
    Promise.all(PAGINES.map((slug) => paginaPerSlug(slug, db))),
    lastmodPropostes(db),
  ]);
  const lastmodsDe = (llista) => mesRecent(llista.map(lastmodSessio));
  const entrada = (cami, lastmod) => (lastmod ? { cami, lastmod } : { cami });
  return [
    entrada('/', lastmodPagina(portada)),
    entrada('/programacio/', lastmodPagina(programacio)),
    entrada('/propostes/', lastmodProp),
    ...sessions.map((s) => entrada(urlSessioCodificada(s), lastmodSessio(s))),
    ...TAXONOMIES.flatMap((taxonomia) => {
      const termes = termesDe(sessions, taxonomia);
      return [
        entrada(`/${taxonomia}/`, lastmodsDe(termes.flatMap((t) => t.sessions))),
        ...termes.map((terme) => entrada(urlTerme(taxonomia, terme.nom), lastmodsDe(terme.sessions))),
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
