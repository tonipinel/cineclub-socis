import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import { etiquetaSoci } from '../../lib/socis';
import { calcularNomPublic } from '../../lib/propostes';
import Carregant from '../../components/Carregant';

export default function PropostesNova() {
  const [socis, setSocis] = useState(null);
  const [etiquetaTriada, setEtiquetaTriada] = useState('');
  const [titol, setTitol] = useState('');
  const [enllac, setEnllac] = useState('');
  const [comentari, setComentari] = useState('');
  const [error, setError] = useState(null);
  const [desant, setDesant] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    getDocs(collection(db, 'socis')).then((snap) => {
      setSocis(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  if (socis === null) return <Carregant />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const sociTriat = socis.find((s) => etiquetaSoci(s) === etiquetaTriada);
    if (!sociTriat) {
      setError('Selecciona un soci vàlid de la llista.');
      return;
    }
    if (!titol.trim()) return;
    setError(null);
    setDesant(true);
    try {
      await addDoc(collection(db, 'propostes'), {
        titol: titol.trim(),
        enllac: enllac.trim(),
        comentari: comentari.trim(),
        numeroSoci: sociTriat.numeroSoci,
        nomProposant: calcularNomPublic(sociTriat),
        estat: 'pendent',
        timestamp: serverTimestamp(),
      });
      navigate(ROUTES.PROPOSTES_PENDENTS);
    } catch {
      setDesant(false);
      setError("No s'ha pogut desar. Torna-ho a provar.");
    }
  };

  return (
    <form className="propostes-nova" onSubmit={handleSubmit}>
      <h1 className="propostes-nova__titol">Nova proposta en nom d'un soci</h1>

      <div className="form__field">
        <label className="form__label" htmlFor="soci">Soci</label>
        <input
          id="soci"
          list="socis-datalist"
          className="form__input"
          value={etiquetaTriada}
          onChange={(e) => setEtiquetaTriada(e.target.value)}
        />
        <datalist id="socis-datalist">
          {socis.map((s) => <option key={s.id} value={etiquetaSoci(s)} />)}
        </datalist>
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="titol">Títol</label>
        <input id="titol" className="form__input" value={titol} onChange={(e) => setTitol(e.target.value)} required />
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="enllac">Enllaç (opcional)</label>
        <input id="enllac" className="form__input" value={enllac} onChange={(e) => setEnllac(e.target.value)} />
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="comentari">Comentari (opcional)</label>
        <input id="comentari" className="form__input" value={comentari} onChange={(e) => setComentari(e.target.value)} />
      </div>

      {error && <p className="form__error">{error}</p>}
      <button className="btn" type="submit" disabled={desant}>Crear proposta</button>
    </form>
  );
}
