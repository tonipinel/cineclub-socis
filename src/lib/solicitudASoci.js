export function solicitudASoci(solicitud, data, numeroSoci) {
  return {
    numeroSoci,
    nom: solicitud.nom,
    cognoms: solicitud.cognoms,
    poblacio: solicitud.poblacio,
    codiPostal: solicitud.codiPostal,
    telefon: solicitud.telefon,
    correuElectronic: solicitud.correuElectronic ?? '',
    comentaris: solicitud.comentaris ?? '',
    dni: '',
    grupWhatsapp: '',
    dataAlta: data,
    ultimPagament: data,
    actiu: true,
  };
}
