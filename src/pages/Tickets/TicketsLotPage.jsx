import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  arrayRemove, arrayUnion, collection, doc, onSnapshot, query, updateDoc, where,
} from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { codisDesDe, tiquetsDelLot } from '../../lib/escaneig';
import * as ROUTES from '../../constants/routes';

function avui() {
  return new Date().toISOString().slice(0, 10);
}

export default function TicketsLotPage() {
  const { id } = useParams();
  const [lot, setLot] = useState(undefined);
  const [entradesGeneriques, setEntradesGeneriques] = useState([]);
  const [urlsPerCodi, setUrlsPerCodi] = useState({});
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    return onSnapshot(doc(db, 'lotsTiquets', id), (snap) => {
      if (!snap.exists()) {
        navigate(ROUTES.TICKETS, { replace: true });
        return;
      }
      setLot({ id, ...snap.data() });
    });
  }, [id, navigate]);

  useEffect(() => {
    const q = query(collection(db, 'accessLog'), where('tipus', '==', 'generic'));
    return onSnapshot(q, (snap) => {
      setEntradesGeneriques(snap.docs.map((d) => d.data()));
    });
  }, []);

  useEffect(() => {
    if (!lot) return;
    let activa = true;
    Promise.all(
      codisDesDe(lot.numeroInicial, lot.quantitat).map((codi) =>
        QRCode.toDataURL(codi, { width: 150, margin: 0 }).then((url) => [codi, url])
      )
    ).then((parells) => {
      if (activa) setUrlsPerCodi(Object.fromEntries(parells));
    });
    return () => { activa = false; };
  }, [lot]);

  const handleMarcarImpres = async () => {
    const confirmat = window.confirm('Confirmes que has imprès aquest lot de tiquets?');
    if (!confirmat) return;
    setError(null);
    try {
      await updateDoc(doc(db, 'lotsTiquets', id), { impres: true, dataImpressio: avui() });
    } catch {
      setError("No s'ha pogut desar. Torna-ho a provar.");
    }
  };

  const handleAnularLot = async () => {
    const confirmat = window.confirm(
      "Segur que vols anul·lar tot el lot? Els tiquets encara no utilitzats deixaran de funcionar. Aquesta acció no es pot desfer."
    );
    if (!confirmat) return;
    setError(null);
    try {
      await updateDoc(doc(db, 'lotsTiquets', id), { anulat: true, dataAnulacio: avui() });
    } catch {
      setError("No s'ha pogut desar. Torna-ho a provar.");
    }
  };

  const handleAnularTiquet = async (codi) => {
    const confirmat = window.confirm(`Segur que vols anul·lar el tiquet ${codi}?`);
    if (!confirmat) return;
    setError(null);
    try {
      await updateDoc(doc(db, 'lotsTiquets', id), { codisAnulats: arrayUnion(codi) });
    } catch {
      setError("No s'ha pogut desar. Torna-ho a provar.");
    }
  };

  const handleReactivarTiquet = async (codi) => {
    setError(null);
    try {
      await updateDoc(doc(db, 'lotsTiquets', id), { codisAnulats: arrayRemove(codi) });
    } catch {
      setError("No s'ha pogut desar. Torna-ho a provar.");
    }
  };

  if (lot === undefined) return <p>Carregant…</p>;

  const tiquets = tiquetsDelLot(lot, entradesGeneriques);
  const codisAnulats = lot.codisAnulats ?? [];
  const disponibles = tiquets.filter((t) => !t.usat && !lot.anulat && !codisAnulats.includes(t.codi)).length;

  return (
    <div className="tickets-pagina">
      <Link className="tickets-pagina__tornar" to={ROUTES.TICKETS}>← Tornar al llistat</Link>

      <div className="tickets-pagina__capcalera">
        <h1 className="tickets-pagina__titol">
          Tiquets T-{String(lot.numeroInicial).padStart(6, '0')} – T-{String(lot.numeroInicial + lot.quantitat - 1).padStart(6, '0')}
        </h1>
        <p className="tickets-pagina__disponibles">{disponibles} de {lot.quantitat} disponibles</p>
        {lot.anulat && <span className="badge badge--anulat">Anul·lat el {lot.dataAnulacio}</span>}
      </div>

      <div className="tickets-pagina__accions">
        {lot.impres ? (
          <span className="badge badge--impres">Imprès el {lot.dataImpressio}</span>
        ) : (
          <button type="button" className="btn" onClick={handleMarcarImpres}>Marcar com imprès</button>
        )}
        <button type="button" className="btn btn--outline" onClick={() => window.print()}>Imprimir</button>
        {!lot.anulat && (
          <button type="button" className="btn btn--outline" onClick={handleAnularLot}>Anul·lar tot el lot</button>
        )}
      </div>

      {error && <p className="form__error">{error}</p>}

      <div className="tickets-graella">
        {tiquets.map(({ codi, usat }) => {
          const anuladIndividual = codisAnulats.includes(codi);
          const anulat = lot.anulat || anuladIndividual;

          return (
            <div
              key={codi}
              className={`tickets-graella__tiquet ${anulat ? 'tickets-graella__tiquet--anulat' : ''} ${usat ? 'tickets-graella__tiquet--usat' : ''}`}
            >
              {!usat && anuladIndividual && !lot.anulat && (
                <button
                  type="button"
                  className="tickets-graella__anular-flotant"
                  onClick={() => handleReactivarTiquet(codi)}
                >
                  Reactivar
                </button>
              )}
              {!usat && !anulat && (
                <button
                  type="button"
                  className="tickets-graella__anular-flotant"
                  onClick={() => handleAnularTiquet(codi)}
                >
                  Anul·lar
                </button>
              )}
              <p className="tickets-graella__titol">APORTACIÓ ({lot.preu}€)</p>
              <div className="tickets-graella__fila">
                <img className="tickets-graella__logo" src="/logo-cineclub.png" alt="" />
                {urlsPerCodi[codi] && (
                  <img className="tickets-graella__qr" src={urlsPerCodi[codi]} alt={`Codi QR ${codi}`} />
                )}
              </div>
              <p className="tickets-graella__codi">{codi}</p>
              <p className="tickets-graella__text">
                Si et fas soci/a abans de la propera sessió et descomptarem
                l'import d'aquesta aportació de la quota
              </p>
              {usat && <p className="tickets-graella__estat">Usat</p>}
              {!usat && anuladIndividual && !lot.anulat && (
                <p className="tickets-graella__estat">Anul·lat</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
