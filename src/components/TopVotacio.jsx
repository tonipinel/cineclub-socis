import { Link } from 'react-router-dom';

const PODI = 3;

const textAccessible = ({ percent, likes, dislikes }) => (
  percent === null ? 'Sense vots' : `${percent} % de vots a favor, ${likes} a favor i ${dislikes} en contra`
);

export default function TopVotacio({ files, nivellTitol: Titol = 'h3' }) {
  return (
    <ol className="top-votacio">
      {files.map(({ id, titol, imatgeUrl, href, likes, dislikes, percent }, i) => {
        const classe = i < PODI ? `top-votacio__fila top-votacio__fila--podi top-votacio__fila--${i + 1}` : 'top-votacio__fila';
        const vots = likes + dislikes;
        return (
          <li key={id} className={classe} data-testid="resultat-proposta">
            <span className="top-votacio__posicio" role="img" aria-label={`Posició ${i + 1}`}>{i + 1}</span>
            <Link to={href} className="top-votacio__enllac-cartell" tabIndex={-1} aria-hidden="true">
              {imatgeUrl ? (
                <img className="top-votacio__cartell" src={imatgeUrl} alt="" loading="lazy" />
              ) : (
                <span className="top-votacio__cartell top-votacio__cartell--buit" data-testid="cartell-buit" aria-hidden="true" />
              )}
            </Link>
            <div className="top-votacio__cos">
              <Titol className="top-votacio__titol"><Link to={href} className="top-votacio__enllac">{titol}</Link></Titol>
              <div className="top-votacio__barra" aria-hidden="true">
                {vots > 0 && (
                  <>
                    <span className="top-votacio__barra-like" style={{ width: `${(likes / vots) * 100}%` }} />
                    <span className="top-votacio__barra-dislike" style={{ width: `${(dislikes / vots) * 100}%` }} />
                  </>
                )}
              </div>
              <p className="top-votacio__xifres" aria-hidden="true">
                <span>👍 {likes} · 👎 {dislikes}</span>
                {percent === null
                  ? <span className="top-votacio__sense-vots">Sense vots</span>
                  : <span className="top-votacio__percentatge">{percent}%</span>}
              </p>
              <span className="top-votacio__text-accessible">{textAccessible({ percent, likes, dislikes })}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
