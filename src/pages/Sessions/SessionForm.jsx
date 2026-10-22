import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  addDoc, collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { db } from '../../firebase/firebase';
import {
  afegirAlias, camiPublic, ERROR_DESCRIPCIO, formulariAPublica, marcarActualitzada, netejarPublica, publicaAFormulari, urlPublica, validarPublicable,
} from '../../lib/sessioPublica';
import { resumAccessLog, entradesPerFranjaHorariaFixa } from '../../lib/escaneig';
import {
  resumEconomicSessio, ordenarMoviments, formatEuros, classeSigne, ETIQUETES_METODE, ETIQUETES_TIPUS,
} from '../../lib/moviments';
import { formatData } from '../../lib/data';
import { imatgeDeSessio, sessionsAmbControl } from '../../lib/sessions';
import * as ROUTES from '../../constants/routes';
import Carregant from '../../components/Carregant';
import BotoEditar from '../../components/BotoEditar';
import BotoAfegir from '../../components/BotoAfegir';
import EstrellaActiva from '../../components/EstrellaActiva';
import PaginaPublicaSessio from './PaginaPublicaSessio';

const CAMPS_INICIALS = {
  titol: '', data: '', hora: '19:00', urlProgramacio: '', imatgeUrl: '',
};

const CAMPS_FORMULARI = [
  ['titol', 'Títol', 'text'],
  ['data', 'Data', 'date'],
  ['hora', "Hora d'inici", 'time'],
  ['urlProgramacio', 'URL de programació', 'text'],
  ['imatgeUrl', 'URL de la imatge de reserva (si no hi ha cartell públic)', 'text'],
];

const RESUM_INICIAL = { socisDistints: 0, entradesGeneriques: 0, importGeneric: 0 };

function IconaActiva() {
  return (
    <svg
      className="btn-icona__icona"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7Z" />
    </svg>
  );
}

const MISSATGE_ALIAS = "Això trencarà l'URL anterior; s'afegirà com a alias perquè continuï funcionant.";

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const sessionsDe = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

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

function comparativa(actual, anterior) {
  if (anterior == null) return null;
  const diferencia = actual - anterior;
  if (diferencia === 0) return { text: '0', classe: '' };
  return {
    text: `${diferencia > 0 ? '▲' : '▼'} ${Math.abs(diferencia)}`,
    classe: diferencia > 0 ? 'comptabilitat__valor--positiu' : 'comptabilitat__valor--negatiu',
  };
}

export default function SessionForm() {
  const { id } = useParams();
  const editant = Boolean(id);
  const [dades, setDades] = useState(CAMPS_INICIALS);
  const [original, setOriginal] = useState({});
  const [publicaForm, setPublicaForm] = useState(() => publicaAFormulari(undefined));
  const [publicaInicial, setPublicaInicial] = useState(publicaForm);
  const [publicaOberta, setPublicaOberta] = useState(false);
  const [altresSessions, setAltresSessions] = useState([]);
  const [errorsPublica, setErrorsPublica] = useState({});
  const [carregant, setCarregant] = useState(editant);
  const [error, setError] = useState(null);
  const [desbloquejat, setDesbloquejat] = useState(!editant);
  const [resum, setResum] = useState(RESUM_INICIAL);
  const [resumAnterior, setResumAnterior] = useState(null);
  const [resumEconomic, setResumEconomic] = useState(resumEconomicSessio([]));
  const [moviments, setMoviments] = useState([]);
  const [entradesAccessLog, setEntradesAccessLog] = useState([]);
  const [socisPerNumero, setSocisPerNumero] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    if (!editant) return;
    getDoc(doc(db, 'sessions', id)).then((snap) => {
      const { publica, ...sessio } = snap.data();
      const form = publicaAFormulari(publica);
      setOriginal(snap.data());
      setDades({ ...CAMPS_INICIALS, ...sessio });
      setPublicaForm(form);
      setPublicaInicial(form);
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
      const dades = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setResumEconomic(resumEconomicSessio(dades));
      setMoviments(dades);
    });
  }, [id, editant]);

  useEffect(() => {
    if (!editant || !dades.data) return;
    let cancelat = false;
    const q = query(collection(db, 'sessions'), where('data', '<', dades.data), orderBy('data', 'desc'));
    getDocs(q).then(async (snap) => {
      const anterior = sessionsAmbControl(snap.docs.map((d) => ({ id: d.id, ...d.data() })))[0];
      if (!anterior) {
        if (!cancelat) setResumAnterior(null);
        return;
      }
      const logSnap = await getDocs(query(collection(db, 'accessLog'), where('sessionId', '==', anterior.id)));
      if (!cancelat) setResumAnterior(resumAccessLog(logSnap.docs.map((d) => d.data())));
    });
    return () => { cancelat = true; };
  }, [editant, dades.data]);

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

  useEffect(() => {
    if (!publicaOberta) return;
    getDocs(collection(db, 'sessions')).then((snap) => setAltresSessions(sessionsDe(snap)));
  }, [publicaOberta]);

  const handleChange = (camp) => (e) => {
    setDades((d) => ({ ...d, [camp]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setErrorsPublica({});
    const publicaCanviada = !igual(publicaForm, publicaInicial);
    const conversio = formulariAPublica(publicaForm);
    // La fitxa pública desada sense tocar no bloqueja res (p. ex. una descripció llarga migrada de Hugo).
    const errors = publicaCanviada ? conversio.errors : {};
    let publica = publicaCanviada ? netejarPublica({ ...original.publica, ...conversio.publica }) : original.publica;
    const nou = { ...dades };
    const publicaPerPrimerCop = nou.publicada && !original.publicada;
    if (publicaPerPrimerCop && conversio.avisos.descripcio) errors.descripcio = ERROR_DESCRIPCIO;
    if (nou.publicada) {
      const altres = sessionsDe(await getDocs(collection(db, 'sessions')));
      const validacio = validarPublicable({ ...nou, id, publica: publica ?? {} }, altres);
      if (!validacio.valid) errors.publicar = validacio.errors;
    }
    if (Object.keys(errors).length > 0) {
      setErrorsPublica(errors);
      setPublicaOberta(true);
      setError('Revisa la pàgina pública: hi ha errors.');
      return;
    }
    const camiAntic = original.publicada ? camiPublic(original.data, original.slug) : '';
    const camiCanviat = camiPublic(nou.data, nou.slug) !== camiPublic(original.data, original.slug);
    let aliasNou = false;
    if (nou.publicada && (publicaPerPrimerCop || camiCanviat)) nou.urlProgramacio = urlPublica(nou.data, nou.slug);
    if (camiAntic && camiCanviat) {
      if (!window.confirm(MISSATGE_ALIAS)) return;
      aliasNou = true;
      publica = { ...netejarPublica(publica), aliases: afegirAlias(publica?.aliases, camiAntic) };
    }
    if (publicaCanviada || aliasNou) {
      publica = marcarActualitzada(publica, new Date());
      nou.publica = publica;
      if (publica.cartell && publica.cartell !== original.publica?.cartell) nou.imatgeUrl = publica.cartell;
    }
    try {
      // El camp `activa` és exclusiu de "Marcar com a activa" (handleMarcarActiva):
      // un "Desar" normal mai l'ha de sobreescriure amb l'estat local, que pot
      // haver quedat desactualitzat si s'ha activat una altra sessió mentre
      // aquest formulari estava obert.
      const { activa: _activaActual, ...dadesADesar } = nou;
      if (editant) {
        const abans = { ...CAMPS_INICIALS, ...original };
        const canvis = Object.fromEntries(Object.entries(dadesADesar).filter(([camp, valor]) => !igual(valor, abans[camp])));
        await updateDoc(doc(db, 'sessions', id), canvis);
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
  const franges = entradesPerFranjaHorariaFixa(entradesAccessLog, dades.hora);
  const movimentsOrdenats = ordenarMoviments(moviments, { columna: 'data', direccio: 'desc' });
  const totalPersones = resum.socisDistints + resum.entradesGeneriques;
  const totalPersonesAnterior = resumAnterior ? resumAnterior.socisDistints + resumAnterior.entradesGeneriques : null;
  const comparacioSocis = comparativa(resum.socisDistints, resumAnterior?.socisDistints);
  const comparacioAportacions = comparativa(resum.entradesGeneriques, resumAnterior?.entradesGeneriques);
  const comparacioTotal = comparativa(totalPersones, totalPersonesAnterior);
  // Avisem si a la porta s'han escanejat entrades genèriques (no-socis) amb
  // cost però encara no s'ha registrat el moviment d'"Aportacions"
  // corresponent — un oblit fàcil, ja que és un pas manual separat de
  // l'escaneig. Les entrades a 0€ (cortesies, mode prova, etc.) no compten:
  // no generen cap aportació a registrar.
  const entradesAportacio = entradesAccessLog.filter((e) => e.tipus === 'generic' && (e.preuAplicat ?? 0) > 0);
  const importAportacions = entradesAportacio.reduce((total, e) => total + e.preuAplicat, 0);
  const aportacionsPendents = entradesAportacio.length > 0 && !resumEconomic.ingressosPerCategoria['Aportacions'];
  const enllacAfegirAportacions = editant
    ? `${ROUTES.COMPTABILITAT_NOU}?${new URLSearchParams({
      sessionId: id,
      data: dades.data,
      tipus: 'ingres',
      categoria: 'Aportacions',
      concepte: 'Aportacions',
      preuUnitari: String(importAportacions / entradesAportacio.length),
      quantitat: String(entradesAportacio.length),
    })}`
    : '';

  const imatge = imatgeDeSessio({ ...dades, publica: original.publica });

  return (
    <form className="session-form" onSubmit={handleSubmit}>
      <div className="session-form__seccio session-form__seccio--blanc">
        <div className="session-form__contingut">
          <div className="session-form__capcalera session-form__capcalera--principal">
            <h1 className="session-form__titol">
              {editant && dades.activa && <EstrellaActiva className="session-form__estrella" />}
              {editant ? dades.titol : 'Nova sessió'}
            </h1>
            {editant && !dades.activa && !dades.senseControl && (
              <span className="session-form__activar">
                {!dades.data && <span className="session-form__activar-motiu" id="motiu-activar">Cal una data per poder-la activar.</span>}
                <button
                  type="button"
                  className="btn-icona"
                  aria-label="Marcar com a activa"
                  aria-describedby={dades.data ? undefined : 'motiu-activar'}
                  disabled={!dades.data}
                  onClick={handleMarcarActiva}
                >
                  <IconaActiva />
                </button>
              </span>
            )}
          </div>

          <div className="session-form__graella">
            {editant && !desbloquejat && imatge && (
              <div className="session-form__columna">
                {dades.urlProgramacio ? (
                  <a className="session-form__imatge-enllac" href={dades.urlProgramacio} target="_blank" rel="noopener noreferrer">
                    <img className="session-form__imatge" src={imatge} alt={dades.titol} />
                  </a>
                ) : (
                  <img className="session-form__imatge" src={imatge} alt={dades.titol} />
                )}
              </div>
            )}

            <div className="session-form__columna">
              <div className="session-form__capcalera">
                <h2 className="session-form__subtitol">Dades de la sessió</h2>
                {editant && !desbloquejat && <BotoEditar onClick={() => setDesbloquejat(true)} />}
              </div>

              {CAMPS_FORMULARI
                .filter(([camp]) => desbloquejat || (camp !== 'urlProgramacio' && camp !== 'imatgeUrl'))
                .map(([camp, etiqueta, tipus]) => (
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

              {!desbloquejat && error && <p className="form__error" role="alert">{error}</p>}
            </div>
          </div>

          {desbloquejat && (
            <>
              <PaginaPublicaSessio
                obert={publicaOberta}
                onToggle={() => setPublicaOberta((o) => !o)}
                form={publicaForm}
                onCanvi={(camp, valor) => setPublicaForm((f) => ({ ...f, [camp]: valor }))}
                sessio={{ ...dades, id }}
                onCanviSessio={(camp, valor) => setDades((d) => ({ ...d, [camp]: valor }))}
                altresSessions={altresSessions}
                errors={errorsPublica}
                urlPagina={original.publicada ? urlPublica(original.data, original.slug) : ''}
              />
              {error && <p className="form__error" role="alert">{error}</p>}
              <button className="btn session-form__desar" type="submit">Desar</button>
            </>
          )}
        </div>
      </div>

      {editant && !dades.senseControl && (
        <div className="session-form__seccio session-form__seccio--gris">
          <div className="session-form__contingut session-form__graella--3">
            <div className="session-form__bloc">
              <h2 className="session-form__desglossament-titol">Resum d'assistència</h2>
              <div className="session-form__estadistiques">
                <div className="session-form__estadistica-fila">
                  <span className="session-form__xifra-etiqueta">Socis</span>
                  <span className="session-form__estadistica-valors">
                    <span className="session-form__xifra">{resum.socisDistints}</span>
                    {comparacioSocis && (
                      <span className={`session-form__xifra-comparativa ${comparacioSocis.classe}`}>{comparacioSocis.text}</span>
                    )}
                  </span>
                </div>
                <div className="session-form__estadistica-fila">
                  <span className="session-form__xifra-etiqueta">No Socis</span>
                  <span className="session-form__estadistica-valors">
                    <span className="session-form__xifra">{resum.entradesGeneriques}</span>
                    {comparacioAportacions && (
                      <span className={`session-form__xifra-comparativa ${comparacioAportacions.classe}`}>{comparacioAportacions.text}</span>
                    )}
                  </span>
                </div>
                <div className="session-form__estadistica-fila">
                  <span className="session-form__xifra-etiqueta">Total persones</span>
                  <span className="session-form__estadistica-valors">
                    <span className="session-form__xifra">{totalPersones}</span>
                    {comparacioTotal && (
                      <span className={`session-form__xifra-comparativa ${comparacioTotal.classe}`}>{comparacioTotal.text}</span>
                    )}
                  </span>
                </div>
              </div>
            </div>

            <div className="session-form__bloc">
              <h2 className="session-form__desglossament-titol">Entrades per franja horària</h2>
              <ResponsiveContainer width="100%" height={Math.max(280, franges.length * 42)}>
                <BarChart data={franges} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis dataKey="franja" type="category" tick={{ fontSize: 11 }} width={50} />
                  <Tooltip />
                  <Bar dataKey="total" fill="#BF9000" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="session-form__bloc">
              <h2 className="session-form__desglossament-titol">Desglossament econòmic</h2>
              {Object.keys(resumEconomic.ingressosPerCategoria).length === 0 && resumEconomic.despesesTotal === 0 && (
                <p>Sense moviments encara.</p>
              )}
              {Object.entries(resumEconomic.ingressosPerCategoria).map(([categoria, grup]) => (
                <div key={categoria}>
                  <div className="session-form__desglossament-fila session-form__desglossament-fila--categoria">
                    <span>{categoria}</span>
                    <span className="comptabilitat__valor--positiu">+{formatEuros(grup.total)}</span>
                  </div>
                  {grup.detalls.map((detall) => (
                    <div key={`${detall.preuUnitari}-${detall.metode}`} className="session-form__desglossament-fila session-form__desglossament-fila--submetode">
                      <span>
                        {formatEuros(detall.preuUnitari)} × {detall.quantitat} · {ETIQUETES_METODE[detall.metode] ?? detall.metode}
                      </span>
                      <span>+{formatEuros(detall.total)}</span>
                    </div>
                  ))}
                </div>
              ))}
              {resumEconomic.despesesTotal > 0 && (
                <div className="session-form__desglossament-fila">
                  <span>Despeses</span>
                  <span className="comptabilitat__valor--negatiu">−{formatEuros(resumEconomic.despesesTotal)}</span>
                </div>
              )}
              <div className="session-form__desglossament-total">
                <span>Balanç</span>
                <span className={classeSigne(resumEconomic.balanc)}>{formatEuros(resumEconomic.balanc)}</span>
              </div>
            </div>
          </div>

          <div className="session-form__contingut">
            <div className="session-form__bloc">
              <div className="session-form__capcalera">
                <h2 className="session-form__subtitol">Moviments</h2>
                <BotoAfegir to={`${ROUTES.COMPTABILITAT_NOU}?sessionId=${id}`} etiqueta="Afegir moviment d'aquesta sessió" />
              </div>
              {aportacionsPendents && (
                <p className="session-form__avis">
                  Falta afegir les {entradesAportacio.length} aportacions d'aquesta sessió per un total de {formatEuros(importAportacions)}.
                  {' '}
                  <Link className="enllac" to={enllacAfegirAportacions}>Afegir-les ara</Link>
                </p>
              )}
              {movimentsOrdenats.length === 0 && <p>Encara no hi ha cap moviment d'aquesta sessió.</p>}
              <ul className="session-form__llista">
                {movimentsOrdenats.map((moviment) => (
                  <li key={moviment.id} className="session-form__moviment-fila">
                    <span className="session-form__hora">{formatData(moviment.data)}</span>
                    <Link className="enllac" to={ROUTES.COMPTABILITAT_EDITAR.replace(':id', moviment.id)}>
                      {moviment.concepte}
                    </Link>
                    <span className={`badge badge--${moviment.tipus}`}>
                      {ETIQUETES_TIPUS[moviment.tipus] ?? moviment.tipus}
                    </span>
                    <span className={`session-form__moviment-total ${moviment.tipus === 'traspas' ? '' : classeSigne(moviment.tipus === 'despesa' ? -1 : 1)}`}>
                      {moviment.tipus === 'traspas' ? '' : moviment.tipus === 'despesa' ? '−' : '+'}
                      {formatEuros(Number(moviment.total) || 0)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {editant && !dades.senseControl && (
        <div className="session-form__seccio session-form__seccio--blanc">
          <div className="session-form__contingut session-form__graella">
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
        </div>
      )}
    </form>
  );
}
