import { useEffect, useRef } from 'react';
import IconaPolze from './IconaPolze.jsx';

const NOM_VOT = {
  like: "m'agrada",
  dislike: "no m'agrada",
};

// Resum dels vots (un cartell-botó per pel·lícula, amb el seu polze) abans de confirmar el tancament.
// Tocar un cartell porta a la fitxa per canviar-hi el vot. Amb `enfocar`, el focus passa al títol (en
// tornar de revisar els vots, o en completar-los). `confirmant` i `error` són de la confirmació.
export default function PantallaFinalVot({
  propostes, valors, onCanviar, onRevisar, onVeureRanking, enfocar = false, confirmant = false, error = null,
}) {
  const titolRef = useRef(null);
  useEffect(() => {
    if (!enfocar) return;
    titolRef.current?.focus({ preventScroll: true });
    titolRef.current?.scrollIntoView?.({ block: 'start' });
  }, [enfocar]);

  const votades = propostes.filter((p) => valors[p.id]);
  const agrada = votades.filter((p) => valors[p.id] === 'like').length;
  const noAgrada = votades.length - agrada;

  return (
    <section className="pantalla-final-vot">
      <h2 className="pantalla-final-vot__titol" ref={titolRef} tabIndex={-1}>El teu resum</h2>
      <p className="resum-vots__recompte">
        <span className="resum-vots__recompte-text">{agrada} m&apos;agrada i {noAgrada} no m&apos;agrada</span>
        <span aria-hidden="true">{agrada} 👍 · {noAgrada} 👎</span>
      </p>
      <ul className="resum-vots" role="list">
        {votades.map((p) => (
          <li key={p.id} className="resum-vots__element">
            <button
              type="button"
              className={`resum-vots__cartell resum-vots__cartell--${valors[p.id]}`}
              aria-label={`Canviar el vot de ${p.titol} (ara: ${NOM_VOT[valors[p.id]]})`}
              onClick={() => onCanviar(p.id)}
            >
              {p.imatgeUrl ? (
                <img className="resum-vots__imatge" src={p.imatgeUrl} alt="" />
              ) : (
                <span className="resum-vots__placeholder">
                  <span className="resum-vots__placeholder-titol">{p.titol}</span>
                </span>
              )}
              <span className="resum-vots__vot" aria-hidden="true">
                <IconaPolze omplert className="resum-vots__icona" />
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="pantalla-final-vot__barra">
        {error && <p className="pantalla-final-vot__error" role="alert">{error}</p>}
        <div className="pantalla-final-vot__fila">
          <p className="pantalla-final-vot__avis">Un cop confirmat, ja no podràs canviar els vots.</p>
          <div className="pantalla-final-vot__accions">
            <button type="button" className="votacio__enllac" onClick={onRevisar}>Revisar els meus vots</button>
            <button
              type="button"
              className="btn pantalla-final-vot__boto"
              onClick={onVeureRanking}
              disabled={confirmant}
            >
              {confirmant ? 'Confirmant…' : 'Confirmar i veure el rànquing'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
