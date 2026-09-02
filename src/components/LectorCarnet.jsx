import { useEffect, useRef, useState } from 'react';
import 'barcode-detector/polyfill';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { identificarCodi } from '../lib/escaneig';

const DEBOUNCE_MS = 3000;

export default function LectorCarnet({ onIdentificat }) {
  const videoRef = useRef(null);
  const ultimCodiRef = useRef({ codi: null, moment: 0 });
  const [escanejant, setEscanejant] = useState(false);
  const [verificant, setVerificant] = useState(false);
  const [error, setError] = useState(null);

  const handleEscanejar = () => {
    if (!('BarcodeDetector' in window)) {
      setError('Aquest navegador no permet escanejar codis QR. Prova-ho amb un altre mòbil o navegador.');
      return;
    }
    setError(null);
    setEscanejant(true);
  };

  const handleCodi = async (codiOriginal) => {
    const codi = codiOriginal.trim();
    const ara = Date.now();
    if (ultimCodiRef.current.codi === codi && ara - ultimCodiRef.current.moment < DEBOUNCE_MS) {
      return;
    }
    ultimCodiRef.current = { codi, moment: ara };
    const identificat = identificarCodi(codi);
    if (identificat.tipus !== 'carnet-token') {
      setError('Això no és un carnet vàlid. Torna-ho a provar.');
      return;
    }
    setVerificant(true);
    try {
      const snap = await getDoc(doc(db, 'socisPublic', identificat.token));
      if (!snap.exists()) {
        setError('Aquest carnet no és vàlid.');
        setVerificant(false);
        return;
      }
      const { numeroSoci, nomPublic } = snap.data();
      onIdentificat({ numeroSoci, nomPublic, token: identificat.token });
    } catch {
      setError("No s'ha pogut verificar el carnet. Torna-ho a provar.");
      setVerificant(false);
    }
  };

  useEffect(() => {
    if (!escanejant || verificant || !('BarcodeDetector' in window)) return undefined;
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
      if (!actiu) return;
      setError("No s'ha pogut accedir a la càmera. Comprova els permisos del navegador.");
    });

    const interval = setInterval(async () => {
      if (!videoRef.current?.srcObject) return;
      try {
        const barcodes = await detector.detect(videoRef.current);
        if (barcodes[0]) handleCodi(barcodes[0].rawValue);
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
  }, [escanejant, verificant]);

  return (
    <div className="lector-carnet">
      {!escanejant && (
        <button type="button" className="btn" onClick={handleEscanejar}>
          Escanejar el meu carnet
        </button>
      )}
      {escanejant && (
        <div className="lector-carnet__camera">
          <video ref={videoRef} className="lector-carnet__video" muted playsInline />
          {verificant && <p className="lector-carnet__estat">Verificant...</p>}
        </div>
      )}
      {error && <p className="form__error">{error}</p>}
    </div>
  );
}
