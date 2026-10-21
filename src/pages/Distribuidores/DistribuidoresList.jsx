import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import { formatEuros } from '../../lib/moviments';
import { urlWeb } from '../../lib/distribuidores';
import Carregant from '../../components/Carregant';
import BotoAfegir from '../../components/BotoAfegir';

export default function DistribuidoresList() {
  const [distribuidores, setDistribuidores] = useState(null);

  useEffect(() => {
    getDocs(collection(db, 'distribuidores')).then((snap) => {
      const llista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setDistribuidores(llista.sort((a, b) => a.nom.localeCompare(b.nom, 'ca')));
    });
  }, []);

  if (distribuidores === null) return <Carregant />;

  return (
    <div className="distribuidores-list">
      <div className="distribuidores-list__capcalera">
        <div>
          <Link className="distribuidores-list__tornar" to={ROUTES.PROPOSTES_PENDENTS}>← Propostes</Link>
          <h1 className="distribuidores-list__titol">Distribuïdores</h1>
        </div>
        <BotoAfegir to={ROUTES.DISTRIBUIDORES_NOVA} etiqueta="Nova distribuïdora" />
      </div>
      {distribuidores.length === 0 && <p>Encara no hi ha cap distribuïdora.</p>}
      <ul className="distribuidores-list__llista">
        {distribuidores.map((d) => (
          <li key={d.id} className="distribuidores-list__item">
            <Link className="enllac distribuidores-list__nom" to={ROUTES.DISTRIBUIDORES_EDITAR.replace(':id', d.id)}>{d.nom}</Link>
            {d.web && (
              <a className="enllac" href={urlWeb(d.web)} target="_blank" rel="noopener noreferrer">{d.web}</a>
            )}
            {d.preu != null && <span className="distribuidores-list__contacte">Preu per defecte: {formatEuros(d.preu)}</span>}
            {(d.contacte || d.correu) && (
              <span className="distribuidores-list__contacte">
                {d.contacte}
                {d.contacte && d.correu && ' · '}
                {d.correu && <a className="enllac" href={`mailto:${d.correu}`}>{d.correu}</a>}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
