export function solicitudASoci(solicitud, data) {
  return {
    nom: solicitud.nom,
    cognoms: solicitud.cognoms,
    poblacio: solicitud.poblacio,
    codiPostal: solicitud.codiPostal,
    telefon: solicitud.telefon,
    correuElectronic: solicitud.correuElectronic ?? '',
    dni: '',
    grupWhatsapp: '',
    dataAlta: data,
    ultimPagament: data,
    actiu: true,
  };
}
