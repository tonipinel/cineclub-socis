// Estat visual de la barra de desar. Prioritat: desant > error > pendent > desat > net.
export function estatBarra({ desant, error, hiHaCanvis, desatRecent }) {
  if (desant) return 'desant';
  if (error) return 'error';
  if (hiHaCanvis) return 'pendent';
  if (desatRecent) return 'desat';
  return 'net';
}

// Ids únics de pestanya amb canvis; un camp desconegut compta com a 'dades'.
export function pestanyesAmbCanvis(canvisDades, canvisPublica, pestanyaDelCamp) {
  const ids = [...canvisDades, ...canvisPublica].map((camp) => pestanyaDelCamp[camp] || 'dades');
  return [...new Set(ids)];
}
