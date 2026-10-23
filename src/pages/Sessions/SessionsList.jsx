import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { resumPerSessio } from '../../lib/escaneig';
import { rendibilitatPerSessio, formatEuros } from '../../lib/moviments';
import { formatData } from '../../lib/data';
import { imatgeDeSessio } from '../../lib/sessions';
import * as ROUTES from '../../constants/routes';
import BotoAfegir from '../../components/BotoAfegir';
import EstrellaActiva from '../../components/EstrellaActiva';
import PaginaAdmin from '../../components/PaginaAdmin';
import SincronitzarCalendari from './SincronitzarCalendari';

const RESUM_INICIAL = { socisDistints: 0, entradesGeneriques: 0, importGeneric: 0 };

export default function SessionsList() {
  const [sessions, setSessions] = useState([]);
  const [resumPerSessioState, setResumPerSessioState] = useState({});
  const [moviments, setMoviments] = useState([]);
  const [socis, setSocis] = useState([]);
  const [sincronitzant, setSincronitzant] = useState(false);
  const tancarSincro = useCallback(() => setSincronitzant(false), []);

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
      setMoviments(snap.docs.map((d) => d.data()));
    });
  }, []);

  useEffect(() => {
    getDocs(query(collection(db, 'socis'))).then((snap) => {
      setSocis(snap.docs.map((d) => d.data()));
    });
  }, []);

  const rendibilitat = rendibilitatPerSessio(moviments, socis, sessions);

  return (
    <PaginaAdmin
      amplada="llista"
      titol="Sessions"
      accions={(
        <>
          <button
            type="button"
            className="btn-icona"
            onClick={() => setSincronitzant(true)}
            aria-label="Sincronitzar el calendari"
            title="Sincronitzar el calendari"
          >
            <svg
              className="btn-icona__icona"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 10h18M8 3v4M16 3v4" />
            </svg>
          </button>
          <BotoAfegir to={ROUTES.SESSIONS_NOVA} etiqueta="Nova sessió" />
        </>
      )}
    >
      <ul className="sessions-list__graella">
        {sessions.map((s) => {
          const resum = resumPerSessioState[s.id] ?? RESUM_INICIAL;
          const rendibilitatSessio = rendibilitat[s.id] ?? 0;
          return (
            <li key={s.id} className="sessions-list__targeta">
              <Link className="sessions-list__enllac" to={ROUTES.SESSIONS_EDITAR.replace(':id', s.id)}>
                {imatgeDeSessio(s) && <img className="sessions-list__imatge" src={imatgeDeSessio(s)} alt="" />}
                <div className={`sessions-list__info ${s.activa ? 'sessions-list__info--activa' : ''}`}>
                  <div className="sessions-list__capcalera-targeta">
                    <div className="sessions-list__nom-data">
                      <span className="sessions-list__titol-sessio">{s.titol}</span>
                      <p className="sessions-list__data">{formatData(s.data)}</p>
                    </div>
                    {s.activa && <EstrellaActiva className="sessions-list__estrella" />}
                  </div>
                  <div className="sessions-list__resum">
                    {s.senseControl === true ? (
                      <span className="badge badge--especial">Sessió especial · sense control</span>
                    ) : (
                      <>
                        <span>Socis: {resum.socisDistints}</span>
                        <span>No socis: {resum.entradesGeneriques}</span>
                        <span className={rendibilitatSessio < 0 ? 'sessions-list__balanc--negatiu' : 'sessions-list__balanc--positiu'}>
                          Rendibilitat: {formatEuros(rendibilitatSessio)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      {sincronitzant && <SincronitzarCalendari onTancar={tancarSincro} />}
    </PaginaAdmin>
  );
}
