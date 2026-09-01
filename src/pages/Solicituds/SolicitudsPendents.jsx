import { useEffect, useState } from 'react';
import {
  collection, deleteDoc, doc, getDocs, onSnapshot, query, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { solicitudASoci } from '../../lib/solicitudASoci';
import { properNumeroSoci } from '../../lib/numeroSoci';
import { avui } from '../../lib/data';

const MISSATGE_ERROR = "No s'ha pogut desar. Torna-ho a provar.";

const FILTRES = [
  ['pendent', 'Pendents'],
  ['descartada', 'Descartades'],
];

const ETIQUETA_BUIDA = {
  pendent: 'No hi ha sol·licituds pendents.',
  descartada: 'No hi ha sol·licituds descartades.',
};

const CAMPS_DETALL = [
  ['dni', 'DNI'],
  ['telefon', 'Telèfon'],
  ['correuElectronic', 'Correu electrònic'],
  ['poblacio', 'Població'],
  ['codiPostal', 'Codi postal'],
  ['comentaris', 'Comentaris'],
];

function formatDataHora(timestamp) {
  const data = timestamp?.toDate?.();
  if (!data) return '—';
  return `${data.toLocaleDateString('ca-ES')} ${data.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function SolicitudsPendents() {
  const [solicituds, setSolicituds] = useState([]);
  const [filtre, setFiltre] = useState('pendent');
  const [processant, setProcessant] = useState(() => new Set());
  const [errors, setErrors] = useState({});
  const [ultimaAprovacio, setUltimaAprovacio] = useState(null);
  const [errorDesfer, setErrorDesfer] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'solicituds'), where('estat', 'in', ['pendent', 'descartada']));
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
      const socisExistents = await getDocs(collection(db, 'socis'));
      const numeroSoci = properNumeroSoci(socisExistents.docs.map((d) => d.data().numeroSoci));
      const batch = writeBatch(db);
      const nouSociRef = doc(collection(db, 'socis'));
      batch.set(nouSociRef, solicitudASoci(solicitud, avui(), numeroSoci));
      batch.update(doc(db, 'solicituds', solicitud.id), { estat: 'aprovada' });
      await batch.commit();
      setUltimaAprovacio({
        solicitudId: solicitud.id, sociId: nouSociRef.id, nom: solicitud.nom, cognoms: solicitud.cognoms,
      });
    } catch {
      marcarProcessant(solicitud.id, false);
      setErrors((prev) => ({ ...prev, [solicitud.id]: MISSATGE_ERROR }));
    }
  };

  const desferAprovacio = async () => {
    if (!ultimaAprovacio) return;
    const confirmat = window.confirm(
      `Segur que vols desfer l'aprovació de ${ultimaAprovacio.nom} ${ultimaAprovacio.cognoms}? `
      + "S'eliminarà el soci creat i la sol·licitud tornarà a l'estat pendent."
    );
    if (!confirmat) return;
    setErrorDesfer(null);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'socis', ultimaAprovacio.sociId));
      batch.update(doc(db, 'solicituds', ultimaAprovacio.solicitudId), { estat: 'pendent' });
      await batch.commit();
      setUltimaAprovacio(null);
    } catch {
      setErrorDesfer(MISSATGE_ERROR);
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

  const marcarComPendent = async (solicitud) => {
    marcarProcessant(solicitud.id, true);
    setErrors((prev) => ({ ...prev, [solicitud.id]: null }));
    try {
      await updateDoc(doc(db, 'solicituds', solicitud.id), { estat: 'pendent' });
    } catch {
      marcarProcessant(solicitud.id, false);
      setErrors((prev) => ({ ...prev, [solicitud.id]: MISSATGE_ERROR }));
    }
  };

  const eliminarDefinitivament = async (solicitud) => {
    const confirmat = window.confirm(
      `Segur que vols eliminar definitivament la sol·licitud de ${solicitud.nom} ${solicitud.cognoms}? Aquesta acció no es pot desfer.`
    );
    if (!confirmat) return;
    marcarProcessant(solicitud.id, true);
    setErrors((prev) => ({ ...prev, [solicitud.id]: null }));
    try {
      await deleteDoc(doc(db, 'solicituds', solicitud.id));
    } catch {
      marcarProcessant(solicitud.id, false);
      setErrors((prev) => ({ ...prev, [solicitud.id]: MISSATGE_ERROR }));
    }
  };

  const solicitudsFiltrades = solicituds
    .filter((s) => s.estat === filtre)
    .sort((a, b) => (b.timestamp?.toDate?.()?.getTime() ?? 0) - (a.timestamp?.toDate?.()?.getTime() ?? 0));

  return (
    <div className="solicituds-pendents">
      <h1 className="solicituds-pendents__titol">Sol·licituds</h1>

      <div className="solicituds-pendents__filtres">
        {FILTRES.map(([valor, etiqueta]) => (
          <button
            key={valor}
            type="button"
            className={`solicituds-pendents__filtre ${filtre === valor ? 'solicituds-pendents__filtre--actiu' : ''}`}
            onClick={() => setFiltre(valor)}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {ultimaAprovacio && (
        <div className="solicituds-pendents__desfer">
          <p>
            Sol·licitud de <strong>{ultimaAprovacio.nom} {ultimaAprovacio.cognoms}</strong> aprovada.
          </p>
          <button type="button" className="solicituds-pendents__desfer-boto" onClick={desferAprovacio}>
            Desfer
          </button>
          <button
            type="button"
            className="solicituds-pendents__desfer-boto"
            onClick={() => setUltimaAprovacio(null)}
          >
            Amagar
          </button>
        </div>
      )}
      {errorDesfer && <p className="form__error">{errorDesfer}</p>}

      {solicitudsFiltrades.length === 0 && <p>{ETIQUETA_BUIDA[filtre]}</p>}
      <ul className="solicituds-pendents__llista">
        {solicitudsFiltrades.map((s) => {
          const enProces = processant.has(s.id);
          return (
            <li key={s.id} className="solicituds-pendents__item">
              <div className="solicituds-pendents__info">
                <span className="solicituds-pendents__nom">{s.nom} {s.cognoms}</span>
                <span className="solicituds-pendents__data">{formatDataHora(s.timestamp)}</span>
                <div className="solicituds-pendents__detall">
                  {CAMPS_DETALL.filter(([camp]) => s[camp]).map(([camp, etiqueta]) => (
                    <span key={camp}><strong>{etiqueta}:</strong> {s[camp]}</span>
                  ))}
                </div>
              </div>
              {filtre === 'pendent' && (
                <div className="solicituds-pendents__accions">
                  <button
                    type="button"
                    className="btn-icona btn-icona--verd"
                    aria-label="Aprovar"
                    disabled={enProces}
                    onClick={() => aprovar(s)}
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
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="btn-icona btn-icona--vermell"
                    aria-label="Descartar"
                    disabled={enProces}
                    onClick={() => descartar(s)}
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
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
              )}
              {filtre === 'descartada' && (
                <div className="solicituds-pendents__accions">
                  <button
                    type="button"
                    className="btn-icona"
                    aria-label="Marcar com a pendent"
                    disabled={enProces}
                    onClick={() => marcarComPendent(s)}
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
                      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="btn-icona btn-icona--vermell"
                    aria-label="Eliminar definitivament"
                    disabled={enProces}
                    onClick={() => eliminarDefinitivament(s)}
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
                      <path d="M3 6h18" />
                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    </svg>
                  </button>
                </div>
              )}
              {errors[s.id] && <p className="form__error">{errors[s.id]}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
