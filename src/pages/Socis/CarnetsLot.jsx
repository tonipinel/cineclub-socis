import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import CarnetCard from '../../components/CarnetCard';
import Carregant from '../../components/Carregant';
import ErrorCarrega from '../../components/ErrorCarrega';
import useErrorCarrega from '../../lib/useErrorCarrega';
import * as ROUTES from '../../constants/routes';

const COLUMNES = 3;

// Injectem la mida de pàgina d'impressió (A4 apaïsat) només mentre aquesta
// pàgina està muntada, perquè no afecti la impressió de la resta de
// l'aplicació (`@page` és una regla global, no es pot restringir amb un
// selector CSS normal).
function useMidaImpressioA4() {
  useEffect(() => {
    const estil = document.createElement('style');
    estil.textContent = '@page { size: A4 landscape; margin: 8mm; }';
    document.head.appendChild(estil);
    return () => estil.remove();
  }, []);
}

export default function CarnetsLot() {
  const [searchParams] = useSearchParams();
  const idsParam = searchParams.get('ids') ?? '';
  const [socis, setSocis] = useState(null);
  const {
    error: errorCarrega, falla, reintenta, intent,
  } = useErrorCarrega();

  useEffect(() => {
    const ids = idsParam.split(',').filter(Boolean);
    Promise.all(ids.map((id) => getDoc(doc(db, 'socis', id)))).then((snaps) => {
      setSocis(snaps.filter((snap) => snap.exists()).map((snap) => ({ id: snap.id, ...snap.data() })));
    }).catch(falla);
  }, [idsParam, intent, falla]);

  useMidaImpressioA4();

  if (errorCarrega) {
    return (
      <ErrorCarrega
        amplada="formulari"
        titol="Carnets"
        tornar={{ to: ROUTES.SOCIS, etiqueta: 'Socis' }}
        missatge="No s'han pogut carregar els carnets."
        onReintenta={reintenta}
      />
    );
  }
  if (!socis) return <Carregant />;

  const placeholders = socis.length > 0 ? (COLUMNES - (socis.length % COLUMNES)) % COLUMNES : 0;

  return (
    <div className="carnets-lot-pagina">
      <h1 className="titol-ocult">Carnets de socis</h1>
      <div className="carnets-lot-pagina__capcalera">
        <Link className="carnets-lot-pagina__tornar" to={ROUTES.SOCIS}>← Tornar al llistat</Link>
        {socis.length > 0 && (
          <button type="button" className="btn" onClick={() => window.print()}>
            Imprimir o desar com a PDF
          </button>
        )}
      </div>
      {socis.length === 0 ? (
        <p>No s'ha seleccionat cap soci.</p>
      ) : (
        <div className="carnets-lot scroll-horitzontal" role="region" tabIndex={0} aria-label="Carnets per imprimir">
          {socis.map((soci) => (
            <CarnetCard key={soci.id} soci={soci} />
          ))}
          {Array.from({ length: placeholders }).map((_, i) => (
            <div key={`buit-${i}`} className="carnet" aria-hidden="true" />
          ))}
        </div>
      )}
    </div>
  );
}
