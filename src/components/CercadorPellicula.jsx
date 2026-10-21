import { useEffect, useState } from 'react';
import { cercarPellicules } from '../lib/pellicules';

const RETARD_MS = 300;

// Cercador de pel·lícules de TMDB: només es pot triar una pel·lícula que hi
// existeixi (evita títols mal escrits o pel·lícules equivocades).
export default function CercadorPellicula({ token, valorInicial = '', triadaInicial = null, onTriar }) {
  const [consulta, setConsulta] = useState(valorInicial);
  const [resultats, setResultats] = useState([]);
  const [cercant, setCercant] = useState(false);
  const [error, setError] = useState(null);
  const [triada, setTriada] = useState(triadaInicial);
  const [activa, setActiva] = useState(0);

  useEffect(() => {
    if (triada || consulta.trim().length < 2) return undefined;
    let actiu = true;
    const temporitzador = setTimeout(() => {
      setCercant(true);
      setError(null);
      cercarPellicules(consulta.trim(), token)
        .then((trobades) => { if (actiu) { setResultats(trobades); setActiva(0); } })
        .catch(() => { if (actiu) setError("No s'ha pogut cercar. Torna-ho a provar."); })
        .finally(() => { if (actiu) setCercant(false); });
    }, RETARD_MS);
    return () => { actiu = false; clearTimeout(temporitzador); };
  }, [consulta, token, triada]);

  const resultatsVisibles = triada || consulta.trim().length < 2 ? [] : resultats;

  const handleTecla = (e) => {
    if (resultatsVisibles.length === 0) {
      if (e.key === 'Enter') e.preventDefault();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiva((i) => Math.min(i + 1, resultatsVisibles.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiva((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      triar(resultatsVisibles[activa]);
    }
  };

  const triar = (pellicula) => {
    setTriada(pellicula);
    onTriar(pellicula);
  };

  const canviar = () => {
    setTriada(null);
    onTriar(null);
  };

  return (
    <div className="cercador-pellicula">
      {triada ? (
        <div className="cercador-pellicula__triada">
          {triada.posterUrl && <img className="cercador-pellicula__cartell" src={triada.posterUrl} alt="" />}
          <span className="cercador-pellicula__nom">
            {triada.titol}{triada.any && ` (${triada.any})`}
          </span>
          <button type="button" className="cercador-pellicula__canviar" onClick={canviar}>Canviar</button>
        </div>
      ) : (
        <>
          <label className="cercador-pellicula__etiqueta" htmlFor="cercador-pellicula">Pel·lícula</label>
          <div className="cercador-pellicula__camp">
            <svg className="cercador-pellicula__lupa" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              id="cercador-pellicula"
              className="cercador-pellicula__input"
              type="search"
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              onKeyDown={handleTecla}
              placeholder="Cerca una pel·lícula…"
              autoComplete="off"
              role="combobox"
              aria-expanded={resultatsVisibles.length > 0}
              aria-controls="cercador-pellicula-llista"
            />
          </div>
          {cercant && <p className="cercador-pellicula__estat">Cercant…</p>}
          {error && <p className="form__error">{error}</p>}
          {!cercant && !error && consulta.trim().length >= 2 && resultatsVisibles.length === 0 && (
            <p className="cercador-pellicula__estat">No s'ha trobat cap pel·lícula amb aquest títol.</p>
          )}
          {resultatsVisibles.length > 0 && (
            <ul className="cercador-pellicula__llista" id="cercador-pellicula-llista" role="listbox">
              {resultatsVisibles.map((p, i) => (
                <li key={p.tmdbId} role="option" aria-selected={i === activa}>
                  <button
                    type="button"
                    className={`cercador-pellicula__resultat${i === activa ? ' cercador-pellicula__resultat--activa' : ''}`}
                    onClick={() => triar(p)}
                    onMouseEnter={() => setActiva(i)}
                  >
                    {p.posterUrl
                      ? <img className="cercador-pellicula__cartell" src={p.posterUrl} alt="" />
                      : <span className="cercador-pellicula__cartell cercador-pellicula__cartell--buit" />}
                    <span className="cercador-pellicula__nom">
                      {p.titol}{p.any && ` (${p.any})`}
                      {p.titolLocal && <span className="cercador-pellicula__local">{p.titolLocal}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
