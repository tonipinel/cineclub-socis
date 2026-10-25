import { useEffect, useState } from 'react';
import {
  collection, limit, onSnapshot, orderBy, query,
} from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import { formatDataHora } from '../../lib/data';
import Carregant from '../../components/Carregant';
import PaginaAdmin from '../../components/PaginaAdmin';
import ErrorCarrega from '../../components/ErrorCarrega';
import useErrorCarrega from '../../lib/useErrorCarrega';

const MOTIU_ETIQUETES = {
  'codi-desconegut': 'Codi no reconegut',
  'qr-soci-rebutjat': 'QR amb número de soci (no és un carnet)',
  'soci-no-trobat': 'Soci no trobat',
  'soci-desactivat': 'Soci desactivat',
  'tiquet-anullat': 'Tiquet anul·lat',
  'tiquet-desconegut': 'Tiquet desconegut',
  'tiquet-ja-utilitzat': 'Tiquet ja utilitzat',
  excepcio: 'Error inesperat',
  debounce: 'Reescaneig dins 3 s',
  'lots-no-carregats': 'Lots encara no carregats',
  'error-escriptura': "Error d'escriptura",
  'timeout-escriptura': 'Escriptura sense confirmar (8 s)',
  'sense-connexio': 'Sense connexió',
  'pendent-enviar': "Codi pendent d'enviar",
  'lectura-lenta': 'Lectura lenta (reintent correcte)',
  'sessio-canviada': 'Sessió canviada a mig escaneig',
  'sessio-canviada-escrit': 'Sessió canviada (entrada ja desada)',
  abandonat: 'Escaneig abandonat (pantalla tancada)',
};

// Camps afegits als registres a partir d'octubre de 2026; els antics no en
// tenen i aleshores no es mostra res.
function textDiagnostic(e) {
  const parts = [];
  if (e.online !== undefined) parts.push(e.online ? 'En línia' : 'Fora de línia');
  if (e.ms !== undefined) parts.push(`${e.ms} ms`);
  if (e.intents) parts.push(`${e.intents} intents`);
  if (e.desdeCache) parts.push('des de la caché');
  if (e.resultatAnterior) parts.push(`anterior: ${e.resultatAnterior}`);
  if (e.versio) parts.push(e.versio);
  return parts.join(' · ');
}

const METODE_ETIQUETES = { qr: 'QR', manual: 'Manual' };

export default function EscaneigLogPage() {
  const [errors, setErrors] = useState(null);
  const [sessions, setSessions] = useState({});
  const {
    error: errorCarrega, falla, reintenta, intent,
  } = useErrorCarrega();

  useEffect(() => (
    onSnapshot(collection(db, 'sessions'), (snap) => {
      const mapa = {};
      snap.docs.forEach((d) => { mapa[d.id] = d.data().titol; });
      setSessions(mapa);
    }, (e) => console.error("No s'han pogut llegir els títols de les sessions:", e))
  ), [intent]);

  useEffect(() => {
    const q = query(collection(db, 'escaneigErrors'), orderBy('timestamp', 'desc'), limit(200));
    return onSnapshot(q, (snap) => {
      setErrors(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, falla);
  }, [intent, falla]);

  if (errorCarrega) {
    return (
      <ErrorCarrega
        titol="Incidències d'escaneig"
        tornar={{ to: ROUTES.ESCANEIG, etiqueta: 'Escaneig' }}
        missatge="No s'han pogut carregar les incidències."
        onReintenta={reintenta}
      />
    );
  }
  if (errors === null) return <Carregant />;

  return (
    <PaginaAdmin
      amplada="llista"
      className="escaneig-log"
      titol="Incidències d'escaneig"
      tornar={{ to: ROUTES.ESCANEIG, etiqueta: 'Escaneig' }}
    >

      {errors.length === 0 ? (
        <p className="escaneig-log__buit">Encara no s'ha registrat cap incidència.</p>
      ) : (
        <ul className="escaneig-log__llista">
          {errors.map((e) => (
            <li key={e.id} className="escaneig-log__item">
              <div className="escaneig-log__fila">
                <span className="escaneig-log__data">{formatDataHora(e.timestamp)}</span>
                <span className="escaneig-log__motiu">{MOTIU_ETIQUETES[e.motiu] ?? e.motiu}</span>
                <span className="escaneig-log__codi">{e.codi || '—'}</span>
                <span className={`escaneig-log__metode escaneig-log__metode--${e.metode ?? 'desconegut'}`}>
                  {METODE_ETIQUETES[e.metode] ?? '—'}
                </span>
                <span className="escaneig-log__sessio">{sessions[e.sessionId] ?? e.sessionId ?? '—'}</span>
              </div>
              {e.detall && <p className="escaneig-log__detall">{e.detall}</p>}
              {textDiagnostic(e) && <p className="escaneig-log__diagnostic">{textDiagnostic(e)}</p>}
            </li>
          ))}
        </ul>
      )}
    </PaginaAdmin>
  );
}
