import { createContext, useCallback, useRef, useState } from 'react';
import { llegirIdentitat, desarIdentitat, esborrarIdentitat } from '../lib/identitat.js';

export const IdentitatPublicaContext = createContext(null);

export function IdentitatPublicaProvider({ children }) {
  const [identitat, setIdentitatEstat] = useState(() => llegirIdentitat());

  // Darrer valor aplicat: un actualitzador funcional es resol contra ell (i no contra el de l'últim
  // renderitzat), perquè dues crides seguides encadenin.
  const actual = useRef(identitat);

  // Persisteix a sessionStorage i avisa la capçalera (fora de React) perquè actualitzi la salutació.
  // Accepta un valor o un actualitzador `(anterior) => nou`.
  const setIdentitat = useCallback((valorONou) => {
    const nova = typeof valorONou === 'function' ? valorONou(actual.current) : valorONou;
    actual.current = nova;
    setIdentitatEstat(nova);
    if (nova) desarIdentitat(nova);
    else esborrarIdentitat();
    window.dispatchEvent(new CustomEvent('identitat-canviada'));
  }, []);

  return (
    <IdentitatPublicaContext.Provider value={{ identitat, setIdentitat }}>
      {children}
    </IdentitatPublicaContext.Provider>
  );
}
