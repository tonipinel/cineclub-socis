import { useEffect, useRef } from 'react';
import FitxaPublica from './FitxaPublica.jsx';
import IconaPolze from './IconaPolze.jsx';

function BotoVot({ valor, actual, bloquejat, onVotar, etiqueta, avall }) {
  const activa = actual === valor;
  return (
    <button
      type="button"
      className={`targeta-vot__boto ${activa ? 'targeta-vot__boto--activa' : ''}`}
      aria-pressed={activa}
      aria-label={etiqueta}
      disabled={bloquejat}
      onClick={() => onVotar(valor)}
    >
      <IconaPolze omplert={activa} className={`targeta-vot__icona ${avall ? 'targeta-vot__icona--avall' : ''}`} />
      <span className="targeta-vot__etiqueta" aria-hidden="true">{etiqueta}</span>
    </button>
  );
}

const ESTATS = {
  like: "El teu vot: M'agrada",
  dislike: "El teu vot: No m'agrada",
};

// Fitxa completa de la proposta i, enganxada a baix, la barra per votar-la.
// Amb `enfocar`, en canviar de proposta (o en muntar-se) el focus passa al títol i
// la fitxa es veu des de dalt: el botó que s'acaba de prémer ja no hi és o ja no toca.
export default function TargetaVot({ proposta, valor, bloquejat = false, onVotar, enfocar = false }) {
  const targetaRef = useRef(null);
  const titolRef = useRef(null);

  useEffect(() => {
    if (!enfocar) return;
    titolRef.current?.focus({ preventScroll: true });
    targetaRef.current?.scrollIntoView?.({ block: 'start' });
  }, [proposta.id, enfocar]);

  return (
    <article className="targeta-vot" ref={targetaRef}>
      <FitxaPublica proposta={proposta} titolRef={titolRef} />
      <div className="targeta-vot__barra">
        <p className="targeta-vot__estat">{ESTATS[valor] ?? 'Encara no has votat aquesta'}</p>
        <div className="targeta-vot__accions">
          <BotoVot valor="dislike" actual={valor} bloquejat={bloquejat} onVotar={onVotar} etiqueta="No m'agrada" avall />
          <BotoVot valor="like" actual={valor} bloquejat={bloquejat} onVotar={onVotar} etiqueta="M'agrada" />
        </div>
      </div>
    </article>
  );
}
