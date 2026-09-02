import { useState } from 'react';
import { Link } from 'react-router-dom';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import { useIdentitatPublica } from '../../auth/useIdentitatPublica';
import LectorCarnet from '../../components/LectorCarnet';

export default function ProposarPellicula() {
  const { identitat, setIdentitat } = useIdentitatPublica();
  const [titol, setTitol] = useState('');
  const [enllac, setEnllac] = useState('');
  const [comentari, setComentari] = useState('');
  const [enviant, setEnviant] = useState(false);
  const [error, setError] = useState(null);
  const [enviada, setEnviada] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!identitat || !titol.trim()) return;
    setEnviant(true);
    setError(null);
    try {
      const nova = await addDoc(collection(db, 'propostes'), {
        titol: titol.trim(),
        enllac: enllac.trim(),
        comentari: comentari.trim(),
        numeroSoci: identitat.numeroSoci,
        nomProposant: identitat.nomPublic,
        estat: 'pendent',
        timestamp: serverTimestamp(),
      });
      await addDoc(collection(db, 'propostesActivitat'), {
        tipus: 'proposta_creada', propostaId: nova.id, numeroSoci: identitat.numeroSoci, timestamp: serverTimestamp(),
      });
      setEnviada(true);
    } catch {
      setError("No s'ha pogut enviar la proposta. Torna-ho a provar.");
    } finally {
      setEnviant(false);
    }
  };

  if (enviada) {
    return (
      <div className="proposar-pellicula">
        <p className="proposar-pellicula__confirmacio">
          La teva proposta s'ha enviat. Es publicarà quan l'aprovi l'organització.
        </p>
        <Link className="btn" to={ROUTES.PROPOSTES}>Tornar a les propostes</Link>
      </div>
    );
  }

  if (!identitat) {
    return (
      <div className="proposar-pellicula">
        <Link className="proposar-pellicula__tornar" to={ROUTES.PROPOSTES}>← Tornar</Link>
        <h1 className="proposar-pellicula__titol">Proposa una pel·lícula</h1>
        <p className="proposar-pellicula__text">
          Escaneja el teu carnet per identificar-te i proposar una pel·lícula.
        </p>
        <LectorCarnet onIdentificat={setIdentitat} />
      </div>
    );
  }

  return (
    <form className="proposar-pellicula" onSubmit={handleSubmit}>
      <Link className="proposar-pellicula__tornar" to={ROUTES.PROPOSTES}>← Tornar</Link>
      <h1 className="proposar-pellicula__titol">Proposa una pel·lícula</h1>

      <div className="form__field">
        <label className="form__label" htmlFor="titol">Títol</label>
        <input
          id="titol"
          className="form__input"
          value={titol}
          onChange={(e) => setTitol(e.target.value)}
          required
        />
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
      <button className="btn proposar-pellicula__enviar" type="submit" disabled={enviant}>Enviar proposta</button>
    </form>
  );
}
