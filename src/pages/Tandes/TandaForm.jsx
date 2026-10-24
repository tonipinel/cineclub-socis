import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  addDoc, collection, doc, getDoc, getDocs, limit, query, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import { aData, potCrearTanda, validarTanda } from '../../lib/tandes';
import { construirFiles, filtrarFiles } from '../../lib/propostesLlistat';
import useFitxaEditable from '../../lib/useFitxaEditable';
import Carregant from '../../components/Carregant';
import BarraDesar from '../../components/BarraDesar';
import CartaPropostaTanda from '../../components/CartaPropostaTanda';
import PaginaAdmin from '../../components/PaginaAdmin';

const ERROR_OBERTA = "Ja hi ha una tanda oberta. Tanca-la abans d'obrir-ne una altra.";
const ERROR_TANCAR = "No s'ha pogut tancar. Torna-ho a provar.";
const ERROR_CARREGA = "No s'ha pogut carregar la tanda. Torna-ho a provar.";
const TORNAR_TANDES = { to: ROUTES.TANDES, etiqueta: 'Tandes' };
const ETIQUETES = { nom: 'Nom', propostes: 'Propostes aprovades', tanca: 'Tanca' };
const CAMPS = Object.keys(ETIQUETES);

// Les dades internes i les distribuïdores només donen context: si no es poden llegir, les cartes es mostren sense.
const llegirOBuit = (nom) => getDocs(collection(db, nom)).catch(() => ({ docs: [] }));
const textSeleccionades = (n) => (n === 1 ? '1 seleccionada' : `${n} seleccionades`);
const textFora = (n) => (n === 1 ? '1 ja no és aprovada (no es mostra)' : `${n} ja no són aprovades (no es mostren)`);

const aInput = (data) => `${data.toLocaleDateString('sv-SE')}T${data.toLocaleTimeString('sv-SE').slice(0, 5)}`;

const idError = (camp) => `${camp}-error`;
const atributsError = (errors, camp) => (errors[camp]
  ? { 'aria-invalid': true, 'aria-describedby': idError(camp) }
  : {});

function ErrorCamp({ errors, camp }) {
  if (!errors[camp]) return null;
  return <p id={idError(camp)} className="form__error">{errors[camp]}</p>;
}

function FitxaTanda({ id, carregada }) {
  const editant = Boolean(id);
  const { aprovades, context, jaHiHaVots } = carregada;
  const [inicial] = useState(() => (carregada.tanda
    ? { nom: carregada.tanda.nom, propostes: carregada.tanda.propostes, tanca: aInput(aData(carregada.tanda.tanca)) }
    : { nom: '', propostes: [], tanca: '' }));
  // Tancament desat (al minut, com el camp): decideix si la tanda és oberta i si el camp s'ha de validar.
  const [tancaDesada, setTancaDesada] = useState(inicial.tanca);
  const [cerca, setCerca] = useState('');
  const [tancant, setTancant] = useState(false);
  const [errorTancar, setErrorTancar] = useState(null);
  const navigate = useNavigate();

  const onDesar = async ({ valors: v }) => {
    const dataTanca = v.tanca ? new Date(v.tanca) : null;
    const { errors } = validarTanda({ nom: v.nom, propostes: v.propostes, tanca: dataTanca }, new Date());
    if (editant && v.tanca === tancaDesada) delete errors.tanca;
    if (Object.keys(errors).length > 0) return { errors };
    const dades = { nom: v.nom.trim(), propostes: v.propostes, tanca: dataTanca };
    // Només si la tanda resultant quedaria oberta (nova, o tancament futur en reobrir-la).
    if (dataTanca > new Date()) {
      const altres = (await getDocs(collection(db, 'tandes'))).docs
        .filter((d) => d.id !== id)
        .map((d) => ({ id: d.id, ...d.data() }));
      if (!potCrearTanda(altres, new Date())) return { errors: { tanca: ERROR_OBERTA } };
    }
    if (!editant) {
      const nova = await addDoc(collection(db, 'tandes'), { ...dades, creada: serverTimestamp() });
      navigate(ROUTES.TANDES_EDITAR.replace(':id', nova.id), { replace: true });
      return undefined;
    }
    await updateDoc(doc(db, 'tandes', id), dades);
    setTancaDesada(v.tanca);
    return undefined;
  };

  const {
    valors, canvia, hiHaCanvis, estat, desa, descarta, errorDesat, errors, reinicia,
  } = useFitxaEditable({ inicial, onDesar });
  const ambCanvisPendents = hiHaCanvis || estat === 'desant';

  const cartes = useMemo(() => construirFiles({
    propostes: aprovades, ...context, tandes: [], sessions: [],
  }), [aprovades, context]);
  const cartesVisibles = useMemo(() => filtrarFiles(cartes, { cerca }), [cartes, cerca]);

  const alternaProposta = (propostaId) => canvia('propostes', valors.propostes.includes(propostaId)
    ? valors.propostes.filter((p) => p !== propostaId)
    : [...valors.propostes, propostaId]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!tancant) desa();
  };

  // Tancar ara només escriu el tancament; la fitxa es queda amb el nou tancament com a línia base.
  // Amb canvis pendents no es pot (el reinici els perdria).
  const handleTancarAra = async () => {
    if (tancant || ambCanvisPendents) return;
    setTancant(true);
    setErrorTancar(null);
    try {
      const ara = new Date();
      await updateDoc(doc(db, 'tandes', id), { tanca: ara });
      const nova = aInput(ara);
      setTancaDesada(nova);
      reinicia({ ...valors, tanca: nova });
    } catch {
      setErrorTancar(ERROR_TANCAR);
    } finally {
      setTancant(false);
    }
  };

  const anarACamp = (camp) => document.getElementById(camp)?.focus();

  const oberta = editant && new Date(tancaDesada) > new Date();
  // En una tanda tancada és històric; en una d'oberta, només es pot canviar mentre no hi ha cap vot.
  const propostesBloquejades = editant && (!oberta || jaHiHaVots);
  const seleccio = valors.propostes;
  // Propostes de la tanda que ja no són aprovades (programades, etc.): no tenen carta però es conserven en desar.
  const fora = seleccio.filter((propostaId) => !aprovades.some((p) => p.id === propostaId)).length;
  const errorsBarra = CAMPS.filter((camp) => errors[camp]).map((camp) => ({
    pestanya: camp, etiquetaPestanya: ETIQUETES[camp], missatge: errors[camp],
  }));

  return (
    <PaginaAdmin
      as="form"
      amplada="formulari"
      ambBarra
      className="tanda-form"
      titol={editant ? 'Tanda' : 'Nova tanda'}
      tornar={TORNAR_TANDES}
      onSubmit={handleSubmit}
    >
      {/* Mentre es tanca la tanda no es pot editar res: el reinici posterior ho perdria. */}
      <fieldset className="tanda-form__camps" disabled={tancant}>
        <div className="form__field">
          <label className="form__label" htmlFor="nom">Nom</label>
          <input
            id="nom"
            className="form__input"
            value={valors.nom}
            onChange={(e) => canvia('nom', e.target.value)}
            {...atributsError(errors, 'nom')}
          />
          <ErrorCamp errors={errors} camp="nom" />
        </div>

        <fieldset
          id="propostes"
          tabIndex={-1}
          className="tanda-form__propostes"
          {...(errors.propostes ? { 'aria-describedby': idError('propostes') } : {})}
        >
          <legend className="form__label">Propostes aprovades</legend>
          {aprovades.length === 0 && <p>No hi ha cap proposta aprovada.</p>}
          {oberta && jaHiHaVots && (
            <p className="tanda-form__avis">Ja hi ha vots: tanca la tanda i crea&apos;n una de nova per canviar les propostes.</p>
          )}
          {(aprovades.length > 0 || seleccio.length > 0) && (
            <div className="tanda-form__eines">
              {aprovades.length > 0 && (
                <input
                  type="search"
                  className="form__input tanda-form__cerca"
                  placeholder="Títol, proposant o distribuïdora"
                  aria-label="Cerca entre les propostes aprovades"
                  value={cerca}
                  onChange={(e) => setCerca(e.target.value)}
                  // Enter a la cerca no ha d'enviar el formulari (desaria la tanda).
                  onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                />
              )}
              <p className="tanda-form__recompte" aria-live="polite">
                {textSeleccionades(seleccio.length)}
                {fora > 0 && ` · ${textFora(fora)}`}
              </p>
            </div>
          )}
          {aprovades.length > 0 && cartesVisibles.length === 0 && (
            <p className="tanda-form__sense-resultats">Cap proposta aprovada coincideix amb la cerca.</p>
          )}
          {cartesVisibles.length > 0 && (
            <ul className="tanda-form__graella">
              {cartesVisibles.map((c) => (
                <li key={c.id} className="tanda-form__graella-item">
                  <CartaPropostaTanda
                    proposta={c.proposta}
                    distribuidora={c.distribuidora}
                    preu={c.preu}
                    preuPerDefecte={c.preuPerDefecte}
                    seleccionada={seleccio.includes(c.id)}
                    desactivada={propostesBloquejades}
                    onAlterna={() => alternaProposta(c.id)}
                  />
                </li>
              ))}
            </ul>
          )}
          <ErrorCamp errors={errors} camp="propostes" />
        </fieldset>

        <div className="form__field">
          <label className="form__label" htmlFor="tanca">Tanca</label>
          <input
            id="tanca"
            type="datetime-local"
            className="form__input"
            value={valors.tanca}
            onChange={(e) => canvia('tanca', e.target.value)}
            {...atributsError(errors, 'tanca')}
          />
          <ErrorCamp errors={errors} camp="tanca" />
        </div>
      </fieldset>

      {oberta && (
        <div className="tanda-form__tancar">
          <button
            className="btn btn--outline"
            type="button"
            disabled={tancant || ambCanvisPendents}
            aria-describedby={ambCanvisPendents ? 'tancar-nota' : undefined}
            onClick={handleTancarAra}
          >
            Tancar ara
          </button>
          {ambCanvisPendents && (
            <p id="tancar-nota" className="tanda-form__nota">Desa o descarta els canvis abans de tancar la tanda.</p>
          )}
          {errorTancar && <p className="form__error" role="alert">{errorTancar}</p>}
        </div>
      )}

      <BarraDesar
        estat={estat}
        errors={errorsBarra}
        onAnarA={anarACamp}
        onDescarta={descarta}
        missatgeError={errorDesat}
        bloquejada={tancant}
      />
    </PaginaAdmin>
  );
}

// Carrega les propostes aprovades, el context de les cartes i, si s'edita, la tanda i si ja té vots.
// La fitxa es munta quan hi ha les dades: el hook només llegeix `inicial` en muntar.
function CarregaTanda({ id }) {
  const [carregada, setCarregada] = useState(null);
  const [errorCarrega, setErrorCarrega] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let actiu = true;
    const carregaPropostes = getDocs(collection(db, 'propostes')).then((snap) => (
      snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.estat === 'aprovada')
    ));
    const carregaTanda = id ? getDoc(doc(db, 'tandes', id)) : Promise.resolve(null);
    const carregaContext = Promise.all([llegirOBuit('propostesInternes'), llegirOBuit('distribuidores')]);
    Promise.all([carregaPropostes, carregaTanda, carregaContext]).then(async ([aprovades, snap, [internes, distribuidores]]) => {
      const context = {
        internes: new Map(internes.docs.map((d) => [d.id, d.data()])),
        distribuidores: new Map(distribuidores.docs.map((d) => [d.id, { id: d.id, ...d.data() }])),
      };
      let tanda = null;
      let jaHiHaVots = false;
      if (id) {
        tanda = snap.data();
        if (!tanda) {
          if (actiu) navigate(ROUTES.TANDES, { replace: true });
          return;
        }
        // Només una tanda oberta amb vots es bloqueja (canviar-ne les propostes deixaria els socis que ja han
        // vist el rànquing sense poder votar-ne la nova). Si els vots no es poden llegir, es bloqueja per prudència.
        // Es llegeixen també en una de tancada: la fitxa es queda després de reobrir-la i ha de saber si en té.
        const vots = await getDocs(query(collection(db, 'tandes', id, 'vots'), limit(1))).catch(() => null);
        jaHiHaVots = vots === null || vots.docs.length > 0;
      }
      if (actiu) {
        setCarregada({
          aprovades, context, tanda, jaHiHaVots,
        });
      }
    }).catch(() => { if (actiu) setErrorCarrega(ERROR_CARREGA); });
    return () => { actiu = false; };
  }, [id, navigate]);

  if (errorCarrega) {
    return (
      <PaginaAdmin amplada="formulari" titol={id ? 'Tanda' : 'Nova tanda'} tornar={TORNAR_TANDES}>
        <p className="form__error" role="alert">{errorCarrega}</p>
      </PaginaAdmin>
    );
  }
  if (!carregada) return <Carregant />;
  return <FitxaTanda id={id} carregada={carregada} />;
}

// Clau per tanda: en passar de «Nova tanda» a la fitxa creada, l'estat comença de nou.
export default function TandaForm() {
  const { id } = useParams();
  return <CarregaTanda key={id ?? 'nova'} id={id} />;
}
