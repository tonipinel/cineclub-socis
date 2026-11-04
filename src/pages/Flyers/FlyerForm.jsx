import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  addDoc, collection, doc, getDoc, getDocs, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import BarraDesar from '../../components/BarraDesar';
import Carregant from '../../components/Carregant';
import PaginaAdmin from '../../components/PaginaAdmin';
import ErrorCarrega from '../../components/ErrorCarrega';
import useErrorCarrega from '../../lib/useErrorCarrega';
import useFitxaEditable from '../../lib/useFitxaEditable';
import {
  canvisDesdeBase, instantania, sessionsDelRang, validarFlyer,
} from '../../lib/flyers';
import { formatData } from '../../lib/data';
import { URL_WEB } from '../../lib/sessioPublica';
import { VERSIONS } from '../Sessions/camps';

const ERROR_CARREGA = "No s'ha pogut carregar el flyer.";
const ETIQUETES = { nom: 'Nom', desde: 'Des de', fins: 'Fins a' };
const CAMPS = Object.keys(ETIQUETES);
const ETIQUETA_VERSIO = Object.fromEntries(VERSIONS);
const CANVIS = {
  esborrada: 'la sessió s\'ha esborrat',
  despublicada: 'la sessió s\'ha despublicat',
  data: 'ha canviat la data',
  hora: 'ha canviat l\'hora',
  versio: 'ha canviat la versió',
  titol: 'ha canviat el títol',
};

// 32 caràcters: 256 és múltiple de 32, així cada caràcter és igual de probable.
const ALFABET_CLAU = 'abcdefghijkmnpqrstuvwxyz23456789';
const generaClau = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => ALFABET_CLAU[b % 32]).join('');

const ordenaIds = (ids, sessionsPerId) => [...ids].sort((a, b) => {
  const [sa, sb] = [sessionsPerId[a], sessionsPerId[b]];
  if (!sa || !sb) return Number(!sa) - Number(!sb);
  return `${sa.data} ${sa.hora ?? ''}`.localeCompare(`${sb.data} ${sb.hora ?? ''}`);
});

// Firestore no accepta `undefined`: la instantània omet els camps que la sessió no té.
const instantaniaSegura = (sessio) => Object.fromEntries(
  Object.entries(instantania(sessio)).filter(([, valor]) => valor !== undefined),
);

const baseDe = (ids, sessionsPerId) => Object.fromEntries(
  ids.filter((id) => sessionsPerId[id]).map((id) => [id, instantaniaSegura(sessionsPerId[id])]),
);

// L'esborrany i el PDF d'impremta només s'obren amb la clau.
const enllacos = (id, clauPrevia, publicat) => {
  const clau = `clau=${clauPrevia}`;
  const q = (...parts) => {
    const text = parts.filter(Boolean).join('&');
    return text ? `?${text}` : '';
  };
  const arrel = `${URL_WEB}/flyer/${id}/`;
  return {
    pagina: `${arrel}${q(!publicat && clau)}`,
    pdfSimple: `${arrel}flyer.pdf${q(!publicat && clau)}`,
    pdfImpremta: `${arrel}flyer.pdf${q('variant=impremta', clau)}`,
    previsualitzacio: `${arrel}imprimir/${q('variant=simple', !publicat && clau)}`,
  };
};

const idError = (camp) => `${camp}-error`;
const atributsError = (errors, camp) => (errors[camp]
  ? { 'aria-invalid': true, 'aria-describedby': idError(camp) }
  : {});

function ErrorCamp({ errors, camp }) {
  if (!errors[camp]) return null;
  return <p id={idError(camp)} className="form__error">{errors[camp]}</p>;
}

function LlistaSessions({ ids, sessionsPerId, triades, onAlterna }) {
  if (ids.length === 0) return <p className="form__ajuda">No hi ha cap sessió publicada en aquest rang.</p>;
  return (
    <ul className="flyer-form__sessions">
      {ids.map((id) => {
        const s = sessionsPerId[id];
        if (!s) {
          return (
            <li key={id} className="flyer-form__sessio">
              <label className="form__casella">
                <input type="checkbox" checked={triades.has(id)} onChange={() => onAlterna(id)} />
                <span>{`Sessió esborrada (${id})`}</span>
              </label>
            </li>
          );
        }
        const versio = s.publica?.versioTipus;
        return (
          <li key={id} className="flyer-form__sessio">
            <label className="form__casella">
              <input type="checkbox" checked={triades.has(id)} onChange={() => onAlterna(id)} />
              <span className="flyer-form__sessio-data">{formatData(s.data)}</span>
              <span>{s.titol}</span>
              {versio
                ? <span className="badge badge--al-dia">{ETIQUETA_VERSIO[versio] ?? versio}</span>
                : <span className="badge badge--vencut">Falta la versió</span>}
              {s.publicada !== true && <span className="badge badge--pendent">No publicada</span>}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function FitxaFlyer({ id, carregada }) {
  const editant = Boolean(id);
  const { flyer, sessions } = carregada;
  const [sessionsPerId] = useState(() => Object.fromEntries(sessions.map((s) => [s.id, s])));
  const [inicial] = useState(() => ({
    nom: flyer?.nom ?? '',
    desde: flyer?.desde ?? '',
    fins: flyer?.fins ?? '',
    sessionsIds: flyer?.sessionsIds ?? [],
  }));
  // El que hi ha desat a Firestore i no depèn del formulari.
  const [desat, setDesat] = useState(() => ({
    estat: flyer?.estat ?? 'esborrany',
    base: flyer?.base ?? {},
    sessionsIds: inicial.sessionsIds,
    publicat: Boolean(flyer?.publicatEl),
  }));
  const [ocupat, setOcupat] = useState(false);
  const ocupatRef = useRef(false);
  const [errorAccio, setErrorAccio] = useState(null);
  const [copiat, setCopiat] = useState(false);
  const navigate = useNavigate();

  const publicat = desat.estat === 'publicat';

  const escriu = async (v, { publica }) => {
    const ids = ordenaIds(v.sessionsIds, sessionsPerId);
    const dades = {
      nom: v.nom.trim(), desde: v.desde, fins: v.fins, sessionsIds: ids, actualitzatEl: serverTimestamp(),
    };
    let base = desat.base;
    if (publica) {
      base = baseDe(ids, sessionsPerId);
    } else if (publicat) {
      // Retocar un flyer publicat conserva la base de les sessions que ja hi eren.
      base = Object.fromEntries(ids.flatMap((sid) => {
        const previ = desat.base[sid] ?? (sessionsPerId[sid] && instantaniaSegura(sessionsPerId[sid]));
        return previ ? [[sid, previ]] : [];
      }));
    }
    if (publica || publicat) dades.base = base;
    if (publica) {
      dades.estat = 'publicat';
      if (!desat.publicat) dades.publicatEl = serverTimestamp();
    }
    if (!editant) {
      const creada = await addDoc(collection(db, 'flyers'), {
        ...dades, estat: dades.estat ?? 'esborrany', clauPrevia: generaClau(), creatEl: serverTimestamp(),
      });
      navigate(ROUTES.FLYERS_EDITAR.replace(':id', creada.id), { replace: true });
      return;
    }
    await updateDoc(doc(db, 'flyers', id), dades);
    setDesat({
      estat: publica ? 'publicat' : desat.estat,
      base,
      sessionsIds: ids,
      publicat: desat.publicat || publica,
    });
  };

  const onDesar = async ({ valors: v }) => {
    const { errors } = validarFlyer(v, sessions);
    const errorsCamps = Object.fromEntries(Object.entries(errors).filter(([camp]) => CAMPS.includes(camp)));
    // Un flyer publicat ja és públic: no es pot desar amb sessions que no compleixin les regles de publicar.
    if (publicat && errors.sessionsIds) errorsCamps.sessionsIds = errors.sessionsIds;
    if (Object.keys(errorsCamps).length) return { errors: errorsCamps };
    await escriu(v, { publica: false });
    return undefined;
  };

  const {
    valors, canvia, estat, desa, descarta, errorDesat, errors, reinicia,
  } = useFitxaEditable({ inicial, onDesar });

  const { errors: errorsValidacio, avisos } = validarFlyer(valors, sessions);
  const hiHaErrors = Object.keys(errorsValidacio).length > 0;

  const canviaDates = (camp, valor) => {
    canvia(camp, valor);
    const rang = { desde: valors.desde, fins: valors.fins, [camp]: valor };
    if (rang.desde && rang.fins) canvia('sessionsIds', sessionsDelRang(sessions, rang.desde, rang.fins));
  };

  const alterna = (sid) => {
    const triades = new Set(valors.sessionsIds);
    if (!triades.delete(sid)) triades.add(sid);
    canvia('sessionsIds', ordenaIds([...triades], sessionsPerId));
  };

  const candidates = ordenaIds([...new Set([
    ...(valors.desde && valors.fins ? sessionsDelRang(sessions, valors.desde, valors.fins) : []),
    ...valors.sessionsIds,
  ])], sessionsPerId);

  const handleSubmit = (e) => {
    e.preventDefault();
    desa();
  };

  const executa = async (accio) => {
    if (ocupatRef.current) return;
    ocupatRef.current = true;
    setOcupat(true);
    setErrorAccio(null);
    try {
      await accio();
    } catch {
      setErrorAccio("No s'ha pogut completar l'acció. Torna-ho a provar.");
    } finally {
      ocupatRef.current = false;
      setOcupat(false);
    }
  };

  const publica = () => executa(async () => {
    if (hiHaErrors) return;
    await escriu(valors, { publica: true });
    reinicia(valors);
  });

  const marcaRevisat = () => executa(async () => {
    const base = baseDe(desat.sessionsIds, sessionsPerId);
    await updateDoc(doc(db, 'flyers', id), { base, actualitzatEl: serverTimestamp() });
    setDesat((d) => ({ ...d, base }));
  });

  const copia = () => executa(async () => {
    await navigator.clipboard.writeText(enllacos(id, flyer.clauPrevia, true).pagina);
    setCopiat(true);
    setTimeout(() => setCopiat(false), 2500);
  });

  const canvis = publicat ? canvisDesdeBase({ base: desat.base }, sessionsPerId) : [];
  const links = editant ? enllacos(id, flyer.clauPrevia, publicat) : null;

  const anarACamp = (camp) => document.getElementById(camp === 'sessionsIds' ? 'flyer-sessions' : camp)?.focus();
  const errorsBarra = [...CAMPS, 'sessionsIds'].filter((camp) => errors[camp]).map((camp) => ({
    pestanya: camp,
    etiquetaPestanya: ETIQUETES[camp] ?? 'Sessions',
    missatge: [].concat(errors[camp]).join(' '),
  }));

  return (
    <PaginaAdmin
      as="form"
      amplada="formulari"
      ambBarra
      className="flyer-form"
      titol={editant ? 'Flyer' : 'Nou flyer'}
      tornar={{ to: ROUTES.FLYERS, etiqueta: 'Flyers' }}
      onSubmit={handleSubmit}
      noValidate
    >
      {editant && (
        <p className="flyer-form__estat">
          <span className={`badge ${publicat ? 'badge--al-dia' : 'badge--pendent'}`}>{publicat ? 'Publicat' : 'Esborrany'}</span>
        </p>
      )}

      {canvis.length > 0 && (
        <div className="flyer-form__avis-desactualitzat" role="alert">
          <p className="flyer-form__avis-titol">Aquest flyer és desactualitzat</p>
          <ul>
            {canvis.map((c) => <li key={`${c.sessionId}-${c.tipus}`}>{`${c.titol}: ${CANVIS[c.tipus]}`}</li>)}
          </ul>
          <button type="button" className="btn btn--outline" disabled={ocupat} onClick={marcaRevisat}>Marcar com a revisat</button>
        </div>
      )}

      <div className="form__field">
        <label className="form__label" htmlFor="nom">Nom</label>
        <input
          id="nom"
          className="form__input"
          value={valors.nom}
          onChange={(e) => canvia('nom', e.target.value)}
          aria-required="true"
          {...atributsError(errors, 'nom')}
        />
        <ErrorCamp errors={errors} camp="nom" />
      </div>
      <div className="flyer-form__dates">
        <div className="form__field">
          <label className="form__label" htmlFor="desde">Des de</label>
          <input
            id="desde"
            type="date"
            className="form__input"
            value={valors.desde}
            onChange={(e) => canviaDates('desde', e.target.value)}
            aria-required="true"
            {...atributsError(errors, 'desde')}
          />
          <ErrorCamp errors={errors} camp="desde" />
        </div>
        <div className="form__field">
          <label className="form__label" htmlFor="fins">Fins a</label>
          <input
            id="fins"
            type="date"
            className="form__input"
            value={valors.fins}
            onChange={(e) => canviaDates('fins', e.target.value)}
            aria-required="true"
            {...atributsError(errors, 'fins')}
          />
          <ErrorCamp errors={errors} camp="fins" />
        </div>
      </div>

      <section className="flyer-form__seccio" aria-labelledby="flyer-sessions">
        <h2 className="flyer-form__titol-seccio" id="flyer-sessions" tabIndex={-1}>{`Sessions (${valors.sessionsIds.length})`}</h2>
        <p className="form__ajuda">En triar les dates es marquen les sessions publicades del rang. Pots desmarcar-ne.</p>
        <LlistaSessions ids={candidates} sessionsPerId={sessionsPerId} triades={new Set(valors.sessionsIds)} onAlterna={alterna} />
        {errorsValidacio.sessionsIds?.map((m) => <p key={m} className="form__error">{m}</p>)}
        {avisos.map((m) => <p key={m} className="flyer-form__avis">{m}</p>)}
      </section>

      {!publicat && (
        <div className="flyer-form__publicar">
          <button type="button" className="btn btn--negre" disabled={hiHaErrors || ocupat || estat === 'desant'} onClick={publica}>Publicar</button>
          {hiHaErrors && <p className="form__ajuda">Per publicar cal corregir els errors.</p>}
          {CAMPS.filter((camp) => errorsValidacio[camp]).map((camp) => (
            <p key={camp} className="form__error">{errorsValidacio[camp]}</p>
          ))}
        </div>
      )}
      {errorAccio && <p className="form__error" role="alert">{errorAccio}</p>}

      {links && (
        <section className="flyer-form__seccio" aria-labelledby="flyer-enllacos">
          <h2 className="flyer-form__titol-seccio" id="flyer-enllacos">Enllaços</h2>
          <ul className="flyer-form__enllacos">
            <li><a className="enllac" href={links.pagina} target="_blank" rel="noreferrer">{publicat ? 'Pàgina pública' : 'Previsualització de la pàgina'}</a></li>
            <li><a className="enllac" href={links.pdfSimple} target="_blank" rel="noreferrer">PDF simple</a></li>
            <li><a className="enllac" href={links.pdfImpremta} target="_blank" rel="noreferrer">PDF per a impremta</a></li>
            <li><a className="enllac" href={links.previsualitzacio} target="_blank" rel="noreferrer">Previsualització d&apos;impressió</a></li>
          </ul>
          {publicat && (
            <button type="button" className="btn btn--outline" disabled={ocupat} onClick={copia}>
              {copiat ? 'Enllaç copiat' : "Copiar l'enllaç"}
            </button>
          )}
        </section>
      )}

      <BarraDesar
        estat={estat}
        errors={errorsBarra}
        onAnarA={anarACamp}
        onDescarta={descarta}
        missatgeError={errorDesat}
        bloquejada={ocupat}
      />
    </PaginaAdmin>
  );
}

// Carrega les sessions i, si s'edita, el flyer; la fitxa es munta quan hi ha les dades.
function CarregaFlyer({ id }) {
  const [carregada, setCarregada] = useState(null);
  const {
    error: errorCarrega, falla, reintenta, intent,
  } = useErrorCarrega();
  const navigate = useNavigate();

  useEffect(() => {
    let actiu = true;
    const carrega = async () => {
      const snap = await getDocs(collection(db, 'sessions'));
      const sessions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      let flyer = null;
      if (id) {
        flyer = (await getDoc(doc(db, 'flyers', id))).data();
        if (!flyer) {
          if (actiu) navigate(ROUTES.FLYERS, { replace: true });
          return;
        }
      }
      if (actiu) setCarregada({ sessions, flyer });
    };
    carrega().catch((e) => { if (actiu) falla(e); });
    return () => { actiu = false; };
  }, [id, navigate, intent, falla]);

  if (errorCarrega) {
    return (
      <PaginaAdmin amplada="formulari" titol={id ? 'Flyer' : 'Nou flyer'} tornar={{ to: ROUTES.FLYERS, etiqueta: 'Flyers' }}>
        <ErrorCarrega missatge={ERROR_CARREGA} onReintenta={reintenta} />
      </PaginaAdmin>
    );
  }
  if (!carregada) return <Carregant />;
  return <FitxaFlyer id={id} carregada={carregada} />;
}

export default function FlyerForm() {
  const { id } = useParams();
  return <CarregaFlyer key={id ?? 'nou'} id={id} />;
}
