import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import CarnetQR from '../../components/CarnetQR';
import Carregant from '../../components/Carregant';
import ErrorCarrega, { DocumentInexistent } from '../../components/ErrorCarrega';
import useErrorCarrega from '../../lib/useErrorCarrega';
import * as ROUTES from '../../constants/routes';

// Injectem la mida de pàgina d'impressió (8,89×6,096cm, mida de les fundes)
// només mentre aquesta pàgina està muntada, perquè no afecti la impressió de
// la resta de l'aplicació (`@page` és una regla global, no es pot restringir
// amb un selector CSS normal).
function useMidaImpressioCarnet() {
  useEffect(() => {
    const estil = document.createElement('style');
    estil.textContent = '@page { size: 88.9mm 60.96mm; margin: 0; }';
    document.head.appendChild(estil);
    return () => estil.remove();
  }, []);
}

const TORNAR = { to: ROUTES.SOCIS, etiqueta: 'Socis' };

export default function CarnetSoci() {
  const { id } = useParams();
  const [soci, setSoci] = useState(null);
  const [inexistent, setInexistent] = useState(false);
  const {
    error: errorCarrega, falla, reintenta, intent,
  } = useErrorCarrega();

  useEffect(() => {
    let actiu = true;
    getDoc(doc(db, 'socis', id)).then((snap) => {
      if (!actiu) return;
      const dades = snap.data();
      if (dades) setSoci({ id, ...dades }); else setInexistent(true);
    }).catch((e) => { if (actiu) falla(e); });
    return () => { actiu = false; };
  }, [id, intent, falla]);

  useMidaImpressioCarnet();

  if (inexistent) {
    return <DocumentInexistent amplada="formulari" titol="Carnet de soci" missatge="Aquest soci no existeix." tornar={TORNAR} />;
  }
  if (errorCarrega) {
    return <ErrorCarrega amplada="formulari" titol="Carnet de soci" tornar={TORNAR} missatge="No s'ha pogut carregar el carnet." onReintenta={reintenta} />;
  }
  if (!soci) return <Carregant />;

  return (
    <div className="carnet-pagina">
      <h1 className="titol-ocult">Carnet de soci</h1>
      <Link className="carnet-pagina__tornar" to={ROUTES.SOCIS_EDITAR.replace(':id', id)}>
        ← Tornar a la fitxa
      </Link>
      <CarnetQR soci={soci} />
    </div>
  );
}
