import IconaPolze from './IconaPolze.jsx';
import TitolLocal from './TitolLocal.jsx';

const AGRAIMENTS = {
  definitiu: {
    titol: 'Gràcies per participar!',
    text: 'Els teus vots ja són definitius i ens ajudaran a triar les properes pel·lícules del Cineclub.',
  },
  final: { text: 'Gràcies per participar! Aquest és el resultat final de la tanda.' },
};

const ETIQUETA_VOT = {
  like: "El teu vot: m'agrada",
  dislike: "El teu vot: no m'agrada",
};

const PODI = 3;

// Rànquing de la tanda: només ordre i percentatge de 👍 (mai recomptes absoluts). `valors` (opcional)
// són els vots del soci, que es mostren com un polze a cada fila. `agraiment`: 'definitiu' (vots
// bloquejats de la tanda oberta) o 'final' (tanda tancada); `titolRef` enfoca el títol d'agraïment.
export default function RankingTanda({ files, propostes, valors, agraiment, titolRef }) {
  const llista = Array.isArray(propostes) ? propostes : Object.values(propostes ?? {});
  const perId = Object.fromEntries(llista.map((p) => [p.id, p]));
  const gracies = AGRAIMENTS[agraiment];
  return (
    <div className="ranking-tanda">
      {gracies && (
        <div className="ranking-tanda__agraiment">
          {gracies.titol && (
            <h2 className="ranking-tanda__agraiment-titol" ref={titolRef} tabIndex={-1}>
              {gracies.titol} <span aria-hidden="true">🎬</span>
            </h2>
          )}
          <p className="ranking-tanda__agraiment-text">{gracies.text}</p>
        </div>
      )}
      <ol className="ranking-tanda__llista">
        {files.map((fila, i) => {
          const proposta = perId[fila.propostaId];
          const vot = valors?.[fila.propostaId];
          return (
            <li key={fila.propostaId} className="ranking-tanda__fila">
              {proposta?.imatgeUrl ? (
                <img className="ranking-tanda__cartell" src={proposta.imatgeUrl} alt="" loading="lazy" />
              ) : (
                <div className="ranking-tanda__cartell ranking-tanda__cartell-placeholder" aria-hidden="true">🎬</div>
              )}
              <span className={`ranking-tanda__posicio ${i < PODI ? 'ranking-tanda__posicio--podi' : ''}`}>{i + 1}</span>
              <div className="ranking-tanda__info">
                <span className="ranking-tanda__titol">{proposta?.titol || 'Proposta retirada'}</span>
                {proposta && <TitolLocal proposta={proposta} className="ranking-tanda__titol-local" />}
                {fila.percentatge === null ? (
                  <span className="ranking-tanda__poc">pocs vots</span>
                ) : (
                  <div className="ranking-tanda__consens">
                    <span className="ranking-tanda__percentatge">{fila.percentatge} %</span>
                    <div className="ranking-tanda__barra" aria-hidden="true">
                      <div className="ranking-tanda__barra-ple" style={{ width: `${fila.percentatge}%` }} />
                    </div>
                  </div>
                )}
              </div>
              {ETIQUETA_VOT[vot] && (
                <span className={`ranking-tanda__vot ranking-tanda__vot--${vot}`}>
                  <IconaPolze omplert className="ranking-tanda__icona" />
                  <span className="ranking-tanda__vot-text">{ETIQUETA_VOT[vot]}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
