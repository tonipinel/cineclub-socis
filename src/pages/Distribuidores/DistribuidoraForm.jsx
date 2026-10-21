import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where,
} from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import Carregant from '../../components/Carregant';
import BotoEditar from '../../components/BotoEditar';

const CAMPS_BUITS = {
  nom: '', web: '', contacte: '', correu: '', preu: '', condicions: '',
};

export default function DistribuidoraForm() {
  const { id } = useParams();
  const editant = Boolean(id);
  const [dades, setDades] = useState(CAMPS_BUITS);
  const [carregant, setCarregant] = useState(editant);
  const [desbloquejat, setDesbloquejat] = useState(!editant);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!editant) return;
    getDoc(doc(db, 'distribuidores', id)).then((snap) => {
      const dadesDoc = snap.data();
      if (!dadesDoc) {
        navigate(ROUTES.DISTRIBUIDORES, { replace: true });
        return;
      }
      setDades({ ...CAMPS_BUITS, ...dadesDoc, preu: String(dadesDoc.preu ?? '') });
      setCarregant(false);
    });
  }, [id, editant, navigate]);

  const handleChange = (camp) => (e) => setDades((d) => ({ ...d, [camp]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!dades.nom.trim()) {
      setError('El nom no pot estar en blanc.');
      return;
    }
    const distribuidora = {
      nom: dades.nom.trim(),
      web: dades.web.trim(),
      contacte: dades.contacte.trim(),
      correu: dades.correu.trim(),
      preu: dades.preu === '' ? null : Number(dades.preu),
      condicions: dades.condicions.trim(),
    };
    try {
      if (editant) await setDoc(doc(db, 'distribuidores', id), distribuidora);
      else await addDoc(collection(db, 'distribuidores'), distribuidora);
      navigate(ROUTES.DISTRIBUIDORES);
    } catch {
      setError("No s'ha pogut desar. Torna-ho a provar.");
    }
  };

  const handleEliminar = async () => {
    setError(null);
    try {
      const enUs = await getDocs(query(collection(db, 'propostesInternes'), where('distribuidoraId', '==', id)));
      if (!enUs.empty) {
        setError(`No es pot eliminar: s'està fent servir en ${enUs.docs.length} proposta(es).`);
        return;
      }
      if (!window.confirm('Segur que vols eliminar aquesta distribuïdora? Aquesta acció no es pot desfer.')) return;
      await deleteDoc(doc(db, 'distribuidores', id));
      navigate(ROUTES.DISTRIBUIDORES);
    } catch {
      setError("No s'ha pogut eliminar. Torna-ho a provar.");
    }
  };

  if (carregant) return <Carregant />;

  const classeCamp = desbloquejat ? 'form__input' : 'form__input form__input--nomes-lectura';

  return (
    <form className="distribuidora-form" onSubmit={handleSubmit}>
      <Link className="distribuidores-list__tornar" to={ROUTES.DISTRIBUIDORES}>← Distribuïdores</Link>
      <div className="distribuidora-form__capcalera">
        <h1 className="distribuidora-form__titol">{editant ? 'Distribuïdora' : 'Nova distribuïdora'}</h1>
        {editant && !desbloquejat && <BotoEditar onClick={() => setDesbloquejat(true)} />}
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="nom">Nom</label>
        <input id="nom" className={classeCamp} value={dades.nom} onChange={handleChange('nom')} readOnly={!desbloquejat} required />
      </div>
      <div className="form__field">
        <label className="form__label" htmlFor="web">Web</label>
        <input id="web" className={classeCamp} value={dades.web} onChange={handleChange('web')} readOnly={!desbloquejat} />
      </div>
      <div className="form__field">
        <label className="form__label" htmlFor="contacte">Persona de contacte</label>
        <input id="contacte" className={classeCamp} value={dades.contacte} onChange={handleChange('contacte')} readOnly={!desbloquejat} />
      </div>
      <div className="form__field">
        <label className="form__label" htmlFor="correu">Correu electrònic de contacte</label>
        <input id="correu" type="email" className={classeCamp} value={dades.correu} onChange={handleChange('correu')} readOnly={!desbloquejat} />
      </div>
      <div className="form__field">
        <label className="form__label" htmlFor="preu">Preu per defecte (€)</label>
        <input id="preu" type="number" step="0.01" min="0" className={classeCamp} value={dades.preu} onChange={handleChange('preu')} readOnly={!desbloquejat} />
      </div>
      <div className="form__field">
        <label className="form__label" htmlFor="condicions">Condicions per defecte</label>
        <textarea id="condicions" className={classeCamp} rows={3} value={dades.condicions} onChange={handleChange('condicions')} readOnly={!desbloquejat} />
        <p className="distribuidora-form__ajuda">
          S'apliquen a totes les pel·lícules d'aquesta distribuïdora que no tinguin un preu o unes condicions propis.
        </p>
      </div>

      {error && <p className="form__error">{error}</p>}
      {desbloquejat && <button className="btn" type="submit">Desar</button>}
      {editant && desbloquejat && (
        <button className="btn btn--outline" type="button" onClick={handleEliminar}>Eliminar</button>
      )}
    </form>
  );
}
