import { useState } from 'react';
import { crearProposta, missatgeErrorProposta } from '../../lib/propostes/pellicules.js';
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
      await crearProposta(identitat.token, {
        titol: pellicula.titol,
        any: pellicula.any,
        tmdbId: pellicula.tmdbId,
        comentari: comentari.trim(),
      });
      setEnviada(true);
    } catch (errorEnviant) {
      setError(missatgeErrorProposta(errorEnviant));
      // Carnet desconegut o desactivat: cal tornar-lo a escanejar.
      if (errorEnviant?.code === 'functions/permission-denied') {
        setPellicula(null);
        setIdentitat(null);
      }
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
        {error && <p className="form__error">{error}</p>}
        <LectorCarnet onIdentificat={(nova) => { setError(null); setIdentitat(nova); }} />
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
          <textarea
            id="comentari" className="form__input" rows={3} maxLength={1000} aria-describedby="comentari-ajuda"
            value={comentari} onChange={(e) => setComentari(e.target.value)}
          />
          <p id="comentari-ajuda" className="form__ajuda">Màxim 1000 caràcters.</p>
        </div>
      )}

      {error && <p className="form__error">{error}</p>}
      <button className="btn proposar-pellicula__enviar" type="submit" disabled={enviant || !pellicula}>Enviar proposta</button>
    </form>
  );
}
