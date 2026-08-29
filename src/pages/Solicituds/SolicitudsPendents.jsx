import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { solicitudASoci } from '../../lib/solicitudASoci';

const MISSATGE_ERROR = "No s'ha pogut desar. Torna-ho a provar.";

function avui() {
  return new Date().toISOString().slice(0, 10);
}

export default function SolicitudsPendents() {
  const [solicituds, setSolicituds] = useState([]);
  const [numerosSoci, setNumerosSoci] = useState({});
  const [processant, setProcessant] = useState(() => new Set());
  const [errors, setErrors] = useState({});

  useEffect(() => {
    const q = query(collection(db, 'solicituds'), where('estat', '==', 'pendent'));
    return onSnapshot(q, (snap) => {
      setSolicituds(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const marcarProcessant = (id, actiu) => {
    setProcessant((prev) => {
      const next = new Set(prev);
      if (actiu) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const aprovar = async (solicitud) => {
    marcarProcessant(solicitud.id, true);
    setErrors((prev) => ({ ...prev, [solicitud.id]: null }));
    try {
      const batch = writeBatch(db);
      const nouSociRef = doc(collection(db, 'socis'));
      batch.set(nouSociRef, solicitudASoci(solicitud, avui(), numerosSoci[solicitud.id]));
      batch.update(doc(db, 'solicituds', solicitud.id), { estat: 'aprovada' });
      await batch.commit();
    } catch {
      marcarProcessant(solicitud.id, false);
      setErrors((prev) => ({ ...prev, [solicitud.id]: MISSATGE_ERROR }));
    }
  };

  const descartar = async (solicitud) => {
    marcarProcessant(solicitud.id, true);
    setErrors((prev) => ({ ...prev, [solicitud.id]: null }));
    try {
      await updateDoc(doc(db, 'solicituds', solicitud.id), { estat: 'descartada' });
    } catch {
      marcarProcessant(solicitud.id, false);
      setErrors((prev) => ({ ...prev, [solicitud.id]: MISSATGE_ERROR }));
    }
  };

  return (
    <div className="solicituds-pendents">
      <h1 className="solicituds-pendents__titol">Sol·licituds pendents</h1>
      {solicituds.length === 0 && <p>No hi ha sol·licituds pendents.</p>}
      <ul className="solicituds-pendents__llista">
        {solicituds.map((s) => {
          const enProces = processant.has(s.id);
          const numeroSoci = numerosSoci[s.id] ?? '';
          return (
            <li key={s.id} className="solicituds-pendents__item">
              <span>{s.nom} {s.cognoms} — {s.telefon}</span>
              <div className="solicituds-pendents__accions">
                <div className="form__field solicituds-pendents__numero">
                  <label className="form__label" htmlFor={`numero-soci-${s.id}`}>Número de soci/a</label>
                  <input
                    id={`numero-soci-${s.id}`}
                    className="form__input"
                    value={numeroSoci}
                    onChange={(e) => setNumerosSoci((prev) => ({ ...prev, [s.id]: e.target.value }))}
                  />
                </div>
                <button className="btn" disabled={enProces || !numeroSoci} onClick={() => aprovar(s)}>Aprovar</button>
                <button className="btn btn--outline" disabled={enProces} onClick={() => descartar(s)}>Descartar</button>
              </div>
              {errors[s.id] && <p className="form__error">{errors[s.id]}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
