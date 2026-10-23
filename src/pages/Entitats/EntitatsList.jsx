import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import Carregant from '../../components/Carregant';
import BotoAfegir from '../../components/BotoAfegir';
import PaginaAdmin from '../../components/PaginaAdmin';

const ERROR_CARREGA = "No s'han pogut carregar les entitats. Torna-ho a provar.";

export default function EntitatsList() {
  const [entitats, setEntitats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getDocs(collection(db, 'entitats')).then((snap) => {
      const llista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const nomDe = (e) => (typeof e.nom === 'string' ? e.nom : '');
      setEntitats(llista.sort((a, b) => nomDe(a).localeCompare(nomDe(b), 'ca')));
    }).catch(() => setError(ERROR_CARREGA));
  }, []);

  if (error) {
    return (
      <PaginaAdmin amplada="llista" titol="Entitats">
        <p className="form__error" role="alert">{error}</p>
      </PaginaAdmin>
    );
  }
  if (entitats === null) return <Carregant />;

  return (
    <PaginaAdmin
      amplada="llista"
      titol="Entitats"
      accions={<BotoAfegir to={ROUTES.ENTITATS_NOVA} etiqueta="Nova entitat" />}
    >
      {entitats.length === 0 && <p>Encara no hi ha cap entitat.</p>}
      <ul className="entitats-list__llista">
        {entitats.map((e) => (
          <li key={e.id} className="entitats-list__item">
            {e.logo
              ? <img className="entitats-list__logo" src={e.logo} alt={e.nom} />
              : <span className="entitats-list__logo entitats-list__logo--buit" data-testid="logo-buit" aria-hidden="true" />}
            <div className="entitats-list__text">
              <Link className="enllac entitats-list__nom" to={ROUTES.ENTITATS_EDITAR.replace(':id', e.id)}>{e.nom}</Link>
              {e.url && <a className="enllac entitats-list__url" href={e.url} target="_blank" rel="noopener noreferrer">{e.url}</a>}
            </div>
          </li>
        ))}
      </ul>
    </PaginaAdmin>
  );
}
