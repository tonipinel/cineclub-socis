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

Els usuaris de **taquilla** (només escaneig a la porta, sense accés a Socis ni Sessions) es gestionen des de l'admin, a **Configuració → Usuaris de taquilla**: crear (la persona rep un correu per triar la contrasenya; l'enllaç també es pot copiar), canviar nom o correu, desactivar/reactivar, restablir la contrasenya i eliminar. Ho fan les Cloud Functions `*UsuariTaquilla` (`functions/usuaris.js`), que només actuen sobre comptes amb el rol `taquilla` i deixen constància de cada canvi a `auditoriaUsuaris`. Límits: 20 usuaris de taquilla i 10 altes per hora.

L'script continua funcionant (p. ex. per donar el rol a un compte d'Auth que ja existeix):

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

## Títols de les sessions

Cada sessió té tres títols: el **títol original** (un sol camp, «Títol original»: `titol`, i, cada cop que es desa la fitxa pública, `publica.titol` i `publica.titolOriginal`) és el principal de la web (h1, targetes, `<title>`, JSON-LD, calendari, slug suggerit); el **títol en català** (`publica.titolTraduit`, opcional) surt a sota com a subtítol (si és diferent del principal) i, si hi cap, entre parèntesis al `<title>`; el **títol a Espanya** (`publica.titolEspanya`) surt a la fitxa tècnica. Al calendari, l'esdeveniment és «Original (Català)» o, si no hi ha títol en català, «Original (Espanya)». Canviar el títol no canvia mai el slug ni l'URL. Per alinear les sessions antigues amb aquest model: `node scripts/unifica-titols-sessions.mjs` (informe; `--apply` amb la còpia d'avui, `--desfer <fitxer>`). **Ordre obligatori**: còpia de seguretat → `--apply` d'aquest script → desplegar l'admin; si no, desar una sessió sense migrar escriu el títol de gestió (català o castellà) com a títol original. Després de desplegar les funcions, executa `npm run sync-calendar -- --apply` una vegada perquè els esdeveniments existents agafin el títol nou.

La descripció (SEO) d'una sessió és `publica.descripcio` o, si és buida, un text automàtic amb el títol, l'any, la direcció i quan es projecta. Els camps antics `publica.versioIdiomatica` i `publica.hook` (ganxo) ja no s'editen ni es mostren, però es conserven en desar.

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

### Què veu la porta (`socisPorta`)

La taquilla no llegeix `socis` (DNI, contacte, pagaments, token del carnet): només `socisPorta/{numeroSoci}`, amb el número, el nom, si està actiu i el motiu, les dates que calen per calcular l'estat i el venciment (les mateixes funcions de `src/lib/estatSoci.js` que l'admin) i el SHA-256 del token del carnet (`tokenHash`), mai el token. El manté la Cloud Function `sincronitzarSociPorta` (`functions/socis-porta.js`, llista blanca de camps) a cada canvi d'una fitxa. Les regles només permeten un `get` per número o una consulta amb `limit(1)`.

- El QR del carnet porta `CARNET-<token>`: la porta en calcula el hash al navegador i busca el soci per `tokenHash`. Un QR amb `SOCI-<n>` es rebutja (el pot fabricar qualsevol). A mà s'accepta el número (`12` o `SOCI-12`): l'operador ha de comprovar la identitat.
- L'activació del carnet (`inicPeriode` al primer escaneig d'una alta) la desa a `socis` la Cloud Function `activarCarnetEnEscanejar` (`functions/activacio-carnet.js`) en crear-se l'entrada a `accessLog`, tant si escaneja la taquilla com l'admin: la porta no escriu mai a `socis`. Fa servir la data de l'entrada (Europe/Madrid) i la mateixa regla que `inicPeriodeEnEscanejar` (còpia amb test de paritat): un cop desada l'activació d'una quota no es mou mai, encara que arribi una entrada més antiga. Només escriu si canvia, no escriu si el número és repetit (ho avisa al log) i es reintenta si falla. La porta ja mostra l'estat i el venciment finals en el mateix escaneig. Per reparar les activacions que no es van desar abans: `node scripts/repara-inicperiode.mjs` (informe; `--apply` amb la còpia d'avui, `--desfer <fitxer>`).
- `escaneigErrors` només desa els 4 primers caràcters del token d'un carnet.
- Per a la taquilla: després de registrar un pagament o fer un carnet nou, la porta ho veu amb uns segons de retard. Si surt «Vençut» o «Aquest carnet no és vàlid» just després, torna a escanejar-lo un cop.
- El motiu de desactivació (text lliure) es mostra a la porta: no hi escriguis motius sensibles (salut, conflictes personals…).
- Si una actualització de `socisPorta` falla, la funció es reintenta sola (`retry: true`) i registra només l'id del soci i el codi d'error.
- Per omplir `socisPorta` la primera vegada o reparar desajustos: `node scripts/omple-socis-porta.mjs` (informe; `--apply` amb la còpia d'avui, `--desfer <fitxer>`).

### Tiquets genèrics i alternança de lots

Hi ha dos lots (~150 tiquets pre-impresos cadascun). El club alterna quin lot es reparteix d'una sessió a la següent, perquè el lot que acaba de fer-se servir "descansi" abans de tornar-s'hi a repartir, reduint el risc de reutilitzar per error un tiquet físic sobrant d'una sessió anterior.
