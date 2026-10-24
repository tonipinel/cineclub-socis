import { useEffect, useState } from 'react';
import { carregarRankingPublic } from '../../lib/propostes/votacio.js';
import { formatData } from '../../lib/propostes/data.js';
import Carregant from './Carregant.jsx';
import RankingTanda from './RankingTanda.jsx';

// Darrera tanda tancada amb el rànquing públic (ordre i percentatge, mai qui va votar què). `valors` són
// els vots del soci identificat en aquesta tanda, si en té: només ell els veu, a cada fila.
export default function UltimaTanda({ tanda, propostesPerId, valors }) {
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

  return (
    <section className="tanda-publica" aria-labelledby="tanda-publica-titol">
      <h2 className="tanda-publica__titol" id="tanda-publica-titol">Última tanda: {tanda.nom}</h2>
      <p className="tanda-publica__text">
        Aquesta va ser l&apos;última tanda; va tancar el {formatData(tanda.tanca)}.
      </p>
      {fallida && (
        <div className="tanda-publica__fallada">
          <p className="form__error" role="alert">No s&apos;ha pogut carregar el rànquing.</p>
          <button type="button" className="btn" onClick={() => setIntent((i) => i + 1)}>Tornar-ho a provar</button>
        </div>
      )}
      {!fallida && !files && <div className="tanda-publica__carregant" role="status"><Carregant /></div>}
      {files && (
        <RankingTanda
          files={files}
          propostes={propostesPerId}
          valors={valors}
          agraiment={Object.keys(valors ?? {}).length > 0 ? 'final' : undefined}
        />
      )}
    </section>
  );
}
