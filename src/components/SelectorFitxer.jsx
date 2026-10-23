import { useId, useState } from 'react';

// `onChange` rep l'esdeveniment original, però el valor de l'input es buida just després:
// els consumidors han de llegir `e.target.files` de manera síncrona (p. ex. `Array.from(e.target.files)`
// abans de qualsevol await).
export default function SelectorFitxer({ id: idExtern, etiqueta, accept, multiple = false, disabled = false, onChange, nomFitxer }) {
  const idAuto = useId();
  const id = idExtern ?? idAuto;
  const [triats, setTriats] = useState([]);

  const handleChange = (e) => {
    const input = e.target;
    setTriats(Array.from(input.files ?? [], (f) => f.name));
    onChange?.(e);
    // Buidar el valor permet triar el mateix fitxer una altra vegada
    input.value = '';
  };

  const text = nomFitxer ?? (triats.length === 0 ? 'Cap fitxer seleccionat' : triats.length === 1 ? triats[0] : `${triats.length} fitxers`);

  return (
    <div className="selector-fitxer">
      <input
        id={id}
        type="file"
        className="selector-fitxer__input"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        aria-describedby={`${id}-nom`}
        onChange={handleChange}
      />
      <label htmlFor={id} className={`btn btn--outline selector-fitxer__boto${disabled ? ' selector-fitxer__boto--deshabilitat' : ''}`}>
        {etiqueta}
      </label>
      <span id={`${id}-nom`} className="selector-fitxer__nom" aria-live="polite">{text}</span>
    </div>
  );
}
