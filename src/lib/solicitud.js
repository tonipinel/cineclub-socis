export function validarSolicitud(dades) {
  const errors = {};
  if (!dades.nom?.trim()) errors.nom = 'El nom és obligatori.';
  if (!dades.cognoms?.trim()) errors.cognoms = 'Els cognoms són obligatoris.';
  if (!dades.poblacio?.trim()) errors.poblacio = 'La població és obligatòria.';
  if (!dades.codiPostal?.trim()) errors.codiPostal = 'El codi postal és obligatori.';
  if (!dades.telefon?.trim()) errors.telefon = 'El telèfon és obligatori.';
  if (!dades.acceptaPrivacitat) errors.acceptaPrivacitat = 'Cal acceptar la política de privacitat.';
  if (!dades.acceptaDadesPersonals) errors.acceptaDadesPersonals = 'Cal autoritzar el tractament de dades.';
  return errors;
}
