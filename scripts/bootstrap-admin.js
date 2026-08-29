// Ús: node scripts/bootstrap-admin.js <email> /ruta/a/serviceAccountKey.json
import { readFileSync } from 'node:fs';
import admin from 'firebase-admin';
import { buildStaffClaims } from './adminClaims.js';

const [, , email, serviceAccountPath] = process.argv;

if (!email || !serviceAccountPath) {
  console.error('Ús: node scripts/bootstrap-admin.js <email> /ruta/a/serviceAccountKey.json');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const user = await admin.auth().getUserByEmail(email);
await admin.auth().setCustomUserClaims(user.uid, buildStaffClaims('admin'));

console.log(`${email} ara té el rol 'admin'.`);
