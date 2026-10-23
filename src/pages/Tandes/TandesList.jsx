import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import { formatDataHora } from '../../lib/data';
import { aData, potCrearTanda } from '../../lib/tandes';
import Carregant from '../../components/Carregant';
import BotoAfegir from '../../components/BotoAfegir';
import PaginaAdmin from '../../components/PaginaAdmin';

const aMillis = (valor) => aData(valor).getTime();

export default function TandesList() {
  const [tandes, setTandes] = useState(null);

  useEffect(() => {
    getDocs(collection(db, 'tandes')).then((snap) => {
      const llista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTandes(llista.sort((a, b) => aMillis(b.tanca) - aMillis(a.tanca)));
    });
  }, []);

  if (tandes === null) return <Carregant />;

  const ara = new Date();
  const podemCrear = potCrearTanda(tandes, ara);

  return (
    <PaginaAdmin
      amplada="llista"
      titol="Tandes de votació"
      accions={<BotoAfegir to={ROUTES.TANDES_NOVA} etiqueta="Nova tanda" desactivat={!podemCrear} />}
    >
      {!podemCrear && (
        <p className="tandes-list__avis">Ja hi ha una tanda oberta. Tanca-la abans de crear-ne una de nova.</p>
      )}
      {tandes.length === 0 && <p>Encara no hi ha cap tanda.</p>}
      <ul className="tandes-list__llista">
        {tandes.map((t) => {
          const nPropostes = Array.isArray(t.propostes) ? t.propostes.length : 0;
          const oberta = aMillis(t.tanca) > ara.getTime();
          return (
            <li key={t.id} className="tandes-list__item">
              <Link className="enllac tandes-list__nom" to={ROUTES.TANDES_EDITAR.replace(':id', t.id)}>{t.nom}</Link>
              <span className={`tandes-list__estat badge ${oberta ? 'badge--al-dia' : 'badge--desactivat'}`}>{oberta ? 'Oberta' : 'Tancada'}</span>
              <span className="tandes-list__tanca">Tanca: {formatDataHora(t.tanca)}</span>
              <Link className="enllac tandes-list__propostes" to={`${ROUTES.PROPOSTES_PENDENTS}?tanda=${encodeURIComponent(t.id)}`}>
                {nPropostes === 1 ? '1 proposta' : `${nPropostes} propostes`}
              </Link>
              <Link className="enllac tandes-list__resultats" to={ROUTES.TANDES_RESULTATS.replace(':id', t.id)}>Resultats</Link>
            </li>
          );
        })}
      </ul>
    </PaginaAdmin>
  );
}
