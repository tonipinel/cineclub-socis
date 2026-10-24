import { useState } from 'react';
import { carregarRanking } from '../../lib/propostes/votacio.js';
import { missatgeError } from '../../lib/propostes/errorsVotacio.js';
import RankingTanda from './RankingTanda.jsx';

// Accés al rànquing final d'una tanda tancada per a un soci identificat. `valors` són els vots del soci en
// aquella tanda (si en té, es mostren a cada fila i s'hi afegeix un agraïment).
export default function RankingTancat({ token, tandaId, propostesPerId, valors, onError }) {
  const [files, setFiles] = useState(null);

  const handleVeure = async () => {
    onError(null);
    try {
      const resposta = await carregarRanking(token, tandaId);
      setFiles(resposta.files);
    } catch (error) {
      onError(missatgeError(error, 'ranking'));
    }
  };

  if (!files) {
    return (
      <button type="button" className="btn propostes-public__ranking-boto" onClick={handleVeure}>
        Veure el rànquing de la darrera tanda de pel·lícules
      </button>
    );
  }
  return (
    <div className="propostes-public__ranking">
      <h2 className="propostes-public__ranking-titol">Rànquing de la darrera tanda de pel·lícules</h2>
      <RankingTanda
        files={files}
        propostes={propostesPerId}
        valors={valors}
        agraiment={Object.keys(valors ?? {}).length > 0 ? 'final' : undefined}
      />
      <button type="button" className="propostes-public__ranking-tancar" onClick={() => setFiles(null)}>
        Tancar el rànquing
      </button>
    </div>
  );
}
