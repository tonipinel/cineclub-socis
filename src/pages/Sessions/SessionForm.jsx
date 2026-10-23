import {
  lazy, Suspense, useEffect, useRef, useState,
} from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  addDoc, collection, doc, getDoc, getDocs, query, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { publicaAFormulari, urlPublica } from '../../lib/sessioPublica';
import {
  CAMPS_INICIALS, MISSATGE_ALIAS, campsCanviats, prepararDesat,
} from '../../lib/desarSessio';
import { estatBarra, pestanyesAmbCanvis } from '../../lib/estatDesar';
import useAvisSortida from '../../lib/useAvisSortida';
import * as ROUTES from '../../constants/routes';
import Carregant from '../../components/Carregant';
import Pestanyes from '../../components/Pestanyes';
import BarraDesar from '../../components/BarraDesar';
import { ETIQUETA_PESTANYA, PESTANYA_DEL_CAMP, PESTANYES } from './camps';
import CapcaleraSessio from './CapcaleraSessio';
import DadesSessio, { TargetaSessio } from './pestanyes/DadesSessio';
import ContingutsSessio from './pestanyes/ContingutsSessio';
import MitjansSessio from './pestanyes/MitjansSessio';

const EstadistiquesSessio = lazy(() => import('./pestanyes/EstadistiquesSessio'));

const PESTANYES_EDICIO = { dades: DadesSessio, continguts: ContingutsSessio, mitjans: MitjansSessio };

const ERROR_XARXA = "No s'ha pogut desar. Torna-ho a provar.";
const DURADA_DESAT = 2500;

// Camps que `prepararDesat` pot calcular (URL de la primera publicació, cartell → imatge de reserva).
const CAMPS_CALCULATS = ['urlProgramacio', 'imatgeUrl'];

// Camp de `errors.publicar` → id de l'input on es corregeix.
const ID_CAMP_PUBLICAR = {
  titol: 'titol', data: 'data', slug: 'publica-slug', preu: 'publica-preu',
};

const sessionsDe = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

const perOrdreDePestanya = (a, b) => PESTANYES.indexOf(a) - PESTANYES.indexOf(b);

// Errors de `prepararDesat` agrupats per pestanya (en ordre), amb els ids dels camps afectats.
function errorsPerPestanya(errors) {
  const grups = {};
  const afegir = (pestanya, missatge, idCamp) => {
    grups[pestanya] ??= { missatges: [], ids: [] };
    if (!grups[pestanya].missatges.includes(missatge)) grups[pestanya].missatges.push(missatge);
    grups[pestanya].ids.push(idCamp);
  };
  for (const [camp, missatge] of Object.entries(errors.publicar ?? {})) {
    afegir('dades', missatge, ID_CAMP_PUBLICAR[camp] ?? `publica-${camp}`);
  }
  for (const [camp, missatge] of Object.entries(errors)) {
    if (camp !== 'publicar') afegir(PESTANYA_DEL_CAMP[camp] ?? 'dades', missatge, `publica-${camp}`);
  }
  return Object.keys(grups).sort(perOrdreDePestanya).map((pestanya) => ({
    pestanya,
    etiquetaPestanya: ETIQUETA_PESTANYA[pestanya],
    missatge: grups[pestanya].missatges.join(' '),
    ids: grups[pestanya].ids,
  }));
}

function FitxaSessio({ id }) {
  const editant = Boolean(id);
  const [dades, setDades] = useState(CAMPS_INICIALS);
  const [original, setOriginal] = useState({});
  const [publicaForm, setPublicaForm] = useState(() => publicaAFormulari(undefined));
  const [publicaInicial, setPublicaInicial] = useState(publicaForm);
  const [altresSessions, setAltresSessions] = useState([]);
  const [entitats, setEntitats] = useState([]);
  const [errorsPublica, setErrorsPublica] = useState({});
  const [carregant, setCarregant] = useState(editant);
  const [errorActiva, setErrorActiva] = useState(null);
  const [desant, setDesant] = useState(false);
  const [desatRecent, setDesatRecent] = useState(false);
  const [errorDesat, setErrorDesat] = useState(null);
  const [errorsBarra, setErrorsBarra] = useState([]);
  const desantRef = useRef(false);
  const idsAEnfocar = useRef(null);
  const temporitzadorDesat = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const canvis = campsCanviats(dades, original, publicaForm, publicaInicial);
  const hiHaCanvis = canvis.dades.length > 0 || canvis.publica.length > 0;
  useAvisSortida(hiHaCanvis && !desant);

  useEffect(() => {
    if (!editant) return;
    getDoc(doc(db, 'sessions', id)).then((snap) => {
      const { publica, ...sessio } = snap.data();
      const form = publicaAFormulari(publica);
      setOriginal(snap.data());
      setDades({ ...CAMPS_INICIALS, ...sessio });
      setPublicaForm(form);
      setPublicaInicial(form);
      setCarregant(false);
    });
  }, [id, editant]);

  useEffect(() => {
    if (!editant) return;
    getDocs(collection(db, 'sessions')).then((snap) => setAltresSessions(sessionsDe(snap)));
  }, [editant]);

  // Catàleg d'entitats per als selectors de «Dades»; si no es pot llegir, queda buit i la fitxa funciona igual.
  useEffect(() => {
    if (!editant) return;
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'entitats'));
        const llista = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => typeof e.nom === 'string' && e.nom.trim());
        setEntitats(llista.sort((a, b) => a.nom.localeCompare(b.nom, 'ca')));
      } catch {
        setEntitats([]);
      }
    })();
  }, [editant]);

  useEffect(() => () => clearTimeout(temporitzadorDesat.current), []);

  const senseControl = Boolean(dades.senseControl);
  const permeses = senseControl ? PESTANYES.filter((p) => p !== 'estadistiques') : PESTANYES;
  const demanada = searchParams.get('pestanya');
  const pestanya = permeses.includes(demanada) ? demanada : permeses[0];
  const canviarPestanya = (nova) => setSearchParams({ pestanya: nova }, { replace: true });

  // Després d'un error de validació, focus al primer camp invàlid quan la seva pestanya ja és visible (un sol intent).
  useEffect(() => {
    if (!idsAEnfocar.current || idsAEnfocar.current.pestanya !== pestanya) return;
    const elements = idsAEnfocar.current.ids.map((idCamp) => document.getElementById(idCamp)).filter(Boolean);
    idsAEnfocar.current = null;
    elements.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    elements[0]?.focus();
  });

  // Qualsevol edició amaga «Desat ✓» i el resum d'errors (torna a sortir si el proper desat falla).
  const editat = () => {
    clearTimeout(temporitzadorDesat.current);
    setDesatRecent(false);
    setErrorDesat(null);
    setErrorsBarra([]);
  };
  const onCanviDades = (camp, valor) => {
    editat();
    setDades((d) => ({ ...d, [camp]: valor }));
  };
  const onCanviForm = (camp, valor) => {
    editat();
    setPublicaForm((f) => ({ ...f, [camp]: valor }));
  };

  const desar = async () => {
    const altres = dades.publicada ? sessionsDe(await getDocs(collection(db, 'sessions'))) : [];
    const {
      errors, cancelat, dadesADesar, canvis: canvisADesar, publicaFinal,
    } = prepararDesat({
      id, dades, publicaForm, publicaInicial, original, altresSessions: altres, confirmarAlias: () => window.confirm(MISSATGE_ALIAS),
    });
    if (Object.keys(errors).length > 0) {
      const llista = errorsPerPestanya(errors);
      setErrorsPublica(errors);
      setErrorsBarra(llista);
      canviarPestanya(llista[0].pestanya);
      idsAEnfocar.current = { pestanya: llista[0].pestanya, ids: llista[0].ids };
      return;
    }
    if (cancelat) return;
    if (!editant) {
      const nova = await addDoc(collection(db, 'sessions'), { ...dadesADesar, activa: false });
      navigate(`${ROUTES.SESSIONS_EDITAR.replace(':id', nova.id)}?pestanya=dades`);
      return;
    }
    if (Object.keys(canvisADesar).length > 0) await updateDoc(doc(db, 'sessions', id), canvisADesar);
    // El que s'ha desat passa a ser la nova línia base. L'estat viu conserva el que s'hagi escrit mentre es desava
    // i només rep els valors calculats en desar (URL, imatge de reserva i aliases).
    const aliases = publicaFinal?.aliases ?? publicaForm.aliases;
    const calculats = Object.fromEntries(CAMPS_CALCULATS
      .filter((camp) => dadesADesar[camp] !== dades[camp])
      .map((camp) => [camp, dadesADesar[camp]]));
    setOriginal((o) => ({ ...o, ...dadesADesar }));
    setPublicaInicial({ ...publicaForm, aliases });
    setDades((d) => ({ ...d, ...calculats }));
    setPublicaForm((f) => ({ ...f, aliases }));
    setDesatRecent(true);
    temporitzadorDesat.current = setTimeout(() => setDesatRecent(false), DURADA_DESAT);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (desantRef.current) return;
    desantRef.current = true;
    setDesant(true);
    setErrorDesat(null);
    setErrorsBarra([]);
    setErrorsPublica({});
    try {
      await desar();
    } catch {
      setErrorDesat(ERROR_XARXA);
    } finally {
      desantRef.current = false;
      setDesant(false);
    }
  };

  const handleMarcarActiva = async () => {
    setErrorActiva(null);
    try {
      const activesAbans = await getDocs(query(collection(db, 'sessions'), where('activa', '==', true)));
      const batch = writeBatch(db);
      activesAbans.docs.forEach((docActiu) => batch.update(docActiu.ref, { activa: false }));
      batch.update(doc(db, 'sessions', id), { activa: true });
      await batch.commit();
      setDades((d) => ({ ...d, activa: true }));
      setOriginal((o) => ({ ...o, activa: true }));
    } catch {
      setErrorActiva(ERROR_XARXA);
    }
  };

  if (carregant) return <Carregant />;

  const estat = estatBarra({
    desant, error: Boolean(errorDesat) || errorsBarra.length > 0, hiHaCanvis, desatRecent,
  });
  const pestanyesCanviades = pestanyesAmbCanvis(canvis.dades, canvis.publica, PESTANYA_DEL_CAMP).sort(perOrdreDePestanya);
  const barra = (
    <BarraDesar
      estat={estat}
      errors={errorsBarra}
      onAnarA={canviarPestanya}
      pestanyesAfectades={pestanyesCanviades.map((p) => ETIQUETA_PESTANYA[p])}
      missatgeError={errorDesat}
    />
  );

  if (!editant) {
    return (
      <form className="fitxa-sessio" onSubmit={handleSubmit}>
        <div className="fitxa-sessio__contingut">
          <h1 className="fitxa-sessio__titol">Nova sessió</h1>
          <TargetaSessio dades={dades} onCanviDades={onCanviDades} />
        </div>
        {barra}
      </form>
    );
  }

  const PestanyaEdicio = PESTANYES_EDICIO[pestanya];

  return (
    <form className="fitxa-sessio" onSubmit={handleSubmit}>
      <div className="fitxa-sessio__contingut">
        <CapcaleraSessio dades={dades} original={original} onMarcarActiva={handleMarcarActiva} errorActiva={errorActiva} />
        <Pestanyes
          pestanyes={permeses.map((p) => ({ id: p, etiqueta: ETIQUETA_PESTANYA[p], avis: pestanyesCanviades.includes(p) }))}
          actual={pestanya}
          onCanvi={canviarPestanya}
          etiqueta="Seccions de la sessió"
        />
      </div>
      <div
        role="tabpanel"
        id={`panell-${pestanya}`}
        aria-labelledby={`pestanya-${pestanya}`}
        className={pestanya === 'estadistiques' ? 'fitxa-sessio__panell fitxa-sessio__panell--estadistiques' : 'fitxa-sessio__panell'}
      >
        {pestanya === 'estadistiques' ? (
          <Suspense fallback={<Carregant />}>
            <EstadistiquesSessio id={id} sessio={dades} />
          </Suspense>
        ) : (
          <div className="fitxa-sessio__contingut">
            <PestanyaEdicio
              dades={{ ...dades, id }}
              onCanviDades={onCanviDades}
              form={publicaForm}
              onCanviForm={onCanviForm}
              errors={errorsPublica}
              altresSessions={altresSessions}
              entitats={entitats}
              organitzaDesat={publicaInicial.organitza}
              original={original}
              urlPagina={original.publicada ? urlPublica(original.data, original.slug) : ''}
            />
          </div>
        )}
      </div>
      {pestanya !== 'estadistiques' && barra}
    </form>
  );
}

// Clau per sessió: en passar de «Nova sessió» a la fitxa creada, l'estat comença de nou.
export default function SessionForm() {
  const { id } = useParams();
  return <FitxaSessio key={id ?? 'nova'} id={id} />;
}
