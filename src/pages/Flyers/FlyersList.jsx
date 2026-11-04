import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import { canvisDesdeBase } from '../../lib/flyers';
import { formatData } from '../../lib/data';
import Carregant from '../../components/Carregant';
import BotoAfegir from '../../components/BotoAfegir';
import PaginaAdmin from '../../components/PaginaAdmin';
import ErrorCarrega from '../../components/ErrorCarrega';
import useErrorCarrega from '../../lib/useErrorCarrega';

const ESTATS = { esborrany: 'Esborrany', publicat: 'Publicat' };

export default function FlyersList() {
  const [dades, setDades] = useState(null);
  const {
    error, falla, reintenta, intent,
  } = useErrorCarrega();

  useEffect(() => {
    Promise.all([
      getDocs(collection(db, 'flyers')),
      getDocs(collection(db, 'sessions')),
    ]).then(([flyersSnap, sessionsSnap]) => {
      const sessionsPerId = {};
      sessionsSnap.docs.forEach((d) => { sessionsPerId[d.id] = { id: d.id, ...d.data() }; });
      const flyers = flyersSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.desde ?? '').localeCompare(a.desde ?? ''));
      setDades({ flyers, sessionsPerId });
    }).catch(falla);
  }, [intent, falla]);

  if (error) return <ErrorCarrega titol="Flyers" missatge="No s'han pogut carregar els flyers." onReintenta={reintenta} />;
  if (dades === null) return <Carregant />;

  const { flyers, sessionsPerId } = dades;

  return (
    <PaginaAdmin
      amplada="llista"
      titol="Flyers"
      accions={<BotoAfegir to={ROUTES.FLYERS_NOU} etiqueta="Nou flyer" />}
    >
      {flyers.length === 0 && <p>Encara no hi ha cap flyer.</p>}
      <ul className="llista-cataleg">
        {flyers.map((f) => (
          <li key={f.id} className="llista-cataleg__item flyers-list__item">
            <Link className="enllac flyers-list__nom" to={ROUTES.FLYERS_EDITAR.replace(':id', f.id)}>{f.nom}</Link>
            <span className="flyers-list__dates">{`${formatData(f.desde)} – ${formatData(f.fins)}`}</span>
            <span className="flyers-list__estat">
              <span className={`badge ${f.estat === 'publicat' ? 'badge--al-dia' : 'badge--pendent'}`}>{ESTATS[f.estat] ?? f.estat}</span>
              {canvisDesdeBase(f, sessionsPerId).length > 0 && <span className="badge badge--vencut">Desactualitzat</span>}
            </span>
          </li>
        ))}
      </ul>
    </PaginaAdmin>
  );
}
