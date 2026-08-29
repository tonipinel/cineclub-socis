// Ús: node scripts/bootstrap-admin.js <email> /ruta/a/serviceAccountKey.json
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { buildStaffClaims } from './adminClaims.js';

const [, , email, serviceAccountPath] = process.argv;

if (!email || !serviceAccountPath) {
  console.error('Ús: node scripts/bootstrap-admin.js <email> /ruta/a/serviceAccountKey.json');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
const app = initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth(app);

const user = await auth.getUserByEmail(email);
await auth.setCustomUserClaims(user.uid, buildStaffClaims('admin'));

console.log(`${email} ara té el rol 'admin'.`);
