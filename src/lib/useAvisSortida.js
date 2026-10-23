import { useEffect } from 'react';

const MISSATGE_PER_DEFECTE = 'Hi ha canvis sense desar. Vols sortir igualment?';

// Avisa en tancar/recarregar la pàgina i en clicar enllaços interns.
// Limitació: el botó «enrere» del navegador no es pot interceptar amb BrowserRouter (només cobreix beforeunload).
export default function useAvisSortida(actiu, missatge = MISSATGE_PER_DEFECTE) {
  useEffect(() => {
    if (!actiu) return undefined;

    function alDescarregar(e) {
      e.preventDefault();
      e.returnValue = '';
    }

    function alClic(e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const enllac = e.target.closest?.('a[href]');
      if (!enllac || enllac.target) return;
      const url = new URL(enllac.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname + url.search === window.location.pathname + window.location.search) return;
      if (!window.confirm(missatge)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    window.addEventListener('beforeunload', alDescarregar);
    document.addEventListener('click', alClic, true);
    return () => {
      window.removeEventListener('beforeunload', alDescarregar);
      document.removeEventListener('click', alClic, true);
    };
  }, [actiu, missatge]);
}
