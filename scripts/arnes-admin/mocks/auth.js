// firebase/auth simulat: sempre hi ha una administradora identificada, tret que la URL porti
// `?anonim` (per veure /accedir). Amb `?falla-sessio`, el token no es pot comprovar (com sense connexió amb el
// token caducat), per veure l'estat «No s'ha pogut comprovar la sessió».
const params = new URLSearchParams(window.location.search);
const anonim = params.has('anonim');
const fallaSessio = params.has('falla-sessio');

const usuari = {
  uid: 'arnes-admin',
  email: 'administradora.amb.un.correu.molt.llarg@cineclubrodadebera-exemple.cat',
  getIdTokenResult: async () => {
    if (fallaSessio) throw Object.assign(new Error('arnès: sense connexió (?falla-sessio)'), { code: 'auth/network-request-failed' });
    return { claims: { role: 'admin' } };
  },
  getIdToken: async () => 'token-arnes',
};

const auth = { currentUser: anonim ? null : usuari };

export const getAuth = () => auth;
export function onAuthStateChanged(_auth, cb) {
  setTimeout(() => cb(auth.currentUser), 0);
  return () => {};
}
export const signInWithEmailAndPassword = async () => { throw new Error('arnès: sense inici de sessió'); };
export const signOut = async () => {};
