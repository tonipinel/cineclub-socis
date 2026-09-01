import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import { properNumeroSoci } from '../../lib/numeroSoci';
import { METODES_INGRES, ETIQUETES_METODE, TIPUS_MOVIMENT } from '../../lib/moviments';
import { avui } from '../../lib/data';
import { estaActiu } from '../../lib/estatSoci';
import Carregant from '../../components/Carregant';

export default function RegistrarPagamentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [soci, setSoci] = useState(null);
  const [carregant, setCarregant] = useState(true);
  const [data, setData] = useState(avui());
  const [importPagament, setImportPagament] = useState('');
  const [metodePagament, setMetodePagament] = useState(METODES_INGRES[0]);
  const [error, setError] = useState(null);
  const [desant, setDesant] = useState(false);

  useEffect(() => {
    Promise.all([
      getDoc(doc(db, 'socis', id)),
      getDoc(doc(db, 'configuracio', 'associacio')),
    ]).then(([sociSnap, configSnap]) => {
      const dadesSoci = sociSnap.data();
      if (!dadesSoci) {
        navigate(ROUTES.SOCIS, { replace: true });
        return;
      }
      setSoci({ id: sociSnap.id, ...dadesSoci });
      setImportPagament(String(configSnap.data()?.quotaAnual ?? 30));
      setCarregant(false);
    });
  }, [id, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const avisDesactivat = !estaActiu(soci)
      ? ' Atenció: aquest soci està desactivat i continuarà desactivat (el carnet no funcionarà) fins que el reactivis manualment des de la seva fitxa.'
      : '';
    const confirmat = window.confirm(
      `Confirmes que has rebut un pagament de ${importPagament}€ amb data ${data}?${avisDesactivat} Aquesta acció no es pot desfer.`
    );
    if (!confirmat) return;
    setError(null);
    setDesant(true);
    try {
      const actualitzacioSoci = { ultimPagament: data, estatManual: null };
      if (!soci.numeroSoci) {
        const socisExistents = await getDocs(collection(db, 'socis'));
        actualitzacioSoci.numeroSoci = properNumeroSoci(socisExistents.docs.map((d) => d.data().numeroSoci));
      }
      const numeroSoci = Number(actualitzacioSoci.numeroSoci ?? soci.numeroSoci);
      const total = Number(importPagament) || 0;
      const batch = writeBatch(db);
      batch.update(doc(db, 'socis', id), actualitzacioSoci);
      batch.set(doc(collection(db, 'moviments')), {
        data,
        concepte: `Quota ${soci.nom} ${soci.cognoms}`,
        tipus: TIPUS_MOVIMENT.INGRES,
        categoria: 'Quotes socis',
        metodePagament,
        numeroSoci,
        preuUnitari: total,
        quantitat: 1,
        total,
        sessionId: '',
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

      {error && <p className="form__error">{error}</p>}

      <button className="btn" type="submit" disabled={desant}>Registrar pagament</button>
      <Link className="btn btn--outline" to={ROUTES.SOCIS_EDITAR.replace(':id', id)}>Cancel·lar</Link>
    </form>
  );
}
