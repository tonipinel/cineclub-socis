import { useEffect, useState } from 'react';
import { addDoc, collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { solicitudASoci } from '../../lib/solicitudASoci';

function avui() {
  return new Date().toISOString().slice(0, 10);
}

export default function SolicitudsPendents() {
  const [solicituds, setSolicituds] = useState([]);

  useEffect(() => {
    const q = query(collection(db, 'solicituds'), where('estat', '==', 'pendent'));
    return onSnapshot(q, (snap) => {
      setSolicituds(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const aprovar = async (solicitud) => {
    await addDoc(collection(db, 'socis'), solicitudASoci(solicitud, avui()));
    await updateDoc(doc(db, 'solicituds', solicitud.id), { estat: 'aprovada' });
  };

  const descartar = async (solicitud) => {
    await updateDoc(doc(db, 'solicituds', solicitud.id), { estat: 'descartada' });
  };

  return (
    <div className="solicituds-pendents">
      <h1 className="solicituds-pendents__titol">Sol·licituds pendents</h1>
      {solicituds.length === 0 && <p>No hi ha sol·licituds pendents.</p>}
      <ul className="solicituds-pendents__llista">
        {solicituds.map((s) => (
          <li key={s.id} className="solicituds-pendents__item">
            <span>{s.nom} {s.cognoms} — {s.telefon}</span>
            <div className="solicituds-pendents__accions">
              <button className="btn" onClick={() => aprovar(s)}>Aprovar</button>
              <button className="btn btn--outline" onClick={() => descartar(s)}>Descartar</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
