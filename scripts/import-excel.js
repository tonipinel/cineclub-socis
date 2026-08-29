// Ús: node scripts/import-excel.js /ruta/al/fitxer.xlsx /ruta/a/serviceAccountKey.json
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import admin from 'firebase-admin';
import { mapExcelRowToSoci } from './importMapping.js';

const [, , excelPath, serviceAccountPath] = process.argv;

if (!excelPath || !serviceAccountPath) {
  console.error('Ús: node scripts/import-excel.js /ruta/al/fitxer.xlsx /ruta/a/serviceAccountKey.json');
  process.exit(1);
}

const CAPCALERES = {
  'Número de soci/a': 'numeroSoci',
  'Nom': 'nom',
  'Cognoms': 'cognoms',
  'Població': 'poblacio',
  'Codi postal': 'codiPostal',
  'Telèfon': 'telefon',
  'Correu electrònic': 'correuElectronic',
  'Estat pagament': 'estatPagament',
  'Correu pagament': 'correuPagament',
  'DNI': 'dni',
  'Grup whatsapp': 'grupWhatsapp',
};

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(excelPath);
const sheet = workbook.worksheets[0];

const capcaleres = sheet.getRow(1).values.slice(1).map((v) => CAPCALERES[v] ?? null);
const dataImportacio = new Date().toISOString().slice(0, 10);

let importats = 0;
for (let numFila = 2; numFila <= sheet.rowCount; numFila += 1) {
  const valors = sheet.getRow(numFila).values.slice(1);
  if (valors.every((v) => v === undefined || v === null)) continue;
  const row = {};
  capcaleres.forEach((camp, i) => {
    if (camp) row[camp] = valors[i];
  });
  const soci = mapExcelRowToSoci(row, dataImportacio);
  await db.collection('socis').add(soci);
  importats += 1;
}

console.log(`Importats ${importats} socis.`);
