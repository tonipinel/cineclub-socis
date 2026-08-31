import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  addDoc, collection, doc, getDoc, getDocs, onSnapshot, query, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { db } from '../../firebase/firebase';
import { resumAccessLog, entradesPerFranjaHoraria } from '../../lib/escaneig';
import { subtotalsPerMetode, formatEuros, ETIQUETES_METODE } from '../../lib/moviments';
import * as ROUTES from '../../constants/routes';
import Carregant from '../../components/Carregant';

const CAMPS_INICIALS = {
  titol: '', data: '', urlProgramacio: '', imatgeUrl: '', preuEntrada: '5',
};

const CAMPS_FORMULARI = [
  ['titol', 'Títol', 'text'],
  ['data', 'Data', 'date'],
  ['urlProgramacio', 'URL de programació', 'text'],
  ['imatgeUrl', 'URL de la imatge', 'text'],
  ['preuEntrada', "Preu d'entrada (no-socis)", 'text'],
];

const RESUM_INICIAL = { socisDistints: 0, entradesGeneriques: 0, importGeneric: 0 };

function hora(entrada) {
  const data = entrada.timestamp?.toDate?.();
  return data ? data.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' }) : '—';
}

function socisUnics(entradesSocis) {
  const vistos = new Map();
  for (const entrada of entradesSocis) {
    if (!vistos.has(entrada.numeroSoci)) vistos.set(entrada.numeroSoci, entrada);
  }
  return [...vistos.values()];
}

export default function SessionForm() {
  const { id } = useParams();
  const editant = Boolean(id);
  const [dades, setDades] = useState(CAMPS_INICIALS);
  const [carregant, setCarregant] = useState(editant);
  const [error, setError] = useState(null);
  const [desbloquejat, setDesbloquejat] = useState(!editant);
  const [resum, setResum] = useState(RESUM_INICIAL);
  const [subtotals, setSubtotals] = useState({});
  const [entradesAccessLog, setEntradesAccessLog] = useState([]);
  const [socisPerNumero, setSocisPerNumero] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    if (!editant) return;
    getDoc(doc(db, 'sessions', id)).then((snap) => {
      setDades({ ...CAMPS_INICIALS, ...snap.data() });
      setCarregant(false);
    });
  }, [id, editant]);

  useEffect(() => {
    if (!editant) return;
    const q = query(collection(db, 'accessLog'), where('sessionId', '==', id));
    return onSnapshot(q, (snap) => {
      const entrades = snap.docs.map((d) => d.data());
      setResum(resumAccessLog(entrades));
      setEntradesAccessLog(entrades);
    });
  }, [id, editant]);

  useEffect(() => {
    if (!editant) return;
    const q = query(collection(db, 'moviments'), where('sessionId', '==', id));
    return onSnapshot(q, (snap) => {
      setSubtotals(subtotalsPerMetode(snap.docs.map((d) => d.data())));
    });
  }, [id, editant]);

  useEffect(() => {
    if (!editant) return;
    getDocs(collection(db, 'socis')).then((snap) => {
      const mapa = {};
      snap.docs.forEach((d) => {
        const soci = d.data();
        if (soci.numeroSoci) mapa[soci.numeroSoci] = { id: d.id, nom: soci.nom, cognoms: soci.cognoms };
      });
      setSocisPerNumero(mapa);
    });
  }, [editant]);

  const handleChange = (camp) => (e) => {
    setDades((d) => ({ ...d, [camp]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      // El camp `activa` és exclusiu de "Marcar com a activa" (handleMarcarActiva):
      // un "Desar" normal mai l'ha de sobreescriure amb l'estat local, que pot
      // haver quedat desactualitzat si s'ha activat una altra sessió mentre
      // aquest formulari estava obert.
      const { activa: _activaActual, ...dadesADesar } = {
        ...dades,
        preuEntrada: Number(dades.preuEntrada) || 0,
      };
      if (editant) {
        await updateDoc(doc(db, 'sessions', id), dadesADesar);
      } else {
        await addDoc(collection(db, 'sessions'), { ...dadesADesar, activa: false });
      }
      navigate(ROUTES.SESSIONS);
    } catch {
      setError("No s'ha pogut desar. Torna-ho a provar.");
    }
  };

  const handleMarcarActiva = async () => {
    setError(null);
    try {
      const activesAbans = await getDocs(query(collection(db, 'sessions'), where('activa', '==', true)));
      const batch = writeBatch(db);
      activesAbans.docs.forEach((docActiu) => batch.update(docActiu.ref, { activa: false }));
      batch.update(doc(db, 'sessions', id), { activa: true });
      await batch.commit();
      setDades((d) => ({ ...d, activa: true }));
    } catch {
      setError("No s'ha pogut desar. Torna-ho a provar.");
    }
  };

  if (carregant) return <Carregant />;

  const entradesOrdenades = [...entradesAccessLog].sort(
    (a, b) => (a.timestamp?.toDate?.() ?? 0) - (b.timestamp?.toDate?.() ?? 0)
  );
  const entradesSocis = socisUnics(entradesOrdenades.filter((e) => e.tipus === 'soci'));
  const entradesAportacions = entradesOrdenades.filter((e) => e.tipus === 'generic');
  const franges = entradesPerFranjaHoraria(entradesAccessLog);

  return (
    <form className="session-form" onSubmit={handleSubmit}>
      <div className="session-form__capcalera">
        <h1 className="session-form__titol">{editant ? 'Editar sessió' : 'Nova sessió'}</h1>
        {editant && !dades.activa && (
          <button type="button" className="btn btn--outline" onClick={handleMarcarActiva}>
            Marcar com a activa
          </button>
        )}
        {editant && dades.activa && <p className="session-form__activa">Aquesta sessió és l'activa.</p>}
      </div>

      <div className="session-form__graella">
        <div className="session-form__columna">
          {CAMPS_FORMULARI.map(([camp, etiqueta, tipus]) => (
            <div className="form__field" key={camp}>
              <label className="form__label" htmlFor={camp}>{etiqueta}</label>
              <input
                id={camp}
                type={tipus}
                className={desbloquejat ? 'form__input' : 'form__input form__input--nomes-lectura'}
                value={dades[camp] ?? ''}
                onChange={handleChange(camp)}
                readOnly={!desbloquejat}
              />
            </div>
          ))}

          {error && <p className="form__error">{error}</p>}

          {desbloquejat && <button className="btn" type="submit">Desar</button>}

          {editant && !desbloquejat && (
            <button type="button" className="btn btn--outline" onClick={() => setDesbloquejat(true)}>
              Editar dades
            </button>
          )}

          {editant && dades.urlProgramacio && (
            <a className="session-form__enllac" href={dades.urlProgramacio} target="_blank" rel="noopener noreferrer">
              Veure la programació →
            </a>
          )}

          {editant && (
            <div className="session-form__resum">
              <p>Socis diferents: {resum.socisDistints}</p>
              <p>Aportacions: {resum.entradesGeneriques}</p>
              <p>Import d'aportacions acumulat: {resum.importGeneric}€</p>
            </div>
          )}

          {editant && (
            <div className="session-form__resum">
              <h2 className="session-form__desglossament-titol">Desglossament econòmic</h2>
              {Object.keys(subtotals).length === 0 && <p>Encara no hi ha cap moviment d'aquesta sessió.</p>}
              {Object.entries(subtotals).map(([metode, total]) => (
                <p key={metode}>{ETIQUETES_METODE[metode] ?? metode}: {formatEuros(total)}</p>
              ))}
              <Link className="btn btn--outline" to={`${ROUTES.COMPTABILITAT_NOU}?sessionId=${id}`}>
                Afegir moviment d'aquesta sessió
              </Link>
            </div>
          )}
        </div>

        {editant && (
          <div className="session-form__columna">
            {franges.length > 0 && (
              <div className="session-form__bloc">
                <h2 className="session-form__desglossament-titol">Entrades per franja horària</h2>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={franges}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="franja" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} width={24} />
                    <Tooltip />
                    <Bar dataKey="total" fill="#BF9000" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="session-form__bloc">
              <h2 className="session-form__desglossament-titol">Socis que han vingut</h2>
              {entradesSocis.length === 0 && <p>Encara no ha vingut cap soci.</p>}
              <ul className="session-form__llista">
                {entradesSocis.map((entrada) => {
                  const soci = socisPerNumero[entrada.numeroSoci];
                  return (
                    <li key={entrada.numeroSoci} className="session-form__fila">
                      {soci ? (
                        <Link className="enllac" to={ROUTES.SOCIS_EDITAR.replace(':id', soci.id)}>{soci.nom} {soci.cognoms}</Link>
                      ) : (
                        <span>Soci núm. {entrada.numeroSoci}</span>
                      )}
                      <span className="session-form__hora">{hora(entrada)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="session-form__bloc">
              <h2 className="session-form__desglossament-titol">Aportacions</h2>
              {entradesAportacions.length === 0 && <p>Encara no hi ha cap aportació.</p>}
              <ul className="session-form__llista">
                {entradesAportacions.map((entrada, i) => (
                  <li key={`${entrada.codiTiquet}-${i}`} className="session-form__fila">
                    <span>{entrada.codiTiquet}</span>
                    <span>{formatEuros(entrada.preuAplicat)}</span>
                    <span className="session-form__hora">{hora(entrada)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}
