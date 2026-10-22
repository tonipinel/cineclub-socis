// Arnès de l'administració: serveix l'app real (index.html + src/) amb Firebase simulat
// (`./mocks/*`) i les dades adverses de `./dades.js`. Sempre hi ha una administradora
// identificada; afegeix `?anonim` a la URL per veure-la sense sessió.
//
//   npx vite --config scripts/arnes-admin/vite.config.mjs          (http://localhost:6201)
//
// No llegeix cap `.env` ni cap credencial i no parla amb Firebase: les dades viuen en memòria i
// no es llegeix ni s'escriu res real. Obert a mà, el navegador sí que demana recursos externs
// públics (fonts de Google a `index.html`, la imatge de fons del carnet); l'auditoria
// (`scripts/audit-overflow-mobil.mjs`) els avorta perquè el resultat no depengui de la xarxa.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const aqui = (cami) => fileURLToPath(new URL(cami, import.meta.url));
const mock = (modul) => ({ find: new RegExp(`^firebase/${modul}$`), replacement: aqui(`./mocks/${modul}.js`) });

export const PORT_ARNES = 6201;

export default defineConfig({
  root: aqui('../..'),
  envDir: aqui('./'),
  cacheDir: aqui('../../node_modules/.vite-arnes-admin'),
  plugins: [react(), tailwindcss()],
  resolve: { alias: ['app', 'auth', 'firestore', 'functions', 'storage'].map(mock) },
  server: { port: PORT_ARNES, strictPort: true },
  logLevel: 'warn',
});
