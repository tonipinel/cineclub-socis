import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useInRouterContext, useLocation } from 'react-router-dom';
import DialegConfirmacio from './DialegConfirmacio';

const ConfirmacioContext = createContext(null);

// Cada petició es resol una sola vegada, encara que arribin respostes repetides.
function resol(peticio, resultat) {
  if (peticio.resolta) return;
  peticio.resolta = true;
  peticio.resolve(resultat);
}

// Avisa quan canvia la ruta (només si el provider és dins d'un Router).
function VigilaRuta({ onCanvi }) {
  const { pathname } = useLocation();
  const anterior = useRef(pathname);
  useEffect(() => {
    if (anterior.current === pathname) return;
    anterior.current = pathname;
    onCanvi();
  }, [pathname, onCanvi]);
  return null;
}

// `confirma` resol true (acceptar), false (cancel·lar) o 'secundaria' si s'ha triat `accioSecundaria`.
// Cua de peticions: només se'n mostra una alhora, la primera; la següent s'obre en tancar-se.
// En canviar de ruta o desmuntar-se, totes les pendents es resolen amb `false`.
export function ConfirmacioProvider({ children }) {
  const pendents = useRef([]);
  const [cua, setCua] = useState([]);
  const comptador = useRef(0);
  const dinsRouter = useInRouterContext();

  const demana = useCallback((opcions, avis) => new Promise((resolve) => {
    comptador.current += 1;
    pendents.current = [...pendents.current, { id: comptador.current, opcions, avis, resolve, resolta: false }];
    setCua(pendents.current);
  }), []);

  const cancellaTot = useCallback(() => {
    pendents.current.forEach((p) => resol(p, false));
    pendents.current = [];
    setCua([]);
  }, []);

  useEffect(() => () => pendents.current.forEach((p) => resol(p, false)), []);

  const valor = useMemo(() => ({
    confirma: (opcions) => demana(opcions, false),
    avisa: (opcions) => demana(opcions, true).then(() => undefined),
  }), [demana]);

  // Només respon la petició que es mostra: un `close` tardà d'un diàleg ja tancat no toca la següent.
  const respon = (id, resultat) => {
    const actual = pendents.current[0];
    if (!actual || actual.id !== id) return;
    resol(actual, resultat);
    pendents.current = pendents.current.slice(1);
    setCua(pendents.current);
  };

  const actual = cua[0];

  return (
    <ConfirmacioContext.Provider value={valor}>
      {children}
      {dinsRouter && <VigilaRuta onCanvi={cancellaTot} />}
      {actual && (
        <DialegConfirmacio
          key={actual.id}
          obert
          titol={actual.opcions.titol}
          missatge={actual.opcions.missatge}
          etiquetaAcceptar={actual.opcions.etiquetaAcceptar ?? (actual.avis ? 'Entesos' : 'Accepta')}
          etiquetaCancellar={actual.opcions.etiquetaCancellar ?? 'Cancel·lar'}
          perill={actual.opcions.perill ?? false}
          avis={actual.avis}
          accioSecundaria={actual.avis ? null : (actual.opcions.accioSecundaria ?? null)}
          onAcceptar={() => respon(actual.id, true)}
          onSecundaria={() => respon(actual.id, 'secundaria')}
          onCancellar={() => respon(actual.id, false)}
        />
      )}
    </ConfirmacioContext.Provider>
  );
}

export function useConfirmacio() {
  const valor = useContext(ConfirmacioContext);
  if (!valor) throw new Error("useConfirmacio s'ha d'usar dins de ConfirmacioProvider");
  return valor;
}
