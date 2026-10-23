import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, runTransaction, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import { etiquetaSoci } from '../../lib/socis';
import { calcularNomPublic } from '../../lib/propostes';
import { formatData } from '../../lib/data';
import { sessionsPerProposta } from '../../lib/tandes';
import { infoTanda, ordenarTandes } from '../../lib/propostesLlistat';
import { construirSessioDesDeProposta } from '../../lib/sessioPublica';
import { assignarPellicula } from '../../lib/pellicules';
import Carregant from '../../components/Carregant';
import { useConfirmacio } from '../../components/ConfirmacioProvider';
import BotoEditar from '../../components/BotoEditar';
import CercadorPellicula from '../../components/CercadorPellicula';
import FitxaPellicula from '../../components/FitxaPellicula';
import PaginaAdmin from '../../components/PaginaAdmin';
import TextareaAutomatic from '../../components/TextareaAutomatic';
import { GestioInternaCamps, GestioInternaVista, INTERNA_BUIDA } from '../../components/GestioInternaProposta';

const CLASSE_ESTAT = {
  pendent: 'badge--pendent', aprovada: 'badge--al-dia', rebutjada: 'badge--vencut', programada: 'badge--nou-registre',
};

const ERROR_NO_APROVADA = 'Aquesta proposta ja no és aprovada.';

const IDIOMES_SINOPSI = { es: 'castellà', en: 'anglès' };

const ESTATS = [
  ['pendent', 'Pendent'],
  ['aprovada', 'Aprovada'],
  ['rebutjada', 'Rebutjada'],
  ['programada', 'Programada'],
];

export default function PropostaForm() {
  const { id } = useParams();
  const [dades, setDades] = useState(null);
  const [socis, setSocis] = useState(null);
  const [etiquetaSociTriat, setEtiquetaSociTriat] = useState('');
  const [error, setError] = useState(null);
  const [editant, setEditant] = useState(false);
  const [sinopsiCarregada, setSinopsiCarregada] = useState('');
  const [interna, setInterna] = useState(INTERNA_BUIDA);
  const [distribuidores, setDistribuidores] = useState([]);
  const [programant, setProgramant] = useState(false);
  const [tandes, setTandes] = useState([]);
  const [sessioId, setSessioId] = useState(null);
  const [sessioTitol, setSessioTitol] = useState('');
  // Bloqueja un segon «Programar» mentre el diàleg de confirmació és obert.
  const programantRef = useRef(false);
  const navigate = useNavigate();
  const { confirma, avisa } = useConfirmacio();

  const carregar = useCallback(() => {
    Promise.all([
      getDoc(doc(db, 'propostes', id)),
      getDocs(collection(db, 'socis')),
    ]).then(([propostaSnap, socisSnap]) => {
      const socisCarregats = socisSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const dadesProposta = {
        imatgeUrl: '', trailerUrl: '', sinopsi: '', comentari: '', ...propostaSnap.data(),
      };
      setDades(dadesProposta);
      setSinopsiCarregada(dadesProposta.sinopsi);
      setSocis(socisCarregats);
      const sociActual = socisCarregats.find((s) => Number(s.numeroSoci) === Number(dadesProposta.numeroSoci));
      setEtiquetaSociTriat(sociActual ? etiquetaSoci(sociActual) : '');
    });
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  // Les dades internes (preu, condicions, distribuïdora) viuen en un document
  // apart i admin-only; si no es poden llegir, la fitxa es mostra igualment.
  const carregarInterna = useCallback(() => {
    Promise.all([
      getDoc(doc(db, 'propostesInternes', id)),
      getDocs(collection(db, 'distribuidores')),
    ]).then(([internaSnap, distribuidoresSnap]) => {
      const dadesInternes = internaSnap.data() ?? {};
      setInterna({ ...INTERNA_BUIDA, ...dadesInternes, preu: String(dadesInternes.preu ?? '') });
      setDistribuidores(
        distribuidoresSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => a.nom.localeCompare(b.nom, 'ca'))
      );
    }).catch(() => {
      // Sense dades internes: la resta de la fitxa es mostra igualment.
    });
  }, [id]);

  useEffect(() => { carregarInterna(); }, [carregarInterna]);

  // Només lectura i opcional: si falla, les files «Tandes» i «Sessió» mostren «—».
  useEffect(() => {
    getDocs(collection(db, 'tandes')).then((snap) => {
      setTandes(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((t) => Array.isArray(t.propostes) && t.propostes.includes(id))
          .map((t) => infoTanda(t))
          .sort(ordenarTandes),
      );
    }).catch(() => {});
    getDocs(query(collection(db, 'sessions'), where('propostaId', '==', id))).then((snap) => {
      const sessions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const triada = sessionsPerProposta(sessions)[id];
      setSessioId(triada ?? null);
      setSessioTitol(sessions.find((s) => s.id === triada)?.titol ?? '');
    }).catch(() => {});
  }, [id]);

  const handleCanviInterna = (camp) => (e) => setInterna((i) => ({ ...i, [camp]: e.target.value }));

  const handleCancellar = () => {
    setError(null);
    setEditant(false);
    carregar();
    carregarInterna();
  };

  const handleActualitzarTmdb = async () => {
    setError(null);
    try {
      const fitxa = await assignarPellicula(id, dades.tmdbId);
      setDades((d) => ({ ...d, ...fitxa }));
      setSinopsiCarregada(fitxa.sinopsi ?? '');
    } catch {
      setError("No s'ha pogut actualitzar la fitxa des de TMDB. Torna-ho a provar.");
    }
  };

  const handleChange = (camp) => (e) => {
    setDades((d) => ({ ...d, [camp]: e.target.value }));
  };

  // Tria la pel·lícula de TMDB: el servidor en torna a agafar la fitxa
  // sencera (títol, any, cartell, sinopsi…) i aquí només actualitzem el que
  // es veu al formulari.
  const handleTriarPellicula = async (pellicula) => {
    if (!pellicula) return;
    setError(null);
    try {
      const fitxa = await assignarPellicula(id, pellicula.tmdbId);
      setDades((d) => ({ ...d, ...fitxa }));
      setSinopsiCarregada(fitxa.sinopsi ?? '');
    } catch {
      setError("No s'ha pogut carregar la fitxa de la pel·lícula. Torna-ho a provar.");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const sociTriat = socis.find((s) => etiquetaSoci(s) === etiquetaSociTriat);
    if (!sociTriat) {
      setError('Selecciona un soci vàlid de la llista.');
      return;
    }
    try {
      await updateDoc(doc(db, 'propostes', id), {
        estat: dades.estat,
        imatgeUrl: dades.imatgeUrl,
        trailerUrl: dades.trailerUrl,
        sinopsi: dades.sinopsi,
        comentari: dades.comentari.trim(),
        // Si l'admin ha canviat el text (p. ex. traduint-lo), queda marcat
        // com a català i les actualitzacions des de TMDB ja no el trepitgen.
        ...(dades.sinopsi !== sinopsiCarregada ? { sinopsiIdioma: 'ca' } : {}),
        numeroSoci: sociTriat.numeroSoci,
        nomProposant: calcularNomPublic(sociTriat),
      });
      await setDoc(doc(db, 'propostesInternes', id), {
        preu: interna.preu === '' ? null : Number(interna.preu),
        condicions: interna.condicions.trim(),
        distribuidoraId: interna.distribuidoraId,
      });
      navigate(ROUTES.PROPOSTES_PENDENTS);
    } catch {
      setError("No s'ha pogut desar. Torna-ho a provar.");
    }
  };

  // Crea la sessió (sense publicar ni data) i passa la proposta a «programada»
  // dins d'una transacció amb id determinista, perquè dos admins alhora no
  // puguin crear-ne dues. Si la proposta ja té sessió, només hi navega.
  const handleProgramar = async () => {
    if (programant || programantRef.current) return;
    programantRef.current = true;
    const confirmat = await confirma({
      missatge: `Vols programar una sessió amb "${dades.titol}"? Es crearà una sessió sense publicar i la proposta passarà a «Programada».`,
      etiquetaAcceptar: 'Programa',
    });
    if (!confirmat) {
      programantRef.current = false;
      return;
    }
    setError(null);
    setProgramant(true);
    try {
      const trobades = await getDocs(query(collection(db, 'sessions'), where('propostaId', '==', id)));
      const sessioId = trobades.docs[0]?.id ?? `proposta-${id}`;
      const propostaRef = doc(db, 'propostes', id);
      const sessioRef = doc(db, 'sessions', sessioId);
      const { sessio } = construirSessioDesDeProposta(dades, { propostaId: id, avui: new Date() });
      const existia = await runTransaction(db, async (tx) => {
        const estat = (await tx.get(propostaRef)).data()?.estat;
        const existeix = (await tx.get(sessioRef)).exists();
        if (!existeix && estat !== 'aprovada') throw new Error(ERROR_NO_APROVADA);
        if (!existeix) tx.set(sessioRef, sessio);
        if (estat === 'aprovada') tx.update(propostaRef, { estat: 'programada' });
        return existeix;
      });
      if (existia) await avisa({ missatge: 'Aquesta proposta ja té una sessió: s\'obre per editar-la.' });
      navigate(ROUTES.SESSIONS_EDITAR.replace(':id', sessioId));
    } catch (e) {
      setError(e.message === ERROR_NO_APROVADA ? ERROR_NO_APROVADA : "No s'ha pogut programar la sessió. Torna-ho a provar.");
      setProgramant(false);
      programantRef.current = false;
    }
  };

  const handleEliminar = async () => {
    const confirmat = await confirma({
      missatge: `Segur que vols eliminar definitivament la proposta "${dades.titol}"? Aquesta acció no es pot desfer.`,
      perill: true,
      etiquetaAcceptar: 'Elimina',
    });
    if (!confirmat) return;
    setError(null);
    try {
      await deleteDoc(doc(db, 'propostes', id));
      await deleteDoc(doc(db, 'propostesInternes', id));
      navigate(ROUTES.PROPOSTES_PENDENTS);
    } catch {
      setError("No s'ha pogut eliminar. Torna-ho a provar.");
    }
  };

  if (!dades || !socis) return <Carregant />;

  if (!editant) {
    return (
      <PaginaAdmin amplada="fitxa" className="proposta-fitxa">
        <Link className="pagina-admin__tornar" to={ROUTES.PROPOSTES_PENDENTS}>← Propostes</Link>
        <header className="proposta-fitxa__hero">
          <div className="proposta-fitxa__barra">
            <BotoEditar onClick={() => setEditant(true)} />
          </div>
          <h1 className="proposta-fitxa__titol">{dades.titol}</h1>
          {dades.lema && <p className="proposta-fitxa__lema">{dades.lema}</p>}
        </header>

        <div className="proposta-fitxa__fitxa-contenidor">
          <div className="proposta-fitxa__fitxa">
            <div className="proposta-fitxa__cartell-col">
              {dades.imatgeUrl ? (
                <img className="proposta-fitxa__cartell" src={dades.imatgeUrl} alt={dades.titol} />
              ) : (
                <div className="proposta-fitxa__cartell proposta-fitxa__cartell--buit">{dades.titol}</div>
              )}
            </div>
            <div className="proposta-fitxa__dades">
              <FitxaPellicula proposta={dades} ambTitol={false} />
              {!dades.tmdbId && (
                <p className="proposta-fitxa__avis">
                  Aquesta proposta encara no té pel·lícula de TMDB associada: edita-la per triar-la i omplir la fitxa.
                </p>
              )}
              <dl className="proposta-fitxa__gestio">
                <dt className="fitxa-pellicula__etiqueta">Proposada per</dt>
                <dd className="fitxa-pellicula__valor">
                  {etiquetaSociTriat || dades.nomProposant || '—'}
                  {dades.timestamp?.toDate && ` · ${formatData(dades.timestamp.toDate())}`}
                </dd>
                <dt className="fitxa-pellicula__etiqueta">Estat</dt>
                <dd className="fitxa-pellicula__valor">
                  <span className={`badge ${CLASSE_ESTAT[dades.estat] ?? ''}`}>
                    {ESTATS.find(([valor]) => valor === dades.estat)?.[1] ?? dades.estat}
                  </span>
                </dd>
                <dt className="fitxa-pellicula__etiqueta">Tandes</dt>
                <dd className="fitxa-pellicula__valor">
                  {tandes.length === 0 ? '—' : (
                    <ul className="proposta-fitxa__tandes">
                      {tandes.map((t) => (
                        <li key={t.id}>
                          <Link className="enllac" to={ROUTES.TANDES_EDITAR.replace(':id', t.id)}>{t.nom}</Link>
                          {t.oberta && ' (oberta)'}
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
                <dt className="fitxa-pellicula__etiqueta">Sessió</dt>
                <dd className="fitxa-pellicula__valor">
                  {sessioId
                    ? <Link className="enllac" to={ROUTES.SESSIONS_EDITAR.replace(':id', sessioId)}>{sessioTitol || 'Sessió'}</Link>
                    : '—'}
                </dd>
                {dades.comentari && (
                  <>
                    <dt className="fitxa-pellicula__etiqueta">Comentari del soci</dt>
                    <dd className="fitxa-pellicula__valor proposta-fitxa__comentari">{dades.comentari}</dd>
                  </>
                )}
                {dades.trailerUrl && (
                  <>
                    <dt className="fitxa-pellicula__etiqueta">Tràiler</dt>
                    <dd className="fitxa-pellicula__valor">
                      <a className="enllac" href={dades.trailerUrl} target="_blank" rel="noopener noreferrer">Veure tràiler</a>
                    </dd>
                  </>
                )}
              </dl>
              {error && <p className="form__error" role="alert">{error}</p>}
              {dades.estat === 'aprovada' && (
                <button className="btn proposta-fitxa__programar" type="button" disabled={programant} onClick={handleProgramar}>
                  Programar sessió
                </button>
              )}
              {dades.tmdbId && (
                <button className="btn btn--outline proposta-fitxa__actualitzar" type="button" onClick={handleActualitzarTmdb}>
                  Actualitzar fitxa des de TMDB
                </button>
              )}
            </div>
          </div>
        </div>

        <GestioInternaVista interna={interna} distribuidores={distribuidores} />

        {dades.sinopsi && (
          <div className="proposta-fitxa__sinopsi">
            <p>{dades.sinopsi}</p>
            {IDIOMES_SINOPSI[dades.sinopsiIdioma] && (
              <p className="proposta-fitxa__traduccio">
                Aquesta sinopsi és en {IDIOMES_SINOPSI[dades.sinopsiIdioma]}: tradueix-la editant la proposta.
              </p>
            )}
          </div>
        )}
      </PaginaAdmin>
    );
  }

  return (
    <PaginaAdmin
      as="form"
      amplada="fitxa"
      className="proposta-form"
      titol={dades.titol}
      tornar={{ to: ROUTES.PROPOSTES_PENDENTS, etiqueta: 'Propostes' }}
      onSubmit={handleSubmit}
    >
      {dades.enllac && (
        <p><a className="enllac" href={dades.enllac} target="_blank" rel="noopener noreferrer">{dades.enllac}</a></p>
      )}
      {dades.comentari && <p className="proposta-form__comentari">"{dades.comentari}"</p>}

      <div className="form__field">
        <CercadorPellicula
          valorInicial={dades.titol}
          triadaInicial={dades.tmdbId
            ? { tmdbId: dades.tmdbId, titol: dades.titol, any: dades.any ?? '', posterUrl: dades.imatgeUrl || null }
            : null}
          onTriar={handleTriarPellicula}
        />
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="soci">Soci</label>
        <input
          id="soci"
          list="proposta-form-socis-datalist"
          className="form__input"
          value={etiquetaSociTriat}
          onChange={(e) => setEtiquetaSociTriat(e.target.value)}
        />
        <datalist id="proposta-form-socis-datalist">
          {socis.map((s) => <option key={s.id} value={etiquetaSoci(s)} />)}
        </datalist>
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="estat">Estat</label>
        <select id="estat" className="form__input" value={dades.estat} onChange={handleChange('estat')}>
          {ESTATS.map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>{etiqueta}</option>
          ))}
        </select>
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="imatgeUrl">URL del cartell</label>
        <input id="imatgeUrl" className="form__input" value={dades.imatgeUrl} onChange={handleChange('imatgeUrl')} />
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="trailerUrl">URL del tràiler</label>
        <input id="trailerUrl" className="form__input" value={dades.trailerUrl} onChange={handleChange('trailerUrl')} />
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="sinopsi">Sinopsi</label>
        <TextareaAutomatic id="sinopsi" mida="llarg" value={dades.sinopsi} onChange={handleChange('sinopsi')} />
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="comentari">Comentari del soci</label>
        <TextareaAutomatic id="comentari" mida="curt" value={dades.comentari} onChange={handleChange('comentari')} />
      </div>

      <GestioInternaCamps interna={interna} distribuidores={distribuidores} onChange={handleCanviInterna} />

      {error && <p className="form__error">{error}</p>}
      <div className="proposta-form__accions">
        <button className="btn" type="submit">Desar</button>
        <button className="btn btn--outline" type="button" onClick={handleCancellar}>Cancel·lar</button>
        <button className="btn btn--perill" type="button" onClick={handleEliminar}>Eliminar proposta</button>
      </div>
    </PaginaAdmin>
  );
}
