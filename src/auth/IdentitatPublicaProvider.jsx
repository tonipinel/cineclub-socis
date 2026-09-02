import { createContext, useState } from 'react';

export const IdentitatPublicaContext = createContext(null);

export function IdentitatPublicaProvider({ children }) {
  const [identitat, setIdentitat] = useState(null);

  return (
    <IdentitatPublicaContext.Provider value={{ identitat, setIdentitat }}>
      {children}
    </IdentitatPublicaContext.Provider>
  );
}
