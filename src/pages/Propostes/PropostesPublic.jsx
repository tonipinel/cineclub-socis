import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, doc, getDoc, getDocs, query, serverTimestamp, addDoc, setDoc, deleteDoc, where,
} from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import { useIdentitatPublica } from '../../auth/useIdentitatPublica';
import { formatData } from '../../lib/data';
import { ordenarPerVots } from '../../lib/propostes';
import LectorCarnet from '../../components/LectorCarnet';
import Carregant from '../../components/Carregant';

function IconaPolze({ omplert, className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={omplert ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3Zm0 0 4.5-7.5a1.5 1.5 0 0 1 2.7.9L13.5 9H19a2 2 0 0 1 1.9 2.7l-2.3 6.5A2 2 0 0 1 16.7 20H7" />
    </svg>
  );
}

function IconaPlay({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5v7l6-3.5-6-3.5Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function AccionsVot({ proposta, onVotar, ambText }) {
  const classeAccio = `proposta-carta__accio ${ambText ? 'proposta-carta__accio--ample' : ''}`;
  return (
    <div className="proposta-carta__footer">
      <div className="proposta-carta__vot-bloc">
        <button
          type="button"
          className={`${classeAccio} ${proposta.heVotat ? 'proposta-carta__accio--activa' : ''}`}
          onClick={onVotar}
          aria-label={proposta.heVotat ? 'Has votat, treure el vot' : 'Votar'}
          aria-pressed={proposta.heVotat}
        >
          <IconaPolze className="proposta-carta__accio-icona" omplert={proposta.heVotat} />
          {ambText && <span>{proposta.heVotat ? 'Has votat' : 'Votar'}</span>}
        </button>
        <span className="proposta-carta__vots">{proposta.vots}</span>
      </div>
      {proposta.trailerUrl && (
        <a
          className={classeAccio}
          href={proposta.trailerUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Veure tràiler"
        >
          <IconaPlay className="proposta-carta__accio-icona" />
          {ambText && <span>Tràiler</span>}
        </a>
      )}
    </div>
  );
}

function CartellPelicula({ proposta, className }) {
  return proposta.imatgeUrl ? (
    <img className={className} src={proposta.imatgeUrl} alt={proposta.titol} />
  ) : (
    <div className={`${className} proposta-carta__cartell-placeholder`}>{proposta.titol}</div>
  );
}

export default function PropostesPublic() {
  const navigate = useNavigate();
  const { identitat, setIdentitat } = useIdentitatPublica();
  const [propostes, setPropostes] = useState(null);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [propostaPendent, setPropostaPendent] = useState(null);
  const [volProposar, setVolProposar] = useState(false);
  const [propostaObertaId, setPropostaObertaId] = useState(() => window.location.hash.slice(1) || null);
  const identitatRevisadaRef = useRef(null);

  useEffect(() => {
    const handler = () => setPropostaObertaId(window.location.hash.slice(1) || null);
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  useEffect(() => {
    getDocs(query(collection(db, 'propostes'), where('estat', '==', 'aprovada'))).then((snap) => {
      const base = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return Promise.all(base.map((p) => (
        getDocs(collection(db, 'propostes', p.id, 'vots')).then((votsSnap) => ({
          ...p, vots: votsSnap.docs.length, heVotat: false,
        }))
      )));
    }).then((ambVots) => setPropostes(ordenarPerVots(ambVots)));
  }, []);

  // Si la identitat ja es coneixia (compartida entre pàgines) quan aquest
  // component es munta, el carregament de dalt sempre parteix de heVotat:
  // false — cal revisar-ho de nou aquí, un cop per identitat, perquè la
  // llista i el botó de votar mostrin l'estat real des del primer moment
  // (sense esperar a un escaneig nou que no arribarà).
  useEffect(() => {
    if (!identitat || !propostes) return undefined;
    if (identitatRevisadaRef.current === identitat.numeroSoci) return undefined;
    identitatRevisadaRef.current = identitat.numeroSoci;
    let actiu = true;
    Promise.all(propostes.map(async (p) => {
      const votSnap = await getDoc(doc(db, 'propostes', p.id, 'vots', String(identitat.numeroSoci)));
      return { ...p, heVotat: votSnap.exists() };
    })).then((actualitzades) => {
      if (actiu) setPropostes(ordenarPerVots(actualitzades));
    });
    return () => { actiu = false; };
  }, [identitat, propostes]);

  useEffect(() => {
    if (!propostaObertaId) return undefined;
    document.body.classList.add('proposta-detall-obert-body');
    return () => document.body.classList.remove('proposta-detall-obert-body');
  }, [propostaObertaId]);

  const alternarVot = async (proposta, identitatUsada) => {
    setError(null);
    const votRef = doc(db, 'propostes', proposta.id, 'vots', String(identitatUsada.numeroSoci));
    const nouHeVotat = !proposta.heVotat;
    try {
      if (proposta.heVotat) {
        await deleteDoc(votRef);
        await addDoc(collection(db, 'propostesActivitat'), {
          tipus: 'desvot', propostaId: proposta.id, numeroSoci: identitatUsada.numeroSoci, timestamp: serverTimestamp(),
        });
      } else {
        await setDoc(votRef, { timestamp: serverTimestamp(), token: identitatUsada.token });
        await addDoc(collection(db, 'propostesActivitat'), {
          tipus: 'vot', propostaId: proposta.id, numeroSoci: identitatUsada.numeroSoci, timestamp: serverTimestamp(),
        });
      }
      setPropostes((actual) => ordenarPerVots(actual.map((p) => (
        p.id === proposta.id ? { ...p, heVotat: nouHeVotat, vots: p.vots + (nouHeVotat ? 1 : -1) } : p
      ))));
    } catch {
      setError("No s'ha pogut registrar el vot. Torna-ho a provar.");
    }
  };

  const handleVotarClick = (proposta) => {
    setInfo(null);
    if (identitat) {
      if (proposta.heVotat && !window.confirm('Ja havies votat aquesta pel·lícula. Vols retirar el teu vot?')) return;
      alternarVot(proposta, identitat);
    } else {
      setPropostaPendent(proposta);
    }
  };

  const handleIdentificat = async (nova) => {
    setIdentitat(nova);
    setError(null);
    setInfo(null);
    let llistaActual = propostes;
    if (propostes) {
      const actualitzades = await Promise.all(propostes.map(async (p) => {
        const votSnap = await getDoc(doc(db, 'propostes', p.id, 'vots', String(nova.numeroSoci)));
        return { ...p, heVotat: votSnap.exists() };
      }));
      llistaActual = ordenarPerVots(actualitzades);
      setPropostes(llistaActual);
    }
    if (propostaPendent) {
      const propostaReal = llistaActual?.find((p) => p.id === propostaPendent.id) ?? propostaPendent;
      if (propostaReal.heVotat) {
        setInfo(
          `Ja havies votat "${propostaReal.titol}". Si vols, pots aprofitar per votar altres propostes.`
        );
      } else {
        await alternarVot(propostaReal, nova);
      }
      setPropostaPendent(null);
    }
    if (volProposar) {
      setVolProposar(false);
      navigate(ROUTES.PROPOSTES_PROPOSAR);
    }
  };

  const handleProposarClick = () => {
    if (identitat) {
      navigate(ROUTES.PROPOSTES_PROPOSAR);
    } else {
      setVolProposar(true);
    }
  };

  const propostaOberta = propostes?.find((p) => p.id === propostaObertaId) ?? null;

  const obrirProposta = (id) => {
    // eslint-disable-next-line react-hooks/immutability -- pushes a shareable/history-friendly URL, mirrors the hashchange listener above
    window.location.hash = id;
  };

  const tancarProposta = () => {
    history.pushState(null, '', window.location.pathname + window.location.search);
    setPropostaObertaId(null);
  };

  return (
    <div className="propostes-public">
      <header className="propostes-public__capcalera">
        <span className="propostes-public__marca">Propostes de pel·lícules</span>
        <button type="button" className="btn propostes-public__proposar-boto" onClick={handleProposarClick}>
          + Proposar
        </button>
      </header>

      {error && <p className="form__error">{error}</p>}
      {info && <p className="propostes-public__info">{info}</p>}

      {propostes === null && <Carregant />}

      {propostes !== null && (
        propostes.length === 0 ? (
          <p className="propostes-public__buit">
            Encara no hi ha cap proposta aprovada. Sigues el primer a proposar-ne una!
          </p>
        ) : (
          <ul className="propostes-public__llista">
            {propostes.map((p) => (
              <li key={p.id} className="proposta-carta">
                <button
                  type="button"
                  className="proposta-carta__obrir"
                  onClick={() => obrirProposta(p.id)}
                >
                  <div className="proposta-carta__cartell-marc">
                    <CartellPelicula proposta={p} className="proposta-carta__cartell" />
                  </div>
                  <div className="proposta-carta__info">
                    <span className="proposta-carta__titol">{p.titol}</span>
                    {p.sinopsi && <p className="proposta-carta__sinopsi">{p.sinopsi}</p>}
                  </div>
                </button>
                <AccionsVot proposta={p} onVotar={() => handleVotarClick(p)} />
              </li>
            ))}
          </ul>
        )
      )}

      {propostaOberta && (
        <div className="proposta-detall" role="dialog" aria-modal="true">
          <div className="proposta-detall__capcalera">
            <img className="proposta-detall__logo" src="/logo-cineclub.png" alt="Cineclub Roda de Berà" />
            <div className="proposta-detall__autor">
              {propostaOberta.nomProposant && (
                <>
                  <span>Proposada per <b>{propostaOberta.nomProposant}</b></span>
                  {propostaOberta.timestamp?.toDate && (
                    <span className="proposta-detall__data">{formatData(propostaOberta.timestamp.toDate())}</span>
                  )}
                </>
              )}
            </div>
            <button
              type="button"
              className="proposta-detall__tancar"
              onClick={tancarProposta}
              aria-label="Tornar al llistat"
            >
              ✕
            </button>
          </div>
          <div className="proposta-detall__scroll">
            <CartellPelicula proposta={propostaOberta} className="proposta-detall__cartell" />
            <div className="proposta-detall__info">
              <h2 className="proposta-detall__titol">{propostaOberta.titol}</h2>
              {propostaOberta.sinopsi && <p className="proposta-detall__sinopsi">{propostaOberta.sinopsi}</p>}
            </div>
          </div>
          <div className="proposta-detall__footer">
            <AccionsVot proposta={propostaOberta} onVotar={() => handleVotarClick(propostaOberta)} ambText />
          </div>
        </div>
      )}

      {(propostaPendent || volProposar) && (
        <div className="propostes-public__overlay" role="dialog" aria-modal="true">
          <div className="propostes-public__overlay-panell">
            <button
              type="button"
              className="propostes-public__overlay-tancar"
              onClick={() => { setPropostaPendent(null); setVolProposar(false); }}
              aria-label="Cancel·lar"
            >
              ✕
            </button>
            <p className="propostes-public__overlay-text">
              {volProposar ? 'Escaneja el teu carnet per proposar' : 'Escaneja el teu carnet per votar'}
            </p>
            <LectorCarnet onIdentificat={handleIdentificat} />
          </div>
        </div>
      )}
    </div>
  );
}
