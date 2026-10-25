import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import Carregant from '../../components/Carregant';
import BotoAfegir from '../../components/BotoAfegir';
import PaginaAdmin from '../../components/PaginaAdmin';
import ErrorCarrega from '../../components/ErrorCarrega';
import useErrorCarrega from '../../lib/useErrorCarrega';

export default function EntitatsList() {
  const [entitats, setEntitats] = useState(null);
  const {
    error, falla, reintenta, intent,
  } = useErrorCarrega();

  useEffect(() => {
    getDocs(collection(db, 'entitats')).then((snap) => {
      const llista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const nomDe = (e) => (typeof e.nom === 'string' ? e.nom : '');
      setEntitats(llista.sort((a, b) => nomDe(a).localeCompare(nomDe(b), 'ca')));
    }).catch(falla);
  }, [intent, falla]);

  if (error) return <ErrorCarrega titol="Entitats" missatge="No s'han pogut carregar les entitats." onReintenta={reintenta} />;
  if (entitats === null) return <Carregant />;

  return (
    <PaginaAdmin
      amplada="llista"
      titol="Entitats"
      accions={<BotoAfegir to={ROUTES.ENTITATS_NOVA} etiqueta="Nova entitat" />}
    >
      {entitats.length === 0 && <p>Encara no hi ha cap entitat.</p>}
      <ul className="llista-cataleg">
        {entitats.map((e) => (
          <li key={e.id} className="llista-cataleg__item">
            {e.logo
              ? <img className="llista-cataleg__logo" src={e.logo} alt="" />
              : <span className="llista-cataleg__logo llista-cataleg__logo--buit" data-testid="logo-buit" aria-hidden="true" />}
            <div className="llista-cataleg__text">
              <Link className="enllac llista-cataleg__nom" to={ROUTES.ENTITATS_EDITAR.replace(':id', e.id)}>{e.nom}</Link>
              {e.url && <a className="enllac llista-cataleg__web" href={e.url} target="_blank" rel="noopener noreferrer">{e.url}</a>}
            </div>
          </li>
        ))}
      </ul>
    </PaginaAdmin>
  );
}
