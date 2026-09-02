import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import Carregant from '../../components/Carregant';
import BotoAfegir from '../../components/BotoAfegir';
import PropostesPublic from './PropostesPublic';

const CLASSE_ESTAT = {
  pendent: 'badge--pendent', aprovada: 'badge--al-dia', rebutjada: 'badge--vencut', programada: 'badge--nou-registre',
};

const ETIQUETES_ESTAT = {
  pendent: 'Pendent', aprovada: 'Aprovada', rebutjada: 'Rebutjada', programada: 'Programada',
};

const PESTANYES = [
  ['gestio', 'Gestió'],
  ['public', 'Vista pública'],
];

function GestioPropostes() {
  const [propostes, setPropostes] = useState(null);

  useEffect(() => {
    getDocs(collection(db, 'propostes')).then((snap) => {
      const llista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPropostes(llista);
    });
  }, []);

  if (propostes === null) return <Carregant />;

  return (
    <>
      {propostes.length === 0 && <p>Encara no hi ha cap proposta.</p>}
      <ul className="propostes-pendents__llista">
        {propostes.map((p) => (
          <li key={p.id} className="propostes-pendents__item">
            <Link className="enllac" to={ROUTES.PROPOSTES_EDITAR.replace(':id', p.id)}>{p.titol}</Link>
            <span className={`badge ${CLASSE_ESTAT[p.estat] ?? ''}`}>{ETIQUETES_ESTAT[p.estat] ?? p.estat}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function PropostesPendents() {
  const [pestanya, setPestanya] = useState('gestio');

  return (
    <div className="propostes-pendents">
      <div className="propostes-pendents__capcalera">
        <h1 className="propostes-pendents__titol">Propostes de pel·lícules</h1>
        <BotoAfegir to={ROUTES.PROPOSTES_NOVA} etiqueta="Nova proposta" />
      </div>
      <div className="propostes-pendents__pestanyes" role="tablist">
        {PESTANYES.map(([valor, etiqueta]) => (
          <button
            key={valor}
            type="button"
            role="tab"
            aria-selected={pestanya === valor}
            className={`propostes-pendents__pestanya${pestanya === valor ? ' propostes-pendents__pestanya--activa' : ''}`}
            onClick={() => setPestanya(valor)}
          >
            {etiqueta}
          </button>
        ))}
      </div>
      {pestanya === 'gestio' ? <GestioPropostes /> : <PropostesPublic />}
    </div>
  );
}
