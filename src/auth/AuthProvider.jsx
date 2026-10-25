import { createContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut } from 'firebase/auth';
import { auth } from '../firebase/firebase';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  // La sessió no s'ha pogut comprovar (p. ex. sense connexió amb el token caducat): no és «sense sessió».
  const [errorSessio, setErrorSessio] = useState(false);
  const [intent, setIntent] = useState(0);

  useEffect(() => {
    let actiu = true;
    const falla = (e) => {
      if (!actiu) return;
      console.error("No s'ha pogut comprovar la sessió:", e);
      setUser(null);
      setRole(null);
      setErrorSessio(true);
      setLoading(false);
    };
    const desubscriu = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setRole(null);
        setErrorSessio(false);
        setLoading(false);
        return;
      }
      try {
        const token = await fbUser.getIdTokenResult();
        if (!actiu) return;
        setUser({ uid: fbUser.uid, email: fbUser.email });
        setRole(token.claims.role || null);
        setErrorSessio(false);
        setLoading(false);
      } catch (e) {
        falla(e);
      }
    }, falla);
    return () => { actiu = false; desubscriu(); };
  }, [intent]);

  const reintentaSessio = () => {
    setErrorSessio(false);
    setLoading(true);
    setIntent((n) => n + 1);
  };
  const signIn = (email, password) => signInWithEmailAndPassword(auth, email, password);
  const signOut = () => fbSignOut(auth);

  return (
    <AuthContext.Provider value={{
      user, role, loading, errorSessio, reintentaSessio, signIn, signOut,
    }}
    >
      {children}
    </AuthContext.Provider>
  );
}
