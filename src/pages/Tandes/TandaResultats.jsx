import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  collection, deleteDoc, doc, getDocs, onSnapshot,
} from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import { aData, resumVotacio } from '../../lib/tandes';
import TopVotacio from '../../components/TopVotacio';
import Carregant from '../../components/Carregant';
import PaginaAdmin from '../../components/PaginaAdmin';
import { useConfirmacio } from '../../components/ConfirmacioProvider';

const TORNAR = { to: ROUTES.TANDES, etiqueta: 'Tandes' };

const ICONES = { like: '👍', dislike: '👎' };
const VOTS_TEXT = { like: 'M\'agrada', dislike: 'No m\'agrada' };

const FILTRES = [
  { clau: 'tots', etiqueta: 'Tots' },
  { clau: 'completat', etiqueta: 'Completats' },
  { clau: 'en-curs', etiqueta: 'En curs' },
  { clau: 'sense-comencar', etiqueta: 'Sense començar' },
];

const etiquetaEstat = ({ estat, votats, total }) => {
  if (estat === 'completat') return 'Completat';
  return `${estat === 'en-curs' ? 'En curs' : 'Sense començar'} (${votats}/${total})`;
};

export default function TandaResultats() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { confirma } = useConfirmacio();
  const [tanda, setTanda] = useState(null);
  const [vots, setVots] = useState(null);
  const [referencies, setReferencies] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [filtre, setFiltre] = useState('tots');
  const [error, setError] = useState(false);
  const [intent, setIntent] = useState(0);
  const [esborrant, setEsborrant] = useState(null);
  const [errorEsborrar, setErrorEsborrar] = useState(null);

  useEffect(() => {
    const alFallar = () => setError(true);
    const desubscriureTanda = onSnapshot(doc(db, 'tandes', id), (snap) => {
      const dades = snap.data();
      if (!dades) {
        navigate(ROUTES.TANDES, { replace: true });
        return;
      }
      setTanda(dades);
    }, alFallar);
    const desubscriureVots = onSnapshot(collection(db, 'tandes', id, 'vots'), (snap) => {
      setVots(snap.docs.map((d) => ({ numeroSoci: d.id, ...d.data() })));
    }, alFallar);
    return () => {
      desubscriureTanda();
      desubscriureVots();
    };
  }, [id, navigate, intent]);

  useEffect(() => {
    Promise.all([
      getDocs(collection(db, 'socis')),
      getDocs(collection(db, 'propostes')),
    ]).then(([socisSnap, propostesSnap]) => {
      setReferencies({
        socis: socisSnap.docs.map((d) => d.data()),
        propostes: Object.fromEntries(propostesSnap.docs.map((d) => [d.id, d.data()])),
      });
    }, () => setError(true));
  }, [intent]);

  // Lectura opcional: sense sessions, cada pel·lícula enllaça a la fitxa de la proposta.
  useEffect(() => {
    getDocs(collection(db, 'sessions')).then(
      (snap) => setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => {},
    );
  }, [intent]);

  const tornarAProvar = () => {
    setError(false);
    setTanda(null);
    setVots(null);
    setReferencies(null);
    setIntent((n) => n + 1);
  };

  const esborrarVots = async (fila) => {
    const nom = fila.nom || `Núm. ${fila.numeroSoci}`;
    const tancada = aData(tanda.tanca) <= new Date();
    const confirmat = await confirma({
      missatge: `Segur que vols esborrar tots els vots de ${nom} (${fila.votats} de ${fila.total})? `
        + `Aquesta acció no es pot desfer. ${tancada ? 'El resultat final de la tanda canviarà.' : 'El soci podrà tornar a votar.'}`,
      perill: true,
      etiquetaAcceptar: 'Esborra',
    });
    if (!confirmat) return;
    setErrorEsborrar(null);
    setEsborrant(fila.numeroSoci);
    try {
      await deleteDoc(doc(db, 'tandes', id, 'vots', String(fila.numeroSoci)));
    } catch {
      setErrorEsborrar(`No s'han pogut esborrar els vots de ${nom}. Torna-ho a provar.`);
    } finally {
      setEsborrant(null);
    }
  };

  if (error) {
    return (
      <PaginaAdmin amplada="llista" titol="Resultats" tornar={TORNAR}>
        <p className="tanda-resultats__error" role="alert">No s'han pogut carregar els resultats. Torna-ho a provar.</p>
        <button type="button" className="btn" onClick={tornarAProvar}>Tornar a provar</button>
      </PaginaAdmin>
    );
  }

  if (tanda === null || vots === null || referencies === null) return <Carregant />;

  const { socis, propostes } = referencies;
  const resum = resumVotacio({
    tanda, vots, socis, propostes, sessions,
  });
  const titol = (propostaId) => propostes[propostaId]?.titol ?? propostaId;
  const { classificacio: files, comptadors } = resum;
  const ordenades = resum.files.map((f) => f.id);
  const filaPerProposta = Object.fromEntries(resum.files.map((f) => [f.id, f]));
  const numerosAmbVot = new Set(vots.map((v) => String(v.numeroSoci)));
  const visibles = filtre === 'tots' ? files : files.filter((f) => f.estat === filtre);

  return (
    <PaginaAdmin
      amplada="llista"
      titol={`Resultats: ${tanda.nom}`}
      tornar={TORNAR}
      accions={(
        <Link className="enllac" to={`${ROUTES.PROPOSTES_PENDENTS}?tanda=${encodeURIComponent(id)}`}>
          Veure les propostes de la tanda
        </Link>
      )}
    >
      <p className="tanda-resultats__participants">
        {resum.participants} de {resum.total} han votat · {resum.completats} han completat · {resum.pendents} pendents
      </p>
      <p className="tanda-resultats__etiqueta-barra">Completats: {resum.completats} de {resum.total}</p>
      <div className="tanda-resultats__barra-wrap">
        <div
          className="tanda-resultats__barra"
          role="progressbar"
          aria-label="Completats"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={resum.percentCompletats}
        >
          <div className="tanda-resultats__barra-omplerta" style={{ width: `${resum.percentCompletats}%` }} />
        </div>
        <span className="tanda-resultats__percentatge">{resum.percentCompletats}%</span>
      </div>
      <TopVotacio files={resum.files} nivellTitol="h2" />
      <div className="tanda-resultats__filtres" role="group" aria-label="Filtrar per estat">
        {FILTRES.map(({ clau, etiqueta }) => (
          <button
            key={clau}
            type="button"
            className="tanda-resultats__filtre"
            aria-pressed={filtre === clau}
            onClick={() => setFiltre(clau)}
          >
            {etiqueta} ({comptadors[clau]})
          </button>
        ))}
      </div>
      {errorEsborrar && <p className="tanda-resultats__error" role="alert">{errorEsborrar}</p>}
      {visibles.length === 0 ? (
        <p>Cap soci en aquest estat.</p>
      ) : (
        <div className="tanda-resultats__taula-wrap" role="region" tabIndex={0} aria-label="Vots per soci">
          <table className="tanda-resultats__taula" style={{ '--pellicules': ordenades.length }}>
            <thead>
              <tr>
                <th scope="col">Soci</th>
                <th scope="col">Estat</th>
                {ordenades.map((propostaId) => (
                  <th key={propostaId} scope="col" className="tanda-resultats__proposta-columna" title={titol(propostaId)}>
                    {filaPerProposta[propostaId].imatgeUrl ? (
                      <img className="tanda-resultats__cartell" src={filaPerProposta[propostaId].imatgeUrl} alt="" loading="lazy" />
                    ) : (
                      <span className="tanda-resultats__cartell tanda-resultats__cartell--buit" aria-hidden="true" />
                    )}
                    <span className="tanda-resultats__proposta-columna-titol">{titol(propostaId)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.map((fila) => (
                <tr key={fila.numeroSoci}>
                  <th scope="row">
                    <span className="tanda-resultats__soci-nom">{fila.nom || `Núm. ${fila.numeroSoci}`}</span>
                    {fila.nom && <span className="tanda-resultats__soci-numero">núm. {fila.numeroSoci}</span>}
                    {!fila.elegible && (
                      <span
                        className="tanda-resultats__marca"
                        title={fila.trobat ? 'Ja no pot votar (inactiu o sense carnet)' : 'Soci no trobat'}
                      >
                        no elegible
                      </span>
                    )}
                    {numerosAmbVot.has(String(fila.numeroSoci)) && (
                      <button
                        type="button"
                        className="tanda-resultats__esborrar"
                        aria-label={`Esborrar tots els vots de ${fila.nom || `Núm. ${fila.numeroSoci}`}`}
                        disabled={esborrant === fila.numeroSoci}
                        onClick={() => esborrarVots(fila)}
                      >
                        Esborrar els vots
                      </button>
                    )}
                  </th>
                  <td><span className={`badge badge--${fila.estat}`}>{etiquetaEstat(fila)}</span></td>
                  {ordenades.map((propostaId) => (
                    <td key={propostaId}>
                      <span role="img" aria-label={VOTS_TEXT[fila.valors[propostaId]] ?? 'Sense vot'}>
                        {ICONES[fila.valors[propostaId]] ?? '—'}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PaginaAdmin>
  );
}
