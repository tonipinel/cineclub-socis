import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  collection, doc, getDoc, getDocs, query, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import { properNumeroSoci } from '../../lib/numeroSoci';
import {
  METODES_INGRES, ETIQUETES_METODE, TIPUS_MOVIMENT, CATEGORIA_QUOTA_SOCI, TIPUS_QUOTA,
} from '../../lib/moviments';
import { avui, formatData } from '../../lib/data';
import { estaActiu, calcularVenciment } from '../../lib/estatSoci';
import { sincronitzarSociPublic } from '../../lib/propostes';
import Carregant from '../../components/Carregant';

// Entre totes les sessions, la que té la data més propera a avui (abans o
// després): és la millor conjectura per defecte de a quina sessió correspon
// aquest pagament, sense obligar l'usuari a triar-la manualment cada cop.
function sessioMesPropera(sessions, dataAvui) {
  const avuiTime = new Date(dataAvui).getTime();
  let millor = null;
  let millorDiferencia = Infinity;
  for (const s of sessions) {
    if (!s.data) continue;
    const diferencia = Math.abs(new Date(s.data).getTime() - avuiTime);
    if (diferencia < millorDiferencia) {
      millor = s.id;
      millorDiferencia = diferencia;
    }
  }
  return millor;
}

export default function RegistrarPagamentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [soci, setSoci] = useState(null);
  const [carregant, setCarregant] = useState(true);
  const [data, setData] = useState(avui());
  const [importPagament, setImportPagament] = useState('');
  const [metodePagament, setMetodePagament] = useState(METODES_INGRES[0]);
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [esRenovacio, setEsRenovacio] = useState(false);
  const [error, setError] = useState(null);
  const [desant, setDesant] = useState(false);

  useEffect(() => {
    Promise.all([
      getDoc(doc(db, 'socis', id)),
      getDoc(doc(db, 'configuracio', 'associacio')),
      getDocs(collection(db, 'sessions')),
    ]).then(async ([sociSnap, configSnap, sessionsSnap]) => {
      const dadesSoci = sociSnap.data();
      if (!dadesSoci) {
        navigate(ROUTES.SOCIS, { replace: true });
        return;
      }
      const totesSessions = sessionsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // És una renovació si ja té algun moviment de quota (alta o renovació)
      // registrat — no simplement perquè `ultimPagament` estigui fixat: una
      // sol·licitud aprovada ja el fixa sense que encara hi hagi cap
      // moviment real, i aquell primer pagament segueix sent una alta.
      let renovacio = false;
      if (dadesSoci.numeroSoci) {
        const pagamentsExistents = await getDocs(query(
          collection(db, 'moviments'),
          where('numeroSoci', '==', Number(dadesSoci.numeroSoci)),
          where('categoria', '==', CATEGORIA_QUOTA_SOCI)
        ));
        renovacio = pagamentsExistents.docs.length > 0;
      }
      setSoci({ id: sociSnap.id, ...dadesSoci });
      setImportPagament(String(configSnap.data()?.quotaAnual ?? 30));
      setSessions(totesSessions);
      setEsRenovacio(renovacio);
      if (renovacio) {
        // Una renovació no es vincula a cap sessió, i per defecte la data és
        // quan li toca renovar (no avui): així l'ultimPagament avança
        // exactament un any cada cop, encara que el pagament real s'hagi
        // rebut un altre dia.
        setSessionId('');
        if (dadesSoci.ultimPagament) {
          setData(calcularVenciment(dadesSoci).toLocaleDateString('sv-SE'));
        }
      } else {
        setSessionId(sessioMesPropera(totesSessions, avui()) ?? '');
      }
      setCarregant(false);
    });
  }, [id, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!esRenovacio && !sessionId) {
      setError("Una alta nova ha d'estar vinculada a una sessió.");
      return;
    }
    const avisDesactivat = !estaActiu(soci)
      ? ' Atenció: aquest soci està desactivat i continuarà desactivat (el carnet no funcionarà) fins que el reactivis manualment des de la seva fitxa.'
      : '';
    const confirmat = window.confirm(
      `Confirmes que has rebut un pagament de ${importPagament}€ amb data ${formatData(data)}?${avisDesactivat} Aquesta acció no es pot desfer.`
    );
    if (!confirmat) return;
    setDesant(true);
    try {
      // inicPeriode (des de quan compta el seu any de soci) es neteja en
      // cada pagament nou: es torna a fixar al proper escaneig, respecte a
      // aquest pagament — si no, quedaria el valor obsolet del cicle anterior.
      const actualitzacioSoci = { ultimPagament: data, estatManual: null, inicPeriode: null };
      if (!soci.numeroSoci) {
        const socisExistents = await getDocs(collection(db, 'socis'));
        actualitzacioSoci.numeroSoci = properNumeroSoci(socisExistents.docs.map((d) => d.data().numeroSoci));
      }
      const numeroSoci = Number(actualitzacioSoci.numeroSoci ?? soci.numeroSoci);
      const total = Number(importPagament) || 0;
      const batch = writeBatch(db);
      batch.update(doc(db, 'socis', id), actualitzacioSoci);
      if (estaActiu(soci)) {
        sincronitzarSociPublic(batch, db, {
          nom: soci.nom, cognoms: soci.cognoms, numeroSoci, tokenCarnet: soci.tokenCarnet,
        });
      }
      batch.set(doc(collection(db, 'moviments')), {
        data,
        concepte: `Quota ${soci.nom} ${soci.cognoms}`,
        tipus: TIPUS_MOVIMENT.INGRES,
        categoria: CATEGORIA_QUOTA_SOCI,
        tipusQuota: esRenovacio ? TIPUS_QUOTA.RENOVACIO : TIPUS_QUOTA.ALTA,
        metodePagament,
        numeroSoci,
        preuUnitari: total,
        quantitat: 1,
        total,
        sessionId: esRenovacio ? '' : sessionId,
      });
      await batch.commit();
      navigate(ROUTES.SOCIS_EDITAR.replace(':id', id));
    } catch {
      setDesant(false);
      setError("No s'ha pogut desar. Torna-ho a provar.");
    }
  };

  if (carregant) return <Carregant />;

  return (
    <form className="pagament-form" onSubmit={handleSubmit}>
      <h1 className="pagament-form__titol">Registrar pagament</h1>
      <p className="pagament-form__soci">{soci.nom} {soci.cognoms}</p>

      {!estaActiu(soci) && (
        <p className="pagament-form__avis">
          Aquest soci està desactivat{soci.motiuDesactivacio ? ` (${soci.motiuDesactivacio})` : ''}.
          Registrar el pagament no el reactivarà automàticament.
        </p>
      )}

      <div className="form__field">
        <label className="form__label" htmlFor="data-pagament">Data del pagament</label>
        <input
          id="data-pagament"
          type="date"
          className="form__input"
          value={data}
          onChange={(e) => setData(e.target.value)}
          required
        />
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="import-pagament">Import (€)</label>
        <input
          id="import-pagament"
          type="number"
          step="0.01"
          className="form__input"
          value={importPagament}
          onChange={(e) => setImportPagament(e.target.value)}
          required
        />
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="metode-pagament">Mètode de pagament</label>
        <select
          id="metode-pagament"
          className="form__input"
          value={metodePagament}
          onChange={(e) => setMetodePagament(e.target.value)}
        >
          {METODES_INGRES.map((m) => (
            <option key={m} value={m}>{ETIQUETES_METODE[m]}</option>
          ))}
        </select>
      </div>

      {esRenovacio ? (
        <p className="pagament-form__avis pagament-form__avis--info">
          Aquest és un pagament de renovació: no es vincula a cap sessió.
        </p>
      ) : (
        <div className="form__field">
          <label className="form__label" htmlFor="sessio-pagament">Sessió</label>
          <select
            id="sessio-pagament"
            className="form__input"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
          >
            {!sessionId && <option value="">Selecciona una sessió…</option>}
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>{s.titol}</option>
            ))}
          </select>
        </div>
      )}

      {error && <p className="form__error">{error}</p>}

      <button className="btn" type="submit" disabled={desant}>Registrar pagament</button>
      <Link className="btn btn--outline" to={ROUTES.SOCIS_EDITAR.replace(':id', id)}>Cancel·lar</Link>
    </form>
  );
}
