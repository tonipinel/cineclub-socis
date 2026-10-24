import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import { formatEuros } from '../../lib/moviments';
import { urlWeb } from '../../lib/distribuidores';
import Carregant from '../../components/Carregant';
import BotoAfegir from '../../components/BotoAfegir';
import PaginaAdmin from '../../components/PaginaAdmin';

const ERROR_CARREGA = "No s'han pogut carregar les distribuïdores. Torna-ho a provar.";

export default function DistribuidoresList() {
  const [distribuidores, setDistribuidores] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getDocs(collection(db, 'distribuidores')).then((snap) => {
      const llista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const nomDe = (d) => (typeof d.nom === 'string' ? d.nom : '');
      setDistribuidores(llista.sort((a, b) => nomDe(a).localeCompare(nomDe(b), 'ca')));
    }).catch(() => setError(ERROR_CARREGA));
  }, []);

  if (error) {
    return (
      <PaginaAdmin amplada="llista" titol="Distribuïdores">
        <p className="form__error" role="alert">{error}</p>
      </PaginaAdmin>
    );
  }
  if (distribuidores === null) return <Carregant />;

  return (
    <PaginaAdmin
      amplada="llista"
      titol="Distribuïdores"
      accions={<BotoAfegir to={ROUTES.DISTRIBUIDORES_NOVA} etiqueta="Nova distribuïdora" />}
    >
      {distribuidores.length === 0 && <p>Encara no hi ha cap distribuïdora.</p>}
      <ul className="llista-cataleg">
        {distribuidores.map((d) => (
          <li key={d.id} className="llista-cataleg__item distribuidores-list__item">
            {d.logo
              ? <img className="llista-cataleg__logo" src={d.logo} alt="" />
              : <span className="llista-cataleg__logo llista-cataleg__logo--buit" data-testid="logo-buit" aria-hidden="true" />}
            <div className="llista-cataleg__text">
              <Link className="enllac llista-cataleg__nom" to={ROUTES.DISTRIBUIDORES_EDITAR.replace(':id', d.id)}>{d.nom}</Link>
              {d.web && (
                <a className="enllac llista-cataleg__web" href={urlWeb(d.web)} target="_blank" rel="noopener noreferrer">{d.web}</a>
              )}
              {d.preu != null && <span className="distribuidores-list__preu">Preu per defecte: {formatEuros(d.preu)}</span>}
              {(d.contacte || d.correu) && (
                <span className="distribuidores-list__contacte">
                  {d.contacte}
                  {d.contacte && d.correu && ' · '}
                  {d.correu && <a className="enllac" href={`mailto:${d.correu}`}>{d.correu}</a>}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </PaginaAdmin>
  );
}
