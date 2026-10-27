const URL_API = 'https://api.themoviedb.org/3';
const URL_IMATGES = 'https://image.tmdb.org/t/p';
const IDIOMA = 'es-ES';
const MAXIM_RESULTATS = 8;

// TMDB dona dues credencials: un "API Read Access Token" (JWT, comença per
// "eyJ") que va a la capçalera Authorization, i una "API Key" curta que va
// com a paràmetre de la consulta. Acceptem qualsevol de les dues.
function peticio(clau, ruta, parametres) {
  const url = new URL(`${URL_API}${ruta}`);
  for (const [nom, valor] of Object.entries({ language: IDIOMA, ...parametres })) {
    url.searchParams.set(nom, valor);
  }
  const headers = { accept: 'application/json' };
  if (clau.startsWith('eyJ')) headers.authorization = `Bearer ${clau}`;
  else url.searchParams.set('api_key', clau);
  return { url: url.toString(), headers };
}

async function obtenirJson(clau, ruta, parametres, fetchFn) {
  const { url, headers } = peticio(clau, ruta, parametres);
  const resposta = await fetchFn(url, { headers });
  if (!resposta.ok) throw new Error(`TMDB ha respost ${resposta.status}`);
  return resposta.json();
}

// Idiomes en què deixem el títol i el cartell originals. Per a qualsevol
// altre idioma fem servir el títol i el cartell en anglès.
const IDIOMES_PROPIS = new Set(['en', 'es', 'ca', 'gl', 'eu', 'fr']);

function idiomaDeVisualitzacio(idiomaOriginal) {
  return IDIOMES_PROPIS.has(idiomaOriginal) ? idiomaOriginal : 'en';
}

function titolSegonsIdioma(pellicula, titolAnglès) {
  return IDIOMES_PROPIS.has(pellicula.original_language)
    ? pellicula.original_title || pellicula.title
    : titolAnglès || pellicula.title;
}

// El títol a Espanya només es guarda quan el títol que mostrem no és ja en
// castellà ni en català (en aquests casos seria redundant).
const IDIOMES_SENSE_TITOL_LOCAL = new Set(['es', 'ca']);

function normalitzar(pellicula, titolAnglès, titolLocal) {
  const titol = titolSegonsIdioma(pellicula, titolAnglès);
  const calTitolLocal = titolLocal && titolLocal !== titol && !IDIOMES_SENSE_TITOL_LOCAL.has(pellicula.original_language);
  return {
    tmdbId: pellicula.id,
    titol,
    titolLocal: calTitolLocal ? titolLocal : null,
    any: pellicula.release_date ? pellicula.release_date.slice(0, 4) : '',
    posterUrl: pellicula.poster_path ? `${URL_IMATGES}/w154${pellicula.poster_path}` : null,
  };
}

// Es cerca en castellà (per les ressenyes i el títol local) i en anglès (pel
// títol internacional que fem servir quan l'original no és d'un idioma propi).
async function cercarPellicules(consulta, clau, fetchFn = fetch) {
  const parametres = { query: consulta, include_adult: 'false' };
  const [es, en] = await Promise.all([
    obtenirJson(clau, '/search/movie', { ...parametres, language: 'es-ES' }, fetchFn),
    obtenirJson(clau, '/search/movie', { ...parametres, language: 'en-US' }, fetchFn),
  ]);
  const titolsAnglès = new Map(en.results.map((p) => [p.id, p.title]));
  return es.results
    .slice(0, MAXIM_RESULTATS)
    .map((p) => normalitzar(p, titolsAnglès.get(p.id), p.title));
}

const MAXIM_REPARTIMENT = 10;

function urlTrailer(videos) {
  const trailers = (videos ?? []).filter((v) => v.site === 'YouTube' && v.type === 'Trailer');
  const triat = trailers.find((v) => v.official) ?? trailers[0];
  return triat ? `https://www.youtube.com/watch?v=${triat.key}` : null;
}

const MAXIM_IMATGES = 4;

// TMDB no té els gèneres en català (torna els noms en anglès), però el
// conjunt d'identificadors és tancat i estable: els traduïm nosaltres.
const GENERES_CATALA = {
  28: 'Acció',
  12: 'Aventura',
  16: 'Animació',
  35: 'Comèdia',
  80: 'Crim',
  99: 'Documental',
  18: 'Drama',
  10751: 'Família',
  14: 'Fantasia',
  36: 'Història',
  27: 'Terror',
  10402: 'Música',
  9648: 'Misteri',
  10749: 'Romanç',
  878: 'Ciència-ficció',
  10770: 'Pel·lícula per a la TV',
  53: 'Suspens',
  10752: 'Bèl·lica',
  37: 'Western',
};

const NOMS_PAISOS = new Intl.DisplayNames(['ca'], { type: 'region' });
const NOMS_IDIOMES = new Intl.DisplayNames(['ca'], { type: 'language' });

const iniciaAmbMajuscula = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// Els països i els idiomes es tradueixen pel seu codi; si el codi no es
// reconeix, es deixa el nom que dona TMDB.
function nomPais(pais) {
  try {
    return NOMS_PAISOS.of(pais.iso_3166_1) ?? pais.name;
  } catch {
    return pais.name;
  }
}

function nomIdioma(idioma) {
  try {
    const nom = NOMS_IDIOMES.of(idioma.iso_639_1);
    return nom && nom !== idioma.iso_639_1 ? iniciaAmbMajuscula(nom) : idioma.name || idioma.english_name;
  } catch {
    return idioma.name || idioma.english_name;
  }
}

const millorsPrimer = (imatges) => [...imatges].sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0));

// El cartell és el més ben valorat de l'idioma de visualització (l'original
// o l'anglès) i, si no n'hi ha cap, el per defecte de TMDB. A més, les
// escenes de la pel·lícula més ben valorades, només les que no porten text.
async function imatgesPellicula(tmdbId, idioma, cartellPerDefecte, clau, fetchFn) {
  const imatges = await obtenirJson(
    clau,
    `/movie/${tmdbId}/images`,
    { language: idioma, include_image_language: `${idioma},null` },
    fetchFn
  );
  const cartell = millorsPrimer((imatges.posters ?? []).filter((p) => p.iso_639_1 === idioma))[0];
  const escenes = millorsPrimer((imatges.backdrops ?? []).filter((b) => b.iso_639_1 == null));
  return {
    posterPath: cartell ? cartell.file_path : cartellPerDefecte,
    escenes: escenes.slice(0, MAXIM_IMATGES).map((b) => b.file_path),
  };
}

// La sinopsi es demana en català i, si TMDB no la té, en castellà i després
// en anglès. `sinopsiIdioma` diu quina ha sortit, perquè qui crida pugui
// traduir-la si no és el català.
function triarSinopsi(ca, es, en) {
  if (ca.overview) return { sinopsi: ca.overview, idioma: 'ca' };
  if (es.overview) return { sinopsi: es.overview, idioma: 'es' };
  if (en?.overview) return { sinopsi: en.overview, idioma: 'en' };
  return { sinopsi: '', idioma: 'ca' };
}

// L'identificador va dins la ruta de l'API: només s'accepta un enter positiu (cap `../`, `?` ni decimals).
const MAXIM_TMDB_ID = 99_999_999;
const esTmdbIdValid = (valor) => Number.isSafeInteger(valor) && valor > 0 && valor <= MAXIM_TMDB_ID;

const MAXIM_PER_CARREC = 3;
const MAXIM_PRODUCTORES = 4;

// Noms únics i no buits, en l'ordre de TMDB.
const unics = (noms, maxim) => [...new Set(noms.map((n) => (typeof n === 'string' ? n.trim() : '')).filter(Boolean))]
  .slice(0, maxim);

const ambFeina = (equip, feina) => unics(equip.filter((c) => c.job === feina).map((c) => c.name), MAXIM_PER_CARREC);

// Fotografia, muntatge, música i producció d'una resposta de detall de TMDB amb `credits`.
function creditsTecnics(detall) {
  const equip = detall.credits?.crew ?? [];
  const compositors = ambFeina(equip, 'Original Music Composer');
  return {
    fotografia: ambFeina(equip, 'Director of Photography'),
    muntatge: ambFeina(equip, 'Editor'),
    musica: compositors.length ? compositors : ambFeina(equip, 'Music'),
    produccio: unics((detall.production_companies ?? []).map((p) => p.name), MAXIM_PRODUCTORES),
  };
}

// Només els crèdits tècnics, amb una sola consulta (per a l'script que omple les propostes antigues).
async function creditsPellicula(tmdbId, clau, fetchFn = fetch) {
  if (!esTmdbIdValid(tmdbId)) throw new Error('Identificador de TMDB no vàlid.');
  return creditsTecnics(await obtenirJson(clau, `/movie/${tmdbId}`, { append_to_response: 'credits' }, fetchFn));
}

async function detallPellicula(tmdbId, clau, fetchFn = fetch) {
  if (!esTmdbIdValid(tmdbId)) throw new Error('Identificador de TMDB no vàlid.');
  const [ca, es] = await Promise.all([
    obtenirJson(
      clau,
      `/movie/${tmdbId}`,
      { language: 'ca-ES', append_to_response: 'credits,videos', include_video_language: 'es,ca,en,null' },
      fetchFn
    ),
    obtenirJson(clau, `/movie/${tmdbId}`, { language: 'es-ES' }, fetchFn),
  ]);
  const idiomaVisualitzacio = idiomaDeVisualitzacio(ca.original_language);
  const necessitaAnglès = idiomaVisualitzacio === 'en' && ca.original_language !== 'en';
  const necessitaSinopsiAnglesa = !ca.overview && !es.overview;
  const en = necessitaAnglès || necessitaSinopsiAnglesa
    ? await obtenirJson(clau, `/movie/${tmdbId}`, { language: 'en-US' }, fetchFn)
    : null;
  const { sinopsi, idioma } = triarSinopsi(ca, es, en);
  const { posterPath, escenes } = ca.original_language
    ? await imatgesPellicula(tmdbId, idiomaVisualitzacio, ca.poster_path ?? null, clau, fetchFn)
    : { posterPath: ca.poster_path ?? null, escenes: [] };
  const equip = ca.credits?.crew ?? [];
  return {
    ...normalitzar(ca, en?.title, es.title),
    sinopsi,
    sinopsiIdioma: idioma,
    posterPath,
    escenes,
    durada: ca.runtime || null,
    generes: (ca.genres ?? []).map((g) => GENERES_CATALA[g.id] ?? g.name),
    directors: equip.filter((c) => c.job === 'Director').map((c) => c.name),
    guionistes: [...new Set(equip.filter((c) => ['Screenplay', 'Writer'].includes(c.job)).map((c) => c.name))],
    ...creditsTecnics(ca),
    repartiment: (ca.credits?.cast ?? []).slice(0, MAXIM_REPARTIMENT).map((a) => ({ nom: a.name, personatge: a.character || '' })),
    lema: ca.tagline || null,
    paisos: (ca.production_countries ?? []).map(nomPais),
    idiomes: (ca.spoken_languages ?? []).map(nomIdioma).filter(Boolean),
    valoracio: ca.vote_count ? Math.round(ca.vote_average * 10) / 10 : null,
    trailerUrl: urlTrailer(ca.videos?.results),
    tmdbUrl: `https://www.themoviedb.org/movie/${ca.id}`,
  };
}

async function descarregarCartell(posterPath, fetchFn = fetch) {
  const resposta = await fetchFn(`${URL_IMATGES}/w500${posterPath}`);
  if (!resposta.ok) throw new Error(`No s'ha pogut descarregar el cartell (${resposta.status})`);
  return {
    contingut: Buffer.from(await resposta.arrayBuffer()),
    contentType: resposta.headers.get('content-type') ?? 'image/jpeg',
  };
}

module.exports = { cercarPellicules, detallPellicula, creditsPellicula, descarregarCartell, esTmdbIdValid };
