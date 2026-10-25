import { resizedUrl } from '../../lib/images.js';
import IconaPolze from './IconaPolze.jsx';
import TitolLocal from './TitolLocal.jsx';

const AGRAIMENTS = {
  definitiu: {
    titol: 'Gràcies per participar!',
    text: 'Els teus vots ja són definitius i ens ajudaran a triar les properes pel·lícules del Cineclub.',
  },
  final: { text: 'Gràcies per participar! Aquest és el resultat final de la tanda de pel·lícules.' },
};

const ETIQUETA_VOT = {
  like: "El teu vot: m'agrada",
  dislike: "El teu vot: no m'agrada",
};

const PODI = 3;
// Mínim de vots per pel·lícula perquè entri al rànquing (el servidor, `calcularRanking`, retorna `percentatge: null` per sota).
const MINIM_VOTS = 5;

// Rànquing de la tanda: només ordre i percentatge de 👍 (mai recomptes absoluts). `valors` (opcional)
// són els vots del soci, que es mostren com un polze a cada fila. `agraiment`: 'definitiu' (vots
// bloquejats de la tanda oberta) o 'final' (tanda tancada); `titolRef` enfoca el títol d'agraïment.
function Fila({ fila, proposta, vot, posicio }) {
  return (
    <li className={`ranking-tanda__fila ${posicio ? '' : 'ranking-tanda__fila--sense-posicio'}`}>
      {proposta?.imatgeUrl ? (
        <img className="ranking-tanda__cartell" src={resizedUrl(proposta.imatgeUrl, 200)} alt="" loading="lazy" />
      ) : (
        <div className="ranking-tanda__cartell ranking-tanda__cartell-placeholder" aria-hidden="true">🎬</div>
      )}
      {posicio && (
        <span className={`ranking-tanda__posicio ${posicio <= PODI ? 'ranking-tanda__posicio--podi' : ''}`}>{posicio}</span>
      )}
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
}

// Només les files amb percentatge (prou vots) formen el rànquing numerat; les altres van en un grup apart,
// sense posició ni medalla, perquè no sembli que tenen un ordre.
export default function RankingTanda({ files, propostes, valors, agraiment, titolRef }) {
  const llista = Array.isArray(propostes) ? propostes : Object.values(propostes ?? {});
  const perId = Object.fromEntries(llista.map((p) => [p.id, p]));
  const gracies = AGRAIMENTS[agraiment];
  const ambPercentatge = files.filter((f) => f.percentatge !== null);
  const sensePercentatge = files.filter((f) => f.percentatge === null);
  const fila = (f, posicio) => (
    <Fila key={f.propostaId} fila={f} proposta={perId[f.propostaId]} vot={valors?.[f.propostaId]} posicio={posicio} />
  );
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
      {ambPercentatge.length === 0 ? (
        <p className="ranking-tanda__buit">Encara no hi ha prou vots per mostrar un rànquing.</p>
      ) : (
        <ol className="ranking-tanda__llista">{ambPercentatge.map((f, i) => fila(f, i + 1))}</ol>
      )}
      {sensePercentatge.length > 0 && (
        <section className="ranking-tanda__pocs">
          <h3 className="ranking-tanda__pocs-titol">Encara sense prou vots per ordenar</h3>
          <p className="ranking-tanda__pocs-text">
            Cal un mínim de {MINIM_VOTS} vots per pel·lícula perquè entri al rànquing.
          </p>
          <ul className="ranking-tanda__llista" role="list">{sensePercentatge.map((f) => fila(f))}</ul>
        </section>
      )}
    </div>
  );
}
