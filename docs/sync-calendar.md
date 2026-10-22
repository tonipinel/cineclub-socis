# Sincronització del Google Calendar

## Automàtica (Cloud Functions)

- `sincronitzarCalendari` (disparador de `sessions/{id}`): en publicar, editar, despublicar o esborrar una sessió crea, actualitza o esborra el seu esdeveniment segons l'estat actual del document (els disparadors poden arribar desordenats). Només actua si canvia alguna cosa que surt al calendari (títol, títol a Espanya, sinopsi, data, hora, slug, publicada). Els errors es registren al log i no es reintenten.
- `sincronitzarCalendariTot` (callable, només admin): sincronització completa. `{ aplicar: false }` (per defecte) retorna l'informe; `{ aplicar: true }` l'aplica. Només mira d'un any enrere a dos endavant; dels esdeveniments no gestionats en dóna només el recompte. Serveix per a la primera adopció dels esdeveniments de Hugo i per reparar desajustos (p. ex. després d'un error).
- Secrets de Firebase: `GOOGLE_CALENDAR_SERVICE_ACCOUNT_KEY` i `GOOGLE_CALENDAR_ID`.
- La lògica és a `functions/calendari.js` (compartida amb l'script), els gestors a `functions/calendari-handlers.js` i el client de Google a `functions/calendari-google.js`.

## Manual (script)

`npm run sync-calendar` fa que el calendari del club reflecteixi les sessions publicades de Firestore (`publicada === true`, amb `slug` i `data` vàlida).

```
npm run sync-calendar              # informe: no escriu res
npm run sync-calendar -- --apply   # aplica els canvis
```

## Variables

A l'entorn o en un `.env` a l'arrel (ignorat per git; la clau en JSON d'una sola línia entre cometes simples):

```
GOOGLE_CALENDAR_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'
GOOGLE_CALENDAR_ID=...@group.calendar.google.com
```

Són els secrets `GOOGLE_CALENDAR_*` del repo de Hugo a GitHub. El calendari ha d'estar compartit amb el `client_email` del compte de servei (permís de modificar esdeveniments). Firestore usa la clau `cineclub-socis-firebase-adminsdk-*.json` de l'arrel.

Sense variables, l'informe només llista les sessions que se sincronitzarien; `--apply` falla.

## Què fa

- Format idèntic al de Hugo: títol amb el títol a Espanya entre parèntesis, sinopsi de 200 caràcters + enllaç a `https://cineclubrodadebera.cat/programacio/<any>/<slug>/`, lloc del teatre, hora d'Europe/Madrid, 3 hores de durada fixes.
- Només gestiona els esdeveniments amb `extendedProperties.private.source = cineclub-website-sync`; la resta del calendari no es toca mai.
- Idempotent: una segona execució no canvia res.

## Adoptar els esdeveniments de Hugo

No cal fer res: l'script de Hugo ja posava la mateixa etiqueta i els `iCalUID` `<slug>-<AAAAMMDD>@cineclubrodadebera.cat`. La primera execució amb `--apply` els emparella amb la sessió, els afegeix l'id de la sessió i els actualitza si cal, sense duplicar-los. Els esdeveniments etiquetats que no corresponen a cap sessió publicada s'esborren, llevat dels «Sessió per determinar» de Hugo (`iCalUID` `placeholder-...`), que es conserven i només es llisten; revisa l'informe abans d'aplicar.

Un cop adoptats, cal desactivar el pas de sincronització del workflow de desplegament de Hugo perquè no s'esborrin l'un a l'altre els esdeveniments.
