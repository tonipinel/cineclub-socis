// Assignació del número de soci. El número identifica el soci a tot arreu (porta `SOCI-<n>`, socisPublic per votar,
// accessLog, quotes), així que no es pot repetir mai.
//
// Font de veritat: el comptador `configuracio/socis.ultimNumeroSoci` (només admin, com `configuracio/tiquets`),
// llegit i avançat dins de la mateixa `runTransaction` que escriu el soci. Si dues assignacions corren alhora, totes
// dues llegeixen el comptador; la que confirma després troba el document canviat, Firestore la reintenta i agafa el
// número següent. Un número cremat (transacció que falla després) deixa un forat, mai un duplicat.
//
// Les transaccions del client no poden fer consultes, així que no es pot comprovar a dins que cap soci tingui ja el
// número candidat. Per això el que crida passa també el màxim llegit de `socis` just abans (`maximNumeroSoci`), i el
// número és max(comptador, màxim) + 1: cobreix números posats a mà o importats després d'inicialitzar el comptador.
// La unicitat entre assignacions de l'app la garanteix el comptador, no aquesta lectura.
//
// Si el comptador no existeix no s'inventa: s'ha d'inicialitzar un cop amb scripts/inicialitza-comptador-socis.mjs
// (que el posa al màxim actual dins d'una transacció de l'Admin SDK, que sí pot llegir tota la col·lecció).

export const MISSATGE_COMPTADOR_ABSENT = "Falta el comptador de números de soci (configuracio/socis). No s'ha desat res: "
  + "cal inicialitzar-lo una vegada amb scripts/inicialitza-comptador-socis.mjs abans d'assignar números nous.";

export const MISSATGE_COMPTADOR_INVALID = "El comptador de números de soci (configuracio/socis) no té un valor vàlid. "
  + "No s'ha desat res: revisa'l amb scripts/inicialitza-comptador-socis.mjs abans d'assignar números nous.";

export class ErrorComptadorSocis extends Error {
  constructor(missatge) {
    super(missatge);
    this.name = 'ErrorComptadorSocis';
  }
}

export function maximNumeroSoci(numerosExistents) {
  const numeros = numerosExistents
    .map((n) => Number(n))
    // Només enters positius (mateix criteri que scripts/inicialitza-comptador-socis.mjs): un número desat malament
    // (p. ex. 1061.5) no ha de fer que el comptador deixi de ser enter.
    .filter((n) => Number.isInteger(n) && n > 0);
  return numeros.length > 0 ? Math.max(...numeros) : 0;
}

// Llegeix i avança el comptador dins de `transaction`. Com que fa una lectura, s'ha de cridar abans de cap escriptura
// de la mateixa transacció.
export async function reservarNumeroSoci(transaction, comptadorRef, maximExistent) {
  const snap = await transaction.get(comptadorRef);
  if (!snap.exists()) throw new ErrorComptadorSocis(MISSATGE_COMPTADOR_ABSENT);
  const ultim = snap.data().ultimNumeroSoci;
  if (!Number.isInteger(ultim) || ultim < 0) throw new ErrorComptadorSocis(MISSATGE_COMPTADOR_INVALID);
  const numero = Math.max(ultim, maximExistent) + 1;
  if (!Number.isInteger(numero) || numero <= 0) throw new ErrorComptadorSocis(MISSATGE_COMPTADOR_INVALID);
  transaction.update(comptadorRef, { ultimNumeroSoci: numero });
  return numero;
}
