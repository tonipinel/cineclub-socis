import { useEffect, useState } from 'react';
import CartellPelicula from './CartellPelicula.jsx';
import FitxaPellicula from './FitxaPellicula.jsx';
import TrailerPellicula from './TrailerPellicula.jsx';
import TitolLocal from './TitolLocal.jsx';
import { useDialegModal } from './useDialegModal.js';

const URL_IMATGES_TMDB = 'https://image.tmdb.org/t/p';

// Fitxa que veu un soci per decidir si vol veure la pel·lícula: què és (any,
// durada, gèneres), el tràiler, de què va, qui la recomana i per què, i qui
// hi participa.
// `titolRef` deixa que qui la fa servir hi mogui el focus; `senseProposant` amaga «Proposada per»
// quan el contenidor ja ho diu (el detall públic).
export default function FitxaPublica({ proposta, titolRef, senseProposant = false }) {
  const imatges = proposta.imatges ?? [];
  const [obertaIndex, setObertaIndex] = useState(null);

  useEffect(() => {
    if (obertaIndex === null) return undefined;
    const handler = (e) => {
      if (e.key === 'ArrowRight') setObertaIndex((i) => (i + 1) % imatges.length);
      if (e.key === 'ArrowLeft') setObertaIndex((i) => (i - 1 + imatges.length) % imatges.length);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [obertaIndex, imatges.length]);

  const resum = [proposta.any, proposta.durada ? `${proposta.durada} min` : null, proposta.paisos?.join(', ')]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="fitxa-publica">
      <header className="fitxa-publica__hero">
        <h2 className="fitxa-publica__titol" ref={titolRef} tabIndex={titolRef ? -1 : undefined}>{proposta.titol}</h2>
        <TitolLocal proposta={proposta} className="fitxa-publica__titol-local" />
        {resum && <p className="fitxa-publica__resum">{resum}</p>}
        {proposta.generes?.length > 0 && (
          <ul className="fitxa-publica__generes">
            {proposta.generes.map((g) => <li key={g} className="fitxa-publica__genere">{g}</li>)}
          </ul>
        )}
        {proposta.nomProposant && !senseProposant && (
          <p className="fitxa-publica__proposant">
            Proposada per <strong className="fitxa-publica__proposant-nom">{proposta.nomProposant}</strong>
          </p>
        )}
        {proposta.lema && <p className="fitxa-publica__lema">{proposta.lema}</p>}
      </header>
      <div className="fitxa-publica__cos">
        <CartellPelicula proposta={proposta} className="fitxa-publica__cartell" />
        <div className="fitxa-publica__contingut">
          {proposta.trailerUrl && <TrailerPellicula url={proposta.trailerUrl} titol={proposta.titol} />}
          {proposta.sinopsi && <p className="fitxa-publica__sinopsi">{proposta.sinopsi}</p>}
          {proposta.comentari && (
            <blockquote className="fitxa-publica__recomanacio">
              <p className="fitxa-publica__recomanacio-text">{proposta.comentari}</p>
              {proposta.nomProposant && (
                <footer className="fitxa-publica__recomanacio-autor">— {proposta.nomProposant}</footer>
              )}
            </blockquote>
          )}
          <FitxaPellicula proposta={proposta} ambTitol={false} ambBasics={false} />
        </div>
        {imatges.length > 0 && (
          <div className="fitxa-publica__galeria">
            {imatges.map((cami, index) => (
              <button key={cami} type="button" className="fitxa-publica__escena" onClick={() => setObertaIndex(index)} aria-label="Ampliar la imatge">
                <img className="fitxa-publica__imatge" src={`${URL_IMATGES_TMDB}/w500${cami}`} alt={`Imatge de ${proposta.titol}`} loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>
      {obertaIndex !== null && (
        <ModalImatge
          proposta={proposta}
          imatges={imatges}
          index={obertaIndex}
          onCanviar={setObertaIndex}
          onTancar={() => setObertaIndex(null)}
        />
      )}
    </div>
  );
}

// Imatge ampliada (diàleg modal: Escape la tanca, i el focus torna a la miniatura).
function ModalImatge({ proposta, imatges, index, onCanviar, onTancar }) {
  const ref = useDialegModal(onTancar);
  return (
    <div
      className="fitxa-publica__modal"
      role="dialog"
      aria-modal="true"
      aria-label={`Imatge de ${proposta.titol}`}
      tabIndex={-1}
      ref={ref}
      onClick={onTancar}
    >
      <button type="button" className="fitxa-publica__modal-tancar" onClick={onTancar} aria-label="Tancar la imatge">
        ✕
      </button>
      {imatges.length > 1 && (
        <button
          type="button"
          className="fitxa-publica__modal-fletxa fitxa-publica__modal-fletxa--anterior"
          onClick={(e) => { e.stopPropagation(); onCanviar((index - 1 + imatges.length) % imatges.length); }}
          aria-label="Imatge anterior"
        >
          ‹
        </button>
      )}
      <img
        className="fitxa-publica__modal-imatge"
        src={`${URL_IMATGES_TMDB}/w1280${imatges[index]}`}
        alt={`Imatge ampliada de ${proposta.titol}`}
        onClick={(e) => e.stopPropagation()}
      />
      {imatges.length > 1 && (
        <button
          type="button"
          className="fitxa-publica__modal-fletxa fitxa-publica__modal-fletxa--seguent"
          onClick={(e) => { e.stopPropagation(); onCanviar((index + 1) % imatges.length); }}
          aria-label="Imatge següent"
        >
          ›
        </button>
      )}
    </div>
  );
}
