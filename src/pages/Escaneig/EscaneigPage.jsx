import 'barcode-detector/polyfill';
import { useEffect, useRef, useState } from 'react';
import { addDoc, collection, getDocs, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../auth/useAuth';
import { identificarCodi, resumAccessLog, tiquetEstaAnulat } from '../../lib/escaneig';
import {
  calcularEstatSoci, calcularVenciment, diesFinsVenciment, estaActiu,
  ESTAT_AL_DIA, ESTAT_PENDENT, ESTAT_VENCUT, ESTAT_NOU_REGISTRE,
} from '../../lib/estatSoci';
import { DIES_AVIS_RENOVACIO } from '../../lib/socis';
import Carregant from '../../components/Carregant';

const DEBOUNCE_MS = 3000;
const RESUM_INICIAL = { socisDistints: 0, entradesGeneriques: 0, importGeneric: 0 };

const ETIQUETES_ESTAT = {
  [ESTAT_AL_DIA]: 'Al dia',
  [ESTAT_PENDENT]: 'Pendent',
  [ESTAT_VENCUT]: 'Vençut',
  [ESTAT_NOU_REGISTRE]: 'Nou registre',
};

// Mode mockup: afegeix #idle, #escanejant, #codi, #ok (soci), #tiquet (ok
// genèric), #error o #avis a la URL per veure directament aquella pantalla
// sense haver d'escanejar ni tenir sessió activa (útil per iterar sobre el
// disseny). No afecta producció real: només substitueix l'estat inicial
// mentre l'URL tingui aquest fragment.
const MOCKUP_SESSIO = { id: 'mockup', titol: 'Sessió de prova', preuEntrada: 5 };

const MOCKUP_VENCIMENT_AVIAT = new Date();
MOCKUP_VENCIMENT_AVIAT.setDate(MOCKUP_VENCIMENT_AVIAT.getDate() + 10);

const MOCKUPS = {
  idle: { modeEntrada: 'idle', missatge: null },
  escanejant: { modeEntrada: 'escanejant', missatge: null },
  codi: { modeEntrada: 'manual', missatge: null },
  ok: {
    modeEntrada: 'escanejant',
    missatge: {
      tipus: 'ok',
      text: 'Anna Vidal',
      estat: ESTAT_AL_DIA,
      venciment: { data: MOCKUP_VENCIMENT_AVIAT.toLocaleDateString('ca-ES'), dies: 10 },
    },
  },
  tiquet: { modeEntrada: 'escanejant', missatge: { tipus: 'ok', text: 'Entrada genèrica registrada (5€)' } },
  error: {
    modeEntrada: 'escanejant',
    missatge: {
      tipus: 'error',
      text: 'Codi no reconegut: XYZ',
      detall: 'Els codis vàlids comencen per SOCI- o T-',
    },
  },
  avis: {
    modeEntrada: 'escanejant',
    missatge: {
      tipus: 'avis',
      text: 'Codi ja utilitzat',
      detall: "El codi T-000123 ja s'ha escanejat (20/8/2026 20:00:00). Confirma si vols comptar-lo igualment.",
      codiTiquet: 'T-000123',
      onConfirmar: () => {},
    },
  },
};

function IconaCamera() {
  return (
    <svg
      className="escaneig__icona"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7l1.3-2.5A1 1 0 0 1 10.2 4h3.6a1 1 0 0 1 .9.5L16 7" />
      <circle cx="12" cy="13.5" r="3.3" />
    </svg>
  );
}

function IconaTeclat() {
  return (
    <svg
      className="escaneig__icona"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M6 14h8" />
    </svg>
  );
}

function IconaCheck() {
  return (
    <svg
      className="escaneig__missatge-check"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
  );
}

function IconaAlerta() {
  return (
    <svg
      className="escaneig__icona-alerta"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3.5 21.5 20H2.5L12 3.5Z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function EscaneigPage() {
  const { user } = useAuth();
  const videoRef = useRef(null);
  const ultimCodiRef = useRef({ codi: null, moment: 0 });
  const [sessioActiva, setSessioActiva] = useState(undefined);
  const [codiManual, setCodiManual] = useState('');
  const [hash, setHash] = useState(() => window.location.hash.slice(1));
  const mockup = import.meta.env.DEV ? MOCKUPS[hash] : undefined;
  const [missatge, setMissatge] = useState(() => mockup?.missatge ?? null);
  const [resum, setResum] = useState(RESUM_INICIAL);
  const [modeEntrada, setModeEntrada] = useState(() => mockup?.modeEntrada ?? 'idle');
  const lotsRef = useRef([]);
  const [lotsCarregats, setLotsCarregats] = useState(false);

  useEffect(() => {
    const handler = () => setHash(window.location.hash.slice(1));
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  useEffect(() => {
    document.body.classList.add('escaneig-body');
    return () => document.body.classList.remove('escaneig-body');
  }, []);

  // Quan l'usuari canvia el fragment de la URL (p. ex. #ok -> #error) sense
  // recarregar la pàgina, apliquem el mockup corresponent durant el render
  // (patró recomanat per React per "reaccionar" a un canvi, enlloc de fer-ho
  // dins un efecte, que aquí disparava react-hooks/set-state-in-effect).
  const [hashAplicat, setHashAplicat] = useState(hash);
  if (hash !== hashAplicat) {
    setHashAplicat(hash);
    if (mockup) {
      setModeEntrada(mockup.modeEntrada);
      setMissatge(mockup.missatge ?? null);
    } else {
      setMissatge(null);
      setModeEntrada('idle');
    }
  }

  useEffect(() => {
    const q = query(collection(db, 'sessions'), where('activa', '==', true));
    return onSnapshot(q, (snap) => {
      setSessioActiva(snap.docs[0] ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null);
    });
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'lotsTiquets'));
    return onSnapshot(q, (snap) => {
      lotsRef.current = snap.docs.map((d) => d.data());
      setLotsCarregats(true);
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

  const mostrarResultat = (nouMissatge) => {
    setMissatge(nouMissatge);
  };

  const handleTornarAEscanejar = () => {
    setMissatge(null);
  };

  const handleTancar = () => {
    setModeEntrada('idle');
    setMissatge(null);
  };

  const handleEscanejar = () => {
    setModeEntrada('BarcodeDetector' in window ? 'escanejant' : 'manual');
  };

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
      mostrarResultat({ tipus: 'ok', text: `Entrada genèrica registrada (${sessioActiva.preuEntrada}€)` });
    } catch {
      mostrarResultat({ tipus: 'error', text: "No s'ha pogut registrar l'entrada. Torna-ho a provar." });
    }
  };

  const processarCodi = async (codiOriginal) => {
    const codi = codiOriginal.trim();
    const ara = Date.now();
    if (ultimCodiRef.current.codi === codi && ara - ultimCodiRef.current.moment < DEBOUNCE_MS) {
      mostrarResultat({ tipus: 'avis', text: "Aquest codi ja s'ha registrat fa un moment." });
      return;
    }
    ultimCodiRef.current = { codi, moment: ara };

    try {
      const identificat = identificarCodi(codi);

      if (identificat.tipus === 'desconegut') {
        mostrarResultat({
          tipus: 'error',
          text: `Codi no reconegut: ${codi}`,
          detall: 'Els codis vàlids comencen per SOCI- o T-',
        });
        return;
      }

      if (identificat.tipus === 'soci') {
        const socisTrobats = await getDocs(
          query(collection(db, 'socis'), where('numeroSoci', '==', identificat.numeroSoci))
        );
        if (socisTrobats.empty) {
          mostrarResultat({
            tipus: 'error',
            text: `No hi ha cap soci amb el número ${identificat.numeroSoci}`,
            detall: 'Comprova el número al carnet o al llistat de socis',
          });
          return;
        }
        const soci = socisTrobats.docs[0].data();
        if (!estaActiu(soci)) {
          mostrarResultat({
            tipus: 'error',
            text: `${soci.nom} ${soci.cognoms}`,
            detall: soci.motiuDesactivacio ? `Soci desactivat: ${soci.motiuDesactivacio}` : 'Aquest soci està desactivat',
          });
          return;
        }
        await addDoc(collection(db, 'accessLog'), {
          sessionId: sessioActiva.id,
          timestamp: serverTimestamp(),
          escanejatPer: user.uid,
          tipus: 'soci',
          numeroSoci: identificat.numeroSoci,
        });
        const estat = calcularEstatSoci(soci);
        const venciment = estat === ESTAT_AL_DIA
          ? { data: calcularVenciment(soci).toLocaleDateString('ca-ES'), dies: diesFinsVenciment(soci) }
          : null;
        mostrarResultat({ tipus: 'ok', text: `${soci.nom} ${soci.cognoms}`, estat, venciment });
        return;
      }

      if (!lotsCarregats) {
        mostrarResultat({ tipus: 'error', text: 'Encara carregant els lots de tiquets. Torna-ho a provar.' });
        return;
      }

      if (tiquetEstaAnulat(identificat.codiTiquet, lotsRef.current)) {
        mostrarResultat({
          tipus: 'error',
          text: `El codi ${identificat.codiTiquet} ha estat anul·lat.`,
          detall: 'Aquest tiquet ja no és vàlid per accedir-hi',
        });
        return;
      }

      const repetits = await getDocs(
        query(
          collection(db, 'accessLog'),
          where('codiTiquet', '==', identificat.codiTiquet)
        )
      );
      if (!repetits.empty) {
        const timestampRepetit = repetits.docs[0].data().timestamp;
        const dataRepetit = typeof timestampRepetit?.toDate === 'function'
          ? timestampRepetit.toDate().toLocaleString('ca-ES')
          : null;
        const textBase = `El codi ${identificat.codiTiquet} ja s'ha escanejat`;
        mostrarResultat({
          tipus: 'avis',
          text: 'Codi ja utilitzat',
          detall: dataRepetit
            ? `${textBase} (${dataRepetit}). Confirma si vols comptar-lo igualment.`
            : `${textBase}. Confirma si vols comptar-lo igualment.`,
          codiTiquet: identificat.codiTiquet,
          onConfirmar: () => registrarGeneric(identificat.codiTiquet),
        });
        return;
      }
      await registrarGeneric(identificat.codiTiquet);
    } catch {
      mostrarResultat({ tipus: 'error', text: "No s'ha pogut registrar l'entrada. Torna-ho a provar." });
    }
  };

  useEffect(() => {
    if (!sessioActiva || modeEntrada !== 'escanejant' || missatge || !('BarcodeDetector' in window)) return undefined;
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
      mostrarResultat({ tipus: 'error', text: "No s'ha pogut accedir a la càmera. Utilitza el camp de text." });
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
  }, [sessioActiva?.id, modeEntrada, missatge]);

  const handleCodiManual = (e) => {
    e.preventDefault();
    if (!codiManual.trim()) return;
    processarCodi(codiManual.trim());
    setCodiManual('');
  };

  if (!mockup && sessioActiva === undefined) return <Carregant />;

  if (!mockup && !sessioActiva) {
    return (
      <p className="escaneig__sense-sessio">
        No hi ha cap sessió activa. Marca una sessió com a activa abans d'escanejar.
      </p>
    );
  }

  const sessioPerMostrar = mockup ? (sessioActiva ?? MOCKUP_SESSIO) : sessioActiva;

  const fonsContingut = sessioPerMostrar.imatgeUrl
    ? `linear-gradient(rgb(0 0 0 / 44%), rgb(255 255 255 / 84%)), url(${sessioPerMostrar.imatgeUrl})`
    : undefined;

  return (
    <div className="escaneig">
      {mockup && <p className="escaneig__mockup-avis">Mode mockup: #{hash}</p>}
      <div
        className="escaneig__contingut"
        style={{ backgroundImage: fonsContingut }}
      >
        {!missatge && modeEntrada === 'idle' && (
          <>
            <button type="button" className="btn escaneig__boto-gran" onClick={handleEscanejar}>
              <IconaCamera />
              Escanejar
            </button>
            <button
              type="button"
              className="btn btn--negre escaneig__boto-gran"
              onClick={() => setModeEntrada('manual')}
            >
              <IconaTeclat />
              Introduir codi manualment
            </button>
          </>
        )}

        {!missatge && modeEntrada === 'escanejant' && (
          <>
            <video ref={videoRef} className="escaneig__video" muted playsInline />
            <button
              type="button"
              className="btn btn--negre escaneig__boto-gran"
              onClick={() => setModeEntrada('manual')}
            >
              <IconaTeclat />
              Introduir codi manualment
            </button>
          </>
        )}

        {!missatge && modeEntrada === 'manual' && (
          <div className="escaneig__manual-caixa">
            <form className="escaneig__manual" onSubmit={handleCodiManual}>
              <div className="form__field">
                <label className="form__label escaneig__manual-label" htmlFor="codi-manual">Codi manual</label>
                <input
                  id="codi-manual"
                  className="form__input escaneig__manual-input"
                  value={codiManual}
                  onChange={(e) => setCodiManual(e.target.value)}
                />
              </div>
              <button className="btn" type="submit">Registrar</button>
            </form>
          </div>
        )}

        {missatge && (
          <div className={`escaneig__missatge escaneig__missatge--${missatge.tipus}`} role="status">
            {missatge.tipus === 'ok' && <IconaCheck />}
            {missatge.tipus === 'avis' && <IconaAlerta />}
            <p className="escaneig__missatge-text">{missatge.text}</p>
            {missatge.detall && <p className="escaneig__missatge-detall">{missatge.detall}</p>}
            {missatge.estat && (
              <span className={`badge badge--${missatge.estat} escaneig__missatge-badge`}>{ETIQUETES_ESTAT[missatge.estat]}</span>
            )}
            {missatge.venciment && (
              <p className={`escaneig__missatge-venciment ${missatge.venciment.dies <= DIES_AVIS_RENOVACIO ? 'escaneig__missatge-venciment--avis' : ''}`}>
                {missatge.venciment.dies <= DIES_AVIS_RENOVACIO && <IconaAlerta />}
                Venç el {missatge.venciment.data}
              </p>
            )}
            {missatge.onConfirmar && (
              <button
                className="btn btn--blanc escaneig__boto-confirmar"
                type="button"
                onClick={() => {
                  if (window.confirm(`Segur que vols comptar el codi ${missatge.codiTiquet} igualment?`)) {
                    missatge.onConfirmar();
                  }
                }}
              >
                Comptar igualment
              </button>
            )}
            <button className="btn escaneig__boto-tornar" type="button" onClick={handleTornarAEscanejar}>
              <IconaCamera />
              Escanejar un altre
            </button>
          </div>
        )}
      </div>

      <footer className="escaneig__footer">
        <div className="escaneig__footer-info">
          <p className="escaneig__footer-titol">{sessioPerMostrar.titol}</p>
          <div className="escaneig__footer-resum">
            <span>Socis: {resum.socisDistints}</span>
            <span>Aportacions: {resum.entradesGeneriques}</span>
            <span>Import: {resum.importGeneric}€</span>
          </div>
        </div>
        {(modeEntrada !== 'idle' || missatge) && (
          <button
            type="button"
            className="escaneig__footer-tancar"
            onClick={handleTancar}
            aria-label="Tancar i tornar a l'inici"
          >
            <svg
              className="escaneig__footer-tancar-icona"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </footer>
    </div>
  );
}
