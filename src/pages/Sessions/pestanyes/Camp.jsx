// Camp de la fitxa pública (`publica-<camp>`), amb ajuda, error i avís.
export default function Camp({ camp, etiqueta, ajuda, avis, form, onCanviForm, errors, children }) {
  const idAjuda = ajuda ? `publica-${camp}-ajuda` : undefined;
  const idError = errors[camp] ? `publica-${camp}-error` : undefined;
  return (
    <div className="form__field">
      <label className="form__label" htmlFor={`publica-${camp}`}>{etiqueta}</label>
      {children ?? (
        <input
          id={`publica-${camp}`}
          className="form__input"
          value={form[camp]}
          onChange={(e) => onCanviForm(camp, e.target.value)}
          aria-invalid={Boolean(idError)}
          aria-describedby={[idAjuda, idError].filter(Boolean).join(' ') || undefined}
        />
      )}
      {ajuda && <p id={idAjuda} className="form__ajuda">{ajuda}</p>}
      {idError && <p id={idError} className="form__error">{errors[camp]}</p>}
      {!idError && avis && <p className="pagina-publica__avis">{avis}</p>}
    </div>
  );
}
