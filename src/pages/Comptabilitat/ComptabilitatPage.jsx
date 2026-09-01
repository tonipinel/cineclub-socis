import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, onSnapshot, query } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import {
  calcularSaldos, filtrarMoviments, ordenarMoviments, formatEuros, classeSigne,
  TIPUS_MOVIMENT, CATEGORIES, ETIQUETES_TIPUS, ETIQUETES_METODE, ETIQUETES_DIRECCIO,
} from '../../lib/moviments';
import * as ROUTES from '../../constants/routes';
import BotoAfegir from '../../components/BotoAfegir';

const COLUMNES = [
  ['data', 'Data'],
  ['concepte', 'Concepte'],
  ['tipus', 'Tipus'],
  ['categoriaODireccio', 'Categoria'],
  ['metodePagament', 'Mètode'],
  ['total', 'Total'],
];

const COLUMNES_ORDENABLES = new Set(['data', 'concepte', 'tipus', 'total']);

const RENDERITZAR_CELDA = {
  data: (m) => m.data,
  concepte: (m) => m.concepte,
  tipus: (m) => (
    <span className={`badge badge--${m.tipus}`}>{ETIQUETES_TIPUS[m.tipus] ?? m.tipus}</span>
  ),
  categoriaODireccio: (m) => m.categoria ?? ETIQUETES_DIRECCIO[m.direccio] ?? '',
  metodePagament: (m) => {
    const etiqueta = ETIQUETES_METODE[m.metodePagament] ?? m.metodePagament;
    return etiqueta ? <span className="badge badge--metode">{etiqueta}</span> : null;
  },
  total: (m) => (
    <span className={`comptabilitat__import ${m.tipus === 'traspas' ? 'comptabilitat__valor--traspas' : classeSigne(m.tipus === 'despesa' ? -1 : 1)}`}>
      {m.tipus === 'traspas' ? '' : m.tipus === 'despesa' ? '−' : '+'}{formatEuros(Number(m.total) || 0)}
    </span>
  ),
};

export default function ComptabilitatPage() {
  const [moviments, setMoviments] = useState([]);
  const [tipus, setTipus] = useState('tots');
  const [categoria, setCategoria] = useState('totes');
  const [sessionId, setSessionId] = useState('totes');
  const [sessions, setSessions] = useState([]);
  const [ordenacio, setOrdenacio] = useState({ columna: 'data', direccio: 'desc' });

  useEffect(() => {
    const q = query(collection(db, 'moviments'));
    return onSnapshot(q, (snap) => {
      setMoviments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  useEffect(() => {
    getDocs(collection(db, 'sessions')).then((snap) => {
      setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const canviarOrdenacio = (columna) => {
    setOrdenacio((actual) => {
      if (actual.columna !== columna) return { columna, direccio: 'asc' };
      return { columna, direccio: actual.direccio === 'asc' ? 'desc' : 'asc' };
    });
  };

  const saldos = calcularSaldos(moviments);
  const movimentsFiltrats = ordenarMoviments(filtrarMoviments(moviments, { tipus, categoria, sessionId }), ordenacio);

  return (
    <div className="comptabilitat">
      <div className="comptabilitat__capcalera">
        <h1 className="comptabilitat__titol">Comptabilitat</h1>
        <BotoAfegir to={ROUTES.COMPTABILITAT_NOU} etiqueta="Afegir moviment" />
      </div>

      <div className="comptabilitat__saldos">
        <p className={`comptabilitat__saldo ${classeSigne(saldos.caixa)}`}>Caixa: {formatEuros(saldos.caixa)}</p>
        <p className={`comptabilitat__saldo ${classeSigne(saldos.banc)}`}>Banc: {formatEuros(saldos.banc)}</p>
        <p className={`comptabilitat__saldo ${classeSigne(saldos.excedent)}`}>Excedent: {formatEuros(saldos.excedent)}</p>
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
        <select className="form__input" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
          <option value="totes">Totes les sessions</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>{s.titol}</option>
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
            <tr key={moviment.id}>
              {COLUMNES.map(([columna]) => (
                <td key={columna}>
                  {columna === 'concepte' ? (
                    <Link className="enllac" to={ROUTES.COMPTABILITAT_EDITAR.replace(':id', moviment.id)}>{RENDERITZAR_CELDA[columna](moviment)}</Link>
                  ) : RENDERITZAR_CELDA[columna](moviment)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
