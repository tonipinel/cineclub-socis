import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import {
  calcularTotal, CATEGORIES_PER_TIPUS, CATEGORIA_QUOTA_SOCI, DIRECCIONS_TRASPAS, METODES_DESPESA, METODES_INGRES,
  TIPUS_MOVIMENT, ETIQUETES_METODE, ETIQUETES_DIRECCIO,
} from '../../lib/moviments';
import {
  ACCEPT_ADJUNT, eliminarAdjunt, pujarAdjunt, urlAdjunt, validarAdjunt,
} from '../../lib/adjunts';
import { sincronitzacioQuotes } from '../../lib/estatSoci';
import { sessionsAmbControl } from '../../lib/sessions';
import useFitxaEditable from '../../lib/useFitxaEditable';
import BarraDesar from '../../components/BarraDesar';
import Carregant from '../../components/Carregant';
import { useConfirmacio } from '../../components/ConfirmacioProvider';
import PaginaAdmin from '../../components/PaginaAdmin';
import SelectorFitxer from '../../components/SelectorFitxer';
import ZonaPerill from '../../components/ZonaPerill';
import * as ROUTES from '../../constants/routes';

// Un soci pot tenir diversos moviments de "Quotes socis" (alta + renovacions
// successives, distingides pel camp `tipusQuota`). Aquest formulari és
// genèric i no en sap res del soci: per això, cada cop que es desa o
// s'elimina un moviment de quota, la fitxa del soci (ultimPagament,
// vigenciaDes i, si cal, inicPeriode) es recalcula amb tot l'historial de
// quotes que en queda (sincronitzacioQuotes, a estatSoci.js), i només
// s'escriu el que canvia: editar el concepte o el mètode no toca res.
async function sincronitzarUltimPagament(numeroSoci) {
  const [movimentsSnap, socisSnap] = await Promise.all([
    getDocs(query(
      collection(db, 'moviments'),
      where('categoria', '==', CATEGORIA_QUOTA_SOCI),
      where('numeroSoci', '==', numeroSoci)
    )),
    getDocs(query(collection(db, 'socis'), where('numeroSoci', '==', numeroSoci))),
  ]);
  if (socisSnap.empty) return;
  const sociDoc = socisSnap.docs[0];
  const canvis = sincronitzacioQuotes(sociDoc.data(), movimentsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
  if (Object.keys(canvis).length === 0) return;
  await updateDoc(sociDoc.ref, canvis);
}

// Cada categoria només és vàlida per a un tipus (una despesa mai pot ser
// "Aportacions", ni un ingrés "Gestió pel·lícules" — vegeu CATEGORIES_PER_TIPUS).
// A més, "Quotes socis" només es pot crear des de "Registrar pagament" a la
// fitxa del soci (l'únic flux que en sap el numeroSoci, distingeix alta de
// renovació, i sincronitza ultimPagament): aquest formulari genèric no té
// selector de soci, així que no es pot triar per a moviments nous ni per
// canviar-hi un moviment existent — però si ja n'estàs editant un, es manté
// a la llista perquè la categoria es pugui seguir mostrant i desar sense
// forçar un canvi.
function categoriesDisponibles(tipus, categoriaActual) {
  const base = CATEGORIES_PER_TIPUS[tipus] ?? [];
  return base.filter((c) => c !== CATEGORIA_QUOTA_SOCI || c === categoriaActual);
}

const CAMPS = ['data', 'concepte', 'tipus', 'categoria', 'metodePagament', 'direccio', 'preuUnitari', 'quantitat', 'sessionId'];
const ERROR_CARREGA = "No s'ha pogut carregar el moviment. Torna-ho a provar.";
const ETIQUETES = {
  data: 'Data', concepte: 'Concepte', sessionId: 'Sessió', preuUnitari: 'Preu unitari', quantitat: 'Quantitat',
};
const CAMPS_AMB_ERROR = Object.keys(ETIQUETES);
const TORNAR_COMPTABILITAT = { to: ROUTES.COMPTABILITAT, etiqueta: 'Comptabilitat' };
const rutaSessio = (sessionId) => `${ROUTES.SESSIONS_EDITAR.replace(':id', sessionId)}?pestanya=estadistiques`;

// Valors del formulari: els per defecte (amb `parametres` de l'URL en una alta) i, si n'hi ha, els del moviment desat.
function valorsFormulari(parametres, desat) {
  const tipus = parametres.get('tipus') || TIPUS_MOVIMENT.INGRES;
  const categoria = parametres.get('categoria');
  const disponibles = categoriesDisponibles(tipus);
  const perDefecte = {
    data: parametres.get('data') ?? '',
    concepte: parametres.get('concepte') ?? '',
    tipus,
    categoria: categoria && disponibles.includes(categoria) ? categoria : disponibles[0],
    metodePagament: METODES_INGRES[0],
    direccio: DIRECCIONS_TRASPAS[0],
    preuUnitari: parametres.get('preuUnitari') ?? '',
    quantitat: parametres.get('quantitat') ?? '1',
    sessionId: parametres.get('sessionId') ?? '',
  };
  const camps = desat
    ? {
      ...perDefecte,
      ...Object.fromEntries(CAMPS.filter((camp) => camp in desat).map((camp) => [camp, desat[camp]])),
      preuUnitari: String(desat.preuUnitari ?? ''),
      quantitat: String(desat.quantitat ?? '1'),
      sessionId: desat.sessionId ?? '',
    }
    : perDefecte;
  // `fitxerNou`: clau del document triat pendent de pujar ('' cap); `treureAdjunt`: camí del document desat que es vol treure.
  return { ...camps, fitxerNou: '', treureAdjunt: '' };
}

function FitxaMoviment({ id, moviment }) {
  const editant = Boolean(id);
  const [searchParams] = useSearchParams();
  // Una alta preomplerta per URL (p. ex. des d'una sessió) ja és un canvi pendent respecte de l'alta buida.
  const [inicial] = useState(() => valorsFormulari(new URLSearchParams(), moviment));
  const [valorsInicials] = useState(() => (editant ? inicial : valorsFormulari(searchParams, null)));
  // Si s'ha arribat aquí amb una sessió ja triada per l'URL (des del botó
  // "Afegir moviment" de la fitxa d'una sessió concreta), no té sentit
  // permetre canviar-la: era precisament el motiu d'obrir el formulari.
  // En desar, es torna a aquella sessió (no a la fitxa del moviment nou).
  const [sessioOrigen] = useState(() => (!editant && searchParams.get('sessionId')) || '');
  // Document tal com és a Firestore: base de numeroSoci, tipusQuota i adjunt en desar i en eliminar.
  const [desat, setDesat] = useState(moviment);
  const [sessions, setSessions] = useState([]);
  const [url, setUrl] = useState(null);
  const [errorAdjunt, setErrorAdjunt] = useState(null);
  const [errorEliminar, setErrorEliminar] = useState(null);
  // Documents triats per clau (`valors.fitxerNou`); `fitxerDesat` és la clau del que ja és a l'últim desat.
  const [fitxers, setFitxers] = useState({});
  const [fitxerDesat, setFitxerDesat] = useState('');
  const dataRef = useRef(null);
  const preuRef = useRef(null);
  const quantitatRef = useRef(null);
  const navigate = useNavigate();
  const { confirma } = useConfirmacio();

  const onDesar = async ({ valors: v }) => {
    // Venint d'una sessió, la sessió bloquejada és sempre la d'origen (excepte en un traspàs, que no en té).
    const sessionId = v.tipus === TIPUS_MOVIMENT.TRASPAS ? '' : (sessioOrigen || v.sessionId || '');
    const errors = {};
    // Una data a mig esborrar arriba com a '': sense validació nativa, s'escriuria i es perdria la desada.
    if (dataRef.current?.validity.badInput) errors.data = 'La data no és vàlida.';
    if (!v.concepte.trim()) errors.concepte = 'El concepte no pot estar en blanc.';
    if (v.tipus !== TIPUS_MOVIMENT.TRASPAS && v.categoria === 'Gestió pel·lícules' && !sessionId) {
      errors.sessionId = 'Un moviment de "Gestió pel·lícules" ha d\'estar vinculat a una sessió.';
    }
    // Sense validació nativa, el navegador ja no atura un text que no pot llegir com a número (arriba com a '')
    // ni un valor fora del `step`: són errors, no un 0 ni un valor arrodonit.
    const validesaPreu = preuRef.current?.validity;
    if (validesaPreu?.badInput) errors.preuUnitari = 'El preu unitari ha de ser un número.';
    else if (validesaPreu?.stepMismatch) errors.preuUnitari = 'El preu unitari pot tenir com a màxim dos decimals.';
    const validesaQuantitat = quantitatRef.current?.validity;
    if (validesaQuantitat?.badInput) errors.quantitat = 'La quantitat ha de ser un número.';
    else if (validesaQuantitat?.stepMismatch) errors.quantitat = 'La quantitat ha de ser un número enter.';
    if (Object.keys(errors).length) return { errors };

    const adjuntDesat = desat?.adjunt;
    const fitxer = v.fitxerNou !== fitxerDesat ? fitxers[v.fitxerNou] : null;
    let adjuntNou = null;
    let escrit = false;
    try {
      if (fitxer) adjuntNou = await pujarAdjunt(fitxer);
      const treure = Boolean(adjuntDesat) && v.treureAdjunt === adjuntDesat.path;
      const adjuntFinal = adjuntNou ?? (treure ? null : adjuntDesat);
      const quantitatNum = Number(v.quantitat) || 0;
      const preuUnitariNum = Number(v.preuUnitari) || 0;
      const totalNum = calcularTotal(preuUnitariNum, quantitatNum);
      const base = {
        data: v.data,
        concepte: v.concepte.trim(),
        tipus: v.tipus,
        preuUnitari: preuUnitariNum,
        quantitat: quantitatNum,
        total: totalNum,
        sessionId,
        // numeroSoci i tipusQuota no són camps editables en aquest formulari,
        // però si el moviment ja els tenia (creat des de "Registrar
        // pagament" d'un soci) els hem de conservar explícitament: `moviment`
        // es desa sencer amb setDoc (no merge), així que qualsevol camp no
        // llistat aquí es perdria en desar.
        ...(desat?.numeroSoci != null ? { numeroSoci: desat.numeroSoci } : {}),
        ...(desat?.tipusQuota != null ? { tipusQuota: desat.tipusQuota } : {}),
        ...(desat?.vencimentAnterior != null ? { vencimentAnterior: desat.vencimentAnterior } : {}),
        ...(adjuntFinal ? { adjunt: adjuntFinal } : {}),
      };
      const nou = v.tipus === TIPUS_MOVIMENT.TRASPAS
        ? { ...base, direccio: v.direccio }
        : { ...base, categoria: v.categoria, metodePagament: v.metodePagament };
      // `nou` és sempre el document sencer per al tipus actual: se sobreescriu
      // amb setDoc (no merge) perquè un canvi de tipus no deixi camps obsolets
      // (categoria/metodePagament/direccio) del tipus anterior.
      let idNou = null;
      if (editant) {
        await setDoc(doc(db, 'moviments', id), nou);
      } else {
        idNou = (await addDoc(collection(db, 'moviments'), nou)).id;
      }
      escrit = true;
      if (editant) {
        setDesat(nou);
        setFitxerDesat(v.fitxerNou);
      }
      // Just després d'escriure (abans de cap pas que pugui fallar): el document antic ja no és de cap moviment,
      // i un reintent, que parteix del document escrit, no el tornaria a veure. `eliminarAdjunt` no falla mai.
      if (adjuntDesat && adjuntFinal?.path !== adjuntDesat.path) {
        await eliminarAdjunt(adjuntDesat.path);
      }
      if (nou.numeroSoci != null) {
        await sincronitzarUltimPagament(Number(nou.numeroSoci));
      }
      if (!editant) {
        if (sessioOrigen) navigate(rutaSessio(sessioOrigen), { replace: true });
        else navigate(ROUTES.COMPTABILITAT_EDITAR.replace(':id', idNou), { replace: true });
      }
      return undefined;
    } catch (e) {
      // Un document ja vinculat al moviment escrit no s'esborra.
      if (adjuntNou && !escrit) await eliminarAdjunt(adjuntNou.path);
      throw e;
    }
  };

  const {
    valors, canvia, estat, desa, descarta, errorDesat, errors,
  } = useFitxaEditable({ inicial, valorsInicials, onDesar });
  const desant = estat === 'desant';

  useEffect(() => {
    getDocs(collection(db, 'sessions')).then((snap) => {
      setSessions(sessionsAmbControl(snap.docs.map((d) => ({ id: d.id, ...d.data() }))).filter((s) => s.data));
    });
  }, []);

  const adjuntDesat = desat?.adjunt;
  const pathAdjunt = adjuntDesat?.path;
  useEffect(() => {
    if (!pathAdjunt) return undefined;
    let cancelat = false;
    urlAdjunt(pathAdjunt).then((u) => {
      if (!cancelat) setUrl({ path: pathAdjunt, url: u });
    }).catch(() => {});
    return () => { cancelat = true; };
  }, [pathAdjunt]);
  const urlAdjuntActual = pathAdjunt && url?.path === pathAdjunt ? url.url : null;
  const treurePendent = Boolean(adjuntDesat) && valors.treureAdjunt === adjuntDesat.path;
  const fitxerPendent = valors.fitxerNou !== fitxerDesat ? fitxers[valors.fitxerNou] : null;
  const mostraAdjuntDesat = adjuntDesat && !treurePendent;

  const handleCanviFitxer = (e) => {
    const fitxer = e.target.files[0];
    if (!fitxer) return;
    const errorFitxer = validarAdjunt(fitxer);
    if (errorFitxer) {
      // Com abans, un fitxer rebutjat també treu el que hi havia triat.
      setErrorAdjunt(errorFitxer);
      canvia('fitxerNou', fitxerDesat);
      return;
    }
    setErrorAdjunt(null);
    const clau = `fitxer-${Object.keys(fitxers).length + 1}`;
    setFitxers((f) => ({ ...f, [clau]: fitxer }));
    canvia('fitxerNou', clau);
  };

  const handleCanviTipus = (e) => {
    const nouTipus = e.target.value;
    canvia('tipus', nouTipus);
    if (nouTipus === TIPUS_MOVIMENT.TRASPAS) {
      // Un traspàs mou diners entre caixa i banc de l'associació: no té
      // sentit lligar-lo a una sessió concreta.
      canvia('direccio', valors.direccio || DIRECCIONS_TRASPAS[0]);
      canvia('sessionId', '');
      return;
    }
    const metodes = nouTipus === TIPUS_MOVIMENT.DESPESA ? METODES_DESPESA : METODES_INGRES;
    const disponibles = categoriesDisponibles(nouTipus, valors.categoria);
    canvia('categoria', disponibles.includes(valors.categoria) ? valors.categoria : disponibles[0]);
    canvia('metodePagament', metodes.includes(valors.metodePagament) ? valors.metodePagament : metodes[0]);
    // En sortir d'un traspàs, la sessió bloquejada torna a ser la d'origen.
    if (sessioOrigen) canvia('sessionId', sessioOrigen);
  };

  const handleDescarta = () => {
    setErrorAdjunt(null);
    descarta();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    desa();
  };

  const handleEliminar = async () => {
    const confirmat = await confirma({
      missatge: 'Segur que vols eliminar aquest moviment? Aquesta acció no es pot desfer.',
      perill: true,
      etiquetaAcceptar: 'Elimina',
    });
    if (!confirmat) return;
    setErrorEliminar(null);
    try {
      await deleteDoc(doc(db, 'moviments', id));
      if (desat.adjunt) await eliminarAdjunt(desat.adjunt.path);
      if (desat.numeroSoci != null) {
        await sincronitzarUltimPagament(Number(desat.numeroSoci));
      }
      navigate(ROUTES.COMPTABILITAT);
    } catch {
      setErrorEliminar("No s'ha pogut eliminar. Torna-ho a provar.");
    }
  };

  const camp = (nom) => ({
    id: nom,
    className: 'form__input',
    value: valors[nom],
    onChange: (e) => canvia(nom, e.target.value),
    'aria-invalid': errors[nom] ? true : undefined,
    'aria-describedby': errors[nom] ? `${nom}-error` : undefined,
  });
  const errorCamp = (nom) => errors[nom] && <p id={`${nom}-error`} className="form__error">{errors[nom]}</p>;
  const anarACamp = (nom) => document.getElementById(nom)?.focus();
  const errorsBarra = CAMPS_AMB_ERROR.filter((nom) => errors[nom]).map((nom) => ({
    pestanya: nom, etiquetaPestanya: ETIQUETES[nom], missatge: errors[nom],
  }));

  const metodes = valors.tipus === TIPUS_MOVIMENT.DESPESA ? METODES_DESPESA : METODES_INGRES;
  const sessioObligatoria = valors.categoria === 'Gestió pel·lícules';
  // Un moviment de "Quotes socis" ja existent no pot canviar de tipus ni de
  // categoria: si està malament, cal esborrar-lo i crear-ne un de nou des de
  // "Registrar pagament" (l'únic flux que en sap el numeroSoci).
  const tipusICategoriaBloquejats = editant && valors.categoria === CATEGORIA_QUOTA_SOCI;
  const sessioPreseleccionada = Boolean(sessioOrigen);
  const classeBloquejat = (bloquejat) => (bloquejat ? 'form__input form__input--bloquejat' : 'form__input');

  return (
    <PaginaAdmin
      as="form"
      amplada="fitxa"
      ambBarra
      className="moviment-form"
      onSubmit={handleSubmit}
      noValidate
      titol={editant ? 'Moviment' : 'Nou moviment'}
      tornar={sessioPreseleccionada ? { to: rutaSessio(sessioOrigen), etiqueta: 'Sessió' } : TORNAR_COMPTABILITAT}
    >
      <div className="form__field">
        <label className="form__label" htmlFor="data">Data</label>
        <input {...camp('data')} ref={dataRef} type="date" />
        {errorCamp('data')}
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="concepte">Concepte</label>
        <input {...camp('concepte')} aria-required="true" />
        {errorCamp('concepte')}
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="tipus">Tipus</label>
        <select
          id="tipus"
          className={classeBloquejat(tipusICategoriaBloquejats)}
          value={valors.tipus}
          onChange={handleCanviTipus}
          disabled={tipusICategoriaBloquejats}
        >
          <option value={TIPUS_MOVIMENT.INGRES}>Ingrés</option>
          <option value={TIPUS_MOVIMENT.DESPESA}>Despesa</option>
          <option value={TIPUS_MOVIMENT.TRASPAS}>Traspàs</option>
        </select>
      </div>

      {valors.tipus === TIPUS_MOVIMENT.TRASPAS ? (
        <div className="form__field">
          <label className="form__label" htmlFor="direccio">Direcció</label>
          <select {...camp('direccio')}>
            {DIRECCIONS_TRASPAS.map((d) => (
              <option key={d} value={d}>{ETIQUETES_DIRECCIO[d]}</option>
            ))}
          </select>
        </div>
      ) : (
        <>
          <div className="form__field">
            <label className="form__label" htmlFor="categoria">Categoria</label>
            <select {...camp('categoria')} className={classeBloquejat(tipusICategoriaBloquejats)} disabled={tipusICategoriaBloquejats}>
              {categoriesDisponibles(valors.tipus, valors.categoria).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          {tipusICategoriaBloquejats && desat?.tipusQuota && (
            <div className="form__field">
              <label className="form__label" htmlFor="tipusQuota">Tipus de quota</label>
              <input
                id="tipusQuota"
                className={classeBloquejat(true)}
                value={desat.tipusQuota === 'renovacio' ? 'Renovació' : 'Alta nova'}
                readOnly
              />
            </div>
          )}
          <div className="form__field">
            <label className="form__label" htmlFor="metodePagament">Mètode de pagament</label>
            <select {...camp('metodePagament')}>
              {metodes.map((m) => (
                <option key={m} value={m}>{ETIQUETES_METODE[m]}</option>
              ))}
            </select>
          </div>
        </>
      )}

      {valors.tipus !== TIPUS_MOVIMENT.TRASPAS && (
        <div className="form__field">
          <label className="form__label" htmlFor="sessionId">
            {sessioObligatoria ? 'Sessió (pel·lícula)' : 'Sessió (opcional)'}
          </label>
          <select
            {...camp('sessionId')}
            className={classeBloquejat(sessioPreseleccionada)}
            disabled={sessioPreseleccionada}
            aria-required={sessioObligatoria ? true : undefined}
          >
            {!sessioObligatoria && <option value="">Moviment general de l'associació</option>}
            {sessioObligatoria && !valors.sessionId && <option value="">Selecciona una pel·lícula…</option>}
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>{s.titol}</option>
            ))}
          </select>
          {errorCamp('sessionId')}
        </div>
      )}

      <div className="form__field">
        <label className="form__label" htmlFor="preuUnitari">Preu unitari</label>
        <input {...camp('preuUnitari')} ref={preuRef} type="number" step="0.01" />
        {errorCamp('preuUnitari')}
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="quantitat">Quantitat</label>
        <input {...camp('quantitat')} ref={quantitatRef} type="number" />
        {errorCamp('quantitat')}
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="total">Total</label>
        <input
          id="total"
          type="number"
          step="0.01"
          className={classeBloquejat(true)}
          value={calcularTotal(valors.preuUnitari, valors.quantitat)}
          readOnly
        />
      </div>

      <div className="form__field" role="group" aria-labelledby="adjunt-titol">
        <span className="form__label" id="adjunt-titol">Document / factura</span>
        {mostraAdjuntDesat && (
          <p className="moviment-form__adjunt">
            {urlAdjuntActual ? (
              <a className="enllac" href={urlAdjuntActual} target="_blank" rel="noreferrer">{adjuntDesat.nom}</a>
            ) : adjuntDesat.nom}
            <button
              className="moviment-form__adjunt-treure"
              type="button"
              disabled={desant}
              onClick={() => canvia('treureAdjunt', adjuntDesat.path)}
            >
              Treure
            </button>
          </p>
        )}
        {editant && !adjuntDesat && <p className="moviment-form__adjunt">Cap document adjunt.</p>}
        <SelectorFitxer
          id="adjunt"
          etiqueta={mostraAdjuntDesat ? 'Canviar el document' : 'Adjuntar un document'}
          accept={ACCEPT_ADJUNT}
          disabled={desant}
          onChange={handleCanviFitxer}
          nomFitxer={fitxerPendent ? fitxerPendent.name : 'Cap fitxer seleccionat'}
        />
        {errorAdjunt && <p className="form__error" role="alert">{errorAdjunt}</p>}
      </div>

      {editant && (
        <ZonaPerill descripcio="S'eliminarà el moviment i, si en té, el document adjunt. Aquesta acció no es pot desfer.">
          <button className="btn btn--perill" type="button" disabled={desant} onClick={handleEliminar}>Eliminar</button>
          {errorEliminar && <p className="form__error" role="alert">{errorEliminar}</p>}
        </ZonaPerill>
      )}

      <BarraDesar
        estat={estat}
        errors={errorsBarra}
        onAnarA={anarACamp}
        onDescarta={handleDescarta}
        missatgeError={errorDesat}
      />
    </PaginaAdmin>
  );
}

// Si s'edita, carrega el moviment; la fitxa es munta quan hi ha les dades (el hook només llegeix `inicial` en muntar).
function CarregaMoviment({ id }) {
  const [moviment, setMoviment] = useState(null);
  const [errorCarrega, setErrorCarrega] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) return undefined;
    let actiu = true;
    getDoc(doc(db, 'moviments', id)).then((snap) => {
      if (!actiu) return;
      const dadesDoc = snap.data();
      if (!dadesDoc) {
        navigate(ROUTES.COMPTABILITAT, { replace: true });
        return;
      }
      setMoviment(dadesDoc);
    }).catch(() => { if (actiu) setErrorCarrega(ERROR_CARREGA); });
    return () => { actiu = false; };
  }, [id, navigate]);

  if (!id) return <FitxaMoviment moviment={null} />;
  if (errorCarrega) {
    return (
      <PaginaAdmin amplada="fitxa" titol="Moviment" tornar={TORNAR_COMPTABILITAT}>
        <p className="form__error" role="alert">{errorCarrega}</p>
      </PaginaAdmin>
    );
  }
  if (!moviment) return <Carregant />;
  return <FitxaMoviment id={id} moviment={moviment} />;
}

// Clau per moviment: en passar de «Nou moviment» a la fitxa creada, l'estat comença de nou.
export default function MovimentForm() {
  const { id } = useParams();
  return <CarregaMoviment key={id ?? 'nou'} id={id} />;
}
