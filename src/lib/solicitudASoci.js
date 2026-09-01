function dataISO(timestamp, fallback) {
  const data = timestamp?.toDate?.();
  if (!data) return fallback;
  const any = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${any}-${mes}-${dia}`;
}

export function solicitudASoci(solicitud, dataPagament, numeroSoci) {
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
    dataAlta: dataISO(solicitud.timestamp, dataPagament),
    ultimPagament: dataPagament,
    actiu: true,
  };
}
