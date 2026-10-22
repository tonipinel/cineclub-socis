import { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/client.js';
import { useIdentitatPublica } from '../../auth/useIdentitatPublica.js';
import LectorCarnet from './LectorCarnet.jsx';
import CercadorPellicula from './CercadorPellicula.jsx';

export default function ProposarPellicula() {
  const { identitat, setIdentitat } = useIdentitatPublica();
  const [pellicula, setPellicula] = useState(null);
  const [comentari, setComentari] = useState('');
  const [enviant, setEnviant] = useState(false);
  const [error, setError] = useState(null);
  const [enviada, setEnviada] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!identitat || !pellicula) return;
    setEnviant(true);
    setError(null);
    try {
      const nova = await addDoc(collection(db, 'propostes'), {
        titol: pellicula.titol,
        any: pellicula.any,
        tmdbId: pellicula.tmdbId,
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
        <a className="btn" href="/propostes/">Tornar a les propostes</a>
      </div>
    );
  }

  if (!identitat) {
    return (
      <div className="proposar-pellicula">
        <a className="proposar-pellicula__tornar" href="/propostes/">← Tornar</a>
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
      <a className="proposar-pellicula__tornar" href="/propostes/">← Tornar</a>
      <h1 className="proposar-pellicula__titol">Proposa una pel·lícula</h1>

      <div className="form__field">
        <CercadorPellicula token={identitat.token} onTriar={setPellicula} />
      </div>
      {pellicula && (
        <div className="form__field">
          <label className="form__label" htmlFor="comentari">Explica'ns breument per què la recomanes (opcional)</label>
          <textarea id="comentari" className="form__input" rows={3} value={comentari} onChange={(e) => setComentari(e.target.value)} />
        </div>
      )}

      {error && <p className="form__error">{error}</p>}
      <button className="btn proposar-pellicula__enviar" type="submit" disabled={enviant || !pellicula}>Enviar proposta</button>
    </form>
  );
}
