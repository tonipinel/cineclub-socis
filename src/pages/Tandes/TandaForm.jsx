import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  addDoc, collection, doc, getDoc, getDocs, limit, query, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import { aData, potCrearTanda, validarTanda } from '../../lib/tandes';
import Carregant from '../../components/Carregant';
import PaginaAdmin from '../../components/PaginaAdmin';

const aInput = (data) => `${data.toLocaleDateString('sv-SE')}T${data.toLocaleTimeString('sv-SE').slice(0, 5)}`;

export default function TandaForm() {
  const { id } = useParams();
  const editant = Boolean(id);
  const [nom, setNom] = useState('');
  const [seleccio, setSeleccio] = useState([]);
  const [tanca, setTanca] = useState('');
  const [tancaInicial, setTancaInicial] = useState('');
  const [aprovades, setAprovades] = useState([]);
  const [jaHiHaVots, setJaHiHaVots] = useState(false);
  const [carregant, setCarregant] = useState(true);
  const [errors, setErrors] = useState({});
  const [errorDesar, setErrorDesar] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const carregaPropostes = getDocs(collection(db, 'propostes')).then((snap) => (
      snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.estat === 'aprovada')
    ));
    const carregaTanda = editant ? getDoc(doc(db, 'tandes', id)) : Promise.resolve(null);
    Promise.all([carregaPropostes, carregaTanda]).then(async ([propostes, snap]) => {
      setAprovades(propostes);
      if (editant) {
        const dades = snap.data();
        if (!dades) {
          navigate(ROUTES.TANDES, { replace: true });
          return;
        }
        const dataTanca = aInput(aData(dades.tanca));
        setNom(dades.nom);
        setSeleccio(dades.propostes);
        setTanca(dataTanca);
        setTancaInicial(dataTanca);
        // Només una tanda oberta amb vots es bloqueja (canviar-ne les propostes deixaria els socis que ja han
        // vist el rànquing sense poder votar-ne la nova). Si els vots no es poden llegir, es bloqueja per prudència.
        if (aData(dades.tanca) > new Date()) {
          const vots = await getDocs(query(collection(db, 'tandes', id, 'vots'), limit(1))).catch(() => null);
          setJaHiHaVots(vots === null || vots.docs.length > 0);
        }
      }
      setCarregant(false);
    });
  }, [id, editant, navigate]);

  const alternaProposta = (propostaId) => setSeleccio((s) => (
    s.includes(propostaId) ? s.filter((p) => p !== propostaId) : [...s, propostaId]
  ));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorDesar(null);
    const dataTanca = tanca ? new Date(tanca) : null;
    const { errors: errorsValidacio } = validarTanda({ nom, propostes: seleccio, tanca: dataTanca }, new Date());
    if (editant && tanca === tancaInicial) delete errorsValidacio.tanca;
    setErrors(errorsValidacio);
    if (Object.keys(errorsValidacio).length > 0) return;
    const dades = { nom: nom.trim(), propostes: seleccio, tanca: dataTanca };
    try {
      // Només si la tanda resultant quedaria oberta (nova, o tancament futur en reobrir-la).
      if (dataTanca > new Date()) {
        const altres = (await getDocs(collection(db, 'tandes'))).docs
          .filter((d) => d.id !== id)
          .map((d) => ({ id: d.id, ...d.data() }));
        if (!potCrearTanda(altres, new Date())) {
          setErrorDesar("Ja hi ha una tanda oberta. Tanca-la abans d'obrir-ne una altra.");
          return;
        }
      }
      if (editant) await updateDoc(doc(db, 'tandes', id), dades);
      else await addDoc(collection(db, 'tandes'), { ...dades, creada: serverTimestamp() });
      navigate(ROUTES.TANDES);
    } catch {
      setErrorDesar("No s'ha pogut desar. Torna-ho a provar.");
    }
  };

  const handleTancarAra = async () => {
    setErrorDesar(null);
    try {
      await updateDoc(doc(db, 'tandes', id), { tanca: new Date() });
      navigate(ROUTES.TANDES);
    } catch {
      setErrorDesar("No s'ha pogut tancar. Torna-ho a provar.");
    }
  };

  if (carregant) return <Carregant />;

  const oberta = editant && new Date(tancaInicial) > new Date();
  // En una tanda tancada és històric; en una d'oberta, només es pot canviar mentre no hi ha cap vot.
  const propostesBloquejades = editant && (!oberta || jaHiHaVots);

  return (
    <PaginaAdmin
      as="form"
      amplada="formulari"
      className="tanda-form"
      titol={editant ? 'Tanda' : 'Nova tanda'}
      tornar={{ to: ROUTES.TANDES, etiqueta: 'Tandes' }}
      onSubmit={handleSubmit}
    >
      <div className="form__field">
        <label className="form__label" htmlFor="nom">Nom</label>
        <input id="nom" className="form__input" value={nom} onChange={(e) => setNom(e.target.value)} />
        {errors.nom && <p className="form__error">{errors.nom}</p>}
      </div>

      <fieldset className="tanda-form__propostes">
        <legend className="form__label">Propostes aprovades</legend>
        {aprovades.length === 0 && <p>No hi ha cap proposta aprovada.</p>}
        {oberta && jaHiHaVots && (
          <p className="tanda-form__avis">Ja hi ha vots: tanca la tanda i crea&apos;n una de nova per canviar les propostes.</p>
        )}
        {aprovades.map((p) => (
          <label key={p.id} className="form__casella">
            <input type="checkbox" checked={seleccio.includes(p.id)} disabled={propostesBloquejades} onChange={() => alternaProposta(p.id)} />
            {p.titol}
          </label>
        ))}
        {errors.propostes && <p className="form__error">{errors.propostes}</p>}
      </fieldset>

      <div className="form__field">
        <label className="form__label" htmlFor="tanca">Tanca</label>
        <input id="tanca" type="datetime-local" className="form__input" value={tanca} onChange={(e) => setTanca(e.target.value)} />
        {errors.tanca && <p className="form__error">{errors.tanca}</p>}
      </div>

      {errorDesar && <p className="form__error">{errorDesar}</p>}
      <div className="tanda-form__accions">
        <button className="btn" type="submit">Desar</button>
        {oberta && <button className="btn btn--outline" type="button" onClick={handleTancarAra}>Tancar ara</button>}
      </div>
    </PaginaAdmin>
  );
}
