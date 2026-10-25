// Després d'un desplegament, una pestanya oberta amb l'`index.html` antic demana fragments (`import()`) que ja no
// existeixen i Hosting respon amb l'HTML: Vite emet `vite:preloadError`. Es recarrega la pàgina una vegada per
// agafar la versió nova; si torna a fallar al cap de poc, no es recarrega més (sense bucles) i l'error arriba a
// l'ErrorBoundary.
export const CLAU_RECARREGA = 'recarregaPerFragment';
const MARGE = 10_000;

export function gestionaErrorPrecarrega(event, { emmagatzematge, recarrega, ara = Date.now() }) {
  try {
    const anterior = Number(emmagatzematge.getItem(CLAU_RECARREGA));
    if (anterior && ara - anterior < MARGE) return false;
    emmagatzematge.setItem(CLAU_RECARREGA, String(ara));
  } catch {
    return false;
  }
  event.preventDefault();
  recarrega();
  return true;
}

export function instalaRecarregaChunks() {
  window.addEventListener('vite:preloadError', (event) => {
    let emmagatzematge = null;
    try { emmagatzematge = window.sessionStorage; } catch { /* bloquejat */ }
    if (!emmagatzematge) return;
    gestionaErrorPrecarrega(event, { emmagatzematge, recarrega: () => window.location.reload() });
  });
}
