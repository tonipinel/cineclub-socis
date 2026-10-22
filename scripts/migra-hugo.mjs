// Ús: node scripts/migra-hugo.mjs [--contingut <dir content de Hugo>] [--apply [--omet-noves]]
// Migra les sessions i les pàgines del web de Hugo (~/sites/cineclub, només lectura) a Firestore i Storage.
// Per defecte és un INFORME: només llegeix (Firestore `sessions` i `pagines`, la llista de `web/` a Storage
// i els fitxers locals) i no escriu res. Amb `--apply` aplica el pla, només si hi ha la còpia de seguretat
// d'avui (backups/<AAAA-MM-DD>/manifest.json) i cap sessió dubtosa sense resoldre a migracio-mapa.json.
// `--omet-noves` aplica tot menys la creació de sessions noves (es poden crear després amb una altra
// execució sense l'opció: la regla «ja migrada» fa que aquesta només creï les que falten).
// Credencials: GOOGLE_APPLICATION_CREDENTIALS o la clau cineclub-socis-firebase-adminsdk-*.json de l'arrel.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import matter from 'gray-matter';

const ARREL = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const US = 'Ús: node scripts/migra-hugo.mjs [--contingut <dir content de Hugo>] [--apply [--omet-noves]]';

// Opcions de la línia d'ordres. Una opció desconeguda (p. ex. `--omet-nova`) o un valor que falta
// llança: mai no s'ha d'aplicar una migració amb una errada d'escriptura que n'ha canviat el sentit.
export function llegirOpcions(argv, dirContingutPerDefecte = join(homedir(), 'sites/cineclub/content')) {
  const opcions = { apply: false, ometNoves: false, dirContingut: dirContingutPerDefecte };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') opcions.apply = true;
    else if (arg === '--omet-noves') opcions.ometNoves = true;
    else if (arg === '--contingut') {
      const valor = argv[i + 1];
      if (!valor || valor.startsWith('--')) throw new Error('Falta el valor de --contingut <dir>');
      opcions.dirContingut = valor;
      i += 1;
    } else {
      throw new Error(`Opció desconeguda: ${arg}`);
    }
  }
  return opcions;
}

export const BUCKET = 'cineclub-socis.firebasestorage.app';
export const URL_WEB = 'https://cineclubrodadebera.cat';

export const urlStorage = (bucket, cami) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(cami)}?alt=media`;

// Front matter de Hugo → camp de `publica` (camelCase; `title` es desa com a `titol`, perquè el títol
// de Hugo pot no coincidir amb el `titol` de gestió de la sessió).
const CAMPS_PUBLICA = {
  title: 'titol',
  titol_original: 'titolOriginal',
  titol_traduit: 'titolTraduit',
  titol_espanya: 'titolEspanya',
  sinopsi_cartell: 'sinopsiCartell',
  trailer_youtube_id: 'trailerYoutubeId',
  directors: 'directors',
  guio: 'guio',
  pais: 'pais',
  any: 'any',
  durada: 'durada',
  idioma: 'idioma',
  versio_idiomatica: 'versioIdiomatica',
  generes: 'generes',
  fotografia: 'fotografia',
  muntatge: 'muntatge',
  musica: 'musica',
  produccio: 'produccio',
  interprets: 'interprets',
  premis_destacats: 'premisDestacats',
  versio_tipus: 'versioTipus',
  preu: 'preu',
  que_inclou: 'queInclou',
  edat_minima_recomanada: 'edatMinimaRecomanada',
  suport_distribucio: 'suportDistribucio',
  seccio: 'seccio',
  organitza: 'organitza',
  participa: 'participa',
  collabora: 'collabora',
  description: 'descripcio',
  hook: 'hook',
  aliases: 'aliases',
};
// Camps del front matter que no van a `publica` perquè ja es desen fora (slug, data i hora).
const CAMPS_FORA_PUBLICA = ['slug', 'date'];
// Llistes: sempre arrays, mai null (la web hi fa `.some`/`.includes`).
const LLISTES = ['directors', 'interprets', 'generes', 'participa', 'collabora', 'aliases'];

const PAGINES = [
  { fitxer: '_index.md', slug: 'portada', tipus: 'portada', dirImatges: '' },
  { fitxer: 'preguntes-frequents.md', slug: 'preguntes-frequents', tipus: 'faq' },
  { fitxer: 'privacitat.md', slug: 'privacitat', tipus: 'contingut' },
  { fitxer: 'fes-te-socia/index.md', slug: 'fes-te-socia', tipus: 'socia', dirImatges: 'fes-te-socia' },
  { fitxer: 'programacio/_index.md', slug: 'programacio', tipus: 'contingut' },
];

const TIPUS_IMATGE = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const tipusImatge = (fitxer) => TIPUS_IMATGE[fitxer.slice(fitxer.lastIndexOf('.')).toLowerCase()];

// `{}` com a opcions evita la memòria cau de gray-matter (que retornaria el mateix objecte).
const llegirMd = (cami) => matter(readFileSync(cami, 'utf8'), {});

// Data i hora d'Europe/Madrid d'un instant.
function dataHoraMadrid(instant) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
  return { data: `${parts.year}-${parts.month}-${parts.day}`, hora: `${parts.hour}:${parts.minute}` };
}

// Firestore no ha de rebre `Date` del YAML a `dades`: es desen com a text (només data si és a mitjanit UTC).
function serialitzar(valor) {
  if (valor instanceof Date) {
    const iso = valor.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
  }
  if (Array.isArray(valor)) return valor.map(serialitzar);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, serialitzar(v)]));
  }
  return valor;
}

const imatgesDe = (dir, filtre = (f) => tipusImatge(f)) =>
  readdirSync(dir).filter((f) => filtre(f) && statSync(join(dir, f)).isFile()).sort();

const comLlista = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);

export function llegirSessionsHugo(dirContingut, bucket = BUCKET) {
  const arrel = join(dirContingut, 'programacio');
  const sessions = [];
  for (const anyCarpeta of readdirSync(arrel).filter((n) => /^\d{4}$/.test(n)).sort()) {
    for (const carpeta of readdirSync(join(arrel, anyCarpeta)).sort()) {
      const dir = join(arrel, anyCarpeta, carpeta);
      if (!existsSync(join(dir, 'index.md'))) continue;
      const { data: fm, content } = llegirMd(join(dir, 'index.md'));
      const slug = fm.slug || carpeta;
      const { data, hora } = dataHoraMadrid(fm.date);

      const publica = {};
      const campsDesconeguts = [];
      for (const [clau, valor] of Object.entries(fm)) {
        if (CAMPS_FORA_PUBLICA.includes(clau)) continue;
        const camp = CAMPS_PUBLICA[clau];
        if (!camp) campsDesconeguts.push(clau);
        else if (valor != null && valor !== '') publica[camp] = valor;
      }
      for (const camp of LLISTES) publica[camp] = comLlista(publica[camp]);

      // Mateix criteri que les plantilles de Hugo: `poster*` i `gallery*` ordenades per nom.
      const fitxers = imatgesDe(dir);
      const poster = fitxers.find((f) => f.startsWith('poster'));
      const galeria = fitxers.filter((f) => f.startsWith('gallery'));
      const fotos = [poster, ...galeria].filter(Boolean).map((fitxer) => ({
        fitxer, cami: join(dir, fitxer), desti: `web/sessions/${slug}/${fitxer}`,
      }));
      if (poster) publica.cartell = urlStorage(bucket, `web/sessions/${slug}/${poster}`);
      publica.galeria = galeria.map((f) => urlStorage(bucket, `web/sessions/${slug}/${f}`));
      publica.cos = content.trim();

      sessions.push({
        slug,
        carpeta: relative(dirContingut, dir),
        any: data.slice(0, 4),
        data,
        hora,
        titol: fm.title,
        aliases: publica.aliases,
        fotos,
        publica,
        campsDesconeguts,
      });
    }
  }
  return sessions;
}

export function llegirPaginesHugo(dirContingut, bucket = BUCKET) {
  return PAGINES.map(({ fitxer, slug, tipus, dirImatges }) => {
    const { data: fm, content } = llegirMd(join(dirContingut, fitxer));
    const imatges = dirImatges === undefined ? [] : imatgesDe(join(dirContingut, dirImatges)).map((f) => ({
      fitxer: f, cami: join(dirContingut, dirImatges, f), desti: `web/pagines/${f}`,
    }));
    return {
      fitxer,
      imatges,
      doc: {
        slug,
        tipus,
        titol: fm.title ?? '',
        dades: serialitzar(fm),
        cos: content.trim(),
        imatges: Object.fromEntries(imatges.map((i) => [i.fitxer, urlStorage(bucket, i.desti)])),
      },
    };
  });
}

// ---------------------------------------------------------------- Emparellament

const normalitza = (text = '') => String(text).normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function conteRuta(url, ruta) {
  if (!url) return false;
  let descodificada = url;
  try { descodificada = decodeURI(url); } catch { /* URL mal codificada: es compara tal qual */ }
  return url.includes(ruta) || descodificada.includes(ruta) || url.includes(encodeURI(ruta));
}

const titolsHugo = (h) => [h.titol, h.publica.titolOriginal, h.publica.titolTraduit, h.publica.titolEspanya]
  .filter(Boolean).map(normalitza);

export const urlProgramacio = (h) => `${URL_WEB}/programacio/${h.any}/${h.slug}/`;

function classificar(h, sessions, mapa) {
  const manual = mapa[h.slug];
  if (manual && manual !== 'nova') {
    const sessio = sessions.find((s) => s.id === manual);
    return sessio
      ? { tipus: 'parella', sessio, motiu: 'mapa' }
      : { tipus: 'dubtosa', candidats: [], motiu: `el mapa apunta a «${manual}», que no existeix` };
  }

  // Ja migrada abans (el `slug` només el posa aquesta migració): garanteix la idempotència.
  const migrades = sessions.filter((s) => s.slug === h.slug && s.data?.startsWith(`${h.any}-`));
  if (migrades.length === 1) return { tipus: 'parella', sessio: migrades[0], motiu: 'ja migrada' };
  if (migrades.length > 1) return { tipus: 'dubtosa', candidats: migrades, motiu: 'diverses sessions amb aquest slug' };

  if (manual === 'nova') return { tipus: 'nova', motiu: 'mapa manual' };

  const perUrl = sessions.filter((s) => conteRuta(s.urlProgramacio, `/programacio/${h.any}/${h.slug}/`));
  const perAlias = sessions.filter((s) => !perUrl.includes(s) && h.aliases.some((a) => conteRuta(s.urlProgramacio, a)));
  const perEnllac = [...perUrl, ...perAlias];
  if (perEnllac.length === 1) return { tipus: 'parella', sessio: perEnllac[0], motiu: perUrl.length ? 'urlProgramacio' : 'alias' };
  if (perEnllac.length > 1) return { tipus: 'dubtosa', candidats: perEnllac, motiu: 'diverses sessions amb aquesta URL' };

  const titols = titolsHugo(h);
  const titolIgual = (s) => titols.includes(normalitza(s.titol));
  const perData = sessions.filter((s) => s.data === h.data);
  if (perData.length > 1) return { tipus: 'dubtosa', candidats: perData, motiu: `${perData.length} sessions el mateix dia` };
  if (perData.length === 1) {
    return titolIgual(perData[0])
      ? { tipus: 'parella', sessio: perData[0], motiu: 'data i títol' }
      : { tipus: 'dubtosa', candidats: perData, motiu: 'mateix dia però títol diferent' };
  }
  const perTitol = sessions.filter(titolIgual);
  if (perTitol.length) return { tipus: 'dubtosa', candidats: perTitol, motiu: 'mateix títol però una altra data' };

  return { tipus: 'nova', motiu: 'cap sessió amb la mateixa URL, slug, data ni títol' };
}

function avisos(h, s) {
  const llista = [];
  if (s.data !== h.data) llista.push(`data diferent (Firestore ${s.data}, Hugo ${h.data})`);
  if (s.hora && s.hora !== h.hora) llista.push(`hora diferent (Firestore ${s.hora}, Hugo ${h.hora})`);
  if (!titolsHugo(h).includes(normalitza(s.titol))) llista.push(`títol diferent (Firestore «${s.titol}», Hugo «${h.titol}»)`);
  return llista;
}

export function emparellar(hugo, sessions, mapa = {}) {
  const resultats = hugo.map((h) => ({ hugo: h, ...classificar(h, sessions, mapa) }));

  // Una mateixa sessió de Firestore no pot rebre dues sessions de Hugo.
  const usos = {};
  for (const r of resultats) if (r.tipus === 'parella') usos[r.sessio.id] = (usos[r.sessio.id] ?? 0) + 1;
  for (const r of resultats) {
    if (r.tipus === 'parella' && usos[r.sessio.id] > 1) {
      Object.assign(r, { tipus: 'dubtosa', candidats: [r.sessio], motiu: 'la mateixa sessió s\'empareja amb més d\'una sessió de Hugo' });
    }
  }

  return {
    parelles: resultats.filter((r) => r.tipus === 'parella')
      .map(({ hugo: h, sessio, motiu }) => ({ hugo: h, sessio, motiu, avisos: avisos(h, sessio) })),
    noves: resultats.filter((r) => r.tipus === 'nova').map((r) => r.hugo),
    dubtoses: resultats.filter((r) => r.tipus === 'dubtosa')
      .map(({ hugo: h, candidats, motiu }) => ({ hugo: h, candidats, motiu })),
  };
}

// ---------------------------------------------------------------- Pla

// Camps que una sessió aparellada ha de tenir; només es retornen els que no hi són iguals.
// `publica` es compara i s'escriu camp a camp (`publica.<camp>`) per no esborrar-ne cap altre.
function canvisSessio(s, h) {
  const canvis = {};
  if (s.slug !== h.slug) canvis.slug = h.slug;
  if (s.publicada !== true) canvis.publicada = true;
  if (!s.urlProgramacio) canvis.urlProgramacio = urlProgramacio(h);
  for (const [camp, valor] of Object.entries(h.publica)) {
    if (!isDeepStrictEqual(s.publica?.[camp], valor)) canvis[`publica.${camp}`] = valor;
  }
  return canvis;
}

// `senseControl: true` marca una sessió especial sense control d'entrades ni comptabilitat (sense
// escaneig, tiquets, despeses ni repartiment de quotes). Només el reben les sessions NOVES de la secció
// «xarxa» i gratuïtes (`preu === 0`); a les sessions que ja existien no es toca.
const esSenseControl = (h) => h.publica.seccio === 'xarxa' && h.publica.preu === 0;

// `ometNoves`: les sessions noves surten al pla i a l'informe, però marcades `omesa` i `aplicar` no les crea.
export function pla({
  emparellament, pagines, paginesExistents = new Set(), fitxersExistents = new Set(), ometNoves = false,
}) {
  const { parelles, noves } = emparellament;
  const accions = [];

  const planejades = new Set();
  const pujar = (imatge) => {
    if (fitxersExistents.has(imatge.desti) || planejades.has(imatge.desti)) return;
    planejades.add(imatge.desti);
    accions.push({ tipus: 'pujar imatge', local: imatge.cami, desti: imatge.desti, contentType: tipusImatge(imatge.fitxer) });
  };
  for (const h of [...parelles.map((p) => p.hugo), ...noves]) h.fotos.forEach(pujar);
  for (const pagina of pagines) pagina.imatges.forEach(pujar);

  for (const pagina of pagines) {
    if (!paginesExistents.has(pagina.doc.slug)) accions.push({ tipus: 'crear pagina', slug: pagina.doc.slug, doc: pagina.doc });
  }

  for (const { hugo: h, sessio } of parelles) {
    const canvis = canvisSessio(sessio, h);
    if (Object.keys(canvis).length) accions.push({ tipus: 'actualitzar sessio', id: sessio.id, slug: h.slug, canvis });
  }

  for (const h of noves) {
    accions.push({
      tipus: 'crear sessio',
      slug: h.slug,
      ...(ometNoves && { omesa: true }),
      dades: {
        titol: h.titol,
        data: h.data,
        hora: h.hora,
        activa: false,
        creadaPerMigracio: true,
        slug: h.slug,
        publicada: true,
        urlProgramacio: urlProgramacio(h),
        publica: h.publica,
        ...(esSenseControl(h) && { senseControl: true }),
      },
    });
  }
  return accions;
}

// ---------------------------------------------------------------- Aplicar

export function comprovarCopia(dirBackups, avui) {
  const manifest = join(dirBackups, avui.toISOString().slice(0, 10), 'manifest.json');
  if (!existsSync(manifest)) {
    throw new Error(`No hi ha cap còpia de seguretat d'avui (${manifest}). Fes-la abans amb \`node scripts/backup-firestore.mjs\` i torna-ho a provar.`);
  }
}

// Mai `set`: les sessions aparellades reben `update` (camps concrets) i el que és nou es crea amb
// `create`, que falla si el document ja existeix. Les imatges no se sobreescriuen mai.
export async function aplicar(accions, { db, bucket, log = console.log }) {
  for (const accio of accions) {
    if (accio.omesa) { log(`  omesa: ${accio.tipus} ${accio.slug}`); continue; }
    if (accio.tipus === 'pujar imatge') {
      const fitxer = bucket.file(accio.desti);
      const [existeix] = await fitxer.exists();
      if (existeix) { log(`  ja existeix, no es toca: ${accio.desti}`); continue; }
      await fitxer.save(readFileSync(accio.local), {
        contentType: accio.contentType,
        metadata: { contentType: accio.contentType, cacheControl: 'public, max-age=31536000' },
        preconditionOpts: { ifGenerationMatch: 0 },
        resumable: false,
      });
    } else if (accio.tipus === 'crear pagina') {
      await db.collection('pagines').doc(accio.slug).create(accio.doc);
    } else if (accio.tipus === 'actualitzar sessio') {
      await db.collection('sessions').doc(accio.id).update(accio.canvis);
    } else if (accio.tipus === 'crear sessio') {
      await db.collection('sessions').doc().create(accio.dades);
    }
    log(`  fet: ${accio.tipus} ${accio.desti ?? accio.slug}`);
  }
}

// ---------------------------------------------------------------- Informe

const idCurt = (id) => `${id.slice(0, 6)}…`;
const descSessio = (s) => `${idCurt(s.id)} «${s.titol}» ${s.data ?? '?'} ${s.hora ?? ''}`.trim();
const descHugo = (h) => `${h.data} ${h.hora}  ${h.slug} «${h.titol}»`;

function descAccio(a) {
  if (a.tipus === 'pujar imatge') return `pujar imatge ${a.local} → ${a.desti}`;
  if (a.tipus === 'crear pagina') return `crear pagina pagines/${a.slug} (tipus ${a.doc.tipus}, ${Object.keys(a.doc.imatges).length} imatges)`;
  if (a.tipus === 'actualitzar sessio') {
    const claus = Object.keys(a.canvis);
    const publica = claus.filter((c) => c.startsWith('publica.')).map((c) => c.slice(8));
    const altres = claus.filter((c) => !c.startsWith('publica.')).map((c) => `${c}=${JSON.stringify(a.canvis[c])}`);
    return `actualitzar sessio ${idCurt(a.id)} (${a.slug}): ${[...altres, publica.length ? `publica: ${publica.length} camps (${publica.join(', ')})` : ''].filter(Boolean).join('; ')}`;
  }
  const d = a.dades;
  return `crear sessio ${a.slug}: titol «${d.titol}», data ${d.data} ${d.hora}, activa false, creadaPerMigracio, publicada, ${d.senseControl ? 'senseControl: true, ' : ''}urlProgramacio ${d.urlProgramacio}, publica: ${Object.keys(d.publica).length} camps${a.omesa ? ' (omesa)' : ''}`;
}

export function informe({ apply, hugo, sessions, emparellament, accions, paginesExistents, mapa }) {
  const { parelles, noves, dubtoses } = emparellament;
  const l = [];
  l.push(`=== Migració Hugo → Firestore (${apply ? 'MODE APPLY: s\'escriu a Firestore i Storage' : 'MODE INFORME: no s\'escriu res'}) ===`);
  l.push(`Sessions de Hugo: ${hugo.length} · Sessions a Firestore: ${sessions.length} · Pàgines ja existents: ${[...paginesExistents].join(', ') || 'cap'}`);
  l.push('', `Parelles (${parelles.length}):`);
  for (const p of parelles) {
    l.push(`  ${descHugo(p.hugo)}  →  ${descSessio(p.sessio)}  [per ${p.motiu}]`);
    for (const a of p.avisos) l.push(`      avís: ${a}`);
  }
  l.push('', `Noves (${noves.length}):`);
  for (const h of noves) l.push(`  ${descHugo(h)}  [${mapa[h.slug] === 'nova' ? 'mapa manual' : 'cap sessió amb la mateixa URL, slug, data ni títol'}]`);
  l.push('', `Dubtoses (${dubtoses.length}):`);
  for (const d of dubtoses) {
    l.push(`  ${descHugo(d.hugo)}  [${d.motiu}]`);
    for (const c of d.candidats) l.push(`      candidata: ${descSessio(c)}`);
  }
  const desconeguts = hugo.filter((h) => h.campsDesconeguts.length);
  l.push('', `Camps del front matter no reconeguts: ${desconeguts.length ? desconeguts.map((h) => `${h.slug} (${h.campsDesconeguts.join(', ')})`).join('; ') : 'cap'}`);
  l.push('', `Accions (${accions.length}):`);
  for (const a of accions) l.push(`  ${descAccio(a)}`);
  const compta = (t) => accions.filter((a) => a.tipus === t).length;
  const omeses = accions.filter((a) => a.omesa).length;
  l.push('', `Resum: ${compta('actualitzar sessio')} sessions a actualitzar, ${compta('crear sessio')} sessions a crear${omeses ? ` (${omeses} omeses per --omet-noves)` : ''}, ${compta('pujar imatge')} imatges a pujar, ${compta('crear pagina')} pàgines a crear.`);
  return l.join('\n');
}

// ---------------------------------------------------------------- Execució

export async function executar({
  apply = false, ometNoves = false, db, bucket, dirContingut, mapa = {}, dirBackups = join(ARREL, 'backups'), avui = new Date(), log = console.log,
}) {
  if (apply) comprovarCopia(dirBackups, avui);

  const hugo = llegirSessionsHugo(dirContingut, bucket.name);
  const pagines = llegirPaginesHugo(dirContingut, bucket.name);
  const [snapSessions, snapPagines, [fitxers]] = await Promise.all([
    db.collection('sessions').get(),
    db.collection('pagines').get(),
    bucket.getFiles({ prefix: 'web/' }),
  ]);
  const sessions = snapSessions.docs.map((d) => ({ id: d.id, ...d.data() }));
  const paginesExistents = new Set(snapPagines.docs.map((d) => d.id));
  const fitxersExistents = new Set(fitxers.map((f) => f.name));

  const emparellament = emparellar(hugo, sessions, mapa);
  const accions = pla({ emparellament, pagines, paginesExistents, fitxersExistents, ometNoves });
  log(informe({ apply, hugo, sessions, emparellament, accions, paginesExistents, mapa }));

  if (apply) {
    const { dubtoses } = emparellament;
    if (dubtoses.length) {
      throw new Error(`Hi ha ${dubtoses.length} sessions dubtoses sense resoldre (${dubtoses.map((d) => d.hugo.slug).join(', ')}). Resol-les a scripts/migracio-mapa.json amb l'id de la sessió o "nova".`);
    }
    await aplicar(accions, { db, bucket, log });
    const omeses = accions.filter((a) => a.omesa).length;
    log(ometNoves
      ? `Migració aplicada, SENSE crear ${omeses} sessions noves (--omet-noves). Torna a executar sense l'opció per crear-les.`
      : 'Migració aplicada.');
  }
  return { hugo, pagines, emparellament, accions };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { initializeApp, cert, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const { getStorage } = await import('firebase-admin/storage');

  let opcions;
  try {
    opcions = llegirOpcions(process.argv.slice(2));
  } catch (err) {
    console.error(`${err.message}\n${US}`);
    process.exit(2);
  }
  const { apply, ometNoves, dirContingut } = opcions;
  const mapa = JSON.parse(readFileSync(new URL('./migracio-mapa.json', import.meta.url), 'utf8'));

  let credential = applicationDefault();
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const key = readdirSync(ARREL).find((f) => /^cineclub-socis-firebase-adminsdk-.*\.json$/.test(f));
    if (key) credential = cert(JSON.parse(readFileSync(join(ARREL, key), 'utf8')));
  }
  const app = initializeApp({ credential, storageBucket: BUCKET });

  try {
    await executar({ apply, ometNoves, db: getFirestore(app), bucket: getStorage(app).bucket(), dirContingut, mapa });
  } catch (err) {
    console.error(`\nERROR: ${err.message}`);
    process.exitCode = 1;
  }
}
