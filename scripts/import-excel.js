// Ús: node scripts/import-excel.js /ruta/al/fitxer.xlsx /ruta/a/serviceAccountKey.json
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { mapExcelRowToSoci, mapExcelRowToSolicitud } from './importMapping.js';

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

let socisImportats = 0;
let solicitudsImportades = 0;
for (let numFila = 2; numFila <= sheet.rowCount; numFila += 1) {
  const valors = sheet.getRow(numFila).values.slice(1);
  if (valors.every((v) => v === undefined || v === null)) continue;
  const row = {};
  capcaleres.forEach((camp, i) => {
    if (camp) row[camp] = valors[i];
  });

  if (row.numeroSoci) {
    const soci = mapExcelRowToSoci(row, dataImportacio);
    // Idempotent: l'ID del document és el número de soci/a, no un ID autogenerat,
    // perquè tornar a executar l'script (p. ex. per corregir dades) actualitzi
    // el mateix soci en lloc de duplicar-lo.
    await db.collection('socis').doc(String(soci.numeroSoci)).set(soci, { merge: true });
    socisImportats += 1;
  } else {
    // Una fila sense número de soci/a encara no ha pagat la quota — es tracta
    // igual que una sol·licitud pendent de revisió, no com un soci confirmat.
    await db.collection('solicituds').add({
      ...mapExcelRowToSolicitud(row),
      timestamp: Timestamp.now(),
    });
    solicitudsImportades += 1;
  }
}

console.log(`Importats ${socisImportats} socis i ${solicitudsImportades} sol·licituds pendents.`);
