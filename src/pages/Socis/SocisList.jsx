import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { calcularEstatSoci, ESTAT_AL_DIA, ESTAT_PENDENT, ESTAT_VENCUT } from '../../lib/estatSoci';
import { filtrarSocis } from '../../lib/socis';
import * as ROUTES from '../../constants/routes';

const ETIQUETES_ESTAT = {
  [ESTAT_AL_DIA]: 'Al dia',
  [ESTAT_PENDENT]: 'Pendent',
  [ESTAT_VENCUT]: 'Vençut',
};

export default function SocisList() {
  const [socis, setSocis] = useState([]);
  const [cerca, setCerca] = useState('');
  const [estat, setEstat] = useState('tots');

  useEffect(() => {
    const q = query(collection(db, 'socis'), orderBy('cognoms'));
    return onSnapshot(q, (snap) => {
      setSocis(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const socisFiltrats = filtrarSocis(socis, { cerca, estat });

  return (
    <div className="socis-list">
      <div className="socis-list__capcalera">
        <h1 className="socis-list__titol">Socis</h1>
        <Link className="btn" to={ROUTES.SOCIS_NOU}>Donar d'alta</Link>
      </div>
      <div className="socis-list__filtres">
        <input
          className="form__input"
          placeholder="Cerca per nom, cognoms o número de soci"
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
        />
        <select className="form__input" value={estat} onChange={(e) => setEstat(e.target.value)}>
          <option value="tots">Tots els estats</option>
          <option value={ESTAT_AL_DIA}>Estat: Al dia</option>
          <option value={ESTAT_PENDENT}>Estat: Pendent</option>
          <option value={ESTAT_VENCUT}>Estat: Vençut</option>
        </select>
      </div>
      <table className="socis-list__taula">
        <thead>
          <tr>
            <th>Núm.</th><th>Nom</th><th>Cognoms</th><th>Estat</th><th></th>
          </tr>
        </thead>
        <tbody>
          {socisFiltrats.map((soci) => (
            <tr key={soci.id}>
              <td>{soci.numeroSoci}</td>
              <td>{soci.nom}</td>
              <td>{soci.cognoms}</td>
              <td>
                <span className={`badge badge--${calcularEstatSoci(soci)}`}>
                  {ETIQUETES_ESTAT[calcularEstatSoci(soci)]}
                </span>
              </td>
              <td>
                <Link to={ROUTES.SOCIS_EDITAR.replace(':id', soci.id)}>Editar</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
