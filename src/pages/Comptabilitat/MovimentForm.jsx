import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where,
} from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import {
  calcularTotal, CATEGORIES, DIRECCIONS_TRASPAS, METODES_DESPESA, METODES_INGRES, TIPUS_MOVIMENT,
  ETIQUETES_METODE, ETIQUETES_DIRECCIO,
} from '../../lib/moviments';
import { resumAccessLog } from '../../lib/escaneig';
import * as ROUTES from '../../constants/routes';

export default function MovimentForm() {
  const { id } = useParams();
  const editant = Boolean(id);
  const [searchParams] = useSearchParams();
  const [dades, setDades] = useState(() => ({
    data: '', concepte: '', tipus: TIPUS_MOVIMENT.INGRES, categoria: CATEGORIES[0],
    metodePagament: METODES_INGRES[0], direccio: DIRECCIONS_TRASPAS[0],
    preuUnitari: '', quantitat: '1', total: '',
    sessionId: editant ? '' : (searchParams.get('sessionId') ?? ''),
  }));
  const [sessions, setSessions] = useState([]);
  const [suggeriment, setSuggeriment] = useState(null);
  const [carregant, setCarregant] = useState(editant);
  const [error, setError] = useState(null);
  const [desbloquejat, setDesbloquejat] = useState(!editant);
  const navigate = useNavigate();

  useEffect(() => {
    if (!editant) return;
    getDoc(doc(db, 'moviments', id)).then((snap) => {
      const dadesDoc = snap.data();
      if (!dadesDoc) {
        navigate(ROUTES.COMPTABILITAT, { replace: true });
        return;
      }
      setDades((d) => ({
        ...d,
        ...dadesDoc,
        preuUnitari: String(dadesDoc.preuUnitari ?? ''),
        quantitat: String(dadesDoc.quantitat ?? '1'),
        total: String(dadesDoc.total ?? ''),
        sessionId: dadesDoc.sessionId ?? '',
      }));
      setCarregant(false);
    });
  }, [id, editant, navigate]);

  useEffect(() => {
    getDocs(collection(db, 'sessions')).then((snap) => {
      setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  useEffect(() => {
    if (dades.tipus !== TIPUS_MOVIMENT.INGRES || dades.categoria !== 'Aportacions' || !dades.sessionId) return;
    getDocs(query(collection(db, 'accessLog'), where('sessionId', '==', dades.sessionId))).then((snap) => {
      setSuggeriment({
        tipus: dades.tipus,
        categoria: dades.categoria,
        sessionId: dades.sessionId,
        resum: resumAccessLog(snap.docs.map((d) => d.data())),
      });
    });
  }, [dades.tipus, dades.categoria, dades.sessionId]);

  const suggerimentActiu = suggeriment
    && suggeriment.tipus === dades.tipus
    && suggeriment.categoria === dades.categoria
    && suggeriment.sessionId === dades.sessionId
    ? suggeriment.resum
    : null;

  const handleChange = (camp) => (e) => {
    setDades((d) => ({ ...d, [camp]: e.target.value }));
  };

  const handleCanviTipus = (e) => {
    const nouTipus = e.target.value;
    setDades((d) => {
      if (nouTipus === TIPUS_MOVIMENT.TRASPAS) {
        return { ...d, tipus: nouTipus, direccio: d.direccio || DIRECCIONS_TRASPAS[0] };
      }
      const metodes = nouTipus === TIPUS_MOVIMENT.DESPESA ? METODES_DESPESA : METODES_INGRES;
      return {
        ...d,
        tipus: nouTipus,
        categoria: d.categoria || CATEGORIES[0],
        metodePagament: metodes.includes(d.metodePagament) ? d.metodePagament : metodes[0],
      };
    });
  };

  const handleCanviPreuUnitari = (e) => {
    const valor = e.target.value;
    setDades((d) => (Number(d.quantitat) === 1 ? { ...d, preuUnitari: valor, total: valor } : { ...d, preuUnitari: valor }));
  };

  const handleCanviTotal = (e) => {
    const valor = e.target.value;
    setDades((d) => ({ ...d, total: valor, preuUnitari: valor }));
  };

  const omplirAmbSuggeriment = () => {
    if (!suggerimentActiu) return;
    const valor = String(suggerimentActiu.importGeneric);
    setDades((d) => ({ ...d, total: valor, preuUnitari: valor }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const quantitatNum = Number(dades.quantitat) || 0;
      const preuUnitariNum = Number(dades.preuUnitari) || 0;
      const totalNum = quantitatNum === 1 ? Number(dades.total) || 0 : calcularTotal(preuUnitariNum, quantitatNum);
      const base = {
        data: dades.data,
        concepte: dades.concepte,
        tipus: dades.tipus,
        preuUnitari: preuUnitariNum,
        quantitat: quantitatNum,
        total: totalNum,
        sessionId: dades.sessionId || '',
      };
      const moviment = dades.tipus === TIPUS_MOVIMENT.TRASPAS
        ? { ...base, direccio: dades.direccio }
        : { ...base, categoria: dades.categoria, metodePagament: dades.metodePagament };
      // `moviment` és sempre el document sencer per al tipus actual: se sobreescriu
      // amb setDoc (no merge) perquè un canvi de tipus no deixi camps obsolets
      // (categoria/metodePagament/direccio) del tipus anterior.
      if (editant) {
        await setDoc(doc(db, 'moviments', id), moviment);
      } else {
        await addDoc(collection(db, 'moviments'), moviment);
      }
      navigate(ROUTES.COMPTABILITAT);
    } catch {
      setError("No s'ha pogut desar. Torna-ho a provar.");
    }
  };

  const handleEliminar = async () => {
    const confirmat = window.confirm('Segur que vols eliminar aquest moviment? Aquesta acció no es pot desfer.');
    if (!confirmat) return;
    setError(null);
    try {
      await deleteDoc(doc(db, 'moviments', id));
      navigate(ROUTES.COMPTABILITAT);
    } catch {
      setError("No s'ha pogut desar. Torna-ho a provar.");
    }
  };

  if (carregant) return <p>Carregant…</p>;

  const metodes = dades.tipus === TIPUS_MOVIMENT.DESPESA ? METODES_DESPESA : METODES_INGRES;
  const quantitatEsUnitaria = Number(dades.quantitat) === 1;

  return (
    <form className="moviment-form" onSubmit={handleSubmit}>
      <div className="moviment-form__capcalera">
        <h1 className="moviment-form__titol">{editant ? 'Editar moviment' : 'Afegir moviment'}</h1>
        {editant && !desbloquejat && (
          <button type="button" className="btn btn--outline" onClick={() => setDesbloquejat(true)}>
            Editar dades
          </button>
        )}
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="data">Data</label>
        <input id="data" type="date" className={desbloquejat ? 'form__input' : 'form__input form__input--nomes-lectura'} value={dades.data} onChange={handleChange('data')} readOnly={!desbloquejat} />
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="concepte">Concepte</label>
        <input id="concepte" className={desbloquejat ? 'form__input' : 'form__input form__input--nomes-lectura'} value={dades.concepte} onChange={handleChange('concepte')} readOnly={!desbloquejat} />
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="tipus">Tipus</label>
        <select id="tipus" className="form__input" value={dades.tipus} onChange={handleCanviTipus} disabled={!desbloquejat}>
          <option value={TIPUS_MOVIMENT.INGRES}>Ingrés</option>
          <option value={TIPUS_MOVIMENT.DESPESA}>Despesa</option>
          <option value={TIPUS_MOVIMENT.TRASPAS}>Traspàs</option>
        </select>
      </div>

      {dades.tipus === TIPUS_MOVIMENT.TRASPAS ? (
        <div className="form__field">
          <label className="form__label" htmlFor="direccio">Direcció</label>
          <select id="direccio" className="form__input" value={dades.direccio} onChange={handleChange('direccio')} disabled={!desbloquejat}>
            {DIRECCIONS_TRASPAS.map((d) => (
              <option key={d} value={d}>{ETIQUETES_DIRECCIO[d]}</option>
            ))}
          </select>
        </div>
      ) : (
        <>
          <div className="form__field">
            <label className="form__label" htmlFor="categoria">Categoria</label>
            <select id="categoria" className="form__input" value={dades.categoria} onChange={handleChange('categoria')} disabled={!desbloquejat}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="form__field">
            <label className="form__label" htmlFor="metodePagament">Mètode de pagament</label>
            <select id="metodePagament" className="form__input" value={dades.metodePagament} onChange={handleChange('metodePagament')} disabled={!desbloquejat}>
              {metodes.map((m) => (
                <option key={m} value={m}>{ETIQUETES_METODE[m]}</option>
              ))}
            </select>
          </div>
        </>
      )}

      <div className="form__field">
        <label className="form__label" htmlFor="sessionId">Sessió (opcional)</label>
        <select id="sessionId" className="form__input" value={dades.sessionId} onChange={handleChange('sessionId')} disabled={!desbloquejat}>
          <option value="">Moviment general de l'associació</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>{s.titol}</option>
          ))}
        </select>
      </div>

      {suggerimentActiu && (
        <p className="moviment-form__suggeriment">
          Aquesta sessió ha tingut {suggerimentActiu.entradesGeneriques} aportacions ({suggerimentActiu.importGeneric}€).
          {' '}
          {desbloquejat && (
            <button type="button" className="btn btn--outline" onClick={omplirAmbSuggeriment}>
              Omplir amb {suggerimentActiu.importGeneric}€
            </button>
          )}
        </p>
      )}

      <div className="form__field">
        <label className="form__label" htmlFor="preuUnitari">Preu unitari</label>
        <input id="preuUnitari" type="number" step="0.01" className={desbloquejat ? 'form__input' : 'form__input form__input--nomes-lectura'} value={dades.preuUnitari} onChange={handleCanviPreuUnitari} readOnly={!desbloquejat} />
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="quantitat">Quantitat</label>
        <input id="quantitat" type="number" className={desbloquejat ? 'form__input' : 'form__input form__input--nomes-lectura'} value={dades.quantitat} onChange={handleChange('quantitat')} readOnly={!desbloquejat} />
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="total">Total</label>
        <input
          id="total"
          type="number"
          step="0.01"
          className={desbloquejat ? 'form__input' : 'form__input form__input--nomes-lectura'}
          value={quantitatEsUnitaria ? dades.total : calcularTotal(dades.preuUnitari, dades.quantitat)}
          onChange={handleCanviTotal}
          readOnly={!desbloquejat || !quantitatEsUnitaria}
        />
      </div>

      {error && <p className="form__error">{error}</p>}

      {desbloquejat && <button className="btn" type="submit">Desar</button>}
      {editant && desbloquejat && (
        <button className="btn btn--outline" type="button" onClick={handleEliminar}>
          Eliminar
        </button>
      )}
    </form>
  );
}
