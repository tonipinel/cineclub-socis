import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, doc, onSnapshot, orderBy, query, runTransaction } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';

const QUANTITAT_MAXIMA = 500;

function avui() {
  return new Date().toLocaleDateString('sv-SE');
}

export default function TicketsPage() {
  const [lots, setLots] = useState([]);
  const [quantitat, setQuantitat] = useState('150');
  const [preu, setPreu] = useState('5');
  const [generant, setGenerant] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const q = query(collection(db, 'lotsTiquets'), orderBy('numeroInicial', 'desc'));
    return onSnapshot(q, (snap) => {
      setLots(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const handleGenerar = async () => {
    const n = Number(quantitat);
    if (!Number.isInteger(n) || n <= 0 || n > QUANTITAT_MAXIMA) {
      setError(`La quantitat ha de ser un número enter entre 1 i ${QUANTITAT_MAXIMA}.`);
      return;
    }
    const confirmat = window.confirm(
      `Es reservaran ${n} números de tiquet nous. Un cop generats no es tornaran a repetir. Vols continuar?`
    );
    if (!confirmat) return;
    setError(null);
    setGenerant(true);
    try {
      const comptadorRef = doc(db, 'configuracio', 'tiquets');
      const lotRef = doc(collection(db, 'lotsTiquets'));
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(comptadorRef);
        const actual = snap.exists() ? snap.data().seguentNumero ?? 1 : 1;
        transaction.set(comptadorRef, { seguentNumero: actual + n }, { merge: true });
        transaction.set(lotRef, {
          numeroInicial: actual,
          quantitat: n,
          preu: Number(preu) || 0,
          dataGeneracio: avui(),
          impres: false,
          dataImpressio: null,
          anulat: false,
          dataAnulacio: null,
          codisAnulats: [],
        });
      });
      navigate(ROUTES.TICKETS_LOT.replace(':id', lotRef.id));
    } catch {
      setError("No s'han pogut generar els tiquets. Torna-ho a provar.");
    } finally {
      setGenerant(false);
    }
  };

  return (
    <div className="tickets-pagina">
      <div className="tickets-pagina__capcalera">
        <h1 className="tickets-pagina__titol">Tiquets genèrics</h1>
      </div>

      <div className="tickets-pagina__formulari">
        <div className="form__field">
          <label className="form__label" htmlFor="quantitat-tiquets">Quantitat</label>
          <input
            id="quantitat-tiquets"
            type="number"
            className="form__input"
            value={quantitat}
            onChange={(e) => setQuantitat(e.target.value)}
          />
        </div>
        <div className="form__field">
          <label className="form__label" htmlFor="preu-tiquet">Preu</label>
          <input
            id="preu-tiquet"
            type="number"
            step="0.01"
            className="form__input"
            value={preu}
            onChange={(e) => setPreu(e.target.value)}
          />
        </div>
        <button type="button" className="btn" onClick={handleGenerar} disabled={generant}>
          Generar tiquets nous
        </button>
      </div>

      {error && <p className="form__error">{error}</p>}

      <ul className="tickets-llista">
        {lots.map((lot) => (
          <li key={lot.id} className="tickets-llista__item">
            <Link className="enllac" to={ROUTES.TICKETS_LOT.replace(':id', lot.id)}>
              Tiquets T-{String(lot.numeroInicial).padStart(6, '0')} – T-{String(lot.numeroInicial + lot.quantitat - 1).padStart(6, '0')}
              {' '}({lot.quantitat})
            </Link>
            <span className="tickets-llista__data">Generat el {lot.dataGeneracio}</span>
            {lot.anulat && <span className="badge badge--anulat">Anul·lat</span>}
            {!lot.anulat && lot.impres && <span className="badge badge--impres">Imprès el {lot.dataImpressio}</span>}
            {!lot.anulat && !lot.impres && <span className="badge badge--pendent-impressio">Pendent d'imprimir</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
