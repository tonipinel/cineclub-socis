import { useCallback, useState } from 'react';

// Estat d'error d'una càrrega amb reintent: `falla` (per a `.catch` i per a l'error d'`onSnapshot`) registra l'error
// a la consola i marca l'error; `reintenta` el neteja i incrementa `intent`, que la pàgina posa a les dependències
// de l'efecte que llegeix perquè torni a llegir (o a subscriure's).
export default function useErrorCarrega() {
  const [error, setError] = useState(false);
  const [intent, setIntent] = useState(0);
  const falla = useCallback((e) => {
    console.error("No s'han pogut llegir les dades:", e);
    setError(true);
  }, []);
  const reintenta = useCallback(() => {
    setError(false);
    setIntent((n) => n + 1);
  }, []);
  return {
    error, falla, reintenta, intent,
  };
}
