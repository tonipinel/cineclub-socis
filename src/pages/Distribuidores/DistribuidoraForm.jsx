import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where,
} from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import BarraDesar from '../../components/BarraDesar';
import CampLogo from '../../components/CampLogo';
import Carregant from '../../components/Carregant';
import { useConfirmacio } from '../../components/ConfirmacioProvider';
import PaginaAdmin from '../../components/PaginaAdmin';
import TextareaAutomatic from '../../components/TextareaAutomatic';
import ZonaPerill from '../../components/ZonaPerill';
import useFitxaEditable from '../../lib/useFitxaEditable';
import { missatgeBloqueigEliminar } from '../../lib/blocatgeEliminar';
import {
  camiLogoDistribuidora, construirDistribuidora, sessionsQueUsen, validarCorreu, validarPreu, validarUrlPublica,
} from '../../lib/distribuidores';

const CAMPS_BUITS = {
  nom: '', web: '', urlPublica: '', contacte: '', correu: '', preu: '', condicions: '', logo: '',
};
const ERROR_CARREGA = "No s'ha pogut carregar la distribuïdora. Torna-ho a provar.";
const ETIQUETES = {
  nom: 'Nom', urlPublica: 'Pàgina web pública', correu: 'Correu electrònic', preu: 'Preu per defecte',
};
const CAMPS_AMB_ERROR = Object.keys(ETIQUETES);

function FitxaDistribuidora({ id, distribuidora }) {
  const editant = Boolean(id);
  const [inicial] = useState(() => ({
    ...Object.fromEntries(Object.keys(CAMPS_BUITS).map((camp) => [camp, distribuidora?.[camp] ?? ''])),
    preu: String(distribuidora?.preu ?? ''),
  }));
  // Nom desat: el guarden les sessions (amb l'id del document), per això la comprovació d'ús no fa servir el del formulari.
  const nomOriginal = useRef(distribuidora?.nom ?? '');
  const [pujant, setPujant] = useState(false);
  const pujantRef = useRef(false);
  const preuRef = useRef(null);
  const [errorEliminar, setErrorEliminar] = useState(null);
  const navigate = useNavigate();
  const { confirma } = useConfirmacio();

  const onDesar = async ({ valors: v }) => {
    const errors = {};
    if (!v.nom.trim()) errors.nom = 'El nom no pot estar en blanc.';
    const motiuUrl = validarUrlPublica(v.urlPublica);
    if (motiuUrl) errors.urlPublica = motiuUrl;
    const motiuCorreu = validarCorreu(v.correu);
    if (motiuCorreu) errors.correu = motiuCorreu;
    // Sense validació nativa, un text que el navegador no pot llegir com a número («12e») arriba com a ''
    // i esborraria el preu desat: és un error, no un preu buit.
    const motiuPreu = preuRef.current?.validity?.badInput ? 'El preu ha de ser un número.' : validarPreu(v.preu);
    if (motiuPreu) errors.preu = motiuPreu;
    if (Object.keys(errors).length) return { errors };
    const nova = construirDistribuidora(v);
    if (!editant) {
      const creada = await addDoc(collection(db, 'distribuidores'), nova);
      navigate(ROUTES.DISTRIBUIDORES_EDITAR.replace(':id', creada.id), { replace: true });
      return undefined;
    }
    await setDoc(doc(db, 'distribuidores', id), nova);
    nomOriginal.current = nova.nom;
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
      const propostesQueLaUsen = await getDocs(query(collection(db, 'propostesInternes'), where('distribuidoraId', '==', id)));
      if (!propostesQueLaUsen.empty) {
        setErrorEliminar(missatgeBloqueigEliminar(propostesQueLaUsen.docs.length, 'proposta', 'propostes'));
        return;
      }
      const snapSessions = await getDocs(collection(db, 'sessions'));
      const usen = sessionsQueUsen(
        { id, nom: nomOriginal.current },
        snapSessions.docs.map((d) => ({ id: d.id, ...d.data() })),
      );
      if (usen.length) {
        setErrorEliminar(missatgeBloqueigEliminar(usen.length, 'sessió', 'sessions', usen.map((s) => s.titol)));
        return;
      }
      if (!(await confirma({
        missatge: 'Segur que vols eliminar aquesta distribuïdora? Aquesta acció no es pot desfer.',
        perill: true,
        etiquetaAcceptar: 'Elimina',
      }))) return;
      await deleteDoc(doc(db, 'distribuidores', id));
      navigate(ROUTES.DISTRIBUIDORES);
    } catch {
      setErrorEliminar("No s'ha pogut eliminar. Torna-ho a provar.");
    }
  };

  // `ajuda`: id del text d'ajuda del camp, que es manté vinculat també amb error.
  const camp = (nom, ajuda) => {
    const descrits = [ajuda, errors[nom] && `${nom}-error`].filter(Boolean).join(' ');
    return {
      id: nom,
      className: 'form__input',
      value: valors[nom],
      onChange: (e) => canvia(nom, e.target.value),
      'aria-invalid': errors[nom] ? true : undefined,
      'aria-describedby': descrits || undefined,
    };
  };
  const errorCamp = (nom) => errors[nom] && <p id={`${nom}-error`} className="form__error">{errors[nom]}</p>;
  const anarACamp = (nom) => document.getElementById(nom)?.focus();
  const errorsBarra = CAMPS_AMB_ERROR.filter((nom) => errors[nom]).map((nom) => ({
    pestanya: nom, etiquetaPestanya: ETIQUETES[nom], missatge: errors[nom],
  }));

  return (
    <PaginaAdmin
      as="form"
      amplada="formulari"
      ambBarra
      className="distribuidora-form"
      titol={editant ? 'Distribuïdora' : 'Nova distribuïdora'}
      tornar={{ to: ROUTES.DISTRIBUIDORES, etiqueta: 'Distribuïdores' }}
      onSubmit={handleSubmit}
      noValidate
    >
      <div className="form__field">
        <label className="form__label" htmlFor="nom">Nom</label>
        <input {...camp('nom')} aria-required="true" />
        {errorCamp('nom')}
      </div>
      <div className="form__field">
        <label className="form__label" htmlFor="web">Web</label>
        <input {...camp('web')} />
      </div>
      <div className="form__field">
        <label className="form__label" htmlFor="urlPublica">Pàgina web pública</label>
        <input {...camp('urlPublica', 'urlPublica-ajuda')} />
        <p id="urlPublica-ajuda" className="form__ajuda">
          Adreça on porta el logo al lloc públic. Pot ser la mateixa que «Web» o una altra, p. ex. la portada.
        </p>
        {errorCamp('urlPublica')}
      </div>
      <CampLogo
        logo={valors.logo}
        nom={valors.nom}
        cami={camiLogoDistribuidora}
        pujant={pujant}
        onPujant={onPujant}
        onCanvia={(logo) => canvia('logo', logo)}
      />
      <div className="form__field">
        <label className="form__label" htmlFor="contacte">Persona de contacte</label>
        <input {...camp('contacte')} />
      </div>
      <div className="form__field">
        <label className="form__label" htmlFor="correu">Correu electrònic de contacte</label>
        <input {...camp('correu')} type="email" />
        {errorCamp('correu')}
      </div>
      <div className="form__field">
        <label className="form__label" htmlFor="preu">Preu per defecte (€)</label>
        <input {...camp('preu')} ref={preuRef} type="number" step="0.01" min="0" />
        {errorCamp('preu')}
      </div>
      <div className="form__field">
        <label className="form__label" htmlFor="condicions">Condicions per defecte</label>
        <TextareaAutomatic
          id="condicions"
          mida="curt"
          value={valors.condicions}
          onChange={(e) => canvia('condicions', e.target.value)}
        />
        <p className="form__ajuda">
          S'apliquen a totes les pel·lícules d'aquesta distribuïdora que no tinguin un preu o unes condicions propis.
        </p>
      </div>

      {editant && (
        <ZonaPerill descripcio="No es pot eliminar mentre alguna proposta o sessió la faci servir. Aquesta acció no es pot desfer.">
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
      />
    </PaginaAdmin>
  );
}

// Si s'edita, carrega la distribuïdora; la fitxa es munta quan hi ha les dades (el hook només llegeix `inicial` en muntar).
function CarregaDistribuidora({ id }) {
  const [distribuidora, setDistribuidora] = useState(null);
  const [errorCarrega, setErrorCarrega] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) return undefined;
    let actiu = true;
    getDoc(doc(db, 'distribuidores', id)).then((snap) => {
      if (!actiu) return;
      const dadesDoc = snap.data();
      if (!dadesDoc) {
        navigate(ROUTES.DISTRIBUIDORES, { replace: true });
        return;
      }
      setDistribuidora(dadesDoc);
    }).catch(() => { if (actiu) setErrorCarrega(ERROR_CARREGA); });
    return () => { actiu = false; };
  }, [id, navigate]);

  if (!id) return <FitxaDistribuidora distribuidora={null} />;
  if (errorCarrega) {
    return (
      <PaginaAdmin amplada="formulari" titol="Distribuïdora" tornar={{ to: ROUTES.DISTRIBUIDORES, etiqueta: 'Distribuïdores' }}>
        <p className="form__error" role="alert">{errorCarrega}</p>
      </PaginaAdmin>
    );
  }
  if (!distribuidora) return <Carregant />;
  return <FitxaDistribuidora id={id} distribuidora={distribuidora} />;
}

// Clau per distribuïdora: en passar de «Nova distribuïdora» a la fitxa creada, l'estat comença de nou.
export default function DistribuidoraForm() {
  const { id } = useParams();
  return <CarregaDistribuidora key={id ?? 'nova'} id={id} />;
}
