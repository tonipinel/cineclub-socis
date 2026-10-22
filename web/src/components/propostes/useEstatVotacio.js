import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase/client.js';
import { triaTanda } from '../../lib/propostes/tandes.js';
import { carregarEstat, votar } from '../../lib/propostes/votacio.js';
import { esCarnetNoValid, missatgeError } from '../../lib/propostes/errorsVotacio.js';

const TEMPS_MAXIM_CARREGA_MS = 15000;

// Tanda oberta de Firestore per al visitant sense identificar, triada amb el mateix criteri que el
// servidor (`triaTanda`). Torna null si no n'hi ha cap d'oberta.
async function llegirTandaOberta() {
  const snap = await getDocs(collection(db, 'tandes'));
  const ara = new Date();
  const tanda = triaTanda(snap.docs.map((d) => ({ id: d.id, ...d.data() })), ara);
  if (!tanda) return null;
  const tanca = typeof tanda.tanca?.toDate === 'function' ? tanda.tanca.toDate() : new Date(tanda.tanca);
  if (!(tanca > ara)) return null;
  return { id: tanda.id, nom: tanda.nom, propostes: tanda.propostes ?? [] };
}

// Càrrega i estat de la votació compartits per /propostes/ i /propostes/votar/: les propostes
// aprovades, la tanda oberta (visitant) o l'estat del soci identificat (callable `estatVotacio`).
export function useEstatVotacio({ identitat, setIdentitat }) {
  const token = identitat?.token;
  const [propostes, setPropostes] = useState(null);
  const [propostesFallides, setPropostesFallides] = useState(false);
  const [tempsExhaurit, setTempsExhaurit] = useState(false);
  const [versioCarrega, setVersioCarrega] = useState(0);
  // undefined mentre es llegeix; null si no hi ha cap tanda oberta.
  const [tandaPublica, setTandaPublica] = useState(undefined);
  const [tandaFallida, setTandaFallida] = useState(false);
  const [estat, setEstat] = useState(null);
  const [estatFallit, setEstatFallit] = useState(false);
  const [versioEstat, setVersioEstat] = useState(0);
  const [error, setError] = useState(null);
  // Vot (👍/👎) que el visitant ha començat abans d'identificar-se: s'aplica quan es coneix l'estat de la tanda.
  const votPendentRef = useRef(null);

  useEffect(() => {
    getDocs(query(collection(db, 'propostes'), where('estat', 'in', ['aprovada', 'programada']))).then(
      (snap) => setPropostes(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setPropostesFallides(true)
    );
  }, [versioCarrega]);

  useEffect(() => {
    setTandaFallida(false);
    setTandaPublica(undefined);
    llegirTandaOberta().then(setTandaPublica, () => {
      setTandaPublica(null);
      setTandaFallida(true);
    });
  }, [versioCarrega]);

  useEffect(() => {
    setEstatFallit(false);
    if (!token) {
      setEstat(null);
      return undefined;
    }
    let actiu = true;
    (async () => {
      try {
        let dades = await carregarEstat(token);
        if (!actiu) return;
        const pendent = votPendentRef.current;
        votPendentRef.current = null;
        const { tanda } = dades;
        if (pendent && tanda && !tanda.tancada && !dades.bloquejat && tanda.propostes.includes(pendent.propostaId)) {
          try {
            await votar(token, tanda.id, pendent.propostaId, pendent.valor);
            dades = { ...dades, valors: { ...dades.valors, [pendent.propostaId]: pendent.valor } };
          } catch (errorVot) {
            setError(missatgeError(errorVot, 'vot'));
          }
        }
        if (actiu) setEstat({ dades, versio: versioEstat });
      } catch (errorEstat) {
        if (!actiu) return;
        setError(missatgeError(errorEstat, 'estat'));
        setEstatFallit(true);
        if (esCarnetNoValid(errorEstat)) setIdentitat(null);
      }
    })();
    return () => { actiu = false; };
  }, [token, versioEstat, setIdentitat]);

  const recarregarEstat = () => setVersioEstat((v) => v + 1);

  const tandaEstat = identitat && estat ? estat.dades.tanda : null;
  const votacio = !!tandaEstat && !tandaEstat.tancada && tandaEstat.propostes.length > 0;
  const tandaTancada = tandaEstat?.tancada ? tandaEstat : null;
  const carregantBrut = propostes === null
    || (identitat ? !estat && !estatFallit : tandaPublica === undefined);
  // Si la càrrega falla o no es resol, es mostra un error amb sortida (el mode immersiu no hi té cap).
  const carregaFallida = carregantBrut && (propostesFallides || tempsExhaurit);
  const carregant = carregantBrut && !carregaFallida;

  useEffect(() => {
    if (!carregantBrut) {
      setTempsExhaurit(false);
      return undefined;
    }
    const temporitzador = setTimeout(() => setTempsExhaurit(true), TEMPS_MAXIM_CARREGA_MS);
    return () => clearTimeout(temporitzador);
  }, [carregantBrut, versioCarrega]);

  const tornarAProvar = () => {
    setError(null);
    setPropostesFallides(false);
    setTempsExhaurit(false);
    setVersioCarrega((v) => v + 1);
    recarregarEstat();
  };

  const propostesPerId = useMemo(
    () => Object.fromEntries((propostes ?? []).map((p) => [p.id, p])),
    [propostes]
  );

  return {
    propostes,
    propostesPerId,
    tandaPublica,
    tandaFallida,
    estat,
    estatFallit,
    error,
    setError,
    votPendentRef,
    recarregarEstat,
    tornarAProvar,
    tandaEstat,
    votacio,
    tandaTancada,
    carregantBrut,
    carregaFallida,
    carregant,
  };
}
