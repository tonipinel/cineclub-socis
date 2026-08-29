export function mapExcelRowToSoci(row, dataImportacio) {
  return {
    numeroSoci: row.numeroSoci,
    nom: row.nom,
    cognoms: row.cognoms,
    poblacio: row.poblacio,
    codiPostal: row.codiPostal,
    telefon: row.telefon,
    correuElectronic: row.correuElectronic ?? '',
    dni: row.dni ?? '',
    grupWhatsapp: row.grupWhatsapp ?? '',
    dataAlta: dataImportacio,
    ultimPagament: dataImportacio,
    notaImportacio: `Estat pagament original: ${row.estatPagament ?? '—'}. Correu pagament original: ${row.correuPagament ?? '—'}.`,
    actiu: true,
  };
}
