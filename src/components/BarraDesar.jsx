import { useLayoutEffect, useRef, useState } from 'react';

const TEXTOS = {
  net: 'Sense canvis',
  pendent: 'Hi ha canvis sense desar',
  desant: 'Desant…',
  desat: 'Desat ✓',
  error: 'No s\'ha pogut desar',
};

// `bloquejada`: desactiva «Desar» i «Descartar canvis» mentre la pàgina fa una altra operació sobre la fitxa.
// `motiuBloqueig` (opcional): per què està bloquejada (p. ex. una pujada en curs); es mostra com a nota informativa
// només mentre `bloquejada`. La regió viva hi és sempre (buida) perquè els lectors de pantalla n'anunciïn l'aparició.
// Després de «Descartar canvis» el botó desapareix («Sense canvis»): el focus passa al text d'estat de la barra
// (focusable només per programa, tabIndex=-1), que és on era el botó i anuncia el resultat; no es perd al body.
export default function BarraDesar({
  estat, onDesar, onDescarta, errors = [], onAnarA, pestanyesAfectades = [], missatgeError, bloquejada = false,
  motiuBloqueig,
}) {
  const textRef = useRef(null);
  // Cada descart re-renderitza la barra en el mateix lot que la fitxa: l'efecte el consumeix un sol cop.
  const [descarts, setDescarts] = useState(0);
  useLayoutEffect(() => {
    if (descarts === 0) return;
    const actiu = document.activeElement;
    if (!actiu || actiu === document.body) textRef.current?.focus();
  }, [descarts]);
  const handleDescarta = () => {
    setDescarts((n) => n + 1);
    onDescarta();
  };

  let text = estat === 'error' && missatgeError ? missatgeError : TEXTOS[estat];
  if (estat === 'pendent' && pestanyesAfectades.length > 0) {
    text += ` · ${pestanyesAfectades.join(', ')}`;
  }

  return (
    <div className="barra-desar">
      <div className="barra-desar__contingut">
        <div className="barra-desar__estat">
          <p
            ref={textRef}
            tabIndex={-1}
            aria-live="polite"
            role={estat === 'error' ? 'alert' : undefined}
            className={`barra-desar__text${estat === 'error' ? ' barra-desar__text--error' : ''}`}
          >
            {text}
          </p>
          <p aria-live="polite" className="barra-desar__nota">{bloquejada && motiuBloqueig ? motiuBloqueig : ''}</p>
          {estat === 'error' && errors.length > 0 && (
            <ul className="barra-desar__errors">
              {errors.map((error, index) => (
                <li key={`${error.pestanya}-${index}`}>
                  <button type="button" className="barra-desar__error" onClick={() => onAnarA(error.pestanya)}>
                    {error.etiquetaPestanya}: {error.missatge}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="barra-desar__accions">
          {onDescarta && ['pendent', 'error', 'desant'].includes(estat) && (
            <button type="button" className="btn barra-desar__descartar" disabled={bloquejada || estat === 'desant'} onClick={handleDescarta}>
              Descartar canvis
            </button>
          )}
          <button
            type={onDesar ? 'button' : 'submit'}
            className="btn"
            disabled={bloquejada || estat === 'net' || estat === 'desant' || estat === 'desat'}
            aria-busy={estat === 'desant'}
            onClick={onDesar}
          >
            Desar
          </button>
        </div>
      </div>
    </div>
  );
}
