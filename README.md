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

Per donar d'alta un usuari de **taquilla** (control d'accés a la porta, sense accés a Socis ni Sessions), s'utilitza el mateix script amb un tercer argument (la persona ha d'existir prèviament com a usuari d'Auth, igual que per a l'admin):

```bash
node scripts/bootstrap-admin.js <email> <ruta-a-la-clau-de-service-account.json> taquilla
```

## Importació del cens actual (Excel)

```bash
node scripts/import-excel.js <ruta-al-excel.xlsx>           # informe: no escriu res
node scripts/import-excel.js <ruta-al-excel.xlsx> --apply   # escriu (cal la còpia d'avui a backups/)
node scripts/import-excel.js --desfer backups/<AAAA-MM-DD>/import-excel-registre.json
```

Credencials: `GOOGLE_APPLICATION_CREDENTIALS` o la clau `cineclub-socis-firebase-adminsdk-*.json` de l'arrel. És idempotent: un soci que ja existeix (mateix número) només rep els camps de contacte que tingui buits, mai se li toquen el pagament, el període, l'estat actiu ni el carnet; les sol·licituds ja existents (mateix correu, o nom i telèfon) no es dupliquen.

Abans de llançar `--apply`:

- **Desplega primer les funcions** (`firebase deploy --only functions`). Les sol·licituds importades porten `importat: true` i només la versió nova de `notificarNovaSolicitud` les deixa sense correus. Amb la versió antiga, cada persona importada rebria la benvinguda amb el número de compte, i el club, un avís per cadascuna.
- Les sol·licituds importades es desen amb `acceptaPrivacitat` i `acceptaDadesPersonals` a `true`, però aquestes persones no han acceptat res pel formulari. Cal tenir el consentiment per una altra via, o demanar-lo en aprovar-les.
- `--desfer` no esborra un soci creat si després se n'ha canviat el nom, el pagament, el període o l'estat. Tot i així, les referències que no toquen el document (assistències a `accessLog`, moviments, propostes o vots amb el seu número) quedarien òrfenes si s'esborra. Desfés-ho només just després d'importar.

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

## Escaneig a la porta

La pantalla d'Escaneig necessita accedir a la càmera, cosa que el navegador només permet en un context segur (HTTPS). En producció (`associacio.cineclubrodadebera.cat`) ja funciona; però provant-ho amb `npm run dev` des d'un mòbil connectat a la xarxa local **no funcionarà** (l'accés a la càmera fallarà en silenci i caldrà el camp de text manual), perquè només `localhost` compta com a context segur — cal fer-ho des del mateix ordinador on corre el `dev server`, o provar directament contra la versió desplegada.

`BarcodeDetector` (l'API que llegeix el QR amb la càmera) no està implementada nativament a Safari/iOS. Per això s'utilitza el paquet [`barcode-detector`](https://www.npmjs.com/package/barcode-detector) (`import 'barcode-detector/polyfill'` a `EscaneigPage.jsx`), que la substitueix per una implementació pròpia en WebAssembly quan el navegador no la té — així la càmera funciona igual a Safari/iOS que a la resta. Si mai falla (xarxa sense accés al CDN que serveix el `.wasm`, navegador molt antic), l'aplicació cau automàticament al camp de text manual, que sempre funciona.

### Tiquets genèrics i alternança de lots

Hi ha dos lots (~150 tiquets pre-impresos cadascun). El club alterna quin lot es reparteix d'una sessió a la següent, perquè el lot que acaba de fer-se servir "descansi" abans de tornar-s'hi a repartir, reduint el risc de reutilitzar per error un tiquet físic sobrant d'una sessió anterior.
