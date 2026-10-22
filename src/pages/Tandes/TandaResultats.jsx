import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  collection, doc, getDocs, onSnapshot,
} from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import {
  classificarSocis, comptarEstats, propostesEfectives, resumirResultats,
} from '../../lib/tandes';
import Carregant from '../../components/Carregant';

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

const percentatgeLikes = ({ likes, dislikes }) => (
  likes + dislikes === 0 ? null : Math.round((likes / (likes + dislikes)) * 100)
);

export default function TandaResultats() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tanda, setTanda] = useState(null);
  const [vots, setVots] = useState(null);
  const [referencies, setReferencies] = useState(null);
  const [filtre, setFiltre] = useState('tots');
  const [error, setError] = useState(false);
  const [intent, setIntent] = useState(0);

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
        titols: Object.fromEntries(propostesSnap.docs.map((d) => [d.id, d.data().titol])),
        estats: Object.fromEntries(propostesSnap.docs.map((d) => [d.id, d.data().estat])),
      });
    }, () => setError(true));
  }, [intent]);

  const tornarAProvar = () => {
    setError(false);
    setTanda(null);
    setVots(null);
    setReferencies(null);
    setIntent((n) => n + 1);
  };

  if (error) {
    return (
      <div className="tanda-resultats">
        <p className="tanda-resultats__error" role="alert">No s'han pogut carregar els resultats. Torna-ho a provar.</p>
        <button type="button" className="btn" onClick={tornarAProvar}>Tornar a provar</button>
      </div>
    );
  }

  if (tanda === null || vots === null || referencies === null) return <Carregant />;

  const { socis, titols, estats } = referencies;
  const efectives = propostesEfectives(tanda.propostes, estats);
  const { perProposta } = resumirResultats(vots, efectives);
  const titol = (propostaId) => titols[propostaId] ?? propostaId;
  const ordenades = [...efectives].sort((a, b) => (
    (percentatgeLikes(perProposta[b]) ?? -1) - (percentatgeLikes(perProposta[a]) ?? -1)
  ));

  const files = classificarSocis(socis, vots, efectives);
  const comptadors = comptarEstats(files);
  const elegibles = comptarEstats(files.filter((f) => f.elegible));
  const pendents = elegibles['sense-comencar'];
  const haVotat = elegibles.tots - pendents;
  const participacio = elegibles.tots === 0 ? 0 : Math.round((elegibles.completat / elegibles.tots) * 100);
  const visibles = filtre === 'tots' ? files : files.filter((f) => f.estat === filtre);

  return (
    <div className="tanda-resultats">
      <div className="tandes-list__capcalera">
        <h1 className="tandes-list__titol">Resultats: {tanda.nom}</h1>
        <Link className="tandes-list__tornar" to={ROUTES.TANDES}>Tornar</Link>
      </div>
      <p className="tanda-resultats__participants">
        {haVotat} de {elegibles.tots} han votat · {elegibles.completat} han completat · {pendents} pendents
      </p>
      <p className="tanda-resultats__etiqueta-barra">Completats: {elegibles.completat} de {elegibles.tots}</p>
      <div className="tanda-resultats__barra-wrap">
        <div
          className="tanda-resultats__barra"
          role="progressbar"
          aria-label="Completats"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={participacio}
        >
          <div className="tanda-resultats__barra-omplerta" style={{ width: `${participacio}%` }} />
        </div>
        <span className="tanda-resultats__percentatge">{participacio}%</span>
      </div>
      <ul className="tanda-resultats__llista">
        {ordenades.map((propostaId) => {
          const { likes, dislikes } = perProposta[propostaId];
          const percentatge = percentatgeLikes(perProposta[propostaId]);
          return (
            <li key={propostaId} className="tanda-resultats__proposta" data-testid="resultat-proposta">
              <h2 className="tanda-resultats__proposta-titol">{titol(propostaId)}</h2>
              <span>👍 {likes} · 👎 {dislikes}</span>
              {percentatge !== null && <span className="tanda-resultats__percentatge">{percentatge}%</span>}
            </li>
          );
        })}
      </ul>
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
      {visibles.length === 0 ? (
        <p>Cap soci en aquest estat.</p>
      ) : (
        <div className="tanda-resultats__taula-wrap">
          <table className="tanda-resultats__taula">
            <thead>
              <tr>
                <th scope="col">Soci</th>
                <th scope="col">Estat</th>
                {efectives.map((propostaId) => (
                  <th key={propostaId} scope="col" className="tanda-resultats__proposta-columna" title={titol(propostaId)}>
                    {titol(propostaId)}
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
                  </th>
                  <td><span className={`badge badge--${fila.estat}`}>{etiquetaEstat(fila)}</span></td>
                  {efectives.map((propostaId) => (
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
    </div>
  );
}
