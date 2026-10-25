import { useEffect, useRef, useState } from 'react';
import { prepararLector } from '../../lib/lectorCodis';
import { Link } from 'react-router-dom';
import * as ROUTES from '../../constants/routes';
import {
  addDoc, collection, getDocs, getDocsFromServer, limit, onSnapshot, query, serverTimestamp, updateDoc, where,
} from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../auth/useAuth';
import {
  codiPerRegistre, identificarCodi, resumAccessLog, tiquetEstaAnulat, preuDelTiquet,
} from '../../lib/escaneig';
import { hashTokenCarnet } from '../../lib/tokenCarnet';
import { avui, formatData, formatDataHora } from '../../lib/data';
import {
  calcularEstatSoci, calcularVenciment, diesFinsVenciment, estaActiu, inicPeriodeEnEscanejar,
  ESTAT_AL_DIA, ESTAT_PENDENT, ESTAT_VENCUT, ESTAT_NOU_REGISTRE,
} from '../../lib/estatSoci';
import { DIES_AVIS_RENOVACIO } from '../../lib/socis';
import { imatgeDeSessio } from '../../lib/sessions';
import Carregant from '../../components/Carregant';
import { useConfirmacio } from '../../components/ConfirmacioProvider';
import EstrellaActiva from '../../components/EstrellaActiva';

const DEBOUNCE_MS = 3000;
// Temps màxim que la pantalla espera el servidor (lectures i escriptures)
// abans de donar un missatge: sense això, amb mala connexió la promesa de
// Firestore no es resol i l'operador es queda sense resposta i reescaneja.
const TEMPS_LIMIT_MS = 8000;
// Les lectures (idempotents) tenen un primer intent més curt i, si s'esgota,
// un sol reintent amb el límit sencer: ≈ 13 s en el pitjor cas.
const TEMPS_PRIMERA_LECTURA_MS = 5000;
const DETALL_LECTURA_ESGOTADA = 'Temps límit de lectura esgotat (2 intents)';
// Valor que retorna processarCodiUnic quan abandona l'intent durant una
// lectura (abans de cap escriptura i de cap missatge).
const CANCELLAT = 'cancellat';
const TEXT_ERROR_REGISTRE = "No s'ha pogut registrar l'entrada. Torna-ho a provar.";
const DETALL_CODI_DESCONEGUT = 'Escaneja el QR del carnet o del tiquet, o escriu el número de soci o el codi del tiquet (T-000123).';
const RESUM_INICIAL = { socisDistints: 0, entradesGeneriques: 0, importGeneric: 0 };
// Deteccions fallides seguides (≈ 2 s) que fan donar el lector per no disponible.
const MAX_DETECCIONS_FALLIDES = 5;
const TEXT_LECTOR_NO_DISPONIBLE = "No s'ha pogut carregar el lector de codis. Pots escriure el codi a mà.";

const ETIQUETES_ESTAT = {
  [ESTAT_AL_DIA]: 'Al dia',
  [ESTAT_PENDENT]: 'Pendent',
  [ESTAT_VENCUT]: 'Vençut',
  [ESTAT_NOU_REGISTRE]: 'Nou registre',
};

// Mode mockup: afegeix #idle, #escanejant, #codi, #lector (lector no
// disponible), #ok (soci), #tiquet (ok genèric), #error o #avis a la URL per
// veure directament aquella pantalla sense haver d'escanejar ni tenir sessió
// activa (útil per iterar sobre el disseny). No afecta producció real: només
// substitueix l'estat inicial mentre l'URL tingui aquest fragment.
const MOCKUP_SESSIO = { id: 'mockup', titol: 'Sessió de prova' };

const MOCKUP_VENCIMENT_AVIAT = new Date();
MOCKUP_VENCIMENT_AVIAT.setDate(MOCKUP_VENCIMENT_AVIAT.getDate() + 10);

const MOCKUPS = {
  idle: { modeEntrada: 'idle', missatge: null },
  escanejant: { modeEntrada: 'escanejant', missatge: null },
  codi: { modeEntrada: 'manual', missatge: null },
  lector: { modeEntrada: 'manual', missatge: null, lectorNoDisponible: true },
  ok: {
    modeEntrada: 'escanejant',
    missatge: {
      tipus: 'ok',
      text: 'Anna Vidal',
      estat: ESTAT_AL_DIA,
      venciment: { data: formatData(MOCKUP_VENCIMENT_AVIAT), dies: 10 },
    },
  },
  tiquet: { modeEntrada: 'escanejant', missatge: { tipus: 'ok', text: 'Entrada genèrica registrada (5€)' } },
  error: {
    modeEntrada: 'escanejant',
    missatge: {
      tipus: 'error',
      text: 'Codi no reconegut: XYZ',
      detall: DETALL_CODI_DESCONEGUT,
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

// Resol { valor } si la promesa acaba dins el temps límit, { esgotat: true }
// si no, o { cancellat: true } si s'avorta el senyal; la promesa original
// segueix viva. Si falla abans, l'error es propaga.
function ambTempsLimit(promesa, ms = TEMPS_LIMIT_MS, senyal = undefined) {
  let temporitzador;
  let cancellar;
  const limit = new Promise((resolve) => {
    temporitzador = setTimeout(() => resolve({ esgotat: true }), ms);
    cancellar = () => resolve({ cancellat: true });
    if (senyal?.aborted) cancellar();
    senyal?.addEventListener('abort', cancellar);
  });
  return Promise.race([promesa.then((valor) => ({ valor })), limit])
    .finally(() => {
      clearTimeout(temporitzador);
      senyal?.removeEventListener('abort', cancellar);
    });
}

// Identificador del build desplegat: el nom (amb hash) del bundle principal,
// p. ex. "index-B4x9.js". En desenvolupament no n'hi ha i s'omet.
function versioBuild() {
  const src = document.querySelector('script[type="module"][src*="/assets/"]')?.getAttribute('src');
  return src ? src.split('/').pop() : undefined;
}

const textError = (error) => String(error?.message ?? error);

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
  // Últim codi processat i com va acabar: 'en-curs', 'registrat' (escriptura
  // confirmada pel servidor) o 'pendent-enviar'. Només 'registrat' activa
  // l'avís de "ja s'ha registrat fa un moment".
  const ultimCodiRef = useRef({ codi: null, moment: 0, resultat: null });
  // Codis amb l'entrada desada al dispositiu però encara no confirmada.
  const codisPendentsRef = useRef(new Set());
  // Un sol intent alhora: la càmera detecta el mateix QR cada 400 ms i, sense
  // això, un segon intent sobreescrivia el resultat del primer.
  const processantRef = useRef(false);
  // Un sol diàleg de «Comptar igualment» alhora (p. ex. amb un doble toc).
  const confirmantRef = useRef(false);
  const { confirma } = useConfirmacio();
  const [processant, setProcessant] = useState(false);
  const [reintentant, setReintentant] = useState(false);
  // Avorta les lectures de l'intent en curs si la pantalla es desmunta o
  // canvia la sessió activa: cap resultat tardà pot escriure res.
  const controladorRef = useRef(null);
  const [enLinia, setEnLinia] = useState(() => navigator.onLine);
  const [pendentsEnviar, setPendentsEnviar] = useState(0);
  // Entrades que es van donar per pendents d'enviar però que el servidor ha
  // acabat rebutjant: l'operador ha de saber-ho encara que hagi passat a un altre.
  const [enviamentsFallits, setEnviamentsFallits] = useState([]);
  const [sessioActiva, setSessioActiva] = useState(undefined);
  const [codiManual, setCodiManual] = useState('');
  const [hash, setHash] = useState(() => window.location.hash.slice(1));
  const mockup = import.meta.env.DEV ? MOCKUPS[hash] : undefined;
  const [missatge, setMissatge] = useState(() => mockup?.missatge ?? null);
  const [resum, setResum] = useState(RESUM_INICIAL);
  const [modeEntrada, setModeEntrada] = useState(() => mockup?.modeEntrada ?? 'idle');
  // El lector de QR no ha pogut arrencar (WASM no carregat, detector que falla):
  // es passa al camp de text amb un avís.
  const [lectorNoDisponible, setLectorNoDisponible] = useState(() => mockup?.lectorNoDisponible ?? false);
  const inputManualRef = useRef(null);
  const [modeProva, setModeProva] = useState(false);
  const lotsRef = useRef([]);
  const [lotsCarregats, setLotsCarregats] = useState(false);
  // Valors actuals per a codi asíncron o callbacks creats abans (interval de
  // la càmera, «Comptar igualment»): les closures veurien valors antics.
  const missatgeRef = useRef(missatge);
  const modeProvaRef = useRef(modeProva);
  const sessioActivaRef = useRef(sessioActiva);
  useEffect(() => { missatgeRef.current = missatge; }, [missatge]);
  useEffect(() => { modeProvaRef.current = modeProva; }, [modeProva]);
  useEffect(() => { sessioActivaRef.current = sessioActiva; }, [sessioActiva]);

  useEffect(() => {
    const handler = () => setHash(window.location.hash.slice(1));
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  useEffect(() => {
    const actualitzar = () => setEnLinia(navigator.onLine);
    window.addEventListener('online', actualitzar);
    window.addEventListener('offline', actualitzar);
    return () => {
      window.removeEventListener('online', actualitzar);
      window.removeEventListener('offline', actualitzar);
    };
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
      setLectorNoDisponible(mockup.lectorNoDisponible ?? false);
    } else {
      setMissatge(null);
      setModeEntrada('idle');
      setLectorNoDisponible(false);
    }
  }

  useEffect(() => {
    const q = query(collection(db, 'sessions'), where('activa', '==', true));
    return onSnapshot(q, (snap) => {
      const docSessio = snap.docs.find((d) => d.data().senseControl !== true);
      setSessioActiva(docSessio ? { id: docSessio.id, ...docSessio.data() } : null);
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
    return onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
      setResum(resumAccessLog(snap.docs.map((d) => d.data())));
      setPendentsEnviar(snap.docs.filter((d) => d.metadata?.hasPendingWrites).length);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessioActiva?.id]);

  // El WASM del lector (≈ 1 MB amb el polyfill d'iOS) es baixa mentre la
  // pantalla espera, no en clicar Escanejar. Si falla, s'avisa en escanejar.
  useEffect(() => {
    if (sessioActiva) prepararLector().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessioActiva?.id]);

  // En desmuntar, l'intent s'abandona en silenci; si canvia la sessió activa,
  // s'avisa l'operador (vegeu processarCodi).
  useEffect(() => () => controladorRef.current?.abort('desmuntat'), []);
  const sessioIdRef = useRef(undefined);
  useEffect(() => {
    const id = sessioActiva?.id;
    if (sessioIdRef.current !== undefined && sessioIdRef.current !== id) {
      controladorRef.current?.abort('sessio-canviada');
    }
    sessioIdRef.current = id;
  }, [sessioActiva?.id]);

  const mostrarResultat = (nouMissatge) => {
    missatgeRef.current = nouMissatge;
    setMissatge(nouMissatge);
  };

  const handleTornarAEscanejar = () => {
    mostrarResultat(null);
  };

  const handleTancar = () => {
    setModeEntrada('idle');
    setLectorNoDisponible(false);
    mostrarResultat(null);
  };

  const handleEscanejar = () => {
    setLectorNoDisponible(false);
    setModeEntrada('BarcodeDetector' in window ? 'escanejant' : 'manual');
  };

  // Registre de diagnòstic per poder investigar més tard per què un carnet o
  // tiquet concret no s'ha pogut llegir (p. ex. si sempre falla el mateix
  // carnet, probablement és un problema d'impressió, no de l'aplicació).
  // Mai bloqueja el flux principal: no s'espera i, si fallés, s'ignora.
  // Afegeix l'estat de la xarxa i el build per poder diagnosticar-ho després.
  const registrarErrorEscaneig = async (motiu, dades) => {
    if (modeProvaRef.current) return;
    try {
      const registre = {
        sessionId: sessioActivaRef.current?.id ?? null,
        timestamp: serverTimestamp(),
        escanejatPer: user?.uid ?? null,
        motiu,
        ...dades,
        // La taquilla llegeix aquest registre: mai hi pot quedar el token sencer d'un carnet.
        codi: codiPerRegistre(dades?.codi),
        online: navigator.onLine,
        versio: versioBuild(),
      };
      // Firestore no accepta camps undefined.
      Object.keys(registre).forEach((k) => registre[k] === undefined && delete registre[k]);
      await addDoc(collection(db, 'escaneigErrors'), registre);
    } catch {
      // No hi ha res més a fer si ni tan sols es pot desar l'error.
    }
  };

  const marcarRegistrat = (codi) => {
    ultimCodiRef.current = { codi, moment: Date.now(), resultat: 'registrat' };
  };

  // Desa una entrada a l'accessLog sense deixar la pantalla penjada. Retorna
  // 'registrat' si el servidor la confirma dins el temps límit, o
  // 'pendent-enviar' si no: l'SDK la manté a la cua i l'enviarà quan torni
  // la xarxa (sempre que no es recarregui la pàgina, perquè la caché només
  // és en memòria). Si l'escriptura falla, ho registra i llança l'error.
  const desarEntrada = async (codi, metode, inici, dades, clau = codi) => {
    const escriptura = addDoc(collection(db, 'accessLog'), dades);
    let resultat;
    try {
      resultat = await ambTempsLimit(escriptura);
    } catch (error) {
      registrarErrorEscaneig('error-escriptura', {
        codi, metode, ms: Date.now() - inici, detall: textError(error),
      });
      throw error;
    }
    if (!resultat.esgotat) {
      marcarRegistrat(codi);
      return 'registrat';
    }
    registrarErrorEscaneig('timeout-escriptura', { codi, metode, ms: Date.now() - inici });
    codisPendentsRef.current.add(clau);
    ultimCodiRef.current = { codi, moment: Date.now(), resultat: 'pendent-enviar' };
    escriptura.then(() => {
      codisPendentsRef.current.delete(clau);
      if (ultimCodiRef.current.codi === codi) marcarRegistrat(codi);
    }, (error) => {
      codisPendentsRef.current.delete(clau);
      if (ultimCodiRef.current.codi === codi) ultimCodiRef.current = { codi: null, moment: 0, resultat: null };
      registrarErrorEscaneig('error-escriptura', {
        codi, metode, ms: Date.now() - inici, detall: `Després del temps límit: ${textError(error)}`,
      });
      const hora = new Date().toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' });
      setEnviamentsFallits((llista) => [...llista, { id: `${codi}-${Date.now()}`, codi, hora }]);
    });
    return 'pendent-enviar';
  };

  const avisPendent = (qui, extra = {}) => ({
    tipus: 'avis',
    text: "Sense connexió estable: l'entrada s'ha desat al dispositiu i s'enviarà quan torni la xarxa.",
    detall: `${qui}. NO tornis a escanejar aquest codi ni recarreguis la pàgina.`,
    ...extra,
  });

  const mostrarPendent = (codi, metode) => {
    registrarErrorEscaneig('pendent-enviar', { codi, metode });
    mostrarResultat({
      tipus: 'avis',
      text: "Aquest codi és pendent d'enviar-se; espera que torni la connexió.",
      detall: "L'entrada ja està desada al dispositiu: no cal tornar-la a registrar.",
    });
  };

  // Clau de pendents d'un soci: el número, perquè el mateix soci pot entrar
  // amb el número escrit a mà o amb el QR del carnet (CARNET-token).
  const clauSoci = (numeroSoci) => `soci:${numeroSoci}`;

  const avisSenseConnexio = (text, dades) => {
    registrarErrorEscaneig('sense-connexio', dades);
    mostrarResultat({ tipus: 'error', text });
  };

  const registrarGeneric = async (codiTiquet, preuAplicat, metode, inici = Date.now()) => {
    const sessio = sessioActivaRef.current;
    if (modeProvaRef.current) {
      mostrarResultat({
        tipus: 'ok', text: `Entrada genèrica (${preuAplicat}€)`, prova: true, sessioProva: sessio.titol,
      });
      return;
    }
    try {
      const resultat = await desarEntrada(codiTiquet, metode, inici, {
        sessionId: sessio.id,
        timestamp: serverTimestamp(),
        escanejatPer: user.uid,
        tipus: 'generic',
        codiTiquet,
        preuAplicat,
        metode,
      });
      mostrarResultat(resultat === 'registrat'
        ? { tipus: 'ok', text: `Entrada genèrica registrada (${preuAplicat}€)` }
        : avisPendent(`Entrada genèrica (${preuAplicat}€)`));
    } catch {
      mostrarResultat({ tipus: 'error', text: TEXT_ERROR_REGISTRE });
    }
  };

  // Lectura amb un reintent si el primer intent esgota el temps. Retorna el
  // resultat d'ambTempsLimit; { esgotat: true } vol dir que han fallat els dos.
  // Les escriptures no passen mai per aquí: reintentar-les podria duplicar-les.
  // `valid` descarta del log `lectura-lenta` les respostes que acabaran en
  // `sense-connexio` (un sol registre per intent).
  const llegirAmbReintent = async (llegir, {
    senyal, inici, dades, valid = () => true,
  }) => {
    const primer = await ambTempsLimit(llegir(), TEMPS_PRIMERA_LECTURA_MS, senyal);
    if (!primer.esgotat) return primer;
    setReintentant(true);
    let segon;
    try {
      segon = await ambTempsLimit(llegir(), TEMPS_LIMIT_MS, senyal);
    } finally {
      setReintentant(false);
    }
    if (segon.valor !== undefined && valid(segon.valor)) {
      registrarErrorEscaneig('lectura-lenta', { ...dades, ms: Date.now() - inici, intents: 2 });
    }
    return { ...segon, intents: 2 };
  };

  // Consulta de `socisPorta` (la projecció mínima per a la porta, sense DNI, contacte ni token del carnet) amb
  // limit(1), l'únic llistat que permeten les regles. Amb getDocs (no getDocsFromServer): la fitxa d'un soci
  // treta de la caché és vàlida per deixar-lo entrar, però un resultat buit
  // venint de la caché no vol dir que no existeixi, sinó que no s'ha pogut
  // preguntar al servidor; aquest cas es tracta com a "sense connexió".
  const buitDesdeCache = (snap) => snap.docs.length === 0 && snap.metadata?.fromCache;
  const consultarSoci = async (camp, valor, opcions) => {
    const resultat = await llegirAmbReintent(
      () => getDocs(query(collection(db, 'socisPorta'), where(camp, '==', valor), limit(1))),
      { ...opcions, valid: (snap) => !buitDesdeCache(snap) },
    );
    if (resultat.cancellat) return { cancellat: true };
    if (resultat.esgotat) return { senseConnexio: true, detall: DETALL_LECTURA_ESGOTADA, intents: 2 };
    const snap = resultat.valor;
    const desdeCache = snap.metadata?.fromCache;
    if (buitDesdeCache(snap)) {
      return {
        senseConnexio: true, desdeCache, detall: 'Cap resultat a la caché local', intents: resultat.intents,
      };
    }
    return { sociDoc: snap.docs[0], desdeCache };
  };

  // Activació del carnet (primer escaneig d'una alta) a la fitxa de `socis`, que només pot llegir i escriure
  // l'admin: amb el rol taquilla falla i queda al registre d'incidències, com abans. No s'espera mai.
  const desarActivacio = (numeroSoci, inicPeriode, codi, metode) => {
    Promise.resolve()
      .then(() => getDocs(query(collection(db, 'socis'), where('numeroSoci', '==', numeroSoci), limit(1))))
      .then((snap) => {
        if (!snap?.docs?.length) throw new Error('fitxa no trobada');
        return updateDoc(snap.docs[0].ref, { inicPeriode });
      })
      .catch((error) => {
        registrarErrorEscaneig('error-escriptura', {
          codi, metode, numeroSoci, detall: `inicPeriode: ${textError(error)}`,
        });
      });
  };

  const processarSociTrobat = async ({
    consulta, missatgeNoTrobat, detallNoTrobat, metode, codi, inici,
  }) => {
    if (consulta.cancellat) return CANCELLAT;
    const { sociDoc, desdeCache } = consulta;
    const diagnostic = { ms: Date.now() - inici, desdeCache };
    if (consulta.senseConnexio) {
      avisSenseConnexio('No es pot comprovar el soci (sense connexió). Reintenta quan hi hagi xarxa.', {
        codi, metode, ...diagnostic, detall: consulta.detall, intents: consulta.intents,
      });
      return;
    }
    if (!sociDoc) {
      registrarErrorEscaneig('soci-no-trobat', {
        codi, metode, detall: missatgeNoTrobat, ...diagnostic,
      });
      mostrarResultat({ tipus: 'error', text: missatgeNoTrobat, detall: detallNoTrobat });
      return;
    }
    const soci = sociDoc.data();
    if (!estaActiu(soci)) {
      registrarErrorEscaneig('soci-desactivat', {
        codi, metode, numeroSoci: soci.numeroSoci, detall: soci.motiuDesactivacio ?? null, ...diagnostic,
      });
      mostrarResultat({
        tipus: 'error',
        text: `${soci.nom} ${soci.cognoms}`,
        detall: soci.motiuDesactivacio ? `Soci desactivat: ${soci.motiuDesactivacio}` : 'Aquest soci està desactivat',
      });
      return;
    }
    // En una alta, l'any de soci compta des del primer cop que fa servir el
    // carnet dins de la quota pagada: si encara no ho ha fet, aquesta entrada
    // el fixa ara (mai abans que comenci la quota; una renovació encadenada no
    // en té; vegeu inicPeriodeEnEscanejar). Calculem aquí el valor que tindria (encara que
    // en mode prova no s'arribi a desar) perquè l'estat i el venciment
    // mostrats reflecteixin sempre el resultat final.
    const inicPeriodeNou = inicPeriodeEnEscanejar(soci, avui());
    const sociAmbInicPeriode = { ...soci, inicPeriode: inicPeriodeNou };
    const estat = calcularEstatSoci(sociAmbInicPeriode);
    const venciment = estat === ESTAT_AL_DIA
      ? { data: formatData(calcularVenciment(sociAmbInicPeriode)), dies: diesFinsVenciment(sociAmbInicPeriode) }
      : null;
    const sessio = sessioActivaRef.current;
    if (modeProvaRef.current) {
      mostrarResultat({
        tipus: 'ok', text: `${soci.nom} ${soci.cognoms}`, estat, venciment, prova: true, sessioProva: sessio.titol,
      });
      return;
    }
    if (codisPendentsRef.current.has(clauSoci(soci.numeroSoci))) {
      mostrarPendent(codi, metode);
      return;
    }
    const nom = `${soci.nom} ${soci.cognoms}`;
    let resultat;
    try {
      resultat = await desarEntrada(codi, metode, inici, {
        sessionId: sessio.id,
        timestamp: serverTimestamp(),
        escanejatPer: user.uid,
        tipus: 'soci',
        numeroSoci: soci.numeroSoci,
        metode,
      }, clauSoci(soci.numeroSoci));
    } catch {
      mostrarResultat({ tipus: 'error', text: TEXT_ERROR_REGISTRE, detall: nom });
      return;
    }
    // L'entrada ja és desada: no s'espera la confirmació d'aquesta segona
    // escriptura perquè, amb mala connexió, deixaria la pantalla penjada.
    if (inicPeriodeNou !== soci.inicPeriode) desarActivacio(soci.numeroSoci, inicPeriodeNou, codi, metode);
    mostrarResultat(resultat === 'registrat'
      ? { tipus: 'ok', text: nom, estat, venciment }
      : avisPendent(nom, { estat, venciment }));
  };

  const processarCodiUnic = async (codi, metode, inici, senyal) => {
    const identificatAbans = identificarCodi(codi, metode);
    const clau = identificatAbans.tipus === 'soci' ? clauSoci(identificatAbans.numeroSoci) : codi;
    if (codisPendentsRef.current.has(clau)) {
      mostrarPendent(codi, metode);
      return;
    }
    const anterior = ultimCodiRef.current;
    if (anterior.codi === codi && anterior.resultat === 'registrat' && inici - anterior.moment < DEBOUNCE_MS) {
      registrarErrorEscaneig('debounce', {
        codi, metode, ms: inici - anterior.moment, resultatAnterior: anterior.resultat,
      });
      mostrarResultat({ tipus: 'avis', text: "Aquest codi ja s'ha registrat fa un moment." });
      return;
    }
    ultimCodiRef.current = { codi, moment: inici, resultat: 'en-curs' };
    const ms = () => Date.now() - inici;

    try {
      const identificat = identificarCodi(codi, metode);

      if (identificat.tipus === 'desconegut') {
        registrarErrorEscaneig('codi-desconegut', { codi, metode, ms: ms() });
        mostrarResultat({
          tipus: 'error',
          text: `Codi no reconegut: ${codi}`,
          detall: DETALL_CODI_DESCONEGUT,
        });
        return;
      }

      // Un QR amb SOCI-<n> no és el d'un carnet (que porta CARNET-<token>) i el pot fabricar qualsevol.
      if (identificat.tipus === 'soci-qr') {
        registrarErrorEscaneig('qr-soci-rebutjat', { codi, metode, ms: ms() });
        mostrarResultat({
          tipus: 'error',
          text: 'Aquest QR no és un carnet vàlid',
          detall: 'Escaneja el QR del carnet. Si el soci no el porta, escriu-ne el número a mà i comprova-li la identitat.',
        });
        return;
      }

      if (identificat.tipus === 'soci') {
        return await processarSociTrobat({
          consulta: await consultarSoci('numeroSoci', identificat.numeroSoci, {
            senyal, inici, dades: { codi, metode },
          }),
          missatgeNoTrobat: `No hi ha cap soci amb el número ${identificat.numeroSoci}`,
          detallNoTrobat: 'Comprova el número al carnet o al llistat de socis',
          metode,
          codi,
          inici,
        });
      }

      if (identificat.tipus === 'carnet-token') {
        return await processarSociTrobat({
          consulta: await consultarSoci('tokenHash', await hashTokenCarnet(identificat.token), {
            senyal, inici, dades: { codi, metode },
          }),
          missatgeNoTrobat: 'Aquest carnet no és vàlid.',
          metode,
          codi,
          inici,
        });
      }

      if (!lotsCarregats) {
        registrarErrorEscaneig('lots-no-carregats', { codi, metode, ms: ms() });
        mostrarResultat({ tipus: 'error', text: 'Encara carregant els lots de tiquets. Torna-ho a provar.' });
        return;
      }

      if (tiquetEstaAnulat(identificat.codiTiquet, lotsRef.current)) {
        registrarErrorEscaneig('tiquet-anullat', {
          codi, metode, codiTiquet: identificat.codiTiquet, ms: ms(),
        });
        mostrarResultat({
          tipus: 'error',
          text: `El codi ${identificat.codiTiquet} ha estat anul·lat.`,
          detall: 'Aquest tiquet ja no és vàlid per accedir-hi',
        });
        return;
      }

      const preuTiquet = preuDelTiquet(identificat.codiTiquet, lotsRef.current);
      if (preuTiquet === undefined) {
        registrarErrorEscaneig('tiquet-desconegut', {
          codi, metode, codiTiquet: identificat.codiTiquet, ms: ms(),
        });
        mostrarResultat({
          tipus: 'error',
          text: `El codi ${identificat.codiTiquet} no pertany a cap lot de tiquets conegut.`,
        });
        return;
      }

      // Sempre al servidor: la caché local pot no tenir l'entrada (dóna un
      // tiquet repetit per bo) o tenir-ne una de pendent (dóna un "ja
      // utilitzat" per una entrada que encara no consta enlloc).
      const textSenseConnexio = "No es pot comprovar si aquest tiquet ja s'ha utilitzat (sense connexió). Reintenta quan hi hagi xarxa.";
      let consulta;
      try {
        consulta = await llegirAmbReintent(() => getDocsFromServer(
          query(collection(db, 'accessLog'), where('codiTiquet', '==', identificat.codiTiquet))
        ), { senyal, inici, dades: { codi, metode, codiTiquet: identificat.codiTiquet } });
      } catch (error) {
        avisSenseConnexio(textSenseConnexio, {
          codi, metode, codiTiquet: identificat.codiTiquet, ms: ms(), detall: textError(error),
        });
        return;
      }
      if (consulta.cancellat) return CANCELLAT;
      if (consulta.esgotat) {
        avisSenseConnexio(textSenseConnexio, {
          codi, metode, codiTiquet: identificat.codiTiquet, ms: ms(), detall: DETALL_LECTURA_ESGOTADA, intents: 2,
        });
        return;
      }
      const repetits = consulta.valor;
      if (!repetits.empty) {
        const timestampRepetit = repetits.docs[0].data().timestamp;
        const dataRepetit = typeof timestampRepetit?.toDate === 'function'
          ? formatDataHora(timestampRepetit)
          : null;
        const textBase = `El codi ${identificat.codiTiquet} ja s'ha escanejat`;
        registrarErrorEscaneig('tiquet-ja-utilitzat', {
          codi, metode, codiTiquet: identificat.codiTiquet, ms: ms(), desdeCache: repetits.metadata?.fromCache ?? false,
        });
        mostrarResultat({
          tipus: 'avis',
          text: 'Codi ja utilitzat',
          detall: dataRepetit
            ? `${textBase} (${dataRepetit}). Confirma si vols comptar-lo igualment.`
            : `${textBase}. Confirma si vols comptar-lo igualment.`,
          codiTiquet: identificat.codiTiquet,
          onConfirmar: () => ambUnSolIntent(() => registrarGeneric(identificat.codiTiquet, preuTiquet, metode)),
        });
        return;
      }
      await registrarGeneric(identificat.codiTiquet, preuTiquet, metode, inici);
    } catch (error) {
      registrarErrorEscaneig('excepcio', {
        codi, metode, detall: textError(error), ms: ms(),
      });
      mostrarResultat({ tipus: 'error', text: TEXT_ERROR_REGISTRE });
    }
  };

  // Un sol intent alhora (escaneig o «Comptar igualment»): si ja n'hi ha un
  // en curs, el nou s'ignora en silenci; el resultat el donarà el primer.
  const ambUnSolIntent = async (fn) => {
    if (processantRef.current) return;
    processantRef.current = true;
    setProcessant(true);
    try {
      await fn();
    } finally {
      processantRef.current = false;
      setProcessant(false);
    }
  };

  const processarCodi = (codiOriginal, metode) => {
    // Una lectura per QR amb un resultat a la pantalla és un fotograma
    // endarrerit de l'escaneig anterior: s'ignora sense avís ni log.
    if (metode === 'qr' && missatgeRef.current) return undefined;
    const codi = codiOriginal.trim();
    return ambUnSolIntent(async () => {
      const controlador = new AbortController();
      controladorRef.current = controlador;
      const inici = Date.now();
      const sessionId = sessioActivaRef.current?.id;
      try {
        const resultat = await processarCodiUnic(codi, metode, inici, controlador.signal);
        const motiu = controlador.signal.reason;
        const dades = {
          codi, metode, ms: Date.now() - inici, sessionId,
        };
        if (resultat === CANCELLAT && motiu === 'sessio-canviada' && !missatgeRef.current) {
          registrarErrorEscaneig('sessio-canviada', dades);
          mostrarResultat({ tipus: 'avis', text: 'La sessió activa ha canviat. Torna a escanejar el codi.' });
        } else if (resultat === CANCELLAT && motiu === 'desmuntat') {
          // El component ja no hi és, però registrarErrorEscaneig només fa un
          // addDoc independent (no s'espera ni toca estat).
          registrarErrorEscaneig('abandonat', dades);
        } else if (motiu === 'sessio-canviada') {
          // La sessió ha canviat amb l'escriptura en curs: s'ha desat a la
          // sessió inicial i es mostra el resultat normal.
          registrarErrorEscaneig('sessio-canviada-escrit', dades);
        }
      } finally {
        if (controladorRef.current === controlador) controladorRef.current = null;
        // Si l'intent no ha acabat registrat ni pendent, un reintent del mateix
        // codi s'ha de processar de nou (sense el fals "ja s'ha registrat").
        if (ultimCodiRef.current.codi === codi && ultimCodiRef.current.resultat === 'en-curs') {
          ultimCodiRef.current = { codi: null, moment: 0, resultat: null };
        }
      }
    });
  };

  // L'interval de la càmera es crea un cop i, sense aquesta referència,
  // cridaria una versió antiga de processarCodi (amb lotsCarregats o
  // modeProva desfasats).
  const processarCodiRef = useRef(processarCodi);
  useEffect(() => {
    processarCodiRef.current = processarCodi;
  });

  useEffect(() => {
    if (!sessioActiva || modeEntrada !== 'escanejant' || missatge || !('BarcodeDetector' in window)) return undefined;
    let actiu = true;
    let stream;
    let lectorLlest = false;
    let detectant = false;
    let fallades = 0;
    // Sense lector la càmera mostraria la imatge però mai no llegiria res, en silenci.
    const lectorFallit = (error) => {
      if (!actiu) return;
      actiu = false;
      registrarErrorEscaneig('lector-no-disponible', { detall: String(error?.message ?? error).slice(0, 200) });
      setLectorNoDisponible(true);
      setModeEntrada('manual');
    };
    let detector;
    try {
      detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    } catch (error) {
      lectorFallit(error);
      return undefined;
    }
    prepararLector().then(() => { lectorLlest = true; }, lectorFallit);

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
      mostrarResultat({ tipus: 'error', text: "No s'ha pogut accedir a la càmera. Utilitza el camp de text." });
    });

    // Una sola detecció alhora, i cap resultat d'una detecció que acabi
    // després d'aturar la càmera (ja hi ha un resultat a la pantalla).
    const interval = setInterval(async () => {
      // Fins que el vídeo no té imatge (HAVE_CURRENT_DATA), el polyfill llança InvalidStateError:
      // passa en cada arrencada de la càmera i no vol dir que el lector falli.
      if (detectant || !lectorLlest || !videoRef.current?.srcObject || videoRef.current.readyState < 2) return;
      detectant = true;
      try {
        const barcodes = await detector.detect(videoRef.current);
        fallades = 0;
        if (!actiu || !barcodes[0]) return;
        processarCodiRef.current(barcodes[0].rawValue, 'qr');
      } catch (error) {
        // Un fotograma no vàlid es reintenta al següent interval; si el descodificador falla sempre, el lector no funciona.
        if (error?.name === 'InvalidStateError') return;
        fallades += 1;
        if (fallades >= MAX_DETECCIONS_FALLIDES) lectorFallit(error);
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
  }, [sessioActiva?.id, modeEntrada, missatge]);

  useEffect(() => {
    if (lectorNoDisponible && modeEntrada === 'manual') inputManualRef.current?.focus();
  }, [lectorNoDisponible, modeEntrada]);

  const handleCodiManual = (e) => {
    e.preventDefault();
    if (!codiManual.trim() || processantRef.current) return;
    processarCodi(codiManual.trim(), 'manual');
    setCodiManual('');
  };

  if (!mockup && sessioActiva === undefined) return <Carregant />;

  if (!mockup && !sessioActiva) {
    return (
      <div className="escaneig__sense-sessio">
        <h1 className="titol-ocult">Escaneig d'entrades</h1>
        <p>No hi ha cap sessió activa. Marca una sessió com a activa abans d'escanejar.</p>
      </div>
    );
  }

  const sessioPerMostrar = mockup ? (sessioActiva ?? MOCKUP_SESSIO) : sessioActiva;

  const imatgeFons = imatgeDeSessio(sessioPerMostrar);
  const fonsContingut = imatgeFons
    ? `linear-gradient(rgb(0 0 0 / 44%), rgb(255 255 255 / 84%)), url(${imatgeFons})`
    : undefined;

  return (
    <div className="escaneig">
      <h1 className="titol-ocult">Escaneig d'entrades</h1>
      {(mockup || modeProva || !enLinia || pendentsEnviar > 0 || enviamentsFallits.length > 0) && (
        <div className="escaneig__avisos">
          {mockup && <p className="escaneig__mockup-avis">Mode mockup: #{hash}</p>}
          {modeProva && <p className="escaneig__prova-avis">Mode prova: no es desa res</p>}
          {!enLinia && <p className="escaneig__connexio-avis" role="status" aria-live="polite">Sense connexió</p>}
          {enviamentsFallits.map((f) => (
            <div key={f.id} className="escaneig__fallit" role="alert">
              <p className="escaneig__fallit-text">
                {`Una entrada no s'ha pogut enviar: ${f.codi} (${f.hora}). Torna-la a escanejar.`}
              </p>
              <button
                type="button"
                className="escaneig__fallit-tancar"
                aria-label="Descartar l'avís d'entrada no enviada"
                onClick={() => setEnviamentsFallits((llista) => llista.filter((x) => x.id !== f.id))}
              >
                ×
              </button>
            </div>
          ))}
          {pendentsEnviar > 0 && (
            <p className="escaneig__pendents-avis" role="status" aria-live="polite">
              {pendentsEnviar === 1 ? "1 entrada pendent d'enviar" : `${pendentsEnviar} entrades pendents d'enviar`}
            </p>
          )}
        </div>
      )}
      <div
        className="escaneig__contingut"
        style={{ backgroundImage: fonsContingut }}
      >
        {!missatge && processant && (
          <p className="escaneig__processant" role="status" aria-live="polite">{reintentant ? 'Reintentant…' : 'Comprovant el codi…'}</p>
        )}

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
            {lectorNoDisponible && (
              <p className="escaneig__lector-error" role="alert">{TEXT_LECTOR_NO_DISPONIBLE}</p>
            )}
            <form className="escaneig__manual" onSubmit={handleCodiManual}>
              <div className="form__field">
                <label className="form__label escaneig__manual-label" htmlFor="codi-manual">Codi manual</label>
                <input
                  ref={inputManualRef}
                  id="codi-manual"
                  className="form__input escaneig__manual-input"
                  value={codiManual}
                  onChange={(e) => setCodiManual(e.target.value)}
                />
              </div>
              <button className="btn" type="submit">Registrar</button>
            </form>
            {lectorNoDisponible && (
              <button type="button" className="btn btn--blanc escaneig__lector-reintentar" onClick={handleEscanejar}>
                <IconaCamera />
                Tornar a provar la càmera
              </button>
            )}
          </div>
        )}

        {missatge && (
          <div className={`escaneig__missatge escaneig__missatge--${missatge.tipus}`} role="status">
            {missatge.tipus === 'ok' && <IconaCheck />}
            {missatge.tipus === 'avis' && <IconaAlerta />}
            <p className="escaneig__missatge-text">{missatge.text}</p>
            {missatge.detall && <p className="escaneig__missatge-detall">{missatge.detall}</p>}
            {missatge.prova && (
              <p className="escaneig__missatge-prova">
                Mode prova: no s'ha desat res. S'afegiria a «{missatge.sessioProva}».
              </p>
            )}
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
                disabled={processant}
                onClick={async () => {
                  if (processantRef.current || confirmantRef.current) return;
                  const avisMostrat = missatge;
                  confirmantRef.current = true;
                  const confirmat = await confirma({
                    missatge: `Segur que vols comptar el codi ${avisMostrat.codiTiquet} igualment?`,
                    etiquetaAcceptar: 'Compta igualment',
                  });
                  confirmantRef.current = false;
                  // Mentre el diàleg era obert, la pantalla pot haver canviat o haver començat un altre intent.
                  if (!confirmat || processantRef.current || missatgeRef.current !== avisMostrat) return;
                  avisMostrat.onConfirmar();
                }}
              >
                {processant ? 'Registrant…' : 'Comptar igualment'}
              </button>
            )}
            <button
              className="btn escaneig__boto-tornar"
              type="button"
              disabled={processant}
              onClick={handleTornarAEscanejar}
            >
              <IconaCamera />
              Escanejar un altre
            </button>
          </div>
        )}
      </div>

      <footer className="escaneig__footer">
        <div className="escaneig__footer-info">
          <p className="escaneig__footer-titol">
            {sessioPerMostrar.activa && <EstrellaActiva className="escaneig__footer-estrella" />}
            {sessioPerMostrar.titol}
          </p>
          <div className="escaneig__footer-resum">
            <span>Socis: {resum.socisDistints}</span>
            <span>No socis: {resum.entradesGeneriques}</span>
            <span>Import: {resum.importGeneric}€</span>
          </div>
          <button
            type="button"
            className={`escaneig__prova-boto ${modeProva ? 'escaneig__prova-boto--actiu' : ''}`}
            onClick={() => setModeProva((v) => !v)}
            aria-pressed={modeProva}
          >
            Mode prova: {modeProva ? 'activat' : 'desactivat'}
          </button>
        </div>
        <Link className="escaneig__footer-log" to={ROUTES.ESCANEIG_LOG}>LOG</Link>
        {(modeEntrada !== 'idle' || missatge) && (
          <button
            type="button"
            className="escaneig__footer-tancar"
            disabled={processant}
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
