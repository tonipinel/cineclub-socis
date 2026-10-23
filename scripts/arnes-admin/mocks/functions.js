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

export const httpsCallable = (_functions, nom) => async () => (
  nom === 'sincronitzarCalendariTot' ? { data: INFORME } : { data: { resultats: [] } }
);
