// Ús: node scripts/import-excel.js /ruta/al/fitxer.xlsx /ruta/a/serviceAccountKey.json
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
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
const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

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
  // Idempotent quan hi ha número de soci/a: l'ID del document és aquest número,
  // no un ID autogenerat, perquè tornar a executar l'script (p. ex. per corregir
  // dades) actualitzi el mateix soci en lloc de duplicar-lo. Alguns socis reals
  // encara no tenen número assignat — per aquests es crea un ID autogenerat
  // (no idempotent per a ells fins que se'ls assigni un número des de l'app).
  const ref = soci.numeroSoci
    ? db.collection('socis').doc(String(soci.numeroSoci))
    : db.collection('socis').doc();
  await ref.set(soci, { merge: true });
  importats += 1;
}

console.log(`Importats ${importats} socis.`);
