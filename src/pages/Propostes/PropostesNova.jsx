import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  addDoc, collection, getDocs, query, serverTimestamp, where,
} from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import { etiquetaSoci } from '../../lib/socis';
import { calcularNomPublic, esPropostaDuplicada, ESTATS_DUPLICAT } from '../../lib/propostes';
import CercadorPellicula from '../../components/CercadorPellicula';
import Carregant from '../../components/Carregant';
import PaginaAdmin from '../../components/PaginaAdmin';
import ErrorCarrega from '../../components/ErrorCarrega';
import useErrorCarrega from '../../lib/useErrorCarrega';

export default function PropostesNova() {
  const [socis, setSocis] = useState(null);
  const [etiquetaTriada, setEtiquetaTriada] = useState('');
  const [pellicula, setPellicula] = useState(null);
  const [comentari, setComentari] = useState('');
  const [error, setError] = useState(null);
  const [desant, setDesant] = useState(false);
  const navigate = useNavigate();
  const {
    error: errorCarrega, falla, reintenta, intent,
  } = useErrorCarrega();

  useEffect(() => {
    getDocs(collection(db, 'socis')).then((snap) => {
      setSocis(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }).catch(falla);
  }, [intent, falla]);

  if (errorCarrega) {
    return (
      <ErrorCarrega
        amplada="formulari"
        titol="Nova proposta en nom d'un soci"
        tornar={{ to: ROUTES.PROPOSTES_PENDENTS, etiqueta: 'Propostes' }}
        missatge="No s'han pogut carregar els socis."
        onReintenta={reintenta}
      />
    );
  }
  if (socis === null) return <Carregant />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const sociTriat = socis.find((s) => etiquetaSoci(s) === etiquetaTriada);
    if (!sociTriat) {
      setError('Selecciona un soci vàlid de la llista.');
      return;
    }
    if (!pellicula) return;
    setError(null);
    setDesant(true);
    // Mateixa forma que les propostes de la web pública: amb el tmdbId, el trigger `desarFitxaNovaProposta` omple
    // la fitxa. L'admin no té els límits diaris dels socis, però tampoc pot duplicar una proposta oberta.
    const proposta = { titol: pellicula.titol, any: pellicula.any, tmdbId: pellicula.tmdbId };
    try {
      const obertes = await getDocs(query(collection(db, 'propostes'), where('estat', 'in', ESTATS_DUPLICAT)));
      if (obertes.docs.some((d) => esPropostaDuplicada(d.data(), proposta))) {
        setDesant(false);
        setError('Aquesta pel·lícula ja està proposada.');
        return;
      }
      const creada = await addDoc(collection(db, 'propostes'), {
        ...proposta,
        comentari: comentari.trim(),
        numeroSoci: sociTriat.numeroSoci,
        nomProposant: calcularNomPublic(sociTriat),
        estat: 'pendent',
        timestamp: serverTimestamp(),
      });
      navigate(ROUTES.PROPOSTES_EDITAR.replace(':id', creada.id), { replace: true });
    } catch {
      setDesant(false);
      setError("No s'ha pogut desar. Torna-ho a provar.");
    }
  };

  return (
    <PaginaAdmin
      as="form"
      amplada="formulari"
      className="propostes-nova"
      titol="Nova proposta en nom d'un soci"
      tornar={{ to: ROUTES.PROPOSTES_PENDENTS, etiqueta: 'Propostes' }}
      onSubmit={handleSubmit}
    >
      <div className="form__field">
        <label className="form__label" htmlFor="soci">Soci</label>
        <input
          id="soci"
          list="socis-datalist"
          className="form__input"
          value={etiquetaTriada}
          onChange={(e) => setEtiquetaTriada(e.target.value)}
        />
        <datalist id="socis-datalist">
          {socis.map((s) => <option key={s.id} value={etiquetaSoci(s)} />)}
        </datalist>
      </div>

      <div className="form__field">
        <CercadorPellicula onTriar={(triada) => { setError(null); setPellicula(triada); }} />
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="comentari">Comentari (opcional)</label>
        <textarea
          id="comentari" className="form__input" rows={3} maxLength={1000} aria-describedby="comentari-ajuda"
          value={comentari} onChange={(e) => setComentari(e.target.value)}
        />
        <p id="comentari-ajuda" className="form__ajuda">Màxim 1000 caràcters.</p>
      </div>

      {error && <p className="form__error" role="alert">{error}</p>}
      <button className="btn" type="submit" disabled={desant || !etiquetaTriada.trim() || !pellicula}>
        {desant ? 'Creant…' : 'Crear proposta'}
      </button>
    </PaginaAdmin>
  );
}
