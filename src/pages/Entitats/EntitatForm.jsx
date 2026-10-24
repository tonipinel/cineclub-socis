import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import BarraDesar from '../../components/BarraDesar';
import CampLogo from '../../components/CampLogo';
import Carregant from '../../components/Carregant';
import { useConfirmacio } from '../../components/ConfirmacioProvider';
import PaginaAdmin from '../../components/PaginaAdmin';
import ZonaPerill from '../../components/ZonaPerill';
import useFitxaEditable from '../../lib/useFitxaEditable';
import { missatgeBloqueigEliminar } from '../../lib/blocatgeEliminar';
import { camiLogoEntitat, sessionsQueUsen, validarEntitat } from '../../lib/entitats';

const ERROR_CARREGA = "No s'ha pogut carregar l'entitat. Torna-ho a provar.";
const ETIQUETES = { nom: 'Nom', url: 'Pàgina web pública' };
const CAMPS = Object.keys(ETIQUETES);

const idError = (camp) => `${camp}-error`;
// `ajuda`: id del text d'ajuda del camp, que es manté vinculat també amb error.
const atributsError = (errors, camp, ajuda) => {
  const descrits = [ajuda, errors[camp] && idError(camp)].filter(Boolean).join(' ');
  return {
    ...(errors[camp] ? { 'aria-invalid': true } : {}),
    ...(descrits ? { 'aria-describedby': descrits } : {}),
  };
};

function ErrorCamp({ errors, camp }) {
  if (!errors[camp]) return null;
  return <p id={idError(camp)} className="form__error">{errors[camp]}</p>;
}

function FitxaEntitat({ id, carregada }) {
  const editant = Boolean(id);
  const { altres, entitat } = carregada;
  const [inicial] = useState(() => ({
    nom: entitat?.nom ?? '', url: entitat?.url ?? '', logo: entitat?.logo ?? '',
  }));
  // El que hi ha escrit a Firestore (URL retallada): en editar només s'escriuen els camps que en difereixen.
  const desat = useRef({ url: inicial.url, logo: inicial.logo });
  const [pujant, setPujant] = useState(false);
  const pujantRef = useRef(false);
  const [errorEliminar, setErrorEliminar] = useState(null);
  const navigate = useNavigate();
  const { confirma } = useConfirmacio();

  const onDesar = async ({ valors: v }) => {
    const resultat = validarEntitat({ nom: v.nom, url: v.url }, altres, id);
    if (!resultat.valid) return { errors: resultat.errors };
    const nova = { url: v.url.trim(), logo: v.logo };
    if (!editant) {
      const dades = { nom: v.nom.trim(), creatEl: serverTimestamp() };
      if (nova.url) dades.url = nova.url;
      if (nova.logo) dades.logo = nova.logo;
      const creada = await addDoc(collection(db, 'entitats'), dades);
      navigate(ROUTES.ENTITATS_EDITAR.replace(':id', creada.id), { replace: true });
      return undefined;
    }
    const canvis = Object.fromEntries(Object.entries(nova).filter(([camp, valor]) => valor !== desat.current[camp]));
    if (Object.keys(canvis).length) await updateDoc(doc(db, 'entitats', id), canvis);
    desat.current = nova;
    return undefined;
  };

  const {
    valors, canvia, estat, desa, descarta, errorDesat, errors,
  } = useFitxaEditable({ inicial, onDesar });

  const onPujant = (valor) => {
    pujantRef.current = valor;
    setPujant(valor);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!pujantRef.current) desa();
  };

  const handleEliminar = async () => {
    setErrorEliminar(null);
    try {
      const snap = await getDocs(collection(db, 'sessions'));
      const sessions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const usen = sessionsQueUsen(valors.nom, sessions);
      if (usen.length) {
        setErrorEliminar(missatgeBloqueigEliminar(usen.length, 'sessió', 'sessions', usen.map((s) => s.titol)));
        return;
      }
      if (!(await confirma({
        missatge: 'Segur que vols eliminar aquesta entitat? Aquesta acció no es pot desfer.',
        perill: true,
        etiquetaAcceptar: 'Elimina',
      }))) return;
      await deleteDoc(doc(db, 'entitats', id));
      navigate(ROUTES.ENTITATS);
    } catch {
      setErrorEliminar("No s'ha pogut eliminar. Torna-ho a provar.");
    }
  };

  const anarACamp = (camp) => document.getElementById(camp)?.focus();
  const errorsBarra = CAMPS.filter((camp) => errors[camp]).map((camp) => ({
    pestanya: camp, etiquetaPestanya: ETIQUETES[camp], missatge: errors[camp],
  }));

  return (
    <PaginaAdmin
      as="form"
      amplada="formulari"
      ambBarra
      className="entitat-form"
      titol={editant ? 'Entitat' : 'Nova entitat'}
      tornar={{ to: ROUTES.ENTITATS, etiqueta: 'Entitats' }}
      onSubmit={handleSubmit}
      noValidate
    >
      <div className="form__field">
        <label className="form__label" htmlFor="nom">Nom</label>
        <input
          id="nom"
          className={`form__input${editant ? ' form__input--bloquejat' : ''}`}
          value={valors.nom}
          onChange={(e) => canvia('nom', e.target.value)}
          readOnly={editant}
          aria-required="true"
          {...atributsError(errors, 'nom', editant && 'nom-ajuda')}
        />
        {editant && <p id="nom-ajuda" className="form__ajuda">El nom no es pot canviar: les sessions el fan servir per triar-la</p>}
        <ErrorCamp errors={errors} camp="nom" />
      </div>
      <div className="form__field">
        <label className="form__label" htmlFor="url">Pàgina web pública</label>
        <input
          id="url"
          className="form__input"
          value={valors.url}
          onChange={(e) => canvia('url', e.target.value)}
          {...atributsError(errors, 'url', 'url-ajuda')}
        />
        <p id="url-ajuda" className="form__ajuda">Adreça on porta el logo al lloc públic.</p>
        <ErrorCamp errors={errors} camp="url" />
      </div>
      <CampLogo
        logo={valors.logo}
        nom={valors.nom}
        cami={camiLogoEntitat}
        pujant={pujant}
        onPujant={onPujant}
        onCanvia={(logo) => canvia('logo', logo)}
      />

      {editant && (
        <ZonaPerill descripcio="No es pot eliminar mentre alguna sessió la faci servir. Aquesta acció no es pot desfer.">
          <button className="btn btn--perill" type="button" disabled={pujant || estat === 'desant'} onClick={handleEliminar}>Eliminar</button>
          {errorEliminar && <p className="form__error" role="alert">{errorEliminar}</p>}
        </ZonaPerill>
      )}

      <BarraDesar
        estat={estat}
        errors={errorsBarra}
        onAnarA={anarACamp}
        onDescarta={descarta}
        missatgeError={errorDesat}
        bloquejada={pujant}
        motiuBloqueig="S'està pujant el logo…"
      />
    </PaginaAdmin>
  );
}

// Carrega les altres entitats (per als duplicats) i, si s'edita, l'entitat.
// La fitxa es munta quan hi ha les dades: el hook només llegeix `inicial` en muntar.
function CarregaEntitat({ id }) {
  const [carregada, setCarregada] = useState(null);
  const [errorCarrega, setErrorCarrega] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let actiu = true;
    const carrega = async () => {
      const snap = await getDocs(collection(db, 'entitats'));
      const altres = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      let entitat = null;
      if (id) {
        entitat = (await getDoc(doc(db, 'entitats', id))).data();
        if (!entitat) {
          if (actiu) navigate(ROUTES.ENTITATS, { replace: true });
          return;
        }
      }
      if (actiu) setCarregada({ altres, entitat });
    };
    carrega().catch(() => { if (actiu) setErrorCarrega(ERROR_CARREGA); });
    return () => { actiu = false; };
  }, [id, navigate]);

  if (errorCarrega) {
    return (
      <PaginaAdmin amplada="formulari" titol={id ? 'Entitat' : 'Nova entitat'} tornar={{ to: ROUTES.ENTITATS, etiqueta: 'Entitats' }}>
        <p className="form__error" role="alert">{errorCarrega}</p>
      </PaginaAdmin>
    );
  }
  if (!carregada) return <Carregant />;
  return <FitxaEntitat id={id} carregada={carregada} />;
}

// Clau per entitat: en passar de «Nova entitat» a la fitxa creada, l'estat comença de nou.
export default function EntitatForm() {
  const { id } = useParams();
  return <CarregaEntitat key={id ?? 'nova'} id={id} />;
}
