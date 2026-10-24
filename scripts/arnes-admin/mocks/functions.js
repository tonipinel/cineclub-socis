// firebase/functions simulat: cap crida surt del navegador.
export const getFunctions = () => ({});

// Informe d'exemple de `sincronitzarCalendariTot` (només per veure el panell a l'arnès).
const INFORME = {
  aplicat: false,
  crear: ['Amélie amb un títol prou llarg per provar el desbordament (dj. 5 nov. 2026, 20:30)'],
  actualitzar: ['The Artist (dj. 12 nov. 2026, 20:30)', 'Delicatessen (dj. 19 nov. 2026, 20:30)'],
  esborrar: ['Esdeveniment duplicat de Hugo (dj. 26 nov. 2026, 20:30)'],
  placeholdersConservats: ['Per decidir (dj. 3 des. 2026, 20:30)'],
  noGestionats: 4,
  sessionsOmeses: ['ses9'],
  totals: { crear: 1, actualitzar: 2, esborrar: 1, iguals: 0, placeholdersConservats: 1 },
};

// Pel·lícules de TMDB d'exemple per al cercador de la fitxa de proposta.
const PELLICULES = [
  { tmdbId: 2001, titol: 'Les parapluies de Cherbourg', any: '1964', titolLocal: 'Los paraguas de Cherburgo', posterUrl: null },
  { tmdbId: 2002, titol: 'Les demoiselles de Rochefort', any: '1967', titolLocal: '', posterUrl: null },
];

// `assignarPellicula` simulat: no escriu res. Torna valors «nous» de TMDB; sense `sobreescriure` no toca la direcció
// ni la sinopsi (les dades editades a mà de p23), i amb `sobreescriure` o una pel·lícula nova les restableix i buida
// `campsEditats`.
function fitxaTmdb({ tmdbId, sobreescriure }) {
  const pellicula = PELLICULES.find((p) => p.tmdbId === tmdbId);
  const fitxa = {
    tmdbId,
    tmdbUrl: `https://www.themoviedb.org/movie/${tmdbId}`,
    lema: 'Lema actualitzat des de TMDB',
    valoracio: 8.1,
    ...(pellicula ? { titol: pellicula.titol, any: Number(pellicula.any), titolLocal: pellicula.titolLocal } : {}),
  };
  if (!sobreescriure && !pellicula) return fitxa;
  return {
    ...fitxa, directors: ['Jacques Demy'], sinopsi: 'Sinopsis actualizada desde TMDB.', sinopsiIdioma: 'es', campsEditats: [],
  };
}

export const httpsCallable = (_functions, nom) => async (dades = {}) => {
  if (nom === 'sincronitzarCalendariTot') return { data: INFORME };
  if (nom === 'cercarPellicules') return { data: PELLICULES };
  // Amb retard, com la crida real, perquè es vegi la fitxa bloquejada mentre es carrega.
  if (nom === 'assignarPellicula') {
    await new Promise((resol) => { setTimeout(resol, 1200); });
    return { data: fitxaTmdb(dades) };
  }
  return { data: { resultats: [] } };
};
