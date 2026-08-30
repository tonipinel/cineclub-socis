import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  addDoc, collection, doc, getDoc, getDocs, onSnapshot, query, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { resumAccessLog } from '../../lib/escaneig';
import { subtotalsPerMetode } from '../../lib/moviments';
import * as ROUTES from '../../constants/routes';

const CAMPS_INICIALS = {
  titol: '', data: '', urlProgramacio: '', imatgeUrl: '', preuEntrada: '5', lotActiu: 'lot1',
};

const CAMPS_FORMULARI = [
  ['titol', 'Títol', 'text'],
  ['data', 'Data', 'date'],
  ['urlProgramacio', 'URL de programació', 'text'],
  ['imatgeUrl', 'URL de la imatge', 'text'],
  ['preuEntrada', "Preu d'entrada (no-socis)", 'text'],
];

const RESUM_INICIAL = { socisDistints: 0, entradesGeneriques: 0, importGeneric: 0 };

export default function SessionForm() {
  const { id } = useParams();
  const editant = Boolean(id);
  const [dades, setDades] = useState(CAMPS_INICIALS);
  const [carregant, setCarregant] = useState(editant);
  const [error, setError] = useState(null);
  const [resum, setResum] = useState(RESUM_INICIAL);
  const [subtotals, setSubtotals] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    if (!editant) return;
    getDoc(doc(db, 'sessions', id)).then((snap) => {
      setDades({ ...CAMPS_INICIALS, ...snap.data() });
      setCarregant(false);
    });
  }, [id, editant]);

  useEffect(() => {
    if (!editant) return;
    const q = query(collection(db, 'accessLog'), where('sessionId', '==', id));
    return onSnapshot(q, (snap) => {
      setResum(resumAccessLog(snap.docs.map((d) => d.data())));
    });
  }, [id, editant]);

  useEffect(() => {
    if (!editant) return;
    const q = query(collection(db, 'moviments'), where('sessionId', '==', id));
    return onSnapshot(q, (snap) => {
      setSubtotals(subtotalsPerMetode(snap.docs.map((d) => d.data())));
    });
  }, [id, editant]);

  const handleChange = (camp) => (e) => {
    setDades((d) => ({ ...d, [camp]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      // El camp `activa` és exclusiu de "Marcar com a activa" (handleMarcarActiva):
      // un "Desar" normal mai l'ha de sobreescriure amb l'estat local, que pot
      // haver quedat desactualitzat si s'ha activat una altra sessió mentre
      // aquest formulari estava obert.
      const { activa: _activaActual, ...dadesADesar } = {
        ...dades,
        preuEntrada: Number(dades.preuEntrada) || 0,
      };
      if (editant) {
        await updateDoc(doc(db, 'sessions', id), dadesADesar);
      } else {
        await addDoc(collection(db, 'sessions'), { ...dadesADesar, activa: false });
      }
      navigate(ROUTES.SESSIONS);
    } catch {
      setError("No s'ha pogut desar. Torna-ho a provar.");
    }
  };

  const handleMarcarActiva = async () => {
    setError(null);
    try {
      const activesAbans = await getDocs(query(collection(db, 'sessions'), where('activa', '==', true)));
      const batch = writeBatch(db);
      activesAbans.docs.forEach((docActiu) => batch.update(docActiu.ref, { activa: false }));
      batch.update(doc(db, 'sessions', id), { activa: true });
      await batch.commit();
      setDades((d) => ({ ...d, activa: true }));
    } catch {
      setError("No s'ha pogut desar. Torna-ho a provar.");
    }
  };

  if (carregant) return <p>Carregant…</p>;

  return (
    <form className="session-form" onSubmit={handleSubmit}>
      <h1 className="session-form__titol">{editant ? 'Editar sessió' : 'Nova sessió'}</h1>

      {CAMPS_FORMULARI.map(([camp, etiqueta, tipus]) => (
        <div className="form__field" key={camp}>
          <label className="form__label" htmlFor={camp}>{etiqueta}</label>
          <input id={camp} type={tipus} className="form__input" value={dades[camp] ?? ''} onChange={handleChange(camp)} />
        </div>
      ))}

      <div className="form__field">
        <label className="form__label" htmlFor="lotActiu">Lot de tiquets actiu</label>
        <select id="lotActiu" className="form__input" value={dades.lotActiu ?? 'lot1'} onChange={handleChange('lotActiu')}>
          <option value="lot1">Lot 1</option>
          <option value="lot2">Lot 2</option>
        </select>
      </div>

      {error && <p className="form__error">{error}</p>}

      <button className="btn" type="submit">Desar</button>

      {editant && !dades.activa && (
        <button className="btn btn--outline" type="button" onClick={handleMarcarActiva}>
          Marcar com a activa
        </button>
      )}
      {editant && dades.activa && <p className="session-form__activa">Aquesta sessió és l'activa.</p>}

      {editant && dades.urlProgramacio && (
        <a className="session-form__enllac" href={dades.urlProgramacio} target="_blank" rel="noopener noreferrer">
          Veure la programació →
        </a>
      )}

      {editant && (
        <div className="session-form__resum">
          <p>Socis diferents: {resum.socisDistints}</p>
          <p>Entrades genèriques: {resum.entradesGeneriques}</p>
          <p>Import genèric acumulat: {resum.importGeneric}€</p>
        </div>
      )}

      {editant && (
        <div className="session-form__desglose">
          <h2 className="session-form__desglose-titol">Desglose econòmic</h2>
          {Object.keys(subtotals).length === 0 && <p>Encara no hi ha cap moviment d'aquesta sessió.</p>}
          {Object.entries(subtotals).map(([metode, total]) => (
            <p key={metode}>{metode}: {total}€</p>
          ))}
          <Link className="btn btn--outline" to={`${ROUTES.COMPTABILITAT_NOU}?sessionId=${id}`}>
            Afegir moviment d'aquesta sessió
          </Link>
        </div>
      )}
    </form>
  );
}
