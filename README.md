# cineclub-socis

Aplicació de gestió de socis del Cineclub Roda de Berà. Substitueix l'Excel de socis, el Google Form d'alta i part de la comptabilitat en full de càlcul.

## Stack

React 19 + Vite, amb Firebase (Auth + Firestore) com a únic backend. CSS en fitxers dedicats amb `@apply` de Tailwind i nomenclatura BEM. Tests amb Vitest + Testing Library.

## Desenvolupament local

```bash
cp .env.example .env.local   # omple-hi la config web del projecte Firebase
npm install
npm run dev
```

## Configuració inicial del projecte Firebase

1. Crea el projecte a la [consola de Firebase](https://console.firebase.google.com).
2. Activa **Authentication** (mètode Email/Password) i **Firestore**.
3. Vincula aquest checkout al projecte (`.firebaserc` està exclòs del control de versions, així que cal fer-ho a cada màquina nova):
   ```bash
   firebase use --add
   ```
4. Desplega les regles de seguretat de Firestore:
   ```bash
   firebase deploy --only firestore:rules
   ```

## Donar d'alta el primer admin

El rol s'assigna com a custom claim sobre un usuari d'Auth **ja existent**. Si encara no hi ha cap usuari, crea'n un manualment des de la pestanya *Authentication* de la consola de Firebase (o fes que la persona s'hi registri pel mecanisme que tingui disponible el projecte en aquell moment).

```bash
node scripts/bootstrap-admin.js <email> <ruta-a-la-clau-de-service-account.json>
```

Després, cal que aquesta persona tanqui sessió i torni a entrar perquè el navegador obtingui un ID token nou amb el claim `role: admin`.

## Importació del cens actual (Excel)

```bash
node scripts/import-excel.js <ruta-al-excel.xlsx> <ruta-a-la-clau-de-service-account.json>
```

L'script és idempotent: cada soci es desa amb l'ID de document igual al seu número de soci/a, així que tornar a executar-lo sobre el mateix full actualitza els documents existents en lloc de duplicar-los.

## Desplegament

```bash
npm run deploy
```

Requereix haver fet `firebase use --add` prèviament. El domini personalitzat `associacio.cineclubrodadebera.cat` necessita un registre DNS afegit manualment allà on estigui gestionat el domini arrel `cineclubrodadebera.cat` — no és cosa d'aquest repositori ni de l'script de desplegament.

## Tests

```bash
npm test          # suite ràpida (Vitest)
npm run test:rules  # regles de Firestore contra l'emulador local
```

`test:rules` necessita `firebase-tools` instal·lat globalment (`npm i -g firebase-tools`) i Java disponible al sistema (requerit per l'emulador de Firestore).
