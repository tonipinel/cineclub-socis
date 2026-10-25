// exceljs retorna objectes `{ text, hyperlink }` per a cel·les amb hipervincle
// auto-detectat (p. ex. adreces de correu, que l'Excel enllaça automàticament)
// i `{ formula, result }` per a cel·les amb fórmula. Cal desempaquetar-los abans
// de desar el valor a Firestore.
// El text enriquit (cel·les amb formats barrejats) arriba com `{ richText: [{ text }, ...] }`, i el text
// d'un hipervincle també pot ser text enriquit.
function valorPla(valor) {
  if (valor && typeof valor === 'object') {
    if (Array.isArray(valor.richText)) return valor.richText.map((tros) => tros?.text ?? '').join('');
    if ('text' in valor) return valorPla(valor.text);
    if ('result' in valor) return valorPla(valor.result);
  }
  return valor;
}

function text(valor) {
  const pla = valorPla(valor);
  if (pla === undefined || pla === null) return pla;
  return String(pla).trim();
}

// Només per a socis NOUS: `import-excel.js` mai escriu aquest objecte sobre un soci existent.
export function mapExcelRowToSoci(row, dataImportacio) {
  return {
    numeroSoci: valorPla(row.numeroSoci) ?? '',
    nom: text(row.nom) ?? '',
    cognoms: text(row.cognoms) ?? '',
    poblacio: text(row.poblacio) ?? '',
    codiPostal: text(row.codiPostal) ?? '',
    telefon: text(row.telefon) ?? '',
    correuElectronic: text(row.correuElectronic) ?? '',
    dni: text(row.dni) ?? '',
    grupWhatsapp: text(row.grupWhatsapp) ?? '',
    dataAlta: dataImportacio,
    ultimPagament: dataImportacio,
    notaImportacio: `Estat pagament original: ${text(row.estatPagament) ?? '—'}. Correu pagament original: ${text(row.correuPagament) ?? '—'}.`,
    actiu: true,
  };
}

// Una fila de l'Excel sense número de soci/a encara no es considera un soci
// confirmat (no ha pagat la quota) — es tracta igual que una sol·licitud
// arribada pel formulari públic, pendent de revisió i aprovació manual.
export function mapExcelRowToSolicitud(row) {
  return {
    nom: text(row.nom) ?? '',
    cognoms: text(row.cognoms) ?? '',
    poblacio: text(row.poblacio) ?? '',
    codiPostal: text(row.codiPostal) ?? '',
    telefon: text(row.telefon) ?? '',
    correuElectronic: text(row.correuElectronic) ?? '',
    comentaris: '',
    acceptaPrivacitat: true,
    acceptaDadesPersonals: true,
    estat: 'pendent',
  };
}
