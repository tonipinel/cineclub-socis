import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { carregarRankingPublic } from '../../lib/propostes/votacio.js';
import { formatData } from '../../lib/propostes/data.js';
import Carregant from './Carregant.jsx';
import CartellPelicula from './CartellPelicula.jsx';

// Darrera tanda tancada: les pel·lícules i el seu nivell d'acceptació (% de 👍), sense posicions ni ordre de
// classificació (van per ordre alfabètic): la programació no surt només dels vots i un «top» fora de votació
// podria fer pensar el contrari. Mai es mostra qui va votar què.
export default function UltimaTanda({ tanda, propostesPerId, beneficis = [], iconaSocia = '' }) {
  const [files, setFiles] = useState(null);
  const [fallida, setFallida] = useState(false);
  const [intent, setIntent] = useState(0);

  useEffect(() => {
    let actiu = true;
    setFiles(null);
    setFallida(false);
    carregarRankingPublic(tanda.id).then(
      (resposta) => { if (actiu) setFiles(resposta.files); },
      () => { if (actiu) setFallida(true); }
    );
    return () => { actiu = false; };
  }, [tanda.id, intent]);

  const titol = (fila) => propostesPerId?.[fila.propostaId]?.titol ?? '';
  const pelicules = (files ?? [])
    .filter((fila) => propostesPerId?.[fila.propostaId])
    .sort((a, b) => titol(a).localeCompare(titol(b), 'ca'));

  const bloc = (
    <div className="membership-teaser-wrapper">
      <section className="membership-teaser" aria-labelledby="participa-titol">
        {iconaSocia && <img className="membership-teaser__icon" src={iconaSocia} alt="" />}
        <h2 className="membership-teaser__title" id="participa-titol">Fes-te sòcia/soci!</h2>
        {beneficis.length > 0 && (
          <ul className="membership-teaser__list">
            {beneficis.map((b) => <li key={b}>{b}</li>)}
          </ul>
        )}
        <a className="btn tanda-publica__socia" href="/fes-te-socia/">Fes-te sòcia/soci</a>
      </section>
    </div>
  );
  // Fora de `.propostes-app` (fons blanc) perquè es vegi el patró del fons com a la portada; sense el forat de la pàgina, a continuació.
  const desti = typeof document === 'undefined' ? null : document.getElementById('propostes-participa');

  return (
    <>
    <section className="tanda-publica" aria-labelledby="tanda-publica-titol">
      <h2 className="tanda-publica__titol" id="tanda-publica-titol">Últimes pel·lícules valorades per les persones sòcies</h2>
      <p className="tanda-publica__text">
        Aquesta va ser l&apos;última tanda de pel·lícules; va tancar el {formatData(tanda.tanca)}.
      </p>
      <p className="tanda-publica__text">
        Les persones sòcies i la junta proposem pel·lícules; amb aquestes propostes es creen les tandes, que
        votem les persones sòcies. Després, amb l&apos;acceptació que ha tingut cada pel·lícula i altres criteris de
        programació (cost dels drets, idioma, gènere…), la junta crea la programació del trimestre. Aquí teniu
        el nivell d&apos;acceptació de cada una; no és un rànquing, perquè no es programa només per ordre de vots. Vols participar en la programació del Cineclub?
      </p>
      {fallida && (
        <div className="tanda-publica__fallada">
          <p className="form__error" role="alert">No s&apos;ha pogut carregar el nivell d&apos;acceptació.</p>
          <button type="button" className="btn" onClick={() => setIntent((i) => i + 1)}>Tornar-ho a provar</button>
        </div>
      )}
      {!fallida && !files && <div className="tanda-publica__carregant" role="status"><Carregant /></div>}
      {pelicules.length > 0 && (
        <ul className="acceptacio-tanda" aria-label="Acceptació de les pel·lícules de la tanda">
          {pelicules.map((fila) => (
            <li key={fila.propostaId} className="acceptacio-tanda__pelicula">
              <CartellPelicula proposta={propostesPerId[fila.propostaId]} className="acceptacio-tanda__cartell" loading="lazy" ample={300} />
              <span className="acceptacio-tanda__titol">{titol(fila)}</span>
              {fila.percentatge === null ? (
                <span className="acceptacio-tanda__poc">Pocs vots</span>
              ) : (
                <div className="acceptacio-tanda__consens">
                  <span className="acceptacio-tanda__percentatge">{fila.percentatge} %</span>
                  <div className="acceptacio-tanda__barra" aria-hidden="true">
                    <div className="acceptacio-tanda__barra-ple" style={{ width: `${fila.percentatge}%` }} />
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
    {desti ? createPortal(bloc, desti) : bloc}
    </>
  );
}
