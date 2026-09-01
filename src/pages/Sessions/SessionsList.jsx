import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { resumPerSessio } from '../../lib/escaneig';
import { balancPerSessio, formatEuros } from '../../lib/moviments';
import * as ROUTES from '../../constants/routes';
import BotoAfegir from '../../components/BotoAfegir';

const RESUM_INICIAL = { socisDistints: 0, entradesGeneriques: 0, importGeneric: 0 };

export default function SessionsList() {
  const [sessions, setSessions] = useState([]);
  const [resumPerSessioState, setResumPerSessioState] = useState({});
  const [balancPerSessioState, setBalancPerSessioState] = useState({});

  useEffect(() => {
    const q = query(collection(db, 'sessions'), orderBy('data', 'desc'));
    return onSnapshot(q, (snap) => {
      setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'accessLog'));
    getDocs(q).then((snap) => {
      setResumPerSessioState(resumPerSessio(snap.docs.map((d) => d.data())));
    });
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'moviments'));
    getDocs(q).then((snap) => {
      setBalancPerSessioState(balancPerSessio(snap.docs.map((d) => d.data())));
    });
  }, []);

  return (
    <div className="sessions-list">
      <div className="sessions-list__capcalera">
        <h1 className="sessions-list__titol">Sessions</h1>
        <BotoAfegir to={ROUTES.SESSIONS_NOVA} etiqueta="Nova sessió" />
      </div>
      <ul className="sessions-list__graella">
        {sessions.map((s) => {
          const resum = resumPerSessioState[s.id] ?? RESUM_INICIAL;
          const balanc = balancPerSessioState[s.id] ?? 0;
          return (
            <li key={s.id} className="sessions-list__targeta">
              <Link className="sessions-list__enllac" to={ROUTES.SESSIONS_EDITAR.replace(':id', s.id)}>
                {s.imatgeUrl && <img className="sessions-list__imatge" src={s.imatgeUrl} alt="" />}
                <div className="sessions-list__info">
                  <div className="sessions-list__capcalera-targeta">
                    <span className="sessions-list__titol-sessio">{s.titol}</span>
                    {s.activa && <span className="badge badge--activa">Activa</span>}
                  </div>
                  <p className="sessions-list__data">{s.data}</p>
                  <div className="sessions-list__resum">
                    <span>Socis: {resum.socisDistints}</span>
                    <span>Aportacions: {resum.entradesGeneriques}</span>
                    <span className={balanc < 0 ? 'sessions-list__balanc--negatiu' : 'sessions-list__balanc--positiu'}>
                      Balanç: {formatEuros(balanc)}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
