// El web es desa tal com l'escriu l'admin; per fer-ne un enllaç li afegim
// el protocol si no el porta.
export function urlWeb(web) {
  return /^https?:\/\//i.test(web) ? web : `https://${web}`;
}
