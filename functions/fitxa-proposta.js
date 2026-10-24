// Camps de la pel·lícula que l'admin pot editar a mà a la fitxa de la proposta.
// Els que té a `campsEditats` no es tornen a agafar de TMDB.
const CAMPS_EDITABLES = ['titol', 'titolLocal', 'any', 'durada', 'directors', 'guionistes', 'paisos', 'idiomes',
  'generes', 'repartiment', 'lema', 'sinopsi', 'trailerUrl', 'imatgeUrl'];

// Cal buidar `campsEditats` si l'admin demana sobreescriure-ho tot o tria una pel·lícula diferent.
function buidarEditats(actual, tmdbIdNou, { sobreescriure = false } = {}) {
  return sobreescriure || (actual.tmdbId != null && actual.tmdbId !== tmdbIdNou);
}

function campsProtegits(actual, tmdbIdNou, { sobreescriure = false } = {}) {
  if (buidarEditats(actual, tmdbIdNou, { sobreescriure })) return new Set();
  const editats = Array.isArray(actual.campsEditats) ? actual.campsEditats : [];
  const protegits = new Set(editats.filter((camp) => CAMPS_EDITABLES.includes(camp)));
  // Compatibilitat: una sinopsi ja traduïda al català compta com a editada.
  if (actual.sinopsiIdioma === 'ca' && actual.sinopsi) protegits.add('sinopsi');
  return protegits;
}

function filtrarCanvis(canvis, protegits) {
  const resultat = { ...canvis };
  for (const camp of protegits) delete resultat[camp];
  if (protegits.has('sinopsi')) delete resultat.sinopsiIdioma;
  if (protegits.has('imatgeUrl')) delete resultat.cartellPath;
  return resultat;
}

// Tota la fitxa de la proposta surt de TMDB, excepte els camps que l'admin ha editat a mà. El cartell es
// descarrega i es desa a Storage perquè no depenguem de cap web externa que ens pugui bloquejar la imatge.
async function desarFitxaAmbDependencies(deps, propostaId, tmdbId, { sobreescriure = false } = {}) {
  const { db, bucket, detallPellicula, descarregarCartell, FieldValue, ara } = deps;
  const referencia = db.doc(`propostes/${propostaId}`);
  // Es comprova abans de consultar TMDB i de desar cap cartell a Storage.
  const instantania = await referencia.get();
  if (!instantania.exists) throw Object.assign(new Error('La proposta no existeix.'), { codi: 'not-found' });
  const actual = instantania.data();
  const pellicula = await detallPellicula(tmdbId);
  const opcions = { sobreescriure };
  const protegits = campsProtegits(actual, pellicula.tmdbId, opcions);
  const canvisTmdb = {
    tmdbId: pellicula.tmdbId,
    titol: pellicula.titol,
    titolLocal: pellicula.titolLocal,
    any: pellicula.any,
    sinopsi: pellicula.sinopsi,
    sinopsiIdioma: pellicula.sinopsiIdioma,
    durada: pellicula.durada,
    directors: pellicula.directors,
    generes: pellicula.generes,
    imatges: pellicula.escenes,
    guionistes: pellicula.guionistes,
    repartiment: pellicula.repartiment,
    lema: pellicula.lema,
    paisos: pellicula.paisos,
    idiomes: pellicula.idiomes,
    valoracio: pellicula.valoracio,
    tmdbUrl: pellicula.tmdbUrl,
  };
  if (pellicula.trailerUrl) canvisTmdb.trailerUrl = pellicula.trailerUrl;
  // Si l'admin ha posat el cartell a mà no en descarreguem ni en desem cap de nou.
  if (pellicula.posterPath && !protegits.has('imatgeUrl')) {
    const { contingut, contentType } = await descarregarCartell(pellicula.posterPath);
    // Ruta nova a cada actualització: el cartell es serveix amb una caché d'un
    // any, així que reutilitzar la ruta faria veure el cartell antic.
    const ruta = `carteils/${propostaId}-${ara()}.jpg`;
    await bucket.file(ruta).save(contingut, { contentType, metadata: { cacheControl: 'public, max-age=31536000' } });
    canvisTmdb.cartellPath = ruta;
    canvisTmdb.imatgeUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(ruta)}?alt=media`;
  }
  const canvis = filtrarCanvis(canvisTmdb, protegits);
  const buidar = buidarEditats(actual, pellicula.tmdbId, opcions);
  const escriptura = buidar ? { ...canvis, campsEditats: FieldValue.delete() } : canvis;
  await referencia.update(escriptura);
  if (canvis.cartellPath) {
    // El cartell anterior ja no es fa servir (inclòs el de la ruta antiga, sense marca de temps).
    const anteriors = [actual.cartellPath, `carteils/${propostaId}.jpg`].filter((ruta) => ruta && ruta !== canvis.cartellPath);
    await Promise.all(anteriors.map((ruta) => bucket.file(ruta).delete({ ignoreNotFound: true }).catch(() => {})));
  }
  const conservats = Object.fromEntries([...protegits].filter((camp) => camp in actual).map((camp) => [camp, actual[camp]]));
  return {
    ...canvis,
    ...conservats,
    sinopsi: canvis.sinopsi ?? actual.sinopsi,
    sinopsiIdioma: canvis.sinopsiIdioma ?? actual.sinopsiIdioma,
    // El client ha de saber que la llista s'ha buidat; si no, la tornaria a escriure en desar.
    ...(buidar ? { campsEditats: [] } : {}),
  };
}

module.exports = { CAMPS_EDITABLES, campsProtegits, filtrarCanvis, buidarEditats, desarFitxaAmbDependencies };
