import { useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore/lite';
import { db } from '../../firebase/client.js';
import { identificarCodi } from '../../lib/propostes/identificarCodi.js';

const DEBOUNCE_MS = 3000;
// Deteccions fallides seguides (≈ 2 s) que fan donar el lector per no disponible.
const MAX_DETECCIONS_FALLIDES = 5;
const TEXT_LECTOR_NO_DISPONIBLE = "No s'ha pogut carregar el lector. Torna-ho a provar.";

export default function LectorCarnet({ onIdentificat }) {
  const videoRef = useRef(null);
  const ultimCodiRef = useRef({ codi: null, moment: 0 });
  // El lector (polyfill de BarcodeDetector + WASM de zxing) pesa molt: només es baixa en tocar «Escanejar».
  const lectorRef = useRef(null);
  const [escanejant, setEscanejant] = useState(false);
  const [descarregant, setDescarregant] = useState(false);
  const [verificant, setVerificant] = useState(false);
  const [error, setError] = useState(null);
  // El lector de QR no ha arrencat (WASM no carregat, detector que falla): sense
  // això la càmera mostraria la imatge però mai no llegiria res, en silenci.
  const [lectorNoDisponible, setLectorNoDisponible] = useState(false);

  const handleEscanejar = async () => {
    setError(null);
    setLectorNoDisponible(false);
    setDescarregant(true);
    // Importar el mòdul instal·la el polyfill: la comprovació de `BarcodeDetector` va després.
    try {
      lectorRef.current = await import('../../lib/propostes/lectorCodis.js');
    } catch {
      setLectorNoDisponible(true);
      return;
    } finally {
      setDescarregant(false);
    }
    if (!('BarcodeDetector' in window)) {
      setError('Aquest navegador no permet escanejar codis QR. Prova-ho amb un altre mòbil o navegador.');
      return;
    }
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
    let lectorLlest = false;
    let detectant = false;
    let fallades = 0;
    const lectorFallit = () => {
      if (!actiu) return;
      actiu = false;
      setLectorNoDisponible(true);
      setEscanejant(false);
    };
    let detector;
    try {
      detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    } catch {
      lectorFallit();
      return undefined;
    }
    lectorRef.current.prepararLector().then(() => { lectorLlest = true; }, lectorFallit);

    // Dins la promesa: sense context segur, navigator.mediaDevices no existeix.
    Promise.resolve().then(() => navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })).then((s) => {
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
      // Fins que el vídeo no té imatge (HAVE_CURRENT_DATA), el polyfill llança InvalidStateError:
      // passa en cada arrencada de la càmera i no vol dir que el lector falli.
      if (detectant || !lectorLlest || !videoRef.current?.srcObject || videoRef.current.readyState < 2) return;
      detectant = true;
      try {
        const barcodes = await detector.detect(videoRef.current);
        fallades = 0;
        if (actiu && barcodes[0]) handleCodi(barcodes[0].rawValue);
      } catch (error) {
        // Un fotograma no vàlid es reintenta al següent interval; si el descodificador falla sempre, el lector no funciona.
        if (error?.name === 'InvalidStateError') return;
        fallades += 1;
        if (fallades >= MAX_DETECCIONS_FALLIDES) lectorFallit();
      } finally {
        detectant = false;
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
      {lectorNoDisponible && (
        <p className="form__error" role="alert">{TEXT_LECTOR_NO_DISPONIBLE}</p>
      )}
      {!escanejant && (
        <button type="button" className="btn" onClick={handleEscanejar} disabled={descarregant}>
          {descarregant ? 'Carregant el lector…' : lectorNoDisponible ? 'Tornar-ho a provar' : 'Escanejar el meu carnet'}
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
