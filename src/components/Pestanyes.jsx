export default function Pestanyes({ pestanyes, actual, onCanvi, etiqueta }) {
  function alTeclat(e, index) {
    const darrer = pestanyes.length - 1;
    let destí;
    if (e.key === 'ArrowRight') destí = index === darrer ? 0 : index + 1;
    else if (e.key === 'ArrowLeft') destí = index === 0 ? darrer : index - 1;
    else if (e.key === 'Home') destí = 0;
    else if (e.key === 'End') destí = darrer;
    else return;
    e.preventDefault();
    onCanvi(pestanyes[destí].id);
    document.getElementById(`pestanya-${pestanyes[destí].id}`)?.focus();
  }

  return (
    <div role="tablist" aria-label={etiqueta} className="pestanyes__llista">
      {pestanyes.map((p, index) => {
        const activa = p.id === actual;
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            id={`pestanya-${p.id}`}
            aria-selected={activa}
            aria-controls={`panell-${p.id}`}
            tabIndex={activa ? 0 : -1}
            className={`pestanyes__pestanya${activa ? ' pestanyes__pestanya--activa' : ''}`}
            onClick={() => onCanvi(p.id)}
            onKeyDown={(e) => alTeclat(e, index)}
          >
            {p.etiqueta}
            {p.avis && (
              <>
                <span className="pestanyes__avis" aria-hidden="true" />
                <span className="pestanyes__avis-text"> amb canvis</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
