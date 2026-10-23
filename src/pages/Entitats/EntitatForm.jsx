import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import Carregant from '../../components/Carregant';
import { useConfirmacio } from '../../components/ConfirmacioProvider';
import PaginaAdmin from '../../components/PaginaAdmin';
import SelectorFitxer from '../../components/SelectorFitxer';
import { ACCEPT_IMATGE, urlStorage, validarImatge } from '../../lib/sessioPublica';
import { camiLogoEntitat, sessionsQueUsen, validarEntitat } from '../../lib/entitats';

const ERROR_CARREGA = "No s'han pogut carregar les entitats. Torna-ho a provar.";
const ERROR_PUJADA = "No s'ha pogut pujar la imatge. Torna-ho a provar.";

export default function EntitatForm() {
  const { id } = useParams();
  const editant = Boolean(id);
  const [nom, setNom] = useState('');
  const [url, setUrl] = useState('');
  const [logo, setLogo] = useState('');
  const [original, setOriginal] = useState({ url: '', logo: '' });
  const [altres, setAltres] = useState([]);
  const [carregant, setCarregant] = useState(true);
  const [pujant, setPujant] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [errorCarrega, setErrorCarrega] = useState(null);
  const navigate = useNavigate();
  const { confirma } = useConfirmacio();

  useEffect(() => {
    const carrega = async () => {
      const snap = await getDocs(collection(db, 'entitats'));
      setAltres(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      if (editant) {
        const dades = (await getDoc(doc(db, 'entitats', id))).data();
        if (!dades) {
          navigate(ROUTES.ENTITATS, { replace: true });
          return;
        }
        setNom(dades.nom);
        setUrl(dades.url ?? '');
        setLogo(dades.logo ?? '');
        setOriginal({ url: dades.url ?? '', logo: dades.logo ?? '' });
      }
      setCarregant(false);
    };
    carrega().catch(() => setErrorCarrega(ERROR_CARREGA));
  }, [id, editant, navigate]);

  const pujarLogo = async (e) => {
    const fitxer = e.target.files?.[0];
    e.target.value = '';
    if (!fitxer) return;
    setError(null);
    const motiu = nom.trim() ? validarImatge(fitxer) : 'Escriu primer el nom per poder pujar el logo.';
    if (motiu) {
      setError(motiu);
      return;
    }
    setPujant(true);
    try {
      const cami = camiLogoEntitat(nom, fitxer, Date.now());
      await uploadBytes(ref(storage, cami), fitxer, { contentType: fitxer.type });
      setLogo(urlStorage(storage.app.options.storageBucket, cami));
    } catch {
      setError(ERROR_PUJADA);
    } finally {
      setPujant(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const resultat = validarEntitat({ nom, url }, altres, id);
    setErrors(resultat.errors);
    if (!resultat.valid) return;
    const nova = { url: url.trim(), logo };
    try {
      if (editant) {
        const canvis = Object.fromEntries(Object.entries(nova).filter(([camp, valor]) => valor !== original[camp]));
        if (Object.keys(canvis).length) await updateDoc(doc(db, 'entitats', id), canvis);
      } else {
        const entitat = { nom: nom.trim(), creatEl: serverTimestamp() };
        if (nova.url) entitat.url = nova.url;
        if (nova.logo) entitat.logo = nova.logo;
        await addDoc(collection(db, 'entitats'), entitat);
      }
      navigate(ROUTES.ENTITATS);
    } catch {
      setError("No s'ha pogut desar. Torna-ho a provar.");
    }
  };

  const handleEsborrar = async () => {
    setError(null);
    try {
      const snap = await getDocs(collection(db, 'sessions'));
      const sessions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const usen = sessionsQueUsen(nom, sessions);
      if (usen.length) {
        const recompte = usen.length === 1 ? "l'usa 1 sessió" : `l'usen ${usen.length} sessions`;
        setError(`No es pot esborrar: ${recompte} (${usen.map((s) => s.titol).join(', ')})`);
        return;
      }
      if (!(await confirma({
        missatge: 'Segur que vols esborrar aquesta entitat? Aquesta acció no es pot desfer.',
        perill: true,
        etiquetaAcceptar: 'Esborra',
      }))) return;
      await deleteDoc(doc(db, 'entitats', id));
      navigate(ROUTES.ENTITATS);
    } catch {
      setError("No s'ha pogut esborrar. Torna-ho a provar.");
    }
  };

  if (errorCarrega) {
    return (
      <PaginaAdmin amplada="formulari" titol={editant ? 'Entitat' : 'Nova entitat'} tornar={{ to: ROUTES.ENTITATS, etiqueta: 'Entitats' }}>
        <p className="form__error" role="alert">{errorCarrega}</p>
      </PaginaAdmin>
    );
  }
  if (carregant) return <Carregant />;

  return (
    <PaginaAdmin
      as="form"
      amplada="formulari"
      className="entitat-form"
      titol={editant ? 'Entitat' : 'Nova entitat'}
      tornar={{ to: ROUTES.ENTITATS, etiqueta: 'Entitats' }}
      onSubmit={handleSubmit}
    >
      <div className="form__field">
        <label className="form__label" htmlFor="nom">Nom</label>
        <input
          id="nom"
          className={`form__input${editant ? ' entitat-form__input--nomes-lectura' : ''}`}
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          readOnly={editant}
        />
        {editant && <p className="form__ajuda">El nom no es pot canviar: les sessions el fan servir per triar-la</p>}
        {errors.nom && <p className="form__error" role="alert">{errors.nom}</p>}
      </div>
      <div className="form__field">
        <label className="form__label" htmlFor="url">URL</label>
        <input id="url" className="form__input" value={url} onChange={(e) => setUrl(e.target.value)} />
        {errors.url && <p className="form__error" role="alert">{errors.url}</p>}
      </div>
      <div className="form__field" role="group" aria-labelledby="logo-titol">
        <span className="form__label" id="logo-titol">Logo</span>
        <div className="entitat-form__logo">
          {logo && <img className="entitat-form__previsualitzacio" src={logo} alt="Logo" />}
          <SelectorFitxer id="logo" etiqueta={logo ? 'Canviar el logo' : 'Pujar el logo'} accept={ACCEPT_IMATGE} onChange={pujarLogo} disabled={pujant} />
        </div>
        {logo && <button className="btn btn--outline" type="button" onClick={() => setLogo('')}>Treure el logo</button>}
      </div>

      {error && <p className="form__error" role="alert">{error}</p>}
      <button className="btn" type="submit" disabled={pujant}>Desar</button>
      {editant && <button className="btn btn--outline" type="button" onClick={handleEsborrar}>Esborrar</button>}
    </PaginaAdmin>
  );
}
