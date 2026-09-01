import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { addDoc, collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import { teNumeroSoci } from '../../lib/socis';
import {
  calcularEstatSoci, calcularVenciment, estaActiu, ESTAT_AL_DIA, ESTAT_PENDENT, ESTAT_VENCUT, ESTAT_NOU_REGISTRE,
} from '../../lib/estatSoci';
import { assistenciaPerSessio } from '../../lib/escaneig';
import { formatEuros, ETIQUETES_METODE } from '../../lib/moviments';
import { avui } from '../../lib/data';
import Carregant from '../../components/Carregant';
import BotoEditar from '../../components/BotoEditar';
import BotoAfegir from '../../components/BotoAfegir';
import CarnetCard from '../../components/CarnetCard';

const CAMPS_INICIALS = {
  numeroSoci: '', nom: '', cognoms: '', poblacio: '', codiPostal: '',
  telefon: '', correuElectronic: '', dni: '', grupWhatsapp: '',
};

const CAMPS_FORMULARI = [
  ['nom', 'Nom'],
  ['cognoms', 'Cognoms'],
  ['poblacio', 'Població'],
  ['codiPostal', 'Codi postal'],
  ['telefon', 'Telèfon'],
  ['correuElectronic', 'Correu electrònic'],
  ['dni', 'DNI'],
  ['grupWhatsapp', 'Grup WhatsApp'],
];

const ETIQUETES_ESTAT = {
  [ESTAT_AL_DIA]: 'Al dia',
  [ESTAT_PENDENT]: 'Pendent',
  [ESTAT_VENCUT]: 'Vençut',
  [ESTAT_NOU_REGISTRE]: 'Nou registre',
};

const COLOR_ASSISTEIX = '#16a34a';
const COLOR_NO_ASSISTEIX = '#d4d4d4';

function formatData(dataISO) {
  if (!dataISO) return '—';
  const [any, mes, dia] = dataISO.split('-').map(Number);
  return new Date(any, mes - 1, dia).toLocaleDateString('ca-ES');
}

export default function SociForm() {
  const { id } = useParams();
  const editant = Boolean(id);
  const [dades, setDades] = useState(CAMPS_INICIALS);
  const [carregant, setCarregant] = useState(editant);
  const [error, setError] = useState(null);
  const [errorEstat, setErrorEstat] = useState(null);
  const [desbloquejat, setDesbloquejat] = useState(!editant);
  const [assistencies, setAssistencies] = useState([]);
  const [pagaments, setPagaments] = useState([]);
  const [motiuDesactivacio, setMotiuDesactivacio] = useState('');
  const [mostrarFormDesactivacio, setMostrarFormDesactivacio] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!editant) return;
    getDoc(doc(db, 'socis', id)).then((snap) => {
      setDades({ ...CAMPS_INICIALS, ...snap.data() });
      setCarregant(false);
    });
  }, [id, editant]);

  useEffect(() => {
    if (!editant || !dades.numeroSoci) return;
    Promise.all([
      getDocs(collection(db, 'sessions')),
      getDocs(query(collection(db, 'accessLog'), where('numeroSoci', '==', Number(dades.numeroSoci)))),
    ]).then(([sessionsSnap, accessLogSnap]) => {
      const sessions = sessionsSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => s.data <= avui());
      const entradesSoci = accessLogSnap.docs.map((d) => d.data());
      setAssistencies(assistenciaPerSessio(sessions, entradesSoci));
    });
  }, [editant, dades.numeroSoci]);

  useEffect(() => {
    if (!editant || !dades.numeroSoci) return;
    getDocs(query(
      collection(db, 'moviments'),
      where('categoria', '==', 'Quotes socis'),
      where('numeroSoci', '==', Number(dades.numeroSoci))
    )).then((snap) => {
      const llista = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''));
      setPagaments(llista);
    });
  }, [editant, dades.numeroSoci]);

  const handleChange = (camp) => (e) => {
    setDades((d) => ({ ...d, [camp]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      if (editant) {
        await updateDoc(doc(db, 'socis', id), dades);
      } else {
        const data = avui();
        await addDoc(collection(db, 'socis'), {
          ...dades,
          dataAlta: data,
          ultimPagament: data,
          actiu: true,
        });
      }
      navigate(ROUTES.SOCIS);
    } catch {
      setError("No s'ha pogut desar. Torna-ho a provar.");
    }
  };

  const handleDesactivar = async () => {
    if (!motiuDesactivacio.trim()) {
      setErrorEstat('Cal indicar el motiu de la desactivació.');
      return;
    }
    const confirmat = window.confirm(
      "Segur que vols desactivar aquest soci? El seu carnet deixarà de funcionar a l'escaneig."
    );
    if (!confirmat) return;
    setErrorEstat(null);
    try {
      const actualitzacio = { actiu: false, motiuDesactivacio: motiuDesactivacio.trim(), dataDesactivacio: avui() };
      await updateDoc(doc(db, 'socis', id), actualitzacio);
      setDades((d) => ({ ...d, ...actualitzacio }));
      setMotiuDesactivacio('');
      setMostrarFormDesactivacio(false);
    } catch {
      setErrorEstat("No s'ha pogut desar. Torna-ho a provar.");
    }
  };

  const handleReactivar = async () => {
    const confirmat = window.confirm('Segur que vols reactivar aquest soci?');
    if (!confirmat) return;
    setErrorEstat(null);
    try {
      const actualitzacio = { actiu: true, motiuDesactivacio: null, dataDesactivacio: null };
      await updateDoc(doc(db, 'socis', id), actualitzacio);
      setDades((d) => ({ ...d, ...actualitzacio }));
    } catch {
      setErrorEstat("No s'ha pogut desar. Torna-ho a provar.");
    }
  };

  if (carregant) return <Carregant />;

  const estatSoci = dades.ultimPagament ? calcularEstatSoci(dades) : ESTAT_NOU_REGISTRE;
  const venciment = dades.ultimPagament ? calcularVenciment(dades) : null;
  const sessionsAssistides = assistencies.filter((s) => s.assisteix);
  const sessionsNoAssistides = assistencies.filter((s) => !s.assisteix);
  const pagamentActual = pagaments[0] ?? null;
  const sessionsPeriodeActual = dades.ultimPagament
    ? sessionsAssistides.filter((s) => s.data >= dades.ultimPagament)
    : [];
  const sessionsNoAssistidesPeriodeActual = dades.ultimPagament
    ? sessionsNoAssistides.filter((s) => s.data >= dades.ultimPagament)
    : [];
  const costPerSessio = pagamentActual && sessionsPeriodeActual.length > 0
    ? pagamentActual.total / sessionsPeriodeActual.length
    : null;
  const dadesGrafic = [
    { name: 'Hi ha assistit', value: sessionsPeriodeActual.length, color: COLOR_ASSISTEIX },
    { name: 'No hi ha assistit', value: sessionsNoAssistidesPeriodeActual.length, color: COLOR_NO_ASSISTEIX },
  ].filter((d) => d.value > 0);

  return (
    <>
      <div className="soci-form-pagina">
        <form className="soci-form" onSubmit={handleSubmit}>
          <div className="soci-form__capcalera">
            <h1 className="soci-form__titol">{editant ? 'Fitxa del soci/a' : "Donar d'alta un/a soci/a"}</h1>
            {editant && !desbloquejat && <BotoEditar onClick={() => setDesbloquejat(true)} />}
          </div>

          {editant && (
            <div className="soci-form__dades-clau">
              <p className="soci-form__numero">
                Número de soci/a: {dades.numeroSoci || "pendent d'assignar"}
              </p>
              <p className="soci-form__data-clau">Data de sol·licitud: {formatData(dades.dataAlta)}</p>
              <p className="soci-form__data-clau">Últim pagament: {formatData(dades.ultimPagament)}</p>
              {venciment && (
                <p className="soci-form__data-clau">Venciment de la quota: {venciment.toLocaleDateString('ca-ES')}</p>
              )}
            </div>
          )}

          {CAMPS_FORMULARI.map(([camp, etiqueta]) => (
            <div className="form__field" key={camp}>
              <label className="form__label" htmlFor={camp}>{etiqueta}</label>
              <input
                id={camp}
                className={desbloquejat ? 'form__input' : 'form__input form__input--nomes-lectura'}
                value={dades[camp] ?? ''}
                onChange={handleChange(camp)}
                readOnly={!desbloquejat}
              />
            </div>
          ))}

          {error && <p className="form__error">{error}</p>}

          {desbloquejat && <button className="btn" type="submit">Desar</button>}
        </form>

        {editant && (
          <aside className="soci-form-pagina__accions">
            {teNumeroSoci(dades) && (
              <div className="soci-form-pagina__bloc-accio">
                <h2 className="soci-form-pagina__accions-titol">Carnet</h2>
                <Link className="soci-form-pagina__carnet" to={ROUTES.SOCIS_CARNET.replace(':id', id)}>
                  <CarnetCard soci={dades} />
                </Link>
              </div>
            )}

            <div className="soci-form__bloc">
              <h3 className="soci-form__bloc-titol">Estat del soci</h3>
              <div className="soci-form__llegenda-estat">
                <span className={`badge badge--${estatSoci}`}>{ETIQUETES_ESTAT[estatSoci]}</span>
                <span className={`badge ${!estaActiu(dades) ? 'badge--desactivat' : 'badge--assisteix'}`}>
                  {!estaActiu(dades) ? 'Desactivat' : 'Actiu'}
                </span>
              </div>

              {!estaActiu(dades) ? (
                <>
                  <p className="soci-form__xifra-detall">
                    Desactivat el {formatData(dades.dataDesactivacio)}
                    {dades.motiuDesactivacio ? `: ${dades.motiuDesactivacio}` : ''}
                  </p>
                  <button type="button" className="soci-form__accio-petita" onClick={handleReactivar}>Reactivar soci</button>
                </>
              ) : mostrarFormDesactivacio ? (
                <>
                  <div className="form__field">
                    <label className="form__label" htmlFor="motiu-desactivacio">Motiu de la desactivació</label>
                    <input
                      id="motiu-desactivacio"
                      className="form__input"
                      value={motiuDesactivacio}
                      onChange={(e) => setMotiuDesactivacio(e.target.value)}
                    />
                  </div>
                  <button type="button" className="btn btn--outline" onClick={handleDesactivar}>Confirmar desactivació</button>
                </>
              ) : (
                <button type="button" className="soci-form__accio-petita" onClick={() => setMostrarFormDesactivacio(true)}>
                  Desactivar soci
                </button>
              )}
              {errorEstat && <p className="form__error">{errorEstat}</p>}
            </div>

            {teNumeroSoci(dades) && assistencies.length > 0 && (
              <>
                <div className="soci-form__bloc">
                  <h3 className="soci-form__bloc-titol">Sessions assistides (període actual)</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={dadesGrafic} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                        {dadesGrafic.map((d) => <Cell key={d.name} fill={d.color} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="soci-form__llegenda">
                    <span><span className="soci-form__pastilla" style={{ background: COLOR_ASSISTEIX }} /> Hi ha assistit ({sessionsPeriodeActual.length})</span>
                    <span><span className="soci-form__pastilla" style={{ background: COLOR_NO_ASSISTEIX }} /> No hi ha assistit ({sessionsNoAssistidesPeriodeActual.length})</span>
                  </div>
                </div>
                <div className="soci-form__bloc">
                  <h3 className="soci-form__bloc-titol">Cost per sessió (període actual)</h3>
                  {costPerSessio !== null ? (
                    <>
                      <p className="soci-form__xifra-gran">{formatEuros(costPerSessio)}</p>
                      <p className="soci-form__xifra-detall">
                        {formatEuros(pagamentActual.total)} pagats ÷ {sessionsPeriodeActual.length} {sessionsPeriodeActual.length === 1 ? 'sessió assistida' : 'sessions assistides'} des del {formatData(dades.ultimPagament)}
                      </p>
                    </>
                  ) : !pagamentActual ? (
                    <p className="soci-form__xifra-detall">No hi ha cap pagament de quota registrat.</p>
                  ) : (
                    <p className="soci-form__xifra-detall">Encara no ha assistit a cap sessió des de l'últim pagament.</p>
                  )}
                </div>
              </>
            )}

          </aside>
        )}
      </div>

      {editant && (
        <div className="soci-form__seccio soci-form__seccio--gris">
          <div className="soci-form__contingut">
            <div className="soci-form__seccio-capcalera">
              <h2 className="soci-form__subtitol">Pagaments de la quota</h2>
              <BotoAfegir to={ROUTES.SOCIS_PAGAMENT.replace(':id', id)} etiqueta="Registrar pagament" />
            </div>
            {pagaments.length > 0 ? (
              <ul className="soci-form__llista">
                {pagaments.map((p) => (
                  <li key={p.id} className="soci-form__fila">
                    <Link className="enllac" to={ROUTES.COMPTABILITAT_EDITAR.replace(':id', p.id)}>
                      {formatData(p.data)} — {formatEuros(p.total)} — {ETIQUETES_METODE[p.metodePagament]}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="soci-form__xifra-detall">Encara no hi ha cap pagament registrat.</p>
            )}
          </div>
        </div>
      )}

      {editant && teNumeroSoci(dades) && sessionsPeriodeActual.length > 0 && (
        <div className="soci-form__seccio soci-form__seccio--blanc">
          <div className="soci-form__contingut">
            <h2 className="soci-form__subtitol">Pel·lícules a les que ha assistit (període actual)</h2>
            <div className="soci-form__cartells">
              {sessionsPeriodeActual.map((s) => (
                <Link key={s.id} className="soci-form__cartell" to={ROUTES.SESSIONS_EDITAR.replace(':id', s.id)}>
                  {s.imatgeUrl ? (
                    <img className="soci-form__cartell-imatge" src={s.imatgeUrl} alt={s.titol} />
                  ) : (
                    <div className="soci-form__cartell-placeholder">{s.titol}</div>
                  )}
                  <span className="soci-form__cartell-titol">{s.titol}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {editant && teNumeroSoci(dades) && sessionsNoAssistidesPeriodeActual.length > 0 && (
        <div className="soci-form__seccio soci-form__seccio--gris">
          <div className="soci-form__contingut">
            <h2 className="soci-form__subtitol">Sessions a les que no ha assistit (període actual)</h2>
            <ul className="soci-form__llista">
              {sessionsNoAssistidesPeriodeActual.map((s) => (
                <li key={s.id} className="soci-form__fila">
                  <span>{s.titol}</span>
                  <span>{formatData(s.data)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
