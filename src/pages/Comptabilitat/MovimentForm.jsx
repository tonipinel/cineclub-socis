import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import {
  calcularTotal, CATEGORIES_PER_TIPUS, DIRECCIONS_TRASPAS, METODES_DESPESA, METODES_INGRES, TIPUS_MOVIMENT,
  ETIQUETES_METODE, ETIQUETES_DIRECCIO,
} from '../../lib/moviments';
import Carregant from '../../components/Carregant';
import BotoEditar from '../../components/BotoEditar';
import * as ROUTES from '../../constants/routes';

// Un soci pot tenir diversos moviments de "Quotes socis" (renovacions
// successives). El seu `ultimPagament` ha de reflectir sempre el més recent,
// però aquest formulari és genèric per a qualsevol moviment i no en sap res
// del soci: per això, cada cop que es desa o s'elimina un moviment de quota,
// recalculem `ultimPagament` a partir de tots els moviments de quota
// restants d'aquell soci, en comptes de confiar que quedi sincronitzat sol.
// `inicPeriode` (des de quan compta el seu any de soci, fixat al primer
// escaneig posterior al pagament — vegeu estatSoci.js) es neteja alhora,
// perquè torni a fixar-se al proper escaneig respecte al pagament corregit.
async function sincronitzarUltimPagament(numeroSoci) {
  const [movimentsSnap, socisSnap] = await Promise.all([
    getDocs(query(
      collection(db, 'moviments'),
      where('categoria', '==', 'Quotes socis'),
      where('numeroSoci', '==', numeroSoci)
    )),
    getDocs(query(collection(db, 'socis'), where('numeroSoci', '==', numeroSoci))),
  ]);
  if (socisSnap.empty) return;
  const dates = movimentsSnap.docs.map((d) => d.data().data).filter(Boolean).sort();
  if (dates.length === 0) return;
  await updateDoc(socisSnap.docs[0].ref, { ultimPagament: dates[dates.length - 1], inicPeriode: null });
}

// Cada categoria només és vàlida per a un tipus (una despesa mai pot ser
// "Aportacions", ni un ingrés "Gestió pel·lícules" — vegeu CATEGORIES_PER_TIPUS).
// A més, "Quotes socis" només es pot crear des de "Registrar pagament" a la
// fitxa del soci (l'únic flux que en sap el numeroSoci i sincronitza
// ultimPagament): aquest formulari genèric no té selector de soci, així que
// no es pot triar per a moviments nous ni per canviar-hi un moviment
// existent — però si ja n'estàs editant un, es manté a la llista perquè la
// categoria es pugui seguir mostrant i desar sense forçar un canvi.
function categoriesDisponibles(tipus, categoriaActual) {
  const base = CATEGORIES_PER_TIPUS[tipus] ?? [];
  return base.filter((c) => c !== 'Quotes socis' || c === categoriaActual);
}

export default function MovimentForm() {
  const { id } = useParams();
  const editant = Boolean(id);
  const [searchParams] = useSearchParams();
  const [dades, setDades] = useState(() => {
    const tipusInicial = searchParams.get('tipus') || TIPUS_MOVIMENT.INGRES;
    const categoriaInicial = searchParams.get('categoria');
    const disponibles = categoriesDisponibles(tipusInicial);
    return {
      data: !editant ? (searchParams.get('data') ?? '') : '',
      concepte: !editant ? (searchParams.get('concepte') ?? '') : '',
      tipus: tipusInicial,
      categoria: categoriaInicial && disponibles.includes(categoriaInicial) ? categoriaInicial : disponibles[0],
      metodePagament: METODES_INGRES[0],
      direccio: DIRECCIONS_TRASPAS[0],
      preuUnitari: !editant ? (searchParams.get('preuUnitari') ?? '') : '',
      quantitat: !editant ? (searchParams.get('quantitat') ?? '1') : '1',
      sessionId: editant ? '' : (searchParams.get('sessionId') ?? ''),
    };
  });
  const [sessions, setSessions] = useState([]);
  const [carregant, setCarregant] = useState(editant);
  const [error, setError] = useState(null);
  const [desbloquejat, setDesbloquejat] = useState(!editant);
  const navigate = useNavigate();

  useEffect(() => {
    if (!editant) return;
    getDoc(doc(db, 'moviments', id)).then((snap) => {
      const dadesDoc = snap.data();
      if (!dadesDoc) {
        navigate(ROUTES.COMPTABILITAT, { replace: true });
        return;
      }
      setDades((d) => ({
        ...d,
        ...dadesDoc,
        preuUnitari: String(dadesDoc.preuUnitari ?? ''),
        quantitat: String(dadesDoc.quantitat ?? '1'),
        sessionId: dadesDoc.sessionId ?? '',
      }));
      setCarregant(false);
    });
  }, [id, editant, navigate]);

  useEffect(() => {
    getDocs(collection(db, 'sessions')).then((snap) => {
      setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const handleChange = (camp) => (e) => {
    setDades((d) => ({ ...d, [camp]: e.target.value }));
  };

  const handleCanviTipus = (e) => {
    const nouTipus = e.target.value;
    setDades((d) => {
      if (nouTipus === TIPUS_MOVIMENT.TRASPAS) {
        // Un traspàs mou diners entre caixa i banc de l'associació: no té
        // sentit lligar-lo a una sessió concreta.
        return { ...d, tipus: nouTipus, direccio: d.direccio || DIRECCIONS_TRASPAS[0], sessionId: '' };
      }
      const metodes = nouTipus === TIPUS_MOVIMENT.DESPESA ? METODES_DESPESA : METODES_INGRES;
      const disponibles = categoriesDisponibles(nouTipus, d.categoria);
      return {
        ...d,
        tipus: nouTipus,
        categoria: disponibles.includes(d.categoria) ? d.categoria : disponibles[0],
        metodePagament: metodes.includes(d.metodePagament) ? d.metodePagament : metodes[0],
      };
    });
  };

  const handleCanviPreuUnitari = (e) => {
    const valor = e.target.value;
    setDades((d) => ({ ...d, preuUnitari: valor }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (dades.categoria === 'Gestió pel·lícules' && !dades.sessionId) {
      setError('Un moviment de "Gestió pel·lícules" ha d\'estar vinculat a una sessió.');
      return;
    }
    try {
      const quantitatNum = Number(dades.quantitat) || 0;
      const preuUnitariNum = Number(dades.preuUnitari) || 0;
      const totalNum = calcularTotal(preuUnitariNum, quantitatNum);
      const base = {
        data: dades.data,
        concepte: dades.concepte,
        tipus: dades.tipus,
        preuUnitari: preuUnitariNum,
        quantitat: quantitatNum,
        total: totalNum,
        sessionId: dades.tipus === TIPUS_MOVIMENT.TRASPAS ? '' : (dades.sessionId || ''),
        // numeroSoci no és un camp editable en aquest formulari, però si el
        // moviment ja en tenia un (creat des de "Registrar pagament" d'un
        // soci) l'hem de conservar explícitament: `moviment` es desa sencer
        // amb setDoc (no merge), així que qualsevol camp no llistat aquí es
        // perdria en desar.
        ...(dades.numeroSoci != null ? { numeroSoci: dades.numeroSoci } : {}),
      };
      const moviment = dades.tipus === TIPUS_MOVIMENT.TRASPAS
        ? { ...base, direccio: dades.direccio }
        : { ...base, categoria: dades.categoria, metodePagament: dades.metodePagament };
      // `moviment` és sempre el document sencer per al tipus actual: se sobreescriu
      // amb setDoc (no merge) perquè un canvi de tipus no deixi camps obsolets
      // (categoria/metodePagament/direccio) del tipus anterior.
      if (editant) {
        await setDoc(doc(db, 'moviments', id), moviment);
      } else {
        await addDoc(collection(db, 'moviments'), moviment);
      }
      if (moviment.numeroSoci != null) {
        await sincronitzarUltimPagament(Number(moviment.numeroSoci));
      }
      navigate(ROUTES.COMPTABILITAT);
    } catch {
      setError("No s'ha pogut desar. Torna-ho a provar.");
    }
  };

  const handleEliminar = async () => {
    const confirmat = window.confirm('Segur que vols eliminar aquest moviment? Aquesta acció no es pot desfer.');
    if (!confirmat) return;
    setError(null);
    try {
      await deleteDoc(doc(db, 'moviments', id));
      if (dades.numeroSoci != null) {
        await sincronitzarUltimPagament(Number(dades.numeroSoci));
      }
      navigate(ROUTES.COMPTABILITAT);
    } catch {
      setError("No s'ha pogut desar. Torna-ho a provar.");
    }
  };

  if (carregant) return <Carregant />;

  const metodes = dades.tipus === TIPUS_MOVIMENT.DESPESA ? METODES_DESPESA : METODES_INGRES;
  const sessioObligatoria = dades.categoria === 'Gestió pel·lícules';
  // Un moviment de "Quotes socis" ja existent no pot canviar de tipus ni de
  // categoria: si està malament, cal esborrar-lo i crear-ne un de nou des de
  // "Registrar pagament" (l'únic flux que en sap el numeroSoci).
  const tipusICategoriaBloquejats = editant && dades.categoria === 'Quotes socis';
  // Si s'ha arribat aquí amb una sessió ja triada per l'URL (des del botó
  // "Afegir moviment" de la fitxa d'una sessió concreta), no té sentit
  // permetre canviar-la: era precisament el motiu d'obrir el formulari.
  const sessioPreseleccionada = !editant && Boolean(searchParams.get('sessionId'));

  return (
    <form className="moviment-form" onSubmit={handleSubmit}>
      <div className="moviment-form__capcalera">
        <h1 className="moviment-form__titol">{editant ? 'Editar moviment' : 'Afegir moviment'}</h1>
        {editant && !desbloquejat && <BotoEditar onClick={() => setDesbloquejat(true)} />}
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="data">Data</label>
        <input id="data" type="date" className={desbloquejat ? 'form__input' : 'form__input form__input--nomes-lectura'} value={dades.data} onChange={handleChange('data')} readOnly={!desbloquejat} />
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="concepte">Concepte</label>
        <input id="concepte" className={desbloquejat ? 'form__input' : 'form__input form__input--nomes-lectura'} value={dades.concepte} onChange={handleChange('concepte')} readOnly={!desbloquejat} />
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="tipus">Tipus</label>
        <select id="tipus" className={desbloquejat && !tipusICategoriaBloquejats ? 'form__input' : 'form__input form__input--nomes-lectura'} value={dades.tipus} onChange={handleCanviTipus} disabled={!desbloquejat || tipusICategoriaBloquejats}>
          <option value={TIPUS_MOVIMENT.INGRES}>Ingrés</option>
          <option value={TIPUS_MOVIMENT.DESPESA}>Despesa</option>
          <option value={TIPUS_MOVIMENT.TRASPAS}>Traspàs</option>
        </select>
      </div>

      {dades.tipus === TIPUS_MOVIMENT.TRASPAS ? (
        <div className="form__field">
          <label className="form__label" htmlFor="direccio">Direcció</label>
          <select id="direccio" className={desbloquejat ? 'form__input' : 'form__input form__input--nomes-lectura'} value={dades.direccio} onChange={handleChange('direccio')} disabled={!desbloquejat}>
            {DIRECCIONS_TRASPAS.map((d) => (
              <option key={d} value={d}>{ETIQUETES_DIRECCIO[d]}</option>
            ))}
          </select>
        </div>
      ) : (
        <>
          <div className="form__field">
            <label className="form__label" htmlFor="categoria">Categoria</label>
            <select id="categoria" className={desbloquejat && !tipusICategoriaBloquejats ? 'form__input' : 'form__input form__input--nomes-lectura'} value={dades.categoria} onChange={handleChange('categoria')} disabled={!desbloquejat || tipusICategoriaBloquejats}>
              {categoriesDisponibles(dades.tipus, dades.categoria).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="form__field">
            <label className="form__label" htmlFor="metodePagament">Mètode de pagament</label>
            <select id="metodePagament" className={desbloquejat ? 'form__input' : 'form__input form__input--nomes-lectura'} value={dades.metodePagament} onChange={handleChange('metodePagament')} disabled={!desbloquejat}>
              {metodes.map((m) => (
                <option key={m} value={m}>{ETIQUETES_METODE[m]}</option>
              ))}
            </select>
          </div>
        </>
      )}

      {dades.tipus !== TIPUS_MOVIMENT.TRASPAS && (
        <div className="form__field">
          <label className="form__label" htmlFor="sessionId">
            {sessioObligatoria ? 'Sessió (pel·lícula)' : 'Sessió (opcional)'}
          </label>
          <select id="sessionId" className={desbloquejat && !sessioPreseleccionada ? 'form__input' : 'form__input form__input--nomes-lectura'} value={dades.sessionId} onChange={handleChange('sessionId')} disabled={!desbloquejat || sessioPreseleccionada}>
            {!sessioObligatoria && <option value="">Moviment general de l'associació</option>}
            {sessioObligatoria && !dades.sessionId && <option value="">Selecciona una pel·lícula…</option>}
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>{s.titol}</option>
            ))}
          </select>
        </div>
      )}

      <div className="form__field">
        <label className="form__label" htmlFor="preuUnitari">Preu unitari</label>
        <input id="preuUnitari" type="number" step="0.01" className={desbloquejat ? 'form__input' : 'form__input form__input--nomes-lectura'} value={dades.preuUnitari} onChange={handleCanviPreuUnitari} readOnly={!desbloquejat} />
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="quantitat">Quantitat</label>
        <input id="quantitat" type="number" className={desbloquejat ? 'form__input' : 'form__input form__input--nomes-lectura'} value={dades.quantitat} onChange={handleChange('quantitat')} readOnly={!desbloquejat} />
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="total">Total</label>
        <input
          id="total"
          type="number"
          step="0.01"
          className="form__input form__input--nomes-lectura"
          value={calcularTotal(dades.preuUnitari, dades.quantitat)}
          readOnly
        />
      </div>

      {error && <p className="form__error">{error}</p>}

      {desbloquejat && <button className="btn" type="submit">Desar</button>}
      {editant && desbloquejat && (
        <button className="btn btn--outline" type="button" onClick={handleEliminar}>
          Eliminar
        </button>
      )}
    </form>
  );
}
