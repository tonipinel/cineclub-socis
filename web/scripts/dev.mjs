// Arrenca `astro dev` amb les credencials d'administrador de Firebase, que la web necessita per
// llegir Firestore en local. Cerca la clau del compte de servei a l'arrel del repositori
// (`cineclub-socis-firebase-adminsdk-*.json`, ignorada per git): no es copia ni es mostra enlloc.
import { spawn } from 'node:child_process';
import { globSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const arrel = fileURLToPath(new URL('..', import.meta.url));
const [clau] = globSync('../cineclub-socis-firebase-adminsdk-*.json', { cwd: arrel });

if (!clau) {
  console.error('No s\'ha trobat la clau d\'administrador (cineclub-socis-firebase-adminsdk-*.json) a l\'arrel del repositori.');
  process.exit(1);
}

const fill = spawn('npx', ['astro', 'dev', ...process.argv.slice(2)], {
  cwd: arrel,
  stdio: 'inherit',
  env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: resolve(arrel, clau) },
});
fill.on('exit', (codi) => process.exit(codi ?? 0));
