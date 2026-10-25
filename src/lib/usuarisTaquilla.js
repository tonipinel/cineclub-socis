import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/firebase';

const crida = async (nom, dades) => (await httpsCallable(functions, nom)(dades)).data;

export const llistarUsuaris = () => crida('llistarUsuarisTaquilla', {});
export const crearUsuari = ({ nom, correu }) => crida('crearUsuariTaquilla', { nom, correu });
export const editarUsuari = ({ uid, nom, correu }) => crida('editarUsuariTaquilla', { uid, nom, correu });
export const canviarEstatUsuari = (uid, desactivat) => crida('canviarEstatUsuariTaquilla', { uid, desactivat });
export const restablirContrasenya = (uid) => crida('restablirContrasenyaUsuariTaquilla', { uid });
export const eliminarUsuari = (uid) => crida('eliminarUsuariTaquilla', { uid });

// Codis amb un missatge propi del servidor (en català i sense dades sensibles): es mostra tal qual.
const AMB_MISSATGE_DEL_SERVIDOR = ['aborted', 'already-exists', 'resource-exhausted', 'failed-precondition', 'invalid-argument', 'not-found'];
const MISSATGES = {
  'permission-denied': 'No tens permís per fer aquesta acció.',
  unauthenticated: 'Cal tornar a iniciar la sessió.',
  unavailable: "No s'ha pogut connectar amb el servidor. Torna-ho a provar.",
  'deadline-exceeded': 'El servidor ha trigat massa. Torna-ho a provar.',
};

export function missatgeError(e, perDefecte = "No s'ha pogut fer l'acció. Torna-ho a provar.") {
  const codi = String(e?.code ?? '').replace(/^functions\//, '');
  if (AMB_MISSATGE_DEL_SERVIDOR.includes(codi) && e?.message) return e.message;
  return MISSATGES[codi] ?? perDefecte;
}

export const codiError = (e) => String(e?.code ?? '').replace(/^functions\//, '');

// Mateixes regles que la Cloud Function, per avisar abans d'enviar.
export function validarUsuari({ nom, correu }) {
  const errors = {};
  const n = nom.trim();
  if (!n) errors.nom = 'Escriu el nom.';
  else if (n.length > 80) errors.nom = 'El nom pot tenir com a màxim 80 caràcters.';
  else if (/[<>]/.test(n)) errors.nom = 'El nom no pot contenir < ni >.';
  const c = correu.trim();
  if (!c) errors.correu = 'Escriu el correu electrònic.';
  else if (c.length > 254 || !/^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(c)) {
    errors.correu = 'El correu electrònic no és vàlid.';
  }
  return errors;
}

const FORMAT_DATA = new Intl.DateTimeFormat('ca-ES', { dateStyle: 'short', timeStyle: 'short' });
export const formatData = (valor) => {
  if (!valor) return 'Mai';
  const data = typeof valor?.toDate === 'function' ? valor.toDate() : new Date(valor);
  return Number.isNaN(data.getTime()) ? '—' : FORMAT_DATA.format(data);
};

export const filtrarUsuaris = (usuaris, cerca) => {
  const text = cerca.trim().toLocaleLowerCase('ca');
  if (!text) return usuaris;
  return usuaris.filter((u) => `${u.nom} ${u.correu}`.toLocaleLowerCase('ca').includes(text));
};

export const ACCIONS_AUDITORIA = {
  crear: 'Creat',
  editar: 'Dades canviades',
  'enviar-enllac': 'Enllaç per triar contrasenya enviat',
  'restablir-contrasenya': 'Contrasenya restablerta (enllaç enviat)',
  desactivar: 'Desactivat',
  reactivar: 'Reactivat',
  eliminar: 'Eliminat',
};
