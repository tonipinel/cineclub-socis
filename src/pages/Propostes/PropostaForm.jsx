import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, deleteDoc, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import { etiquetaSoci } from '../../lib/socis';
import Carregant from '../../components/Carregant';

const ESTATS = [
  ['pendent', 'Pendent'],
  ['aprovada', 'Aprovada'],
  ['rebutjada', 'Rebutjada'],
  ['programada', 'Programada'],
];

export default function PropostaForm() {
  const { id } = useParams();
  const [dades, setDades] = useState(null);
  const [socis, setSocis] = useState(null);
  const [etiquetaSociTriat, setEtiquetaSociTriat] = useState('');
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      getDoc(doc(db, 'propostes', id)),
      getDocs(collection(db, 'socis')),
    ]).then(([propostaSnap, socisSnap]) => {
      const socisCarregats = socisSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const dadesProposta = { imatgeUrl: '', trailerUrl: '', sinopsi: '', ...propostaSnap.data() };
      setDades(dadesProposta);
      setSocis(socisCarregats);
      const sociActual = socisCarregats.find((s) => Number(s.numeroSoci) === Number(dadesProposta.numeroSoci));
      setEtiquetaSociTriat(sociActual ? etiquetaSoci(sociActual) : '');
    });
  }, [id]);

  const handleChange = (camp) => (e) => {
    setDades((d) => ({ ...d, [camp]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const sociTriat = socis.find((s) => etiquetaSoci(s) === etiquetaSociTriat);
    if (!sociTriat) {
      setError('Selecciona un soci vàlid de la llista.');
      return;
    }
    try {
      await updateDoc(doc(db, 'propostes', id), {
        estat: dades.estat,
        imatgeUrl: dades.imatgeUrl,
        trailerUrl: dades.trailerUrl,
        sinopsi: dades.sinopsi,
        numeroSoci: sociTriat.numeroSoci,
      });
      navigate(ROUTES.PROPOSTES_PENDENTS);
    } catch {
      setError("No s'ha pogut desar. Torna-ho a provar.");
    }
  };

  const handleEliminar = async () => {
    const confirmat = window.confirm(
      `Segur que vols eliminar definitivament la proposta "${dades.titol}"? Aquesta acció no es pot desfer.`
    );
    if (!confirmat) return;
    setError(null);
    try {
      await deleteDoc(doc(db, 'propostes', id));
      navigate(ROUTES.PROPOSTES_PENDENTS);
    } catch {
      setError("No s'ha pogut eliminar. Torna-ho a provar.");
    }
  };

  if (!dades || !socis) return <Carregant />;

  return (
    <form className="proposta-form" onSubmit={handleSubmit}>
      <h1 className="proposta-form__titol">{dades.titol}</h1>
      {dades.enllac && (
        <p><a className="enllac" href={dades.enllac} target="_blank" rel="noopener noreferrer">{dades.enllac}</a></p>
      )}
      {dades.comentari && <p className="proposta-form__comentari">"{dades.comentari}"</p>}

      <div className="form__field">
        <label className="form__label" htmlFor="soci">Soci</label>
        <input
          id="soci"
          list="proposta-form-socis-datalist"
          className="form__input"
          value={etiquetaSociTriat}
          onChange={(e) => setEtiquetaSociTriat(e.target.value)}
        />
        <datalist id="proposta-form-socis-datalist">
          {socis.map((s) => <option key={s.id} value={etiquetaSoci(s)} />)}
        </datalist>
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="estat">Estat</label>
        <select id="estat" className="form__input" value={dades.estat} onChange={handleChange('estat')}>
          {ESTATS.map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>{etiqueta}</option>
          ))}
        </select>
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="imatgeUrl">URL del cartell</label>
        <input id="imatgeUrl" className="form__input" value={dades.imatgeUrl} onChange={handleChange('imatgeUrl')} />
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="trailerUrl">URL del tràiler</label>
        <input id="trailerUrl" className="form__input" value={dades.trailerUrl} onChange={handleChange('trailerUrl')} />
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="sinopsi">Sinopsi</label>
        <textarea id="sinopsi" className="form__input" value={dades.sinopsi} onChange={handleChange('sinopsi')} />
      </div>

      {error && <p className="form__error">{error}</p>}
      <div className="proposta-form__accions">
        <button className="btn" type="submit">Desar</button>
        <button className="btn btn--perill" type="button" onClick={handleEliminar}>Eliminar proposta</button>
      </div>
    </form>
  );
}
