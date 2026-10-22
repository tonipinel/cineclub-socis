// Lògica pura per convertir una proposta en sessió amb pàgina pública (`sessions/{id}` + `publica{}`).
// El model és el que migra `scripts/migra-hugo.mjs` i llegeix `web/src/lib/sessions.js`.

const MAX_SLUG = 60;
const MAX_DESCRIPCIO = 160;
const MAX_INTERPRETS = 8;
const FORMAT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Llistes: sempre arrays a `publica` (la web hi fa `.some`/`.includes`).
const LLISTES = ['directors', 'interprets', 'generes', 'participa', 'collabora', 'aliases'];

const buit = (v) => v == null || v === '' || Number.isNaN(v) || (Array.isArray(v) && v.length === 0);
const text = (v) => (typeof v === 'string' ? v.trim() : '');
const llistaDe = (v) => (Array.isArray(v) ? v : buit(v) ? [] : [v]);
const comLlista = (v) => (Array.isArray(v) ? v : buit(v) ? [] : [v]);

const TRANSLITERACIO = { ø: 'o', æ: 'ae', ß: 'ss', ł: 'l', đ: 'd', œ: 'oe' };

export function generarSlug(titol) {
  return String(titol ?? '')
    .toLowerCase()
    .replace(/[øæßłđœ]/g, (c) => TRANSLITERACIO[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/, '');
}

// Les sessions sense `slug` o sense `data` no compten: no tenen ruta pública.
export function slugDisponible(slug, data, sessions, idPropia) {
  const any = typeof data === 'string' ? data.slice(0, 4) : '';
  return !sessions.some((s) => s.slug && typeof s.data === 'string' && s.data
    && s.id !== idPropia && s.slug === slug && s.data.slice(0, 4) === any);
}

// `AAAA-MM-DD` d'un dia que existeix (el 31 de febrer no).
const dataValida = (data) => {
  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const [any, mes, dia] = data.split('-').map(Number);
  const d = new Date(Date.UTC(any, mes - 1, dia));
  return d.getUTCFullYear() === any && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
};

const dataMadrid = (instant) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instant).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
};

export function marcarActualitzada(publica, ara) {
  return { ...publica, actualitzatEl: dataMadrid(ara) };
}

export function netejarPublica(publica) {
  const neta = {};
  for (const [clau, valor] of Object.entries(publica ?? {})) {
    if (!LLISTES.includes(clau) && !buit(valor)) neta[clau] = valor;
  }
  for (const clau of LLISTES) neta[clau] = comLlista(publica?.[clau]);
  return neta;
}

// Fins a 160 caràcters (comptat el `…`), tallant a la darrera paraula sencera.
function retallarDescripcio(brut) {
  const t = String(brut ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= MAX_DESCRIPCIO) return t;
  const marge = MAX_DESCRIPCIO - 1;
  let tall = t.slice(0, marge);
  if (!/\s/.test(t[marge])) {
    const espai = tall.lastIndexOf(' ');
    if (espai > 0) tall = tall.slice(0, espai);
  }
  return `${tall.replace(/[\s,;:.]+$/, '')}…`;
}

const ID_YOUTUBE = /^[A-Za-z0-9_-]{11}$/;
// Accepta una URL de YouTube o directament l'id; '' si no se'n reconeix cap.
export function idYoutube(brut) {
  const url = text(brut);
  if (ID_YOUTUBE.test(url)) return url;
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  } catch {
    return '';
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, '');
  const [primer, segon] = u.pathname.split('/').filter(Boolean);
  let id = '';
  if (host === 'youtu.be') id = primer;
  else if (host === 'youtube.com') {
    if (primer === 'watch') id = u.searchParams.get('v');
    else if (['embed', 'shorts', 'live', 'v'].includes(primer)) id = segon;
  } else if (host === 'youtube-nocookie.com' && primer === 'embed') id = segon;
  return id && ID_YOUTUBE.test(id) ? id : '';
}

const unir = (llista) => llistaDe(llista).map(text).filter(Boolean).join(', ');
const nomsDe = (llista) => llistaDe(llista).map((r) => text(typeof r === 'string' ? r : r?.nom)).filter(Boolean);

export function construirSessioDesDeProposta(proposta, { propostaId, avui } = {}) {
  proposta ??= {};
  const titolOriginal = text(proposta.titol);
  const titol = text(proposta.titolLocal) || titolOriginal;
  const slugSuggerit = generarSlug(titol) || generarSlug(titolOriginal);
  const imatgeUrl = text(proposta.imatgeUrl);

  const publica = netejarPublica({
    titol,
    titolOriginal,
    directors: nomsDe(proposta.directors),
    guio: unir(proposta.guionistes),
    pais: unir(proposta.paisos),
    any: typeof proposta.any === 'string' ? proposta.any.trim() : proposta.any,
    durada: Number.isFinite(proposta.durada) && proposta.durada > 0 ? proposta.durada : undefined,
    idioma: unir(proposta.idiomes),
    generes: nomsDe(proposta.generes),
    interprets: nomsDe(proposta.repartiment).slice(0, MAX_INTERPRETS),
    sinopsiCartell: text(proposta.sinopsi),
    descripcio: retallarDescripcio(proposta.sinopsi),
    trailerYoutubeId: idYoutube(proposta.trailerUrl),
    cartell: imatgeUrl,
    seccio: 'cartellera',
  });

  return {
    sessio: {
      titol,
      data: '',
      hora: '19:00',
      urlProgramacio: '',
      imatgeUrl,
      publicada: false,
      slug: '',
      propostaId,
      publica: avui instanceof Date && !Number.isNaN(avui.getTime()) ? marcarActualitzada(publica, avui) : publica,
    },
    slugSuggerit,
  };
}

// `errors` invaliden; `avisos` (cartell) deixen publicar però s'han de mostrar.
export function validarPublicable(sessio, altresSessions = []) {
  const errors = {};
  const avisos = {};
  if (!String(sessio.titol ?? '').trim()) errors.titol = 'Cal un títol.';
  if (!sessio.slug) errors.slug = 'Cal un slug.';
  else if (!FORMAT_SLUG.test(sessio.slug)) errors.slug = 'El slug només pot tenir minúscules, xifres i guions.';
  else if (dataValida(sessio.data) && !slugDisponible(sessio.slug, sessio.data, altresSessions, sessio.id)) {
    errors.slug = 'Ja hi ha una altra sessió amb aquest slug el mateix any.';
  }
  if (!dataValida(sessio.data)) errors.data = 'Cal una data vàlida.';
  const preu = sessio.publica?.preu;
  if (preu != null && preu !== '' && !(typeof preu === 'number' && Number.isFinite(preu) && preu >= 0)) {
    errors.preu = 'El preu ha de ser un número igual o superior a 0.';
  }
  if (!sessio.publica?.cartell) avisos.cartell = 'La sessió no té cartell.';
  return { valid: Object.keys(errors).length === 0, errors, avisos };
}

export const URL_WEB = 'https://cineclubrodadebera.cat';

export const esSlugValid = (slug) => typeof slug === 'string' && FORMAT_SLUG.test(slug);

export function camiPublic(data, slug) {
  if (!slug || !dataValida(data)) return '';
  return `/programacio/${data.slice(0, 4)}/${slug}/`;
}

export function urlPublica(data, slug) {
  const cami = camiPublic(data, slug);
  return cami ? `${URL_WEB}${cami}` : '';
}

// Els `aliases` són camins (com els de Hugo): la web en fa 301 cap a la URL actual.
export function afegirAlias(aliases, alias) {
  const llista = comLlista(aliases);
  return !alias || llista.includes(alias) ? llista : [...llista, alias];
}

// ---------------------------------------------------------------- Formulari

const CAMPS_LLISTA = ['directors', 'interprets', 'generes', 'participa', 'collabora'];
const CAMPS_NUMERO = {
  preu: 'El preu ha de ser un número igual o superior a 0.',
  durada: 'La durada ha de ser un nombre enter de minuts.',
  edatMinimaRecomanada: "L'edat mínima ha de ser un nombre enter (0 = tots els públics).",
};
const CAMPS_ENTER = ['durada', 'edatMinimaRecomanada'];
export const AVIS_DESCRIPCIO = `La descripció passa de ${MAX_DESCRIPCIO} caràcters: els cercadors la retallaran.`;
export const ERROR_DESCRIPCIO = `La descripció no pot passar de ${MAX_DESCRIPCIO} caràcters.`;
export const CAMPS_TEXT_PUBLICA = [
  'titol', 'titolOriginal', 'titolTraduit', 'titolEspanya', 'sinopsiCartell', 'guio', 'pais', 'any', 'idioma',
  'versioIdiomatica', 'fotografia', 'muntatge', 'musica', 'produccio', 'premisDestacats', 'versioTipus', 'queInclou',
  'suportDistribucio', 'seccio', 'organitza', 'descripcio', 'hook', 'trailerYoutubeId', 'cos',
];

// Text del formulari: llistes separades per comes i números com a text.
export function publicaAFormulari(publica) {
  const p = publica ?? {};
  const form = {};
  for (const camp of CAMPS_TEXT_PUBLICA) form[camp] = p[camp] == null ? '' : String(p[camp]);
  for (const camp of Object.keys(CAMPS_NUMERO)) form[camp] = p[camp] == null ? '' : String(p[camp]);
  for (const camp of CAMPS_LLISTA) form[camp] = llistaDe(p[camp]).join(', ');
  form.cartell = p.cartell ?? '';
  form.galeria = llistaDe(p.galeria);
  form.aliases = llistaDe(p.aliases);
  return form;
}

const numero = (brut) => {
  const t = text(brut).replace(',', '.');
  if (!t) return undefined;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
};

export function formulariAPublica(form) {
  const publica = {};
  const errors = {};
  const avisos = {};
  for (const camp of CAMPS_TEXT_PUBLICA) publica[camp] = text(form[camp]);
  if (/^\d{4}$/.test(publica.any)) publica.any = Number(publica.any);
  for (const [camp, missatge] of Object.entries(CAMPS_NUMERO)) {
    publica[camp] = numero(form[camp]);
    const enter = !CAMPS_ENTER.includes(camp) || publica[camp] === undefined || Number.isInteger(publica[camp]);
    if (Number.isNaN(publica[camp]) || !enter) errors[camp] = missatge;
  }
  for (const camp of CAMPS_LLISTA) publica[camp] = String(form[camp] ?? '').split(',').map(text).filter(Boolean);
  if (publica.trailerYoutubeId) {
    const id = idYoutube(publica.trailerYoutubeId);
    if (!id) errors.trailerYoutubeId = "No s'ha reconegut cap vídeo de YouTube.";
    publica.trailerYoutubeId = id;
  }
  if (publica.descripcio.length > MAX_DESCRIPCIO) avisos.descripcio = AVIS_DESCRIPCIO;
  publica.cartell = form.cartell;
  publica.galeria = llistaDe(form.galeria);
  publica.aliases = llistaDe(form.aliases);
  return { publica, errors, avisos };
}

// ---------------------------------------------------------------- Imatges

const EXTENSIONS_IMATGE = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const ACCEPT_IMATGE = Object.keys(EXTENSIONS_IMATGE).join(',');
export const MIDA_MAXIMA_IMATGE = 10 * 1024 * 1024;

export function validarImatge(fitxer) {
  if (!EXTENSIONS_IMATGE[fitxer?.type]) return "La imatge ha de ser JPG, PNG o WebP.";
  if (fitxer.size > MIDA_MAXIMA_IMATGE) return 'La imatge no pot ocupar més de 10 MB.';
  return null;
}

// `poster-<instant>.jpg` o `gallery-<instant>-<n>.webp`: mai el nom original del fitxer.
export function camiImatge(slug, tipus, fitxer, instant, n) {
  const nom = n == null ? `${tipus}-${instant}` : `${tipus}-${instant}-${n}`;
  return `web/sessions/${slug}/${nom}.${EXTENSIONS_IMATGE[fitxer.type]}`;
}

// Mateix format que `urlStorage` de scripts/migra-hugo.mjs (lectura pública de `web/`).
export const urlStorage = (bucket, cami) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(cami)}?alt=media`;
