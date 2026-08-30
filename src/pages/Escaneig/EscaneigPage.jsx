import 'barcode-detector/polyfill';
import { useEffect, useRef, useState } from 'react';
import { addDoc, collection, getDocs, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../auth/useAuth';
import { identificarCodi, resumAccessLog } from '../../lib/escaneig';
import { calcularEstatSoci, ESTAT_AL_DIA, ESTAT_PENDENT, ESTAT_VENCUT, ESTAT_NOU_REGISTRE } from '../../lib/estatSoci';

const DEBOUNCE_MS = 3000;
const RESUM_INICIAL = { socisDistints: 0, entradesGeneriques: 0, importGeneric: 0 };

const ETIQUETES_ESTAT = {
  [ESTAT_AL_DIA]: 'Al dia',
  [ESTAT_PENDENT]: 'Pendent',
  [ESTAT_VENCUT]: 'Vençut',
  [ESTAT_NOU_REGISTRE]: 'Nou registre',
};

export default function EscaneigPage() {
  const { user } = useAuth();
  const videoRef = useRef(null);
  const ultimCodiRef = useRef({ codi: null, moment: 0 });
  const [sessioActiva, setSessioActiva] = useState(undefined);
  const [codiManual, setCodiManual] = useState('');
  const [missatge, setMissatge] = useState(null);
  const [resum, setResum] = useState(RESUM_INICIAL);

  useEffect(() => {
    const q = query(collection(db, 'sessions'), where('activa', '==', true));
    return onSnapshot(q, (snap) => {
      setSessioActiva(snap.docs[0] ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null);
    });
  }, []);

  useEffect(() => {
    if (!sessioActiva) return;
    const q = query(collection(db, 'accessLog'), where('sessionId', '==', sessioActiva.id));
    return onSnapshot(q, (snap) => {
      setResum(resumAccessLog(snap.docs.map((d) => d.data())));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessioActiva?.id]);

  const registrarGeneric = async (codiTiquet) => {
    try {
      await addDoc(collection(db, 'accessLog'), {
        sessionId: sessioActiva.id,
        timestamp: serverTimestamp(),
        escanejatPer: user.uid,
        tipus: 'generic',
        codiTiquet,
        preuAplicat: sessioActiva.preuEntrada,
      });
      setMissatge({ tipus: 'ok', text: `Entrada genèrica registrada (${sessioActiva.preuEntrada}€)` });
    } catch {
      setMissatge({ tipus: 'error', text: "No s'ha pogut registrar l'entrada. Torna-ho a provar." });
    }
  };

  const processarCodi = async (codiOriginal) => {
    const codi = codiOriginal.trim();
    const ara = Date.now();
    if (ultimCodiRef.current.codi === codi && ara - ultimCodiRef.current.moment < DEBOUNCE_MS) {
      return;
    }
    ultimCodiRef.current = { codi, moment: ara };

    try {
      const identificat = identificarCodi(codi);

      if (identificat.tipus === 'desconegut') {
        setMissatge({ tipus: 'error', text: `Codi no reconegut: ${codi}` });
        return;
      }

      if (identificat.tipus === 'soci') {
        const socisTrobats = await getDocs(
          query(collection(db, 'socis'), where('numeroSoci', '==', identificat.numeroSoci))
        );
        if (socisTrobats.empty) {
          setMissatge({ tipus: 'error', text: `No hi ha cap soci amb el número ${identificat.numeroSoci}` });
          return;
        }
        const soci = socisTrobats.docs[0].data();
        await addDoc(collection(db, 'accessLog'), {
          sessionId: sessioActiva.id,
          timestamp: serverTimestamp(),
          escanejatPer: user.uid,
          tipus: 'soci',
          numeroSoci: identificat.numeroSoci,
        });
        const etiquetaEstat = ETIQUETES_ESTAT[calcularEstatSoci(soci)];
        setMissatge({ tipus: 'ok', text: `${soci.nom} ${soci.cognoms} — ${etiquetaEstat}` });
        return;
      }

      const repetits = await getDocs(
        query(
          collection(db, 'accessLog'),
          where('sessionId', '==', sessioActiva.id),
          where('codiTiquet', '==', identificat.codiTiquet)
        )
      );
      if (!repetits.empty) {
        const timestampRepetit = repetits.docs[0].data().timestamp;
        const dataRepetit = typeof timestampRepetit?.toDate === 'function'
          ? timestampRepetit.toDate().toLocaleString('ca-ES')
          : null;
        const textBase = `El codi ${identificat.codiTiquet} ja s'ha escanejat aquesta sessió`;
        setMissatge({
          tipus: 'avis',
          text: dataRepetit
            ? `${textBase} (${dataRepetit}). Confirma si vols comptar-lo igualment.`
            : `${textBase}. Confirma si vols comptar-lo igualment.`,
          onConfirmar: () => registrarGeneric(identificat.codiTiquet),
        });
        return;
      }
      await registrarGeneric(identificat.codiTiquet);
    } catch {
      setMissatge({ tipus: 'error', text: "No s'ha pogut registrar l'entrada. Torna-ho a provar." });
    }
  };

  useEffect(() => {
    if (!sessioActiva || !('BarcodeDetector' in window)) return undefined;
    let actiu = true;
    let stream;
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then((s) => {
      if (!actiu) {
        s.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = s;
      videoRef.current.srcObject = stream;
      return videoRef.current.play();
    }).catch(() => {
      setMissatge({ tipus: 'error', text: "No s'ha pogut accedir a la càmera. Utilitza el camp de text." });
    });

    const interval = setInterval(async () => {
      if (!videoRef.current?.srcObject) return;
      try {
        const barcodes = await detector.detect(videoRef.current);
        if (barcodes[0]) processarCodi(barcodes[0].rawValue);
      } catch {
        // Fotograma no vàlid per detectar-hi res; es reintenta al següent interval.
      }
    }, 400);

    return () => {
      actiu = false;
      clearInterval(interval);
      stream?.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessioActiva?.id]);

  const handleCodiManual = (e) => {
    e.preventDefault();
    if (!codiManual.trim()) return;
    processarCodi(codiManual.trim());
    setCodiManual('');
  };

  if (sessioActiva === undefined) return <p className="escaneig__carregant">Carregant…</p>;

  if (!sessioActiva) {
    return (
      <p className="escaneig__sense-sessio">
        No hi ha cap sessió activa. Marca una sessió com a activa abans d'escanejar.
      </p>
    );
  }

  return (
    <div className="escaneig">
      <h1 className="escaneig__titol">Escaneig — {sessioActiva.titol}</h1>

      {'BarcodeDetector' in window ? (
        <video ref={videoRef} className="escaneig__video" muted playsInline />
      ) : (
        <p className="escaneig__avis">
          Aquest navegador no permet escanejar amb la càmera. Utilitza el camp de text.
        </p>
      )}

      <form className="escaneig__manual" onSubmit={handleCodiManual}>
        <div className="form__field">
          <label className="form__label" htmlFor="codi-manual">Codi manual</label>
          <input
            id="codi-manual"
            className="form__input"
            value={codiManual}
            onChange={(e) => setCodiManual(e.target.value)}
          />
        </div>
        <button className="btn" type="submit">Registrar</button>
      </form>

      {missatge && (
        <div className={`escaneig__missatge escaneig__missatge--${missatge.tipus}`}>
          <p>{missatge.text}</p>
          {missatge.onConfirmar && (
            <button
              className="btn"
              type="button"
              onClick={() => { missatge.onConfirmar(); setMissatge(null); }}
            >
              Comptar igualment
            </button>
          )}
        </div>
      )}

      <div className="escaneig__resum">
        <p>Socis diferents: {resum.socisDistints}</p>
        <p>Entrades genèriques: {resum.entradesGeneriques}</p>
        <p>Import genèric acumulat: {resum.importGeneric}€</p>
      </div>
    </div>
  );
}
