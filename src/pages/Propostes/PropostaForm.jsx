import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ref, uploadBytes } from 'firebase/storage';
import {
  collection, doc, getDoc, getDocs, query, runTransaction, where, writeBatch,
} from 'firebase/firestore';
import { db, storage } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import { etiquetaSoci } from '../../lib/socis';
import { calcularNomPublic } from '../../lib/propostes';
import { missatgeBloqueigEliminarDiversos } from '../../lib/blocatgeEliminar';
import { sessionsPerProposta } from '../../lib/tandes';
import { infoTanda, ordenarTandes } from '../../lib/propostesLlistat';
import {
  EXTENSIONS_IMATGE, construirSessioDesDeProposta, urlStorage, validarImatge,
} from '../../lib/sessioPublica';
import {
  CAMPS_PELLICULA, ETIQUETES_CAMPS, esCampEditat, fitxaAFormulari, prepararDesatFitxa,
} from '../../lib/fitxaProposta';
import { assignarPellicula } from '../../lib/pellicules';
import useFitxaEditable from '../../lib/useFitxaEditable';
import Carregant from '../../components/Carregant';
import { useConfirmacio } from '../../components/ConfirmacioProvider';
import Pestanyes from '../../components/Pestanyes';
import BarraDesar from '../../components/BarraDesar';
import PaginaAdmin from '../../components/PaginaAdmin';
import {
  CAMPS_INTERNS, ETIQUETA_PESTANYA, PESTANYA_DEL_CAMP, PESTANYES,
} from './campsProposta';
import CapcaleraProposta from './CapcaleraProposta';
import ResumProposta from './pestanyes/ResumProposta';
import GestioProposta from './pestanyes/GestioProposta';
import PelliculaProposta from './pestanyes/PelliculaProposta';
import MitjansProposta from './pestanyes/MitjansProposta';

const ERROR_NO_APROVADA = 'Aquesta proposta ja no és aprovada.';
const ERROR_SOCI = 'Selecciona un soci vàlid de la llista.';
const ERROR_TRIAR = "No s'ha pogut carregar la fitxa de la pel·lícula. Torna-ho a provar.";
const ERROR_PUJADA = "No s'ha pogut pujar la imatge. Torna-ho a provar.";
const ERROR_ACTUALITZAR = "No s'ha pogut actualitzar la fitxa des de TMDB. Torna-ho a provar.";
const ERROR_ELIMINAR = "No s'ha pogut eliminar. Torna-ho a provar.";
// «Programada» només la posa «Programar sessió» (amb la sessió); una proposta amb sessió no en pot sortir.
const ERROR_A_PROGRAMADA = 'Només «Programar sessió» pot passar la proposta a «Programada».';
const ERROR_TE_SESSIO = "Aquesta proposta té una sessió associada: l'estat ha de ser «Programada».";
const ERROR_PROGRAMADA_MENTRESTANT = "No es pot eliminar: mentrestant s'ha programat una sessió amb aquesta proposta.";
// Per què la barra no deixa desar (els mateixos textos que la nota de «Programar sessió»).
const MOTIU_TMDB = "S'està actualitzant la fitxa des de TMDB…";
const MOTIU_PUJADA = "S'està pujant el cartell…";

const docsDe = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const perOrdreDePestanya = (a, b) => PESTANYES.indexOf(a) - PESTANYES.indexOf(b);
const pestanyaDe = (camp) => PESTANYA_DEL_CAMP[camp] ?? 'gestio';

const internaAFormulari = (interna) => ({
  preu: String(interna?.preu ?? ''),
  condicions: interna?.condicions ?? '',
  distribuidoraId: interna?.distribuidoraId ?? '',
});

// Sessions creades des de la proposta (consulta nova al servidor; el filtre local només reforça el `where`).
async function sessionsDeLaProposta(id) {
  const snap = await getDocs(query(collection(db, 'sessions'), where('propostaId', '==', id)));
  return docsDe(snap).filter((s) => s.propostaId === id);
}

const sociDeLaProposta = (socis, proposta) => socis.find((s) => Number(s.numeroSoci) === Number(proposta.numeroSoci));

// Errors de validació agrupats per pestanya (en ordre), amb els ids dels camps afectats (id = nom del camp).
function errorsPerPestanya(errors) {
  const grups = {};
  for (const [camp, missatge] of Object.entries(errors)) {
    const pestanya = pestanyaDe(camp);
    grups[pestanya] ??= { missatges: [], ids: [] };
    if (!grups[pestanya].missatges.includes(missatge)) grups[pestanya].missatges.push(missatge);
    grups[pestanya].ids.push(camp);
  }
  return Object.keys(grups).sort(perOrdreDePestanya).map((pestanya) => ({
    pestanya,
    etiquetaPestanya: ETIQUETA_PESTANYA[pestanya],
    missatge: grups[pestanya].missatges.join(' '),
    ids: grups[pestanya].ids,
  }));
}

function FitxaProposta({
  id, carregada, tandes, sessio,
}) {
  const { socis, distribuidores } = carregada;
  const internaDisponible = carregada.interna !== null;
  const [proposta, setProposta] = useState(carregada.proposta);
  const [interna, setInterna] = useState(internaDisponible ? internaAFormulari(carregada.interna) : null);
  const [inicial] = useState(() => {
    const soci = sociDeLaProposta(socis, carregada.proposta);
    return {
      ...fitxaAFormulari(carregada.proposta),
      estat: carregada.proposta.estat ?? 'pendent',
      soci: soci ? etiquetaSoci(soci) : '',
      comentari: carregada.proposta.comentari ?? '',
      ...internaAFormulari(carregada.interna),
    };
  });
  // Línia base dels valors desats (la del hook no és accessible): `prepararDesatFitxa` hi compara els camps de la pel·lícula.
  const base = useRef(inicial);
  const idsAEnfocar = useRef(null);
  const [programant, setProgramant] = useState(false);
  const [errorProgramar, setErrorProgramar] = useState(null);
  const [errorEliminar, setErrorEliminar] = useState(null);
  const [eliminant, setEliminant] = useState(false);
  const eliminantRef = useRef(false);
  // `actualitzant`: la crida a TMDB és en curs (la fitxa queda bloquejada). `actualitzantRef`: des que comença
  // (inclòs el diàleg de confirmació) fins que acaba; bloqueja «Programar», desar i descartar.
  const [actualitzant, setActualitzant] = useState(false);
  const actualitzantRef = useRef(false);
  const [errorTmdb, setErrorTmdb] = useState(null);
  // `pujant`: el cartell s'està pujant a Storage (la URL arriba després i entra com a canvi pendent). Bloqueja, com
  // `actualitzant`, desar, descartar, canviar de pestanya, TMDB i programar fins que acaba.
  const [pujant, setPujant] = useState(false);
  const pujantRef = useRef(false);
  const [errorPujada, setErrorPujada] = useState(null);
  // Canviar la clau torna el cercador a la pel·lícula desada (després d'un error en triar-ne una).
  const [clauCercador, setClauCercador] = useState(0);
  // Bloqueja un segon «Programar» mentre el diàleg de confirmació és obert.
  const programantRef = useRef(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { confirma, avisa } = useConfirmacio();

  const demanada = searchParams.get('pestanya');
  const pestanya = PESTANYES.includes(demanada) ? demanada : 'resum';
  const canviarPestanya = (nova) => setSearchParams({ pestanya: nova }, { replace: true });

  // Només escriu els camps canviats: a `propostes` els de la pel·lícula (via `prepararDesatFitxa`) i els de gestió;
  // a `propostesInternes`, el document sencer i només si n'ha canviat algun camp.
  const onDesar = async ({ valors: v, canviats }) => {
    const { errors: errorsFitxa, payload } = prepararDesatFitxa({ form: v, base: base.current, proposta });
    const errors = { ...errorsFitxa };
    const aProposta = { ...payload };
    // Sessions rellegides a cada canvi d'estat: una altra pestanya pot haver programat la proposta mentrestant.
    if (canviats.includes('estat')) {
      aProposta.estat = v.estat;
      const teSessio = (await sessionsDeLaProposta(id)).length > 0;
      if (v.estat === 'programada' && !teSessio) errors.estat = ERROR_A_PROGRAMADA;
      if (v.estat !== 'programada' && teSessio) errors.estat = ERROR_TE_SESSIO;
    }
    if (v.comentari.trim() !== base.current.comentari.trim()) aProposta.comentari = v.comentari.trim();
    if (canviats.includes('soci')) {
      const soci = socis.find((s) => etiquetaSoci(s) === v.soci);
      if (soci) {
        aProposta.numeroSoci = soci.numeroSoci;
        aProposta.nomProposant = calcularNomPublic(soci);
      } else {
        errors.soci = ERROR_SOCI;
      }
    }
    if (Object.keys(errors).length > 0) {
      const [primer] = errorsPerPestanya(errors);
      idsAEnfocar.current = { pestanya: primer.pestanya, ids: primer.ids };
      canviarPestanya(primer.pestanya);
      return { errors };
    }
    const aInterna = internaDisponible && CAMPS_INTERNS.some((camp) => canviats.includes(camp))
      ? { preu: v.preu === '' ? null : Number(v.preu), condicions: v.condicions.trim(), distribuidoraId: v.distribuidoraId }
      : null;
    const hiHaProposta = Object.keys(aProposta).length > 0;
    // Tot o res: les dues escriptures van en un sol lot, i l'estat local només canvia si el commit ha anat bé.
    if (hiHaProposta || aInterna) {
      const lot = writeBatch(db);
      if (hiHaProposta) lot.update(doc(db, 'propostes', id), aProposta);
      if (aInterna) lot.set(doc(db, 'propostesInternes', id), aInterna);
      await lot.commit();
    }
    if (hiHaProposta) setProposta((p) => ({ ...p, ...aProposta }));
    if (aInterna) setInterna(internaAFormulari(aInterna));
    base.current = v;
    return undefined;
  };

  const {
    valors, canvia, canviats, hiHaCanvis, estat, desa, descarta, errorDesat, errors, reinicia,
  } = useFitxaEditable({ inicial, onDesar });
  const ambCanvisPendents = hiHaCanvis || estat === 'desant';
  // Si la sessió arriba tard i fixa l'estat a «Programada», un canvi d'estat pendent ja no es podria desar: es desfà.
  const estatFix = proposta.estat === 'programada' && Boolean(sessio);
  useEffect(() => {
    if (estatFix && valors.estat !== 'programada') canvia('estat', 'programada');
  }, [estatFix, valors.estat]); // eslint-disable-line react-hooks/exhaustive-deps
  // Valors de l'últim render, per als gestors que continuen després d'un `await`.
  const propostaRef = useRef(proposta);
  const ambCanvisPendentsRef = useRef(ambCanvisPendents);
  useEffect(() => {
    propostaRef.current = proposta;
    ambCanvisPendentsRef.current = ambCanvisPendents;
  });

  // TMDB recarrega la fitxa: no es pot amb canvis pendents (el reinici els perdria) ni mentre es programa.
  const potCarregarDeTmdb = () => !actualitzantRef.current && !programantRef.current && !pujantRef.current && !ambCanvisPendentsRef.current;

  // Carrega la fitxa de TMDB al servidor (que ja respecta `campsEditats`), hi fusiona els valors efectius que torna
  // i reinicia el formulari des de la proposta nova. Cal haver agafat `actualitzantRef` abans.
  const carregaDeTmdb = async (crida, missatgeError, enFallar) => {
    setActualitzant(true);
    setErrorTmdb(null);
    try {
      const fitxa = await crida();
      const nouFormulari = { ...base.current, ...fitxaAFormulari({ ...propostaRef.current, ...fitxa }) };
      setProposta((p) => ({ ...p, ...fitxa }));
      base.current = nouFormulari;
      reinicia(nouFormulari);
    } catch {
      setErrorTmdb(missatgeError);
      enFallar?.();
    } finally {
      setActualitzant(false);
    }
  };

  const handleTriarPellicula = async (pellicula) => {
    if (!potCarregarDeTmdb()) return;
    actualitzantRef.current = true;
    try {
      await carregaDeTmdb(() => assignarPellicula(id, pellicula.tmdbId), ERROR_TRIAR, () => setClauCercador((c) => c + 1));
    } finally {
      actualitzantRef.current = false;
    }
  };

  const handleActualitzar = async () => {
    if (!potCarregarDeTmdb()) return;
    actualitzantRef.current = true;
    try {
      await confirmaIActualitza();
    } finally {
      actualitzantRef.current = false;
    }
  };

  const confirmaIActualitza = async () => {
    const editats = CAMPS_PELLICULA.filter((camp) => esCampEditat(proposta, camp));
    const resposta = await confirma(editats.length > 0
      ? {
        titol: 'Actualitzar des de TMDB',
        missatge: `Es mantindran els camps que has editat: ${editats.map((camp) => ETIQUETES_CAMPS[camp]).join(', ')}.`,
        etiquetaAcceptar: 'Actualitza (conserva els meus canvis)',
        accioSecundaria: { etiqueta: 'Actualitza i sobreescriu-ho tot', perill: true },
      }
      : {
        titol: 'Actualitzar des de TMDB',
        missatge: "No hi ha cap camp editat a mà: s'actualitzarà tota la fitxa.",
        etiquetaAcceptar: 'Actualitza',
      });
    // Si mentrestant hi ha hagut canvis (no hauria de passar amb el diàleg modal), el reinici els perdria.
    if (ambCanvisPendentsRef.current) return;
    if (resposta === true) await carregaDeTmdb(() => assignarPellicula(id, proposta.tmdbId), ERROR_ACTUALITZAR);
    else if (resposta === 'secundaria') {
      await carregaDeTmdb(() => assignarPellicula(id, proposta.tmdbId, { sobreescriure: true }), ERROR_ACTUALITZAR);
    }
  };

  // Després d'un error de validació, focus al primer camp invàlid quan la seva pestanya ja és visible (un sol intent).
  useEffect(() => {
    if (!idsAEnfocar.current || idsAEnfocar.current.pestanya !== pestanya) return;
    const elements = idsAEnfocar.current.ids.map((idCamp) => document.getElementById(idCamp)).filter(Boolean);
    idsAEnfocar.current = null;
    elements.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    elements[0]?.focus();
  });

  // Crea la sessió (sense publicar ni data) i passa la proposta a «programada» dins d'una transacció amb id determinista,
  // perquè dos admins alhora no puguin crear-ne dues. Si la proposta ja té sessió, només hi navega.
  const handleProgramar = async () => {
    if (programant || programantRef.current || actualitzantRef.current || pujantRef.current || hiHaCanvis || estat === 'desant') return;
    programantRef.current = true;
    const confirmat = await confirma({
      missatge: `Vols programar una sessió amb "${proposta.titol}"? Es crearà una sessió sense publicar i la proposta passarà a «Programada».`,
      etiquetaAcceptar: 'Programa',
    });
    if (!confirmat) {
      programantRef.current = false;
      return;
    }
    setErrorProgramar(null);
    setProgramant(true);
    try {
      const trobades = await getDocs(query(collection(db, 'sessions'), where('propostaId', '==', id)));
      const sessioId = trobades.docs[0]?.id ?? `proposta-${id}`;
      const propostaRef = doc(db, 'propostes', id);
      const sessioRef = doc(db, 'sessions', sessioId);
      const { sessio: novaSessio } = construirSessioDesDeProposta(proposta, { propostaId: id, avui: new Date() });
      const existia = await runTransaction(db, async (tx) => {
        const estatTx = (await tx.get(propostaRef)).data()?.estat;
        const existeix = (await tx.get(sessioRef)).exists();
        if (!existeix && estatTx !== 'aprovada') throw new Error(ERROR_NO_APROVADA);
        if (!existeix) tx.set(sessioRef, novaSessio);
        if (estatTx === 'aprovada') tx.update(propostaRef, { estat: 'programada' });
        return existeix;
      });
      if (existia) await avisa({ missatge: 'Aquesta proposta ja té una sessió: s\'obre per editar-la.' });
      navigate(ROUTES.SESSIONS_EDITAR.replace(':id', sessioId));
    } catch (e) {
      setErrorProgramar(e.message === ERROR_NO_APROVADA ? ERROR_NO_APROVADA : "No s'ha pogut programar la sessió. Torna-ho a provar.");
      setProgramant(false);
      programantRef.current = false;
    }
  };

  // Comprova (de nou a cada intent) que cap tanda ni sessió no usa la proposta i, després de confirmar, esborra la
  // proposta i les dades internes en una transacció que rellegeix la proposta: si mentrestant ha passat a
  // «Programada» (una altra pestanya l'ha programat), no esborra res. Una de programada ja abans (encallada, sense
  // sessió) sí que es pot esborrar. Els vots són dins les tandes (si n'hi ha, la tanda ja bloqueja);
  // `propostesActivitat` és un registre d'auditoria immutable i es conserva; Storage no s'esborra mai.
  const handleEliminar = async () => {
    if (eliminantRef.current) return;
    eliminantRef.current = true;
    setErrorEliminar(null);
    try {
      const [snapTandes, sessions] = await Promise.all([
        getDocs(query(collection(db, 'tandes'), where('propostes', 'array-contains', id))),
        sessionsDeLaProposta(id),
      ]);
      const tandesQueLaUsen = docsDe(snapTandes).filter((t) => Array.isArray(t.propostes) && t.propostes.includes(id));
      const bloqueig = missatgeBloqueigEliminarDiversos([
        { nombre: tandesQueLaUsen.length, singular: 'tanda', plural: 'tandes', titols: tandesQueLaUsen.map((t) => t.nom) },
        { nombre: sessions.length, singular: 'sessió', plural: 'sessions', titols: sessions.map((t) => t.titol) },
      ]);
      if (bloqueig) {
        setErrorEliminar(bloqueig);
        return;
      }
      const confirmat = await confirma({
        missatge: `Segur que vols eliminar definitivament la proposta "${proposta.titol}"? Aquesta acció no es pot desfer.`,
        perill: true,
        etiquetaAcceptar: 'Elimina',
      });
      if (!confirmat) return;
      setEliminant(true);
      const refProposta = doc(db, 'propostes', id);
      const estatAbans = proposta.estat;
      await runTransaction(db, async (tx) => {
        const estatTx = (await tx.get(refProposta)).data()?.estat;
        if (estatTx === 'programada' && estatAbans !== 'programada') throw new Error(ERROR_PROGRAMADA_MENTRESTANT);
        tx.delete(refProposta);
        tx.delete(doc(db, 'propostesInternes', id));
      });
      navigate(ROUTES.PROPOSTES_PENDENTS);
    } catch (e) {
      setErrorEliminar(e.message === ERROR_PROGRAMADA_MENTRESTANT ? ERROR_PROGRAMADA_MENTRESTANT : ERROR_ELIMINAR);
    } finally {
      eliminantRef.current = false;
      setEliminant(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!actualitzantRef.current && !pujantRef.current) desa();
  };

  const handleDescarta = () => {
    if (!actualitzantRef.current && !pujantRef.current) descarta();
  };

  // Puja el cartell (una sola pujada alhora) i en posa la URL com a canvi pendent. Mai s'esborra cap fitxer de Storage.
  const handlePujarCartell = async (fitxer) => {
    if (pujantRef.current || actualitzantRef.current) return;
    const errorFitxer = validarImatge(fitxer);
    setErrorPujada(errorFitxer);
    if (errorFitxer) return;
    const cami = `web/propostes/${id}/cartell-${Date.now()}.${EXTENSIONS_IMATGE[fitxer.type]}`;
    pujantRef.current = true;
    setPujant(true);
    try {
      await uploadBytes(ref(storage, cami), fitxer, { contentType: fitxer.type });
      canvia('imatgeUrl', urlStorage(storage.app.options.storageBucket, cami));
    } catch {
      setErrorPujada(ERROR_PUJADA);
    } finally {
      pujantRef.current = false;
      setPujant(false);
    }
  };

  const ambBarra = pestanya !== 'resum';
  const pestanyesCanviades = [...new Set(canviats.map(pestanyaDe))].sort(perOrdreDePestanya);
  const sociDesat = sociDeLaProposta(socis, proposta);

  return (
    <PaginaAdmin
      as="form"
      amplada="fitxa"
      ambBarra={ambBarra}
      className="fitxa-proposta"
      onSubmit={handleSubmit}
    >
      <div className="fitxa-proposta__contingut">
        <CapcaleraProposta
          proposta={proposta}
          tandes={tandes}
          sessio={sessio}
          onProgramar={handleProgramar}
          programant={programant}
          // Programar treballa amb les dades desades: amb canvis pendents (o desant) es perdrien en navegar.
          ambCanvisPendents={ambCanvisPendents}
          actualitzant={actualitzant}
          pujant={pujant}
          errorProgramar={errorProgramar}
        />
        <Pestanyes
          pestanyes={PESTANYES.map((p) => ({ id: p, etiqueta: ETIQUETA_PESTANYA[p], avis: pestanyesCanviades.includes(p) }))}
          actual={pestanya}
          onCanvi={canviarPestanya}
          etiqueta="Seccions de la proposta"
          desactivades={actualitzant || pujant}
        />
      </div>
      <div
        role="tabpanel"
        id={`panell-${pestanya}`}
        aria-labelledby={`pestanya-${pestanya}`}
        aria-busy={actualitzant}
        className="fitxa-proposta__panell"
      >
        {/* Mentre es recarrega des de TMDB, cap camp ni botó de la pestanya no es pot fer servir. */}
        <fieldset className="fitxa-proposta__bloqueig" disabled={actualitzant}>
          {pestanya === 'resum' && (
            <ResumProposta
              proposta={proposta}
              proposant={sociDesat ? etiquetaSoci(sociDesat) : ''}
              tandes={tandes}
              sessio={sessio}
              interna={interna}
              distribuidores={distribuidores}
            />
          )}
          {pestanya === 'gestio' && (
            <GestioProposta
              valors={valors}
              canvia={canvia}
              errors={errors}
              socis={socis}
              distribuidores={distribuidores}
              internaDisponible={internaDisponible}
              estatDesat={proposta.estat}
              teSessio={Boolean(sessio)}
              onEliminar={handleEliminar}
              eliminacioDesactivada={eliminant || estat === 'desant' || pujant}
              errorEliminar={errorEliminar}
            />
          )}
          {pestanya === 'pellicula' && (
            <PelliculaProposta
              proposta={proposta}
              valors={valors}
              canvia={canvia}
              errors={errors}
              ambCanvisPendents={ambCanvisPendents}
              actualitzant={actualitzant}
              pujant={pujant}
              onTriar={handleTriarPellicula}
              onActualitzar={handleActualitzar}
              errorTmdb={errorTmdb}
              clauCercador={clauCercador}
            />
          )}
          {pestanya === 'mitjans' && (
            <MitjansProposta
              proposta={proposta}
              valors={valors}
              canvia={canvia}
              errors={errors}
              pujant={pujant}
              errorPujada={errorPujada}
              onPujar={handlePujarCartell}
            />
          )}
        </fieldset>
      </div>
      {ambBarra && (
        <BarraDesar
          estat={estat}
          errors={errorsPerPestanya(errors)}
          onAnarA={canviarPestanya}
          onDescarta={handleDescarta}
          bloquejada={actualitzant || pujant}
          motiuBloqueig={(actualitzant && MOTIU_TMDB) || (pujant && MOTIU_PUJADA) || undefined}
          pestanyesAfectades={pestanyesCanviades.map((p) => ETIQUETA_PESTANYA[p])}
          missatgeError={errorDesat}
        />
      )}
    </PaginaAdmin>
  );
}

// Carrega la proposta (obligatòria) i, amb fallada silenciosa, els socis, les dades internes, les distribuïdores,
// les tandes i les sessions. La fitxa es munta quan hi ha les dades del formulari: el hook només llegeix `inicial` en muntar.
function CarregaProposta({ id }) {
  const [carregada, setCarregada] = useState(null);
  const [tandes, setTandes] = useState([]);
  // `undefined` fins que s'han llegit les sessions; després, la sessió o `null` (també si la lectura falla).
  const [sessio, setSessio] = useState(undefined);

  useEffect(() => {
    let actiu = true;
    const silenciosa = (promesa, perDefecte) => promesa.catch(() => perDefecte);
    Promise.all([
      getDoc(doc(db, 'propostes', id)).then((snap) => snap.data()),
      silenciosa(getDocs(collection(db, 'socis')).then(docsDe), []),
      // `null`: no s'han pogut llegir (no és el mateix que no tenir-ne, `{}`).
      silenciosa(getDoc(doc(db, 'propostesInternes', id)).then((snap) => snap.data() ?? {}), null),
      silenciosa(getDocs(collection(db, 'distribuidores'))
        .then((snap) => docsDe(snap).sort((a, b) => String(a.nom ?? '').localeCompare(String(b.nom ?? ''), 'ca'))), []),
    ]).then(([proposta, socis, interna, distribuidores]) => {
      if (actiu) setCarregada(proposta ? { proposta, socis, interna, distribuidores } : { error: true });
    }).catch(() => {
      if (actiu) setCarregada({ error: true });
    });
    return () => { actiu = false; };
  }, [id]);

  // Només lectura i opcional: si falla, el Resum mostra «—» i la capçalera no en mostra res.
  useEffect(() => {
    let actiu = true;
    getDocs(collection(db, 'tandes')).then((snap) => {
      if (!actiu) return;
      setTandes(docsDe(snap)
        .filter((t) => Array.isArray(t.propostes) && t.propostes.includes(id))
        .map((t) => infoTanda(t))
        .sort(ordenarTandes));
    }).catch(() => {});
    getDocs(query(collection(db, 'sessions'), where('propostaId', '==', id))).then((snap) => {
      if (!actiu) return;
      const sessions = docsDe(snap);
      const triada = sessionsPerProposta(sessions)[id];
      setSessio(triada ? { id: triada, titol: sessions.find((s) => s.id === triada)?.titol ?? '' } : null);
    }).catch(() => {
      if (actiu) setSessio(null);
    });
    return () => { actiu = false; };
  }, [id]);

  if (!carregada) return <Carregant />;
  if (carregada.error) {
    return (
      <PaginaAdmin amplada="fitxa" titol="Proposta" tornar={{ to: ROUTES.PROPOSTES_PENDENTS, etiqueta: 'Propostes' }}>
        <p className="form__error" role="alert">No s&apos;ha pogut carregar la proposta.</p>
      </PaginaAdmin>
    );
  }
  return <FitxaProposta id={id} carregada={carregada} tandes={tandes} sessio={sessio} />;
}

// Clau per proposta: en canviar de proposta, l'estat del formulari comença de nou.
export default function PropostaForm() {
  const { id } = useParams();
  return <CarregaProposta key={id} id={id} />;
}
