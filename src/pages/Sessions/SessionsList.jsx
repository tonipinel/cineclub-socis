import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';

export default function SessionsList() {
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    const q = query(collection(db, 'sessions'), orderBy('data', 'desc'));
    return onSnapshot(q, (snap) => {
      setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  return (
    <div className="sessions-list">
      <div className="sessions-list__capcalera">
        <h1 className="sessions-list__titol">Sessions</h1>
        <Link className="btn" to={ROUTES.SESSIONS_NOVA}>Nova sessió</Link>
      </div>
      <ul className="sessions-list__llista">
        {sessions.map((s) => (
          <li key={s.id} className="sessions-list__item">
            <Link to={ROUTES.SESSIONS_EDITAR.replace(':id', s.id)}>
              {s.titol} — {s.data}
            </Link>
            {s.activa && <span className="badge badge--activa">Activa</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
