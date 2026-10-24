import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where,
} from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import Carregant from '../../components/Carregant';
import { useConfirmacio } from '../../components/ConfirmacioProvider';
import BotoEditar from '../../components/BotoEditar';
import PaginaAdmin from '../../components/PaginaAdmin';
import TextareaAutomatic from '../../components/TextareaAutomatic';
import SelectorFitxer from '../../components/SelectorFitxer';
import { ACCEPT_IMATGE, urlStorage, validarImatge } from '../../lib/sessioPublica';
import {
  camiLogoDistribuidora, construirDistribuidora, sessionsQueUsen, validarUrlPublica,
} from '../../lib/distribuidores';

const CAMPS_BUITS = {
  nom: '', web: '', urlPublica: '', contacte: '', correu: '', preu: '', condicions: '', logo: '',
};
const ERROR_PUJADA = "No s'ha pogut pujar la imatge. Torna-ho a provar.";

export default function DistribuidoraForm() {
  const { id } = useParams();
  const editant = Boolean(id);
  const [dades, setDades] = useState(CAMPS_BUITS);
  const [carregant, setCarregant] = useState(editant);
  const [desbloquejat, setDesbloquejat] = useState(!editant);
  const [error, setError] = useState(null);
  const [errorUrlPublica, setErrorUrlPublica] = useState(null);
  const [pujant, setPujant] = useState(false);
  // Nom desat: el guarden les sessions (amb l'id del document), per això la comprovació d'ús no fa servir el del formulari.
  const [nomOriginal, setNomOriginal] = useState('');
  const navigate = useNavigate();
  const { confirma } = useConfirmacio();

  useEffect(() => {
    if (!editant) return;
    getDoc(doc(db, 'distribuidores', id)).then((snap) => {
      const dadesDoc = snap.data();
      if (!dadesDoc) {
        navigate(ROUTES.DISTRIBUIDORES, { replace: true });
        return;
      }
      setDades({ ...CAMPS_BUITS, ...dadesDoc, preu: String(dadesDoc.preu ?? '') });
      setNomOriginal(dadesDoc.nom ?? '');
      setCarregant(false);
    });
  }, [id, editant, navigate]);

  const handleChange = (camp) => (e) => setDades((d) => ({ ...d, [camp]: e.target.value }));

  const pujarLogo = async (e) => {
    const fitxer = e.target.files?.[0];
    if (!fitxer) return;
    setError(null);
    const motiu = dades.nom.trim() ? validarImatge(fitxer) : 'Escriu primer el nom per poder pujar el logo.';
    if (motiu) {
      setError(motiu);
      return;
    }
    setPujant(true);
    try {
      const cami = camiLogoDistribuidora(dades.nom, fitxer, Date.now());
      await uploadBytes(ref(storage, cami), fitxer, { contentType: fitxer.type });
      setDades((d) => ({ ...d, logo: urlStorage(storage.app.options.storageBucket, cami) }));
    } catch {
      setError(ERROR_PUJADA);
    } finally {
      setPujant(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!dades.nom.trim()) {
      setError('El nom no pot estar en blanc.');
      return;
    }
    const motiuUrl = validarUrlPublica(dades.urlPublica);
    setErrorUrlPublica(motiuUrl);
    if (motiuUrl) return;
    const distribuidora = construirDistribuidora(dades);
    try {
      if (editant) await setDoc(doc(db, 'distribuidores', id), distribuidora);
      else await addDoc(collection(db, 'distribuidores'), distribuidora);
      navigate(ROUTES.DISTRIBUIDORES);
    } catch {
      setError("No s'ha pogut desar. Torna-ho a provar.");
    }
  };

  const handleEliminar = async () => {
    setError(null);
    try {
      const enUs = await getDocs(query(collection(db, 'propostesInternes'), where('distribuidoraId', '==', id)));
      if (!enUs.empty) {
        setError(`No es pot eliminar: s'està fent servir en ${enUs.docs.length} proposta(es).`);
        return;
      }
      const snapSessions = await getDocs(collection(db, 'sessions'));
      const usen = sessionsQueUsen({ id, nom: nomOriginal }, snapSessions.docs.map((d) => ({ id: d.id, ...d.data() })));
      if (usen.length) {
        const recompte = usen.length === 1 ? "l'usa 1 sessió" : `l'usen ${usen.length} sessions`;
        setError(`No es pot eliminar: ${recompte} (${usen.map((s) => s.titol).join(', ')})`);
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
      setError("No s'ha pogut eliminar. Torna-ho a provar.");
    }
  };

  if (carregant) return <Carregant />;

  const classeCamp = desbloquejat ? 'form__input' : 'form__input form__input--nomes-lectura';

  return (
    <PaginaAdmin
      as="form"
      amplada="formulari"
      className="distribuidora-form"
      titol={editant ? 'Distribuïdora' : 'Nova distribuïdora'}
      tornar={{ to: ROUTES.DISTRIBUIDORES, etiqueta: 'Distribuïdores' }}
      accions={editant && !desbloquejat && <BotoEditar onClick={() => setDesbloquejat(true)} />}
      onSubmit={handleSubmit}
    >
      <div className="form__field">
        <label className="form__label" htmlFor="nom">Nom</label>
        <input id="nom" className={classeCamp} value={dades.nom} onChange={handleChange('nom')} readOnly={!desbloquejat} required />
      </div>
      <div className="form__field">
        <label className="form__label" htmlFor="web">Web</label>
        <input id="web" className={classeCamp} value={dades.web} onChange={handleChange('web')} readOnly={!desbloquejat} />
      </div>
      <div className="form__field">
        <label className="form__label" htmlFor="urlPublica">Pàgina web pública (enllaç des de la fitxa de la sessió)</label>
        <input
          id="urlPublica"
          className={classeCamp}
          value={dades.urlPublica}
          onChange={(e) => {
            setErrorUrlPublica(null);
            handleChange('urlPublica')(e);
          }}
          readOnly={!desbloquejat}
          aria-invalid={errorUrlPublica ? true : undefined}
          aria-describedby={errorUrlPublica ? 'urlPublica-ajuda urlPublica-error' : 'urlPublica-ajuda'}
        />
        <p id="urlPublica-ajuda" className="distribuidora-form__ajuda">
          Pot ser la mateixa que «Web» o una altra, p. ex. la portada. Es mostra al lloc públic.
        </p>
        {errorUrlPublica && <p id="urlPublica-error" className="form__error" role="alert">{errorUrlPublica}</p>}
      </div>
      <div className="form__field" role="group" aria-labelledby="logo-titol">
        <span className="form__label" id="logo-titol">Logo</span>
        <div className="distribuidora-form__logo">
          {dades.logo && <img className="distribuidora-form__previsualitzacio" src={dades.logo} alt="Logo" />}
          {!dades.logo && !desbloquejat && <span className="distribuidora-form__sense-logo">Sense logo</span>}
          {desbloquejat && (
            <SelectorFitxer id="logo" etiqueta={dades.logo ? 'Canviar el logo' : 'Pujar el logo'} accept={ACCEPT_IMATGE} onChange={pujarLogo} disabled={pujant} />
          )}
        </div>
        {desbloquejat && dades.logo && (
          <button className="btn btn--outline distribuidora-form__treure-logo" type="button" onClick={() => setDades((d) => ({ ...d, logo: '' }))}>
            Treure el logo
          </button>
        )}
      </div>
      <div className="form__field">
        <label className="form__label" htmlFor="contacte">Persona de contacte</label>
        <input id="contacte" className={classeCamp} value={dades.contacte} onChange={handleChange('contacte')} readOnly={!desbloquejat} />
      </div>
      <div className="form__field">
        <label className="form__label" htmlFor="correu">Correu electrònic de contacte</label>
        <input id="correu" type="email" className={classeCamp} value={dades.correu} onChange={handleChange('correu')} readOnly={!desbloquejat} />
      </div>
      <div className="form__field">
        <label className="form__label" htmlFor="preu">Preu per defecte (€)</label>
        <input id="preu" type="number" step="0.01" min="0" className={classeCamp} value={dades.preu} onChange={handleChange('preu')} readOnly={!desbloquejat} />
      </div>
      <div className="form__field">
        <label className="form__label" htmlFor="condicions">Condicions per defecte</label>
        <TextareaAutomatic
          id="condicions"
          mida="curt"
          className={desbloquejat ? undefined : 'form__input--nomes-lectura'}
          value={dades.condicions}
          onChange={handleChange('condicions')}
          readOnly={!desbloquejat}
        />
        <p className="distribuidora-form__ajuda">
          S'apliquen a totes les pel·lícules d'aquesta distribuïdora que no tinguin un preu o unes condicions propis.
        </p>
      </div>

      {error && <p className="form__error" role="alert">{error}</p>}
      {desbloquejat && <button className="btn" type="submit" disabled={pujant}>Desar</button>}
      {editant && desbloquejat && (
        <button className="btn btn--outline" type="button" onClick={handleEliminar}>Eliminar</button>
      )}
    </PaginaAdmin>
  );
}
