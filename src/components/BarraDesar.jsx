const TEXTOS = {
  net: 'Sense canvis',
  pendent: 'Hi ha canvis sense desar',
  desant: 'Desant…',
  desat: 'Desat ✓',
  error: 'No s\'ha pogut desar',
};

export default function BarraDesar({
  estat, onDesar, errors = [], onAnarA, pestanyesAfectades = [], missatgeError,
}) {
  let text = estat === 'error' && missatgeError ? missatgeError : TEXTOS[estat];
  if (estat === 'pendent' && pestanyesAfectades.length > 0) {
    text += ` · ${pestanyesAfectades.join(', ')}`;
  }

  return (
    <div className="barra-desar">
      <div className="barra-desar__contingut">
        <div className="barra-desar__estat">
          <p
            aria-live="polite"
            role={estat === 'error' ? 'alert' : undefined}
            className={`barra-desar__text${estat === 'error' ? ' barra-desar__text--error' : ''}`}
          >
            {text}
          </p>
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
        <button
          type={onDesar ? 'button' : 'submit'}
          className="btn"
          disabled={estat === 'net' || estat === 'desant' || estat === 'desat'}
          aria-busy={estat === 'desant'}
          onClick={onDesar}
        >
          Desar
        </button>
      </div>
    </div>
  );
}
