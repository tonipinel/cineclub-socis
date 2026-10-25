import { useId, useRef, useState } from 'react';

// Resultat d'enviar un enllaç per triar contrasenya: diu si ha sortit el correu i deixa copiar l'enllaç
// (per si no arriba). L'enllaç permet entrar al compte: només es mostra aquí, no es desa enlloc.
// `contrasenyaAnullada`: el servidor ha canviat la contrasenya per una d'aleatòria (restablir o canvi de correu).
export default function EnllacContrasenya({
  correu, enllac, correuEnviat, contrasenyaAnullada = false,
}) {
  const id = useId();
  const input = useRef(null);
  const [estatCopia, setEstatCopia] = useState('');

  const copia = async () => {
    try {
      await navigator.clipboard.writeText(enllac);
      setEstatCopia("S'ha copiat l'enllaç.");
    } catch {
      input.current?.select();
      setEstatCopia("No s'ha pogut copiar: selecciona'l i copia'l a mà.");
    }
  };

  return (
    <section className="enllac-contrasenya" aria-labelledby={`${id}-titol`}>
      <h2 id={`${id}-titol`} className="enllac-contrasenya__titol">
        {correuEnviat ? 'Correu enviat' : 'No s\'ha pogut enviar el correu'}
      </h2>
      <p className="enllac-contrasenya__text" role="status">
        {correuEnviat && <>S&apos;ha enviat un correu a <strong>{correu}</strong> perquè triï la seva contrasenya.</>}
        {!correuEnviat && enllac && <>Envia tu mateix aquest enllaç a <strong>{correu}</strong> perquè triï la seva contrasenya.</>}
        {!correuEnviat && !enllac && <>No s&apos;ha pogut generar l&apos;enllaç per a <strong>{correu}</strong>. Torna-ho a provar amb «Restableix la contrasenya» des de la fitxa de l&apos;usuari.</>}
      </p>
      {contrasenyaAnullada && (
        <p className="enllac-contrasenya__text">
          La contrasenya actual deixarà de funcionar fins que la persona triï la nova amb l&apos;enllaç.
        </p>
      )}
      {enllac && (
        <>
          <label className="form__label" htmlFor={`${id}-enllac`}>Enllaç per triar la contrasenya</label>
          <div className="enllac-contrasenya__fila">
            <input
              id={`${id}-enllac`}
              ref={input}
              className="form__input enllac-contrasenya__input"
              value={enllac}
              readOnly
              onFocus={(e) => e.target.select()}
            />
            <button type="button" className="btn btn--outline enllac-contrasenya__copia" onClick={copia}>Copia l&apos;enllaç</button>
          </div>
          <p className="enllac-contrasenya__avis">
            L&apos;enllaç és personal: qui el tingui pot triar la contrasenya d&apos;aquest compte. Fes-lo arribar només a aquesta persona i no el comparteixis enlloc més. Caduca al cap d&apos;una estona.
          </p>
          <p className="enllac-contrasenya__copiat" aria-live="polite">{estatCopia}</p>
        </>
      )}
    </section>
  );
}
