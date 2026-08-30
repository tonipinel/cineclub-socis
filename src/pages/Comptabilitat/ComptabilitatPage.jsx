import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { calcularSaldos, filtrarMoviments, ordenarMoviments, TIPUS_MOVIMENT, CATEGORIES } from '../../lib/moviments';
import * as ROUTES from '../../constants/routes';

const COLUMNES = [
  ['data', 'Data'],
  ['concepte', 'Concepte'],
  ['tipus', 'Tipus'],
  ['categoriaODireccio', 'Categoria'],
  ['metodePagament', 'Mètode'],
  ['total', 'Total'],
];

const COLUMNES_ORDENABLES = new Set(['data', 'concepte', 'tipus', 'total']);

function formatEuros(valor) {
  return `${valor.toFixed(2)}€`;
}

const RENDERITZAR_CELDA = {
  data: (m) => m.data,
  concepte: (m) => m.concepte,
  tipus: (m) => m.tipus,
  categoriaODireccio: (m) => m.categoria ?? m.direccio ?? '',
  metodePagament: (m) => m.metodePagament ?? '',
  total: (m) => formatEuros(Number(m.total) || 0),
};

export default function ComptabilitatPage() {
  const [moviments, setMoviments] = useState([]);
  const [tipus, setTipus] = useState('tots');
  const [categoria, setCategoria] = useState('totes');
  const [ordenacio, setOrdenacio] = useState({ columna: 'data', direccio: 'desc' });
  const navigate = useNavigate();

  useEffect(() => {
    const q = query(collection(db, 'moviments'));
    return onSnapshot(q, (snap) => {
      setMoviments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const canviarOrdenacio = (columna) => {
    setOrdenacio((actual) => {
      if (actual.columna !== columna) return { columna, direccio: 'asc' };
      return { columna, direccio: actual.direccio === 'asc' ? 'desc' : 'asc' };
    });
  };

  const saldos = calcularSaldos(moviments);
  const movimentsFiltrats = ordenarMoviments(filtrarMoviments(moviments, { tipus, categoria }), ordenacio);

  return (
    <div className="comptabilitat">
      <div className="comptabilitat__capcalera">
        <h1 className="comptabilitat__titol">Comptabilitat</h1>
        <Link className="btn" to={ROUTES.COMPTABILITAT_NOU}>Afegir moviment</Link>
      </div>

      <div className="comptabilitat__saldos">
        <p>Caixa: {formatEuros(saldos.caixa)}</p>
        <p>Banc: {formatEuros(saldos.banc)}</p>
        <p>Excedent: {formatEuros(saldos.excedent)}</p>
      </div>

      <div className="comptabilitat__filtres">
        <select className="form__input" value={tipus} onChange={(e) => setTipus(e.target.value)}>
          <option value="tots">Tots els tipus</option>
          <option value={TIPUS_MOVIMENT.INGRES}>Tipus: Ingrés</option>
          <option value={TIPUS_MOVIMENT.DESPESA}>Tipus: Despesa</option>
          <option value={TIPUS_MOVIMENT.TRASPAS}>Tipus: Traspàs</option>
        </select>
        <select className="form__input" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="totes">Totes les categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <table className="comptabilitat__taula">
        <thead>
          <tr>
            {COLUMNES.map(([columna, etiqueta]) => (
              <th key={columna}>
                {COLUMNES_ORDENABLES.has(columna) ? (
                  <button type="button" className="comptabilitat__ordenar" onClick={() => canviarOrdenacio(columna)}>
                    {etiqueta}
                    {ordenacio.columna === columna && (ordenacio.direccio === 'asc' ? ' ▲' : ' ▼')}
                  </button>
                ) : etiqueta}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {movimentsFiltrats.map((moviment) => (
            <tr key={moviment.id} onClick={() => navigate(ROUTES.COMPTABILITAT_EDITAR.replace(':id', moviment.id))}>
              {COLUMNES.map(([columna]) => (
                <td key={columna}>{RENDERITZAR_CELDA[columna](moviment)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
