import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { votar, carregarRanking, ordreBarrejat } from '../../lib/propostes/votacio.js';
import { missatgeError } from '../../lib/propostes/errorsVotacio.js';
import BarraProgres from './BarraProgres.jsx';
import TargetaVot from './TargetaVot.jsx';
import PantallaFinalVot from './PantallaFinalVot.jsx';
import RankingTanda from './RankingTanda.jsx';
import IdentitatLinia from './IdentitatLinia.jsx';

// El dispositiu pot ser compartit: passat aquest temps amb la pantalla final o el rànquing a la vista,
// la identitat s'esborra sola.
const TEMPS_NETEJA_MS = 3 * 60 * 1000;

// Votació d'una tanda oberta per a un soci identificat. L'estat inicial (`estat`) és el de `estatVotacio`;
// si el pare el torna a carregar, remunta aquest component amb una `key` nova.
export default function VotacioTanda({
  identitat, tanda, propostesPerId, estat, setIdentitat, onError, onRecarregar,
}) {
  const { token, numeroSoci } = identitat;
  const ids = tanda.propostes;
  const total = ids.length;
  const ordre = useMemo(
    () => ordreBarrejat(ids.filter((id) => propostesPerId[id]), `${numeroSoci}-${tanda.id}`),
    [ids, propostesPerId, numeroSoci, tanda.id]
  );

  const [valors, setValors] = useState(estat.valors);
  const [bloquejat, setBloquejat] = useState(estat.bloquejat);
  const [ranking, setRanking] = useState(null);
  const [revisant, setRevisant] = useState(false);
  const [ocupat, setOcupat] = useState(false);
  const [confirmant, setConfirmant] = useState(false);
  const [errorConfirmar, setErrorConfirmar] = useState(null);
  // Fins que el soci no actua, no es mou el focus (càrrega inicial); després, cada canvi de targeta l'hi porta.
  const [enfocar, setEnfocar] = useState(false);
  const [index, setIndex] = useState(() => Math.max(0, ordre.findIndex((id) => !estat.valors[id])));

  const votats = ids.filter((id) => valors[id]).length;
  const completa = votats >= total;
  const pantallaFinal = completa && !revisant && !bloquejat;
  const netejaActiva = pantallaFinal || ranking !== null;

  // La capçalera del web és sticky i la seva alçada varia (a certes amplades el menú cau a una segona fila):
  // la barra de progrés s'enganxa just a sota (CSS `--alcada-capcalera`, 4rem per defecte).
  const arrel = useRef(null);
  const titolRankingRef = useRef(null);
  useLayoutEffect(() => {
    const mesura = () => {
      const alcada = document.querySelector('.site-header')?.offsetHeight;
      if (alcada) arrel.current?.style.setProperty('--alcada-capcalera', `${alcada}px`);
    };
    mesura();
    window.addEventListener('resize', mesura);
    return () => window.removeEventListener('resize', mesura);
  }, []);

  // En confirmar, el rànquing es porta a la vista i el focus al seu títol (sota la franja sticky).
  useEffect(() => {
    if (!ranking || !enfocar) return;
    titolRankingRef.current?.focus({ preventScroll: true });
    titolRankingRef.current?.scrollIntoView?.({ block: 'start' });
  }, [ranking, enfocar]);

  useEffect(() => {
    if (!netejaActiva) return undefined;
    const temporitzador = setTimeout(() => setIdentitat(null), TEMPS_NETEJA_MS);
    return () => clearTimeout(temporitzador);
  }, [netejaActiva, setIdentitat]);

  // Vots ja bloquejats (el soci torna després de veure el rànquing): es mostra el rànquing directament.
  useEffect(() => {
    if (!estat.bloquejat) return undefined;
    let actiu = true;
    carregarRanking(token, tanda.id)
      .then((resposta) => { if (actiu) setRanking(resposta.files); })
      .catch((error) => { if (actiu) onError(missatgeError(error, 'ranking')); });
    return () => { actiu = false; };
  }, [estat.bloquejat, token, tanda.id, onError]);

  const handleVot = async (valor) => {
    if (ocupat) return;
    const propostaId = ordre[index];
    onError(null);
    setOcupat(true);
    try {
      await votar(token, tanda.id, propostaId, valor);
      const nous = { ...valors, [propostaId]: valor };
      setValors(nous);
      const seguent = ordre.findIndex((id) => !nous[id]);
      if (seguent >= 0) setIndex(seguent);
      setEnfocar(true);
    } catch (error) {
      onError(missatgeError(error, 'vot'));
      if (error?.code === 'functions/failed-precondition') onRecarregar();
    } finally {
      setOcupat(false);
    }
  };

  const handleVeureRanking = async () => {
    if (confirmant) return;
    onError(null);
    setErrorConfirmar(null);
    setConfirmant(true);
    try {
      const resposta = await carregarRanking(token, tanda.id);
      setRanking(resposta.files);
      setBloquejat(true);
      setEnfocar(true);
    } catch (error) {
      const missatge = missatgeError(error, 'ranking');
      // L'error es veu a la barra de baix; si l'estat ha canviat al servidor, es recarrega (i es conserva el motiu a dalt).
      setErrorConfirmar(missatge);
      if (error?.code === 'functions/failed-precondition') {
        onError(missatge);
        onRecarregar();
      }
    } finally {
      setConfirmant(false);
    }
  };

  const handleRevisar = () => {
    setIndex(0);
    setRevisant(true);
    setErrorConfirmar(null);
    setEnfocar(true);
  };

  const handleCanviar = (propostaCanviadaId) => {
    setIndex(ordre.indexOf(propostaCanviadaId));
    setRevisant(true);
    setErrorConfirmar(null);
    setEnfocar(true);
  };

  const propostaId = ordre[index];
  const identitatLinia = <IdentitatLinia identitat={identitat} setIdentitat={setIdentitat} />;

  // Cap de les propostes de la tanda es pot mostrar: no es deixa la barra de progrés sola.
  if (ordre.length === 0) {
    return (
      <div className="votacio">
        <p className="votacio__buit">Ara mateix no hi ha propostes per votar.</p>
        {identitatLinia}
      </div>
    );
  }

  const targeta = propostaId && (
    <>
      <TargetaVot
        key={propostaId}
        proposta={propostesPerId[propostaId]}
        valor={valors[propostaId]}
        bloquejat={bloquejat || ocupat}
        onVotar={handleVot}
        enfocar={enfocar}
      />
      <div className="votacio__nav">
        <button type="button" className="votacio__enllac" disabled={index === 0} onClick={() => { setIndex(index - 1); setEnfocar(true); }}>
          Anterior
        </button>
        <button type="button" className="votacio__enllac" disabled={index >= ordre.length - 1} onClick={() => { setIndex(index + 1); setEnfocar(true); }}>
          Següent
        </button>
      </div>
    </>
  );

  return (
    <div className="votacio" ref={arrel}>
      <div className="votacio__capcalera">
        <div className="votacio__progres">
          <BarraProgres votats={votats} total={total} />
        </div>
        {identitatLinia}
        {revisant && !bloquejat && (
          <button type="button" className="votacio__enllac votacio__tornar" onClick={() => { setRevisant(false); setEnfocar(true); }}>
            Tornar al resum
          </button>
        )}
      </div>
      {bloquejat && ranking && (
        <RankingTanda files={ranking} propostes={propostesPerId} valors={valors} agraiment="definitiu" titolRef={titolRankingRef} />
      )}
      {!bloquejat && pantallaFinal && (
        <PantallaFinalVot
          propostes={ordre.map((id) => propostesPerId[id])}
          valors={valors}
          onCanviar={handleCanviar}
          onRevisar={handleRevisar}
          onVeureRanking={handleVeureRanking}
          enfocar={enfocar}
          confirmant={confirmant}
          error={errorConfirmar}
        />
      )}
      {!bloquejat && !pantallaFinal && targeta}
    </div>
  );
}
