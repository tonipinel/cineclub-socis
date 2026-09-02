import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, getDocs, onSnapshot, query } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import {
  calcularSaldos, filtrarMoviments, ordenarMoviments, formatEuros, classeSigne,
  TIPUS_MOVIMENT, CATEGORIES, ETIQUETES_METODE, ETIQUETES_DIRECCIO,
} from '../../lib/moviments';
import { formatData } from '../../lib/data';
import * as ROUTES from '../../constants/routes';
import BotoAfegir from '../../components/BotoAfegir';
import BotoFiltres from '../../components/BotoFiltres';

const COLUMNES = [
  ['total', 'Import'],
  ['metodePagament', 'Mètode'],
  ['concepte', 'Concepte'],
  ['categoriaODireccio', 'Categoria'],
  ['data', 'Data'],
];

const COLUMNES_ORDENABLES = new Set(['data', 'concepte', 'total']);

const PREFIX_TIPUS = { ingres: '+', despesa: '−', traspas: '>' };

const RENDERITZAR_CELDA = {
  data: (m) => formatData(m.data),
  concepte: (m) => (
    <Link className="enllac" to={ROUTES.COMPTABILITAT_EDITAR.replace(':id', m.id)} onClick={(e) => e.stopPropagation()}>
      {m.concepte}
    </Link>
  ),
  categoriaODireccio: (m) => m.categoria ?? ETIQUETES_DIRECCIO[m.direccio] ?? '',
  metodePagament: (m) => {
    const etiqueta = ETIQUETES_METODE[m.metodePagament] ?? m.metodePagament;
    if (!etiqueta) return null;
    const variant = m.metodePagament === 'efectiu' ? 'badge--metode-efectiu' : 'badge--metode-banc';
    return <span className={`badge ${variant}`}>{etiqueta}</span>;
  },
  total: (m) => (
    <span className={`comptabilitat__import ${m.tipus === 'traspas' ? 'comptabilitat__valor--traspas' : classeSigne(m.tipus === 'despesa' ? -1 : 1)}`}>
      {PREFIX_TIPUS[m.tipus] ?? ''}{formatEuros(Number(m.total) || 0)}
    </span>
  ),
};

export default function ComptabilitatPage() {
  const navigate = useNavigate();
  const [moviments, setMoviments] = useState([]);
  const [tipus, setTipus] = useState('tots');
  const [categoria, setCategoria] = useState('totes');
  const [sessionId, setSessionId] = useState('totes');
  const [sessions, setSessions] = useState([]);
  const [desde, setDesde] = useState('');
  const [fins, setFins] = useState('');
  const [filtresOberts, setFiltresOberts] = useState(false);
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
  const movimentsFiltrats = ordenarMoviments(
    filtrarMoviments(moviments, { tipus, categoria, sessionId, desde, fins }), ordenacio
  );

  return (
    <div className="comptabilitat">
      <div className="comptabilitat__capcalera">
        <h1 className="comptabilitat__titol">Comptabilitat</h1>
        <div className="comptabilitat__accions">
          <BotoFiltres obert={filtresOberts} onClick={() => setFiltresOberts((v) => !v)} />
          <BotoAfegir to={ROUTES.COMPTABILITAT_NOU} etiqueta="Afegir moviment" />
        </div>
      </div>

      <div className="comptabilitat__formula">
        <div className="comptabilitat__formula-fila">
          <div className="comptabilitat__formula-terme">
            <p className="comptabilitat__formula-etiqueta">Disponibilitat en efectiu</p>
            <p className="comptabilitat__formula-valor comptabilitat__formula-valor--efectiu">{formatEuros(saldos.caixa)}</p>
          </div>
          <span className="comptabilitat__formula-operador">+</span>
          <div className="comptabilitat__formula-terme">
            <p className="comptabilitat__formula-etiqueta">Disponibilitat bancària</p>
            <p className="comptabilitat__formula-valor comptabilitat__formula-valor--banc">{formatEuros(saldos.banc)}</p>
          </div>
        </div>
        <div className="comptabilitat__formula-fila">
          <span className="comptabilitat__formula-operador">=</span>
          <div className="comptabilitat__formula-terme comptabilitat__formula-terme--total">
            <p className="comptabilitat__formula-etiqueta">Fons total de tresoreria</p>
            <p className="comptabilitat__formula-valor comptabilitat__formula-valor--total">{formatEuros(saldos.excedent)}</p>
          </div>
        </div>
      </div>

      <div className={`comptabilitat__filtres-wrap ${filtresOberts ? 'comptabilitat__filtres-wrap--obert' : ''}`}>
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
          <input
            type="date"
            className="form__input"
            aria-label="Data des de"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
          <input
            type="date"
            className="form__input"
            aria-label="Data fins"
            value={fins}
            onChange={(e) => setFins(e.target.value)}
          />
        </div>
      </div>

      <div className="comptabilitat__taula-wrap">
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
            {movimentsFiltrats.map((moviment) => {
              const anarADetall = () => navigate(ROUTES.COMPTABILITAT_EDITAR.replace(':id', moviment.id));
              return (
                <tr
                  key={moviment.id}
                  className="comptabilitat__fila"
                  tabIndex={0}
                  onClick={anarADetall}
                  onKeyDown={(e) => { if (e.key === 'Enter') anarADetall(); }}
                >
                  {COLUMNES.map(([columna]) => (
                    <td key={columna}>{RENDERITZAR_CELDA[columna](moviment)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
