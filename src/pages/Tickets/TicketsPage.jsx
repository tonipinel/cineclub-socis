import { useState } from 'react';
import QRCode from 'qrcode';
import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { codisDesDe } from '../../lib/escaneig';

export default function TicketsPage() {
  const [quantitat, setQuantitat] = useState('150');
  const [preu, setPreu] = useState('5');
  const [tiquets, setTiquets] = useState([]);
  const [generant, setGenerant] = useState(false);
  const [error, setError] = useState(null);

  const handleGenerar = async () => {
    const n = Number(quantitat) || 0;
    if (n <= 0) return;
    const confirmat = window.confirm(
      `Es reservaran ${n} números de tiquet nous. Un cop generats no es tornaran a repetir. Vols continuar?`
    );
    if (!confirmat) return;
    setError(null);
    setGenerant(true);
    try {
      const comptadorRef = doc(db, 'configuracio', 'tiquets');
      const seguent = await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(comptadorRef);
        const actual = snap.exists() ? snap.data().seguentNumero : 1;
        transaction.set(comptadorRef, { seguentNumero: actual + n }, { merge: true });
        return actual;
      });
      const generats = await Promise.all(
        codisDesDe(seguent, n).map((codi) =>
          QRCode.toDataURL(codi, { width: 150, margin: 0 }).then((url) => ({ codi, url }))
        )
      );
      setTiquets(generats);
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
        {tiquets.length > 0 && (
          <button type="button" className="btn btn--outline" onClick={() => window.print()}>
            Imprimir
          </button>
        )}
      </div>

      {error && <p className="form__error">{error}</p>}

      <div className="tickets-graella">
        {tiquets.map(({ codi, url }) => (
          <div className="tickets-graella__tiquet" key={codi}>
            <img className="tickets-graella__logo" src="/logo-cineclub.png" alt="" />
            <p className="tickets-graella__titol">APORTACIÓ ({preu}€)</p>
            <img className="tickets-graella__qr" src={url} alt={`Codi QR ${codi}`} />
            <p className="tickets-graella__codi">{codi}</p>
            <p className="tickets-graella__text">
              Aquesta aportació et dona accés a la sessió d'avui. Recorda que si et
              fas soci/a abans de la propera sessió et descomptarem l'import
              d'aquesta aportació de la quota de soci/a.
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
