import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import CarnetQR from '../../components/CarnetQR';
import Carregant from '../../components/Carregant';
import * as ROUTES from '../../constants/routes';

// Injectem la mida de pàgina d'impressió (85,6×54mm, mida DNI) només mentre
// aquesta pàgina està muntada, perquè no afecti la impressió de la resta de
// l'aplicació (`@page` és una regla global, no es pot restringir amb un
// selector CSS normal).
function useMidaImpressioDNI() {
  useEffect(() => {
    const estil = document.createElement('style');
    estil.textContent = '@page { size: 85.6mm 54mm; margin: 0; }';
    document.head.appendChild(estil);
    return () => estil.remove();
  }, []);
}

export default function CarnetSoci() {
  const { id } = useParams();
  const [soci, setSoci] = useState(null);

  useEffect(() => {
    getDoc(doc(db, 'socis', id)).then((snap) => {
      setSoci({ id, ...snap.data() });
    });
  }, [id]);

  useMidaImpressioDNI();

  if (!soci) return <Carregant />;

  return (
    <div className="carnet-pagina">
      <Link className="carnet-pagina__tornar" to={ROUTES.SOCIS_EDITAR.replace(':id', id)}>
        ← Tornar a la fitxa
      </Link>
      <CarnetQR soci={soci} />
    </div>
  );
}
