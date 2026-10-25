import { useEffect, useRef } from 'react';

const ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

// Diàlegs oberts, de baix a dalt: Escape i Tab només els gestiona el de dalt (p. ex. el lector del carnet
// obert des del detall, o una imatge ampliada dins el detall).
const pila = [];

function gestionarTecla(e) {
  pila.at(-1)?.(e);
}

// Diàleg modal accessible: en muntar-se, el focus hi entra (al primer element enfocable, o al diàleg);
// mentre és obert, Tab no en surt i Escape crida `onTancar`; en desmuntar-se, el focus torna on era.
// Retorna el ref del contenidor, que ha de tenir `tabIndex={-1}`.
export function useDialegModal(onTancar) {
  const ref = useRef(null);
  const onTancarRef = useRef(onTancar);
  useEffect(() => { onTancarRef.current = onTancar; });

  useEffect(() => {
    const dialeg = ref.current;
    const origen = document.activeElement;
    const enfocables = () => [...dialeg.querySelectorAll(ENFOCABLES)];
    (enfocables()[0] ?? dialeg).focus();

    const tecla = (e) => {
      if (e.key === 'Escape') {
        // Una tecla mantinguda repeteix l'Escape: només la primera pulsació tanca (un sol diàleg).
        if (e.repeat) return;
        e.preventDefault();
        onTancarRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const llista = enfocables();
      const actiu = document.activeElement;
      if (llista.length === 0) {
        e.preventDefault();
        dialeg.focus();
      } else if (!dialeg.contains(actiu)) {
        e.preventDefault();
        llista[0].focus();
      } else if (e.shiftKey && (actiu === llista[0] || actiu === dialeg)) {
        e.preventDefault();
        llista.at(-1).focus();
      } else if (!e.shiftKey && actiu === llista.at(-1)) {
        e.preventDefault();
        llista[0].focus();
      }
    };

    if (pila.length === 0) document.addEventListener('keydown', gestionarTecla);
    pila.push(tecla);
    return () => {
      pila.splice(pila.indexOf(tecla), 1);
      if (pila.length === 0) document.removeEventListener('keydown', gestionarTecla);
      if (origen instanceof HTMLElement && origen !== document.body && origen.isConnected) origen.focus();
    };
  }, []);

  return ref;
}
