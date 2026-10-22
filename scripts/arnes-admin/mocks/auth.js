// firebase/auth simulat: sempre hi ha una administradora identificada, tret que la URL porti
// `?anonim` (per veure /accedir).
const anonim = new URLSearchParams(window.location.search).has('anonim');

const usuari = {
  uid: 'arnes-admin',
  email: 'administradora.amb.un.correu.molt.llarg@cineclubrodadebera-exemple.cat',
  getIdTokenResult: async () => ({ claims: { role: 'admin' } }),
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
