// Gestió dels usuaris de taquilla des de l'admin. Cada crida comprova que qui la fa és admin i només
// actua sobre comptes amb el rol 'taquilla' (mai sobre admins, comptes sense rol ni sobre qui fa la crida).
// El rol el posa sempre aquest codi; mai no ve del client. Els enllaços per triar contrasenya permeten
// entrar al compte: es tornen només a l'admin que els demana i no s'escriuen mai al registre.
const { randomBytes } = require('node:crypto');
const { escaparHtml, correuValid, crearCorreuUnCop } = require('./solicituds');

const ROL = 'taquilla';
const LIMIT_USUARIS = 20;
const LIMIT_CREACIONS_HORA = 10;
const HORA = 60 * 60 * 1000;
const URL_ACCEDIR = 'https://associacio.cineclubrodadebera.cat/accedir';
const REMITENT = 'cineclub.rodadebera@gmail.com';
const AUDITORIA = 'auditoriaUsuaris';

function error(codi, missatge) {
  return Object.assign(new Error(missatge), { codi });
}

// Còpia de `scripts/adminClaims.js` (functions/ no pot importar de scripts/), limitada al rol que es gestiona aquí.
function buildStaffClaims(role) {
  if (role !== ROL) throw new Error(`Rol no permès: ${role}`);
  return { role };
}

const NOMES_ADMIN = 'Només l\'admin pot gestionar els usuaris.';

// El token pot ser d'abans que l'admin fos desactivat o perdés el rol (dura fins a 1 hora): es comprova també
// el compte actual. Si no es pot comprovar, es denega.
async function comprovarAdmin(deps, auth) {
  if (!auth?.uid) throw error('unauthenticated', 'Cal iniciar la sessió.');
  if (auth.token?.role !== 'admin') throw error('permission-denied', NOMES_ADMIN);
  let actual;
  try {
    actual = await deps.auth.getUser(auth.uid);
  } catch {
    throw error('permission-denied', NOMES_ADMIN);
  }
  if (actual.disabled || actual.customClaims?.role !== 'admin') throw error('permission-denied', NOMES_ADMIN);
}

// Contrasenya aleatòria que no es fa servir mai ni surt d'aquí: la persona en tria una amb l'enllaç.
const contrasenyaAleatoria = () => randomBytes(32).toString('base64url');

function validarNom(valor) {
  const nom = typeof valor === 'string' ? valor.trim() : '';
  // eslint-disable-next-line no-control-regex
  if (nom.length < 1 || nom.length > 80 || /[\u0000-\u001F\u007F<>]/.test(nom)) {
    throw error('invalid-argument', 'El nom ha de tenir entre 1 i 80 caràcters.');
  }
  return nom;
}

function validarCorreu(valor) {
  const correu = typeof valor === 'string' ? valor.trim().toLowerCase() : '';
  if (!correuValid(correu)) throw error('invalid-argument', 'El correu electrònic no és vàlid.');
  return correu;
}

function validarUid(valor) {
  // eslint-disable-next-line no-control-regex
  if (typeof valor !== 'string' || !/^[^/\s\u0000-\u001F]{1,128}$/.test(valor)) {
    throw error('invalid-argument', 'Usuari no vàlid.');
  }
  return valor;
}

const esNoTrobat = (e) => e?.code === 'auth/user-not-found';

// L'usuari objectiu: ha d'existir, no pot ser qui fa la crida i ha de tenir exactament el rol de taquilla.
async function usuariTaquilla(deps, auth, valor) {
  const uid = validarUid(valor);
  if (uid === auth.uid) throw error('permission-denied', 'No pots modificar el teu propi usuari.');
  let usuari;
  try {
    usuari = await deps.auth.getUser(uid);
  } catch (e) {
    if (esNoTrobat(e)) throw error('not-found', 'Aquest usuari no existeix.');
    throw e;
  }
  if (usuari.customClaims?.role !== ROL) throw error('permission-denied', 'Aquest usuari no és de taquilla.');
  return usuari;
}

async function correuEnUs(deps, correu) {
  try {
    await deps.auth.getUserByEmail(correu);
    return true;
  } catch (e) {
    if (esNoTrobat(e)) return false;
    throw e;
  }
}

async function auditar(deps, auth, accio, objectiu, detalls) {
  await deps.db.collection(AUDITORIA).add({
    accio,
    actorUid: auth.uid,
    actorCorreu: auth.token?.email ?? null,
    objectiuUid: objectiu.uid,
    objectiuCorreu: objectiu.correu ?? null,
    ...(detalls ? { detalls } : {}),
    timestamp: deps.FieldValue.serverTimestamp(),
  });
}

const data = (text) => (text ? new Date(text).toISOString() : null);

async function totsElsUsuarisTaquilla(deps) {
  const usuaris = [];
  let pagina;
  do {
    const resultat = await deps.auth.listUsers(1000, pagina);
    usuaris.push(...resultat.users.filter((u) => u.customClaims?.role === ROL));
    pagina = resultat.pageToken;
  } while (pagina);
  return usuaris;
}

function missatgeEnllac(nom, correu, enllac) {
  return `
    <p>Hola ${escaparHtml(nom)},</p>
    <p>T'hem donat accés a l'aplicació de taquilla del Cineclub Roda de Berà per escanejar els carnets a l'entrada de les sessions.</p>
    <p>Per començar, tria la teva contrasenya amb aquest enllaç:</p>
    <p><a href="${escaparHtml(enllac)}">Tria la contrasenya</a></p>
    <p>L'enllaç és personal i caduca al cap d'una estona: no el comparteixis. Si ha caducat, demana'n un de nou a l'administració.</p>
    <p>Després podràs entrar a <a href="${URL_ACCEDIR}">${URL_ACCEDIR}</a> amb el correu ${escaparHtml(correu)} i la contrasenya que hagis triat.</p>
    <p>Si no esperaves aquest correu, ignora'l.</p>
    <p style="margin-top:24px;"><strong>Associació Cineclub Roda de Berà</strong></p>
  `;
}

// Els correus porten un enllaç que dona accés al compte: la política TTL de Firestore sobre `mail.expireAt`
// els esborra abans que els de les sol·licituds.
const RETENCIO_CORREUS_ENLLAC = 7 * 24 * HORA;

// Genera l'enllaç per triar contrasenya i l'envia per correu. Si alguna cosa falla, l'acció principal ja
// està feta: es torna el que s'hagi pogut (l'admin pot copiar l'enllaç o tornar-ho a provar).
async function enviarEnllac(deps, uid, nom, correu) {
  let enllac;
  try {
    enllac = await deps.auth.generatePasswordResetLink(correu, { url: URL_ACCEDIR });
  } catch (e) {
    deps.logger.error('No s\'ha pogut generar l\'enllaç per triar contrasenya', { uid, codi: e?.code });
    return { enllac: null, correuEnviat: false };
  }
  try {
    await crearCorreuUnCop(deps.db.collection('mail'), `usuari-${uid}-enllac-${deps.ara}`, {
      to: correu,
      from: REMITENT,
      message: {
        subject: 'Accés a la taquilla del Cineclub Roda de Berà',
        html: missatgeEnllac(nom, correu, enllac),
      },
      expireAt: new Date(deps.ara + RETENCIO_CORREUS_ENLLAC),
    });
    return { enllac, correuEnviat: true };
  } catch (e) {
    deps.logger.error('No s\'ha pogut enviar el correu amb l\'enllaç', { uid, codi: e?.code });
    return { enllac, correuEnviat: false };
  }
}

// `deps`: auth (Admin SDK), db (Firestore Admin), FieldValue, logger i ara (ms).
async function llistar(deps, auth) {
  await comprovarAdmin(deps, auth);
  const usuaris = await totsElsUsuarisTaquilla(deps);
  return usuaris
    .map((u) => ({
      uid: u.uid,
      nom: u.displayName ?? '',
      correu: u.email ?? '',
      desactivat: u.disabled === true,
      ultimAcces: data(u.metadata?.lastRefreshTime ?? u.metadata?.lastSignInTime),
      creat: data(u.metadata?.creationTime),
    }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'ca'));
}

async function comprovarLimits(deps) {
  if ((await totsElsUsuarisTaquilla(deps)).length >= LIMIT_USUARIS) {
    throw error('resource-exhausted', `Ja hi ha ${LIMIT_USUARIS} usuaris de taquilla: elimina'n algun abans de crear-ne més.`);
  }
  // Només un filtre de rang (índex automàtic); l'acció es filtra aquí.
  const recents = await deps.db.collection(AUDITORIA).where('timestamp', '>=', new Date(deps.ara - HORA)).get();
  if (recents.docs.filter((d) => d.data().accio === 'crear').length >= LIMIT_CREACIONS_HORA) {
    throw error('resource-exhausted', `S'han creat ${LIMIT_CREACIONS_HORA} usuaris en l'última hora. Torna-ho a provar més tard.`);
  }
}

async function crear(deps, auth, dades) {
  await comprovarAdmin(deps, auth);
  const nom = validarNom(dades.nom);
  const correu = validarCorreu(dades.correu);
  // Mateix missatge sigui quin sigui el compte existent: no es revela el rol de ningú.
  if (await correuEnUs(deps, correu)) throw error('already-exists', 'Aquest correu ja està en ús.');
  await comprovarLimits(deps);

  let usuari;
  try {
    usuari = await deps.auth.createUser({
      email: correu,
      displayName: nom,
      password: contrasenyaAleatoria(),
      emailVerified: false,
      disabled: false,
    });
  } catch (e) {
    if (e?.code === 'auth/email-already-exists') throw error('already-exists', 'Aquest correu ja està en ús.');
    throw e;
  }
  try {
    await deps.auth.setCustomUserClaims(usuari.uid, buildStaffClaims(ROL));
  } catch (e) {
    // Sense rol el compte no serveix per a res i bloquejaria el correu: es desfà.
    await deps.auth.deleteUser(usuari.uid).catch(() => {});
    throw e;
  }
  // El compte ja existeix: si el registre falla, no es converteix en un error (l'admin el tornaria a crear).
  try {
    await auditar(deps, auth, 'crear', { uid: usuari.uid, correu });
  } catch (e) {
    deps.logger.error('No s\'ha pogut registrar la creació de l\'usuari', { uid: usuari.uid, codi: e?.code ?? null });
  }
  const { enllac, correuEnviat } = await enviarEnllac(deps, usuari.uid, nom, correu);
  return { uid: usuari.uid, enllac, correuEnviat };
}

async function editar(deps, auth, dades) {
  await comprovarAdmin(deps, auth);
  const nom = validarNom(dades.nom);
  const correu = validarCorreu(dades.correu);
  const usuari = await usuariTaquilla(deps, auth, dades.uid);
  const nomAnterior = usuari.displayName ?? '';
  const correuAnterior = usuari.email ?? '';
  const canviaCorreu = correu !== correuAnterior.toLowerCase();
  if (!canviaCorreu && nom === nomAnterior) return { enllac: null, correuEnviat: false };

  if (canviaCorreu) {
    if (await correuEnUs(deps, correu)) throw error('already-exists', 'Aquest correu ja està en ús.');
    try {
      // Nova contrasenya: l'antiga no ha de servir amb la nova adreça.
      await deps.auth.updateUser(usuari.uid, {
        displayName: nom, email: correu, emailVerified: false, password: contrasenyaAleatoria(),
      });
    } catch (e) {
      if (e?.code === 'auth/email-already-exists') throw error('already-exists', 'Aquest correu ja està en ús.');
      throw e;
    }
    await deps.auth.revokeRefreshTokens(usuari.uid);
  } else {
    await deps.auth.updateUser(usuari.uid, { displayName: nom });
  }
  await auditar(deps, auth, 'editar', { uid: usuari.uid, correu }, { nomAnterior, correuAnterior });
  if (!canviaCorreu) return { enllac: null, correuEnviat: false };
  const resultat = await enviarEnllac(deps, usuari.uid, nom, correu);
  if (resultat.enllac) await auditar(deps, auth, 'enviar-enllac', { uid: usuari.uid, correu });
  return resultat;
}

async function canviarEstat(deps, auth, dades) {
  await comprovarAdmin(deps, auth);
  if (typeof dades.desactivat !== 'boolean') throw error('invalid-argument', 'Falta l\'estat.');
  const usuari = await usuariTaquilla(deps, auth, dades.uid);
  if (usuari.disabled === dades.desactivat) return { desactivat: dades.desactivat };
  await deps.auth.updateUser(usuari.uid, { disabled: dades.desactivat });
  // La sessió oberta deixa de renovar-se: l'accés acaba quan caduca el token actual (com a molt, 1 hora).
  if (dades.desactivat) await deps.auth.revokeRefreshTokens(usuari.uid);
  await auditar(deps, auth, dades.desactivat ? 'desactivar' : 'reactivar', { uid: usuari.uid, correu: usuari.email });
  return { desactivat: dades.desactivat };
}

async function restablirContrasenya(deps, auth, dades) {
  await comprovarAdmin(deps, auth);
  const usuari = await usuariTaquilla(deps, auth, dades.uid);
  if (usuari.disabled) throw error('failed-precondition', 'L\'usuari està desactivat: reactiva\'l abans.');
  // Talla l'accés actual: la contrasenya antiga deixa de servir i les sessions obertes no es renoven.
  await deps.auth.updateUser(usuari.uid, { password: contrasenyaAleatoria() });
  await deps.auth.revokeRefreshTokens(usuari.uid);
  await auditar(deps, auth, 'restablir-contrasenya', { uid: usuari.uid, correu: usuari.email });
  const resultat = await enviarEnllac(deps, usuari.uid, usuari.displayName ?? '', usuari.email);
  if (!resultat.enllac) {
    throw error('aborted', 'S\'ha anul·lat la contrasenya, però no s\'ha pogut generar l\'enllaç. Torna-ho a provar.');
  }
  return resultat;
}

async function eliminar(deps, auth, dades) {
  await comprovarAdmin(deps, auth);
  const usuari = await usuariTaquilla(deps, auth, dades.uid);
  await deps.auth.deleteUser(usuari.uid);
  await auditar(deps, auth, 'eliminar', { uid: usuari.uid, correu: usuari.email });
  return { eliminat: true };
}

// Embolcall de les callables: els errors propis (`codi`) passen al client amb el seu missatge; qualsevol
// altre surt com a INTERNAL sense detalls (i al registre, només el codi).
async function executar(gestor, deps, request, HttpsError) {
  try {
    return await gestor(deps, request.auth, request.data ?? {});
  } catch (e) {
    if (e?.codi) throw new HttpsError(e.codi, e.message);
    deps.logger.error('Error inesperat en gestionar usuaris de taquilla', { codi: e?.code ?? null });
    throw new HttpsError('internal', 'Error intern.');
  }
}

module.exports = {
  executar,
  LIMIT_USUARIS, LIMIT_CREACIONS_HORA, URL_ACCEDIR, RETENCIO_CORREUS_ENLLAC,
  llistar, crear, editar, canviarEstat, restablirContrasenya, eliminar,
};
