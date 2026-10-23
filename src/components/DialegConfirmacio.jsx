import { useEffect, useId, useRef } from 'react';

const FOCUSABLES = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// Temps després d'obrir-se durant el qual s'ignora «Acceptar»: el segon clic d'un doble clic
// sobre el diàleg anterior no ha d'acceptar el següent, que s'obre al mateix lloc.
export const GRACIA_ACCEPTAR_MS = 300;

// Diàleg modal accessible sobre <dialog> natiu. Si el navegador (o jsdom) no té showModal,
// es mostra amb l'atribut `open` i els rols ARIA explícits.
export default function DialegConfirmacio({
  obert, titol, missatge, etiquetaAcceptar = 'Accepta', etiquetaCancellar = 'Cancel·lar',
  perill = false, avis = false, onAcceptar, onCancellar,
}) {
  const dialegRef = useRef(null);
  const segurRef = useRef(null);
  const idTitol = useId();
  const idMissatge = useId();
  const obertA = useRef(0);
  const modalNatiu = typeof HTMLDialogElement !== 'undefined'
    && typeof HTMLDialogElement.prototype.showModal === 'function';

  useEffect(() => {
    if (!obert) return undefined;
    const dialeg = dialegRef.current;
    const previ = document.activeElement;
    obertA.current = Date.now();
    if (modalNatiu && !dialeg.open) dialeg.showModal();
    // Focus inicial a l'acció segura: Cancel·lar (o l'únic botó d'un avís).
    segurRef.current?.focus();
    return () => {
      if (modalNatiu && dialeg.open) dialeg.close();
      if (previ?.isConnected) previ.focus();
    };
  }, [obert, modalNatiu]);

  if (!obert) return null;

  const tecla = (e) => {
    if (e.key === 'Escape' && !modalNatiu) {
      e.preventDefault();
      onCancellar();
      return;
    }
    if (e.key !== 'Tab') return;
    const elements = Array.from(dialegRef.current.querySelectorAll(FOCUSABLES));
    const primer = elements[0];
    const darrer = elements[elements.length - 1];
    if (e.shiftKey && document.activeElement === primer) {
      e.preventDefault();
      darrer.focus();
    } else if (!e.shiftKey && document.activeElement === darrer) {
      e.preventDefault();
      primer.focus();
    }
  };

  // El clic al fons arriba al mateix <dialog>: el contingut l'omple tot.
  // Un doble clic sobre el botó que l'obre en fa caure el segon clic al fons: mateixa gràcia que «Acceptar».
  const dinsGracia = () => Date.now() - obertA.current < GRACIA_ACCEPTAR_MS;

  const clic = (e) => {
    if (e.detail > 1 || dinsGracia()) return;
    if (e.target === e.currentTarget) onCancellar();
  };

  const accepta = (e) => {
    if (e.detail > 1 || dinsGracia()) return;
    onAcceptar();
  };

  // Evita que el navegador el tanqui pel seu compte: el tancament el decideix React.
  const cancel = (e) => {
    e.preventDefault();
    onCancellar();
  };

  return (
    <dialog
      ref={dialegRef}
      className={`dialeg-confirmacio${modalNatiu ? '' : ' dialeg-confirmacio--sense-modal'}`}
      open={modalNatiu ? undefined : true}
      role={perill ? 'alertdialog' : modalNatiu ? undefined : 'dialog'}
      aria-modal={modalNatiu ? undefined : 'true'}
      aria-labelledby={titol ? idTitol : idMissatge}
      aria-describedby={titol ? idMissatge : undefined}
      onCancel={cancel}
      onClose={onCancellar}
      onClick={clic}
      onKeyDown={tecla}
    >
      <div className="dialeg-confirmacio__contingut">
        {titol && <h2 id={idTitol} className="dialeg-confirmacio__titol">{titol}</h2>}
        <div id={idMissatge} className="dialeg-confirmacio__missatge">{missatge}</div>
        <div className="dialeg-confirmacio__accions">
          {avis ? (
            <button ref={segurRef} type="button" className="btn" onClick={accepta}>
              {etiquetaAcceptar}
            </button>
          ) : (
            <>
              <button ref={segurRef} type="button" className="btn btn--outline" onClick={onCancellar}>
                {etiquetaCancellar}
              </button>
              <button type="button" className={perill ? 'btn btn--perill' : 'btn'} onClick={accepta}>
                {etiquetaAcceptar}
              </button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
