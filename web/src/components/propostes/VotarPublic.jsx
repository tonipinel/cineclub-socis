import { useIdentitatPublica } from '../../auth/useIdentitatPublica.js';
import { useEstatVotacio } from './useEstatVotacio.js';
import LectorCarnet from './LectorCarnet.jsx';
import Carregant from './Carregant.jsx';
import VotacioTanda from './VotacioTanda.jsx';
import FalladaCarrega from './FalladaCarrega.jsx';
import AvisPrivacitat from './AvisPrivacitat.jsx';
import RankingTancat from './RankingTancat.jsx';
import IdentitatLinia from './IdentitatLinia.jsx';

// Pàgina compartible per WhatsApp: primer demana el carnet i després porta directament a votar
// pel·lícula per pel·lícula (el mateix mode immersiu de /propostes/).
export default function VotarPublic() {
  const { identitat, setIdentitat } = useIdentitatPublica();
  const token = identitat?.token;
  const {
    propostesPerId, tandaPublica, tandaFallida, estat, estatFallit, error, setError,
    recarregarEstat, tornarAProvar, tandaEstat, votacio, tandaTancada, carregant, carregaFallida,
  } = useEstatVotacio({ identitat, setIdentitat });

  const handleIdentificat = (nova) => {
    setError(null);
    setIdentitat(nova);
  };

  const fallada = carregaFallida || (identitat ? estatFallit : tandaFallida);

  if (identitat && carregant) {
    return <div className="propostes-public propostes-public--immersiu"><Carregant /></div>;
  }

  if (identitat && votacio && !fallada) {
    return (
      <div className="propostes-public propostes-public--immersiu">
        {error && <p className="form__error">{error}</p>}
        <VotacioTanda
          key={`${token}-${estat.versio}`}
          identitat={identitat}
          tanda={tandaEstat}
          propostesPerId={propostesPerId}
          estat={estat.dades}
          setIdentitat={setIdentitat}
          onError={setError}
          onRecarregar={recarregarEstat}
        />
        <AvisPrivacitat />
      </div>
    );
  }

  const senseVotacio = identitat ? !fallada : tandaPublica === null && !fallada;
  // El lector (que demana la càmera) només es munta quan se sap que hi ha una tanda oberta.
  const esperantTanda = !identitat && tandaPublica === undefined && !fallada;
  const nomTanda = tandaPublica?.nom;

  return (
    <div className="votar">
      {error && !fallada && <p className="form__error">{error}</p>}

      {fallada && (
        <FalladaCarrega onTornarAProvar={tornarAProvar} onSortir={identitat ? () => setIdentitat(null) : undefined} />
      )}

      {senseVotacio && (
        <>
          <h1 className="votar__titol">Ara mateix no hi ha cap votació oberta.</h1>
          {identitat && <IdentitatLinia identitat={identitat} setIdentitat={setIdentitat} sola />}
          {tandaTancada && (
            <RankingTancat
              token={token}
              tandaId={tandaTancada.id}
              propostesPerId={propostesPerId}
              valors={estat?.dades?.valors}
              onError={setError}
            />
          )}
          <a className="btn" href="/propostes/">Veure les propostes</a>
        </>
      )}

      {esperantTanda && <Carregant />}

      {!fallada && !senseVotacio && !esperantTanda && (
        <>
          <h1 className="votar__titol">
            {nomTanda ? `Vota les propostes de ${nomTanda}` : 'Vota les propostes del Cineclub'}
          </h1>
          <p className="votar__text">Escaneja el teu carnet de soci/a per començar. Només et portarà un moment.</p>
          <LectorCarnet onIdentificat={handleIdentificat} />
          <p className="votar__registre">
            Encara no ets soci/a?{' '}
            <a className="enllac" href="/fes-te-socia/">Fes-te soci/a</a>
          </p>
          <AvisPrivacitat />
        </>
      )}
    </div>
  );
}
