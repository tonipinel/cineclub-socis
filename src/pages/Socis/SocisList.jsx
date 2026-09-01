import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, onSnapshot, query } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import {
  calcularEstatSoci, calcularVenciment, estaActiu, ESTAT_AL_DIA, ESTAT_PENDENT, ESTAT_VENCUT, ESTAT_NOU_REGISTRE,
} from '../../lib/estatSoci';
import { filtrarSocis, ordenarSocis, FILTRE_PROXIMA_RENOVACIO } from '../../lib/socis';
import { comptarAssistenciesRecents } from '../../lib/escaneig';
import * as ROUTES from '../../constants/routes';
import BotoAfegir from '../../components/BotoAfegir';

const ETIQUETES_ESTAT = {
  [ESTAT_AL_DIA]: 'Al dia',
  [ESTAT_PENDENT]: 'Pendent',
  [ESTAT_VENCUT]: 'Vençut',
  [ESTAT_NOU_REGISTRE]: 'Nou registre',
};

const COLUMNES = [
  ['numeroSoci', 'Núm.'],
  ['nom', 'Nom'],
  ['cognoms', 'Cognoms'],
  ['estat', 'Estat'],
  ['venciment', 'Venciment'],
  ['assistencies', 'Assistències (12 mesos)'],
];

function formatData(data) {
  return data.toLocaleDateString('ca-ES');
}

function NomSoci({ soci }) {
  return <Link className="enllac" to={ROUTES.SOCIS_EDITAR.replace(':id', soci.id)}>{soci.nom}</Link>;
}

function CognomsSoci({ soci }) {
  return <Link className="enllac" to={ROUTES.SOCIS_EDITAR.replace(':id', soci.id)}>{soci.cognoms}</Link>;
}

const RENDERITZAR_CELDA = {
  numeroSoci: (soci) => soci.numeroSoci,
  nom: (soci) => <NomSoci soci={soci} />,
  cognoms: (soci) => <CognomsSoci soci={soci} />,
  estat: (soci) => (
    <>
      <span className={`badge badge--${calcularEstatSoci(soci)}`}>
        {ETIQUETES_ESTAT[calcularEstatSoci(soci)]}
      </span>
      {!estaActiu(soci) && <span className="badge badge--desactivat">Desactivat</span>}
    </>
  ),
  venciment: (soci) => formatData(calcularVenciment(soci)),
  assistencies: (soci) => soci.assistencies ?? 0,
};

export default function SocisList() {
  const [socis, setSocis] = useState([]);
  const [assistenciesPerSoci, setAssistenciesPerSoci] = useState({});
  const [cerca, setCerca] = useState('');
  const [estat, setEstat] = useState('tots');
  const [ordenacio, setOrdenacio] = useState({ columna: 'numeroSoci', direccio: 'desc' });
  const [seleccionats, setSeleccionats] = useState(new Set());

  useEffect(() => {
    const q = query(collection(db, 'socis'));
    return onSnapshot(q, (snap) => {
      setSocis(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'accessLog'));
    getDocs(q).then((snap) => {
      const entrades = snap.docs.map((d) => {
        const dades = d.data();
        return { ...dades, data: dades.timestamp?.toDate?.() };
      });
      setAssistenciesPerSoci(comptarAssistenciesRecents(entrades));
    });
  }, []);

  const canviarOrdenacio = (columna) => {
    setOrdenacio((actual) => {
      if (actual.columna !== columna) return { columna, direccio: 'asc' };
      return { columna, direccio: actual.direccio === 'asc' ? 'desc' : 'asc' };
    });
  };

  const socisAmbAssistencies = socis.map((soci) => ({
    ...soci,
    assistencies: assistenciesPerSoci[soci.numeroSoci] ?? 0,
  }));

  const socisFiltrats = ordenarSocis(filtrarSocis(socisAmbAssistencies, { cerca, estat }), ordenacio);

  const alternarSeleccio = (id) => {
    setSeleccionats((actual) => {
      const nou = new Set(actual);
      if (nou.has(id)) nou.delete(id); else nou.add(id);
      return nou;
    });
  };

  const totsSeleccionats = socisFiltrats.length > 0 && socisFiltrats.every((soci) => seleccionats.has(soci.id));

  const alternarSeleccioTots = () => {
    setSeleccionats((actual) => {
      const nou = new Set(actual);
      const accio = totsSeleccionats ? 'delete' : 'add';
      socisFiltrats.forEach((soci) => nou[accio](soci.id));
      return nou;
    });
  };

  return (
    <div className="socis-list">
      <div className="socis-list__capcalera">
        <h1 className="socis-list__titol">Socis</h1>
        <div className="socis-list__accions">
          {seleccionats.size > 0 && (
            <Link className="btn btn--outline" to={`${ROUTES.SOCIS_CARNETS}?ids=${[...seleccionats].join(',')}`}>
              Imprimir carnets ({seleccionats.size})
            </Link>
          )}
          <BotoAfegir to={ROUTES.SOCIS_NOU} etiqueta="Donar d'alta" />
        </div>
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
          <option value={FILTRE_PROXIMA_RENOVACIO}>Renovació pròxima (30 dies)</option>
        </select>
      </div>
      <table className="socis-list__taula">
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                aria-label="Seleccionar tots els socis"
                checked={totsSeleccionats}
                onChange={alternarSeleccioTots}
              />
            </th>
            {COLUMNES.map(([columna, etiqueta]) => (
              <th key={columna}>
                <button
                  type="button"
                  className="socis-list__ordenar"
                  onClick={() => canviarOrdenacio(columna)}
                >
                  {etiqueta}
                  {ordenacio.columna === columna && (ordenacio.direccio === 'asc' ? ' ▲' : ' ▼')}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {socisFiltrats.map((soci) => (
            <tr key={soci.id}>
              <td>
                <input
                  type="checkbox"
                  aria-label={`Seleccionar ${soci.nom} ${soci.cognoms}`}
                  checked={seleccionats.has(soci.id)}
                  onChange={() => alternarSeleccio(soci.id)}
                />
              </td>
              {COLUMNES.map(([columna]) => (
                <td key={columna}>{RENDERITZAR_CELDA[columna](soci)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
