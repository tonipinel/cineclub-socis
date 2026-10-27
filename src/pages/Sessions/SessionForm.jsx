import {
  lazy, Suspense, useEffect, useRef, useState,
} from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  addDoc, collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { publicaAFormulari, urlPublica } from '../../lib/sessioPublica';
import { internaAFormulari, internaADesar, internaHaCanviat } from '../../lib/internaProposta';
import {
  CAMPS_INICIALS, MISSATGE_ALIAS, campsCanviats, prepararDesat,
} from '../../lib/desarSessio';
import { estatBarra, pestanyesAmbCanvis } from '../../lib/estatDesar';
import useAvisSortida from '../../lib/useAvisSortida';
import * as ROUTES from '../../constants/routes';
import Carregant from '../../components/Carregant';
import { useConfirmacio } from '../../components/ConfirmacioProvider';
import Pestanyes from '../../components/Pestanyes';
import BarraDesar from '../../components/BarraDesar';
import PaginaAdmin from '../../components/PaginaAdmin';
import ErrorCarrega, { DocumentInexistent } from '../../components/ErrorCarrega';
import useErrorCarrega from '../../lib/useErrorCarrega';
import { ETIQUETA_PESTANYA, PESTANYA_DEL_CAMP, PESTANYES } from './camps';
import CapcaleraSessio from './CapcaleraSessio';
import DadesSessio, { TargetaSessio } from './pestanyes/DadesSessio';
import ContingutsSessio from './pestanyes/ContingutsSessio';
import MitjansSessio from './pestanyes/MitjansSessio';

const EstadistiquesSessio = lazy(() => import('./pestanyes/EstadistiquesSessio'));

const PESTANYES_EDICIO = { dades: DadesSessio, continguts: ContingutsSessio, mitjans: MitjansSessio };

const ERROR_XARXA = "No s'ha pogut desar. Torna-ho a provar.";
const TORNAR = { to: ROUTES.SESSIONS, etiqueta: 'Sessions' };
const DURADA_DESAT = 2500;

// Camps que `prepararDesat` pot calcular (URL de la primera publicació, cartell → imatge de reserva).
const CAMPS_CALCULATS = ['urlProgramacio', 'imatgeUrl'];

// Camp de `errors.publicar` → id de l'input on es corregeix.
const ID_CAMP_PUBLICAR = {
  titol: 'titol', data: 'data', slug: 'publica-slug', preu: 'publica-preu',
};

const sessionsDe = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

// Documents d'un catàleg amb nom, ordenats pel nom; buit si no es pot llegir.
async function carregarCataleg(coleccio) {
  try {
    const snap = await getDocs(collection(db, coleccio));
    const llista = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => typeof e.nom === 'string' && e.nom.trim());
    return llista.sort((a, b) => a.nom.localeCompare(b.nom, 'ca'));
  } catch {
    return [];
  }
}

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
  const [distribuidores, setDistribuidores] = useState([]);
  const [errorsPublica, setErrorsPublica] = useState({});
  const [carregant, setCarregant] = useState(editant);
  const [inexistent, setInexistent] = useState(false);
  const { error: errorCarrega, falla: fallaCarrega, reintenta, intent: intentCarrega } = useErrorCarrega();
  const [errorActiva, setErrorActiva] = useState(null);
  const [desant, setDesant] = useState(false);
  const [desatRecent, setDesatRecent] = useState(false);
  const [errorDesat, setErrorDesat] = useState(null);
  const [errorsBarra, setErrorsBarra] = useState([]);
  // Pujades d'imatges en curs a «Mitjans» (n'hi pot haver més d'una si es canvia de pestanya i es torna).
  const [pujades, setPujades] = useState(0);
  // Cada «Descartar» remunta la pestanya perquè l'estat local dels components torni a partir dels valors desats.
  const [versioDescart, setVersioDescart] = useState(0);
  // Gestió interna (privada): és la de la proposta d'origen (`propostesInternes/{propostaId}`), i es desa amb la sessió.
  // `null` mentre no es llegeix (o si la sessió no ve d'una proposta); `internaInicial` és l'últim estat desat.
  const [interna, setInterna] = useState(null);
  const [internaInicial, setInternaInicial] = useState(null);
  const desantRef = useRef(false);
  const idsAEnfocar = useRef(null);
  const temporitzadorDesat = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { confirma } = useConfirmacio();

  const canvis = campsCanviats(dades, original, publicaForm, publicaInicial);
  const internaCanviada = internaHaCanviat(interna, internaInicial);
  const hiHaCanvis = canvis.dades.length > 0 || canvis.publica.length > 0 || internaCanviada;
  useAvisSortida(hiHaCanvis && !desant);

  useEffect(() => {
    if (!editant) return undefined;
    let actiu = true;
    getDoc(doc(db, 'sessions', id)).then((snap) => {
      if (!actiu) return;
      const desada = snap.data();
      if (!desada) {
        setInexistent(true);
        return;
      }
      const { publica, ...sessio } = desada;
      const form = publicaAFormulari(publica);
      setOriginal(desada);
      setDades({ ...CAMPS_INICIALS, ...sessio });
      setPublicaForm(form);
      setPublicaInicial(form);
      setCarregant(false);
    }).catch((e) => { if (actiu) fallaCarrega(e); });
    return () => { actiu = false; };
  }, [id, editant, intentCarrega, fallaCarrega]);

  const propostaId = original.propostaId;
  useEffect(() => {
    if (!editant || !propostaId) return undefined;
    let actiu = true;
    getDoc(doc(db, 'propostesInternes', propostaId)).then((snap) => {
      if (!actiu) return;
      const form = internaAFormulari(snap.data());
      setInterna(form);
      setInternaInicial(form);
    }).catch(() => {});
    return () => { actiu = false; };
  }, [editant, propostaId]);

  // Només per avisar d'un slug repetit mentre s'edita (el desat torna a llegir les sessions): si falla, queda buida.
  useEffect(() => {
    if (!editant) return;
    getDocs(collection(db, 'sessions')).then((snap) => setAltresSessions(sessionsDe(snap)))
      .catch((e) => console.error("No s'han pogut llegir les altres sessions:", e));
  }, [editant]);

  // Catàlegs d'entitats i de distribuïdores per als selectors de «Dades»; si no es poden llegir, queden buits
  // i la fitxa funciona igual.
  useEffect(() => {
    if (!editant) return;
    carregarCataleg('entitats').then(setEntitats);
    carregarCataleg('distribuidores').then(setDistribuidores);
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
  // El títol original és un sol camp: si la sessió ja té fitxa pública, també n'escriu el títol (`publica.titol`) i
  // `publica.titolOriginal`, perquè no se separin. Una sessió sense `publica` no la crea per un canvi de títol.
  const onCanviDades = (camp, valor) => {
    editat();
    setDades((d) => ({ ...d, [camp]: valor }));
    if (camp === 'titol' && original.publica) setPublicaForm((f) => ({ ...f, titol: valor, titolOriginal: valor }));
  };
  // `valor` pot ser una funció del valor actual: una pujada que acaba tard (potser des d'una pestanya ja desmuntada)
  // s'aplica sobre l'estat d'ara, sense perdre el que s'hagi editat mentrestant.
  const onCanviForm = (camp, valor) => {
    editat();
    setPublicaForm((f) => ({ ...f, [camp]: typeof valor === 'function' ? valor(f[camp]) : valor }));
  };

  const onCanviInterna = (camp, valor) => {
    editat();
    setInterna((i) => ({ ...i, [camp]: valor }));
  };

  const onPujant = (comenca) => setPujades((n) => n + (comenca ? 1 : -1));

  // Torna a l'últim estat desat (o als camps buits d'una sessió nova): `original` i `publicaInicial` ja són
  // la línia base actualitzada després de cada desat i de «Marcar com a activa». No esborra res de Storage.
  const handleDescarta = () => {
    if (desantRef.current || pujades > 0) return;
    const { publica: _publica, ...desat } = original;
    editat();
    setErrorsPublica({});
    idsAEnfocar.current = null;
    setDades({ ...CAMPS_INICIALS, ...desat });
    setPublicaForm(publicaInicial);
    setInterna(internaInicial);
    setVersioDescart((v) => v + 1);
  };

  const desar = async () => {
    const altres = dades.publicada ? sessionsDe(await getDocs(collection(db, 'sessions'))) : [];
    const {
      errors, cancelat, dadesADesar, canvis: canvisADesar, publicaFinal,
    } = await prepararDesat({
      id,
      dades,
      publicaForm,
      publicaInicial,
      original,
      altresSessions: altres,
      confirmarAlias: () => confirma({ missatge: MISSATGE_ALIAS, etiquetaAcceptar: 'Desa' }),
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
    if (internaCanviada) await setDoc(doc(db, 'propostesInternes', propostaId), internaADesar(interna));
    // El que s'ha desat passa a ser la nova línia base. L'estat viu conserva el que s'hagi escrit mentre es desava
    // i només rep els valors calculats en desar (URL, imatge de reserva i aliases).
    const aliases = publicaFinal?.aliases ?? publicaForm.aliases;
    const calculats = Object.fromEntries(CAMPS_CALCULATS
      .filter((camp) => dadesADesar[camp] !== dades[camp])
      .map((camp) => [camp, dadesADesar[camp]]));
    if (internaCanviada) setInternaInicial(interna);
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

  if (inexistent) {
    return <DocumentInexistent titol="Sessió" missatge="Aquesta sessió no existeix." tornar={TORNAR} />;
  }
  if (errorCarrega) {
    return <ErrorCarrega amplada="fitxa" titol="Sessió" tornar={TORNAR} missatge="No s'ha pogut carregar la sessió." onReintenta={reintenta} />;
  }
  if (carregant) return <Carregant />;

  const estat = estatBarra({
    desant, error: Boolean(errorDesat) || errorsBarra.length > 0, hiHaCanvis, desatRecent,
  });
  const pestanyesCanviades = [...new Set([
    ...pestanyesAmbCanvis(canvis.dades, canvis.publica, PESTANYA_DEL_CAMP),
    ...(internaCanviada ? ['dades'] : []),
  ])].sort(perOrdreDePestanya);
  const barra = (
    <BarraDesar
      estat={estat}
      errors={errorsBarra}
      onAnarA={canviarPestanya}
      pestanyesAfectades={pestanyesCanviades.map((p) => ETIQUETA_PESTANYA[p])}
      missatgeError={errorDesat}
      onDescarta={handleDescarta}
      bloquejada={pujades > 0}
      motiuBloqueig="S'està pujant una imatge…"
    />
  );

  if (!editant) {
    return (
      <PaginaAdmin
        as="form"
        amplada="fitxa"
        ambBarra
        className="fitxa-sessio"
        titol="Nova sessió"
        tornar={TORNAR}
        onSubmit={handleSubmit}
      >
        <div className="fitxa-sessio__contingut">
          <TargetaSessio key={versioDescart} dades={dades} onCanviDades={onCanviDades} />
        </div>
        {barra}
      </PaginaAdmin>
    );
  }

  const PestanyaEdicio = PESTANYES_EDICIO[pestanya];

  return (
    <PaginaAdmin
      as="form"
      amplada="fitxa"
      ambBarra={pestanya !== 'estadistiques'}
      className="fitxa-sessio"
      onSubmit={handleSubmit}
    >
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
              key={versioDescart}
              dades={{ ...dades, id }}
              onCanviDades={onCanviDades}
              form={publicaForm}
              onCanviForm={onCanviForm}
              errors={errorsPublica}
              altresSessions={altresSessions}
              entitats={entitats}
              organitzaDesat={publicaInicial.organitza}
              distribuidores={distribuidores}
              distribucioDesada={{ nom: publicaInicial.suportDistribucio, id: publicaInicial.suportDistribucioId }}
              original={original}
              interna={interna}
              onCanviInterna={onCanviInterna}
              urlPagina={original.publicada ? urlPublica(original.data, original.slug) : ''}
              onPujant={onPujant}
            />
          </div>
        )}
      </div>
      {pestanya !== 'estadistiques' && barra}
    </PaginaAdmin>
  );
}

// Clau per sessió: en passar de «Nova sessió» a la fitxa creada, l'estat comença de nou.
export default function SessionForm() {
  const { id } = useParams();
  return <FitxaSessio key={id ?? 'nova'} id={id} />;
}
