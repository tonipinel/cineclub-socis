// exceljs retorna objectes `{ text, hyperlink }` per a cel·les amb hipervincle
// auto-detectat (p. ex. adreces de correu, que l'Excel enllaça automàticament)
// i `{ formula, result }` per a cel·les amb fórmula. Cal desempaquetar-los abans
// de desar el valor a Firestore.
function valorPla(valor) {
  if (valor && typeof valor === 'object') {
    if ('text' in valor) return valor.text;
    if ('result' in valor) return valor.result;
  }
  return valor;
}

function text(valor) {
  const pla = valorPla(valor);
  if (pla === undefined || pla === null) return pla;
  return String(pla).trim();
}

export function mapExcelRowToSoci(row, dataImportacio) {
  return {
    numeroSoci: valorPla(row.numeroSoci),
    nom: text(row.nom),
    cognoms: text(row.cognoms),
    poblacio: text(row.poblacio),
    codiPostal: text(row.codiPostal),
    telefon: text(row.telefon),
    correuElectronic: text(row.correuElectronic) ?? '',
    dni: text(row.dni) ?? '',
    grupWhatsapp: text(row.grupWhatsapp) ?? '',
    dataAlta: dataImportacio,
    ultimPagament: dataImportacio,
    notaImportacio: `Estat pagament original: ${text(row.estatPagament) ?? '—'}. Correu pagament original: ${text(row.correuPagament) ?? '—'}.`,
    actiu: true,
  };
}
