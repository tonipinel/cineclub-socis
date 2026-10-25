import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { addDoc, collection, doc, getDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { db } from '../../firebase/firebase';
import * as ROUTES from '../../constants/routes';
import {
  hrefCorreu, hrefTelefon, primeraAdrecaCorreu, teNumeroSoci,
} from '../../lib/socis';
import {
  calcularNomPublic, NOM_ORGANITZACIO, sincronitzarSociPublic, esborrarSociPublic,
} from '../../lib/propostes';
import {
  calcularEstatSoci, calcularVenciment, estaActiu, iniciPeriodeActual, iniciVigencia, ESTAT_AL_DIA, ESTAT_PENDENT, ESTAT_VENCUT, ESTAT_NOU_REGISTRE,
} from '../../lib/estatSoci';
import { assistenciaPerSessio } from '../../lib/escaneig';
import { formatEuros, ETIQUETES_METODE, CATEGORIA_QUOTA_SOCI } from '../../lib/moviments';
import { avui, formatData } from '../../lib/data';
import { imatgeDeSessio } from '../../lib/sessions';
import Carregant from '../../components/Carregant';
import BarraDesar from '../../components/BarraDesar';
import BotoAfegir from '../../components/BotoAfegir';
import CarnetCard from '../../components/CarnetCard';
import PaginaAdmin from '../../components/PaginaAdmin';
import { useConfirmacio } from '../../components/ConfirmacioProvider';
import useFitxaEditable from '../../lib/useFitxaEditable';

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

// L'únic que la fitxa pot escriure en editar: els camps del formulari i la casella d'organització.
const CAMPS_EDITABLES = [...CAMPS_FORMULARI.map(([camp]) => camp), 'organitzacio'];
// Camps dels quals depèn el nom públic (`calcularNomPublic`), que es copia a cada proposta com a `nomProposant`.
const CAMPS_NOM_PUBLIC = ['nom', 'cognoms', 'organitzacio'];
// Un lot de Firestore admet 500 escriptures: el primer porta també el soci i socisPublic.
const PROPOSTES_PER_LOT = 450;

const ETIQUETES_ESTAT = {
  [ESTAT_AL_DIA]: 'Al dia',
  [ESTAT_PENDENT]: 'Pendent',
  [ESTAT_VENCUT]: 'Vençut',
  [ESTAT_NOU_REGISTRE]: 'Nou registre',
};

const COLOR_ASSISTEIX = '#16a34a';
const COLOR_NO_ASSISTEIX = '#d4d4d4';

const atributsIcona = {
  className: 'btn-icona__icona',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '1.6',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
};

const IconaTelefon = () => (
  <svg {...atributsIcona}>
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
  </svg>
);

const IconaCorreu = () => (
  <svg {...atributsIcona}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
);

const ERROR_CARREGA = "No s'ha pogut carregar el soci. Torna-ho a provar.";
const TORNAR = { to: ROUTES.SOCIS, etiqueta: 'Socis' };

// Valors editables: els camps del formulari i la casella d'organització.
const valorsInicials = (soci) => ({
  ...Object.fromEntries(CAMPS_FORMULARI.map(([camp]) => [camp, soci[camp] ?? ''])),
  organitzacio: Boolean(soci.organitzacio),
});

// `soci`: el document desat amb els camps buits del formulari (com abans), o els camps buits si es crea.
function FitxaSoci({ id, soci }) {
  const editant = Boolean(id);
  const [desat, setDesat] = useState(soci);
  const [inicial] = useState(() => valorsInicials(soci));
  const [errorEstat, setErrorEstat] = useState(null);
  const [operant, setOperant] = useState(false);
  const operantRef = useRef(false);
  const [assistencies, setAssistencies] = useState([]);
  const [pagaments, setPagaments] = useState([]);
  const [motiuDesactivacio, setMotiuDesactivacio] = useState('');
  const [mostrarFormDesactivacio, setMostrarFormDesactivacio] = useState(false);
  const navigate = useNavigate();
  const { confirma } = useConfirmacio();

  const onDesar = async ({ valors: v, canviats }) => {
    const canvis = Object.fromEntries(canviats
      .filter((camp) => CAMPS_EDITABLES.includes(camp))
      .map((camp) => [camp, v[camp]]));
    if (!editant) {
      const data = avui();
      const creat = await addDoc(collection(db, 'socis'), {
        ...desat,
        ...canvis,
        dataAlta: data,
        ultimPagament: data,
        actiu: true,
        tokenCarnet: crypto.randomUUID(),
      });
      navigate(ROUTES.SOCIS_EDITAR.replace(':id', creat.id), { replace: true });
      return undefined;
    }
    // Només s'escriuen els camps canviats: el que hagin desat mentrestant l'escaneig o un pagament (inicPeriode,
    // ultimPagament, actiu, tokenCarnet...) es conserva. socisPublic i nomProposant depenen també de camps que la
    // fitxa no edita (token, actiu, número), i per això es calculen amb el document rellegit just abans del lot,
    // no amb el carregat en obrir la fitxa.
    const ref = doc(db, 'socis', id);
    const actual = (await getDoc(ref)).data();
    if (!actual) throw new Error('El soci ja no existeix');
    const nou = { ...CAMPS_INICIALS, ...actual, ...canvis };
    const batch = writeBatch(db);
    batch.update(ref, canvis);
    if (estaActiu(nou)) sincronitzarSociPublic(batch, db, nou);
    // El nom amb què es mostren les seves propostes es desa a cada proposta: si canvia, s'hi propaga.
    const lotsAddicionals = [];
    if (CAMPS_NOM_PUBLIC.some((camp) => camp in canvis) && nou.numeroSoci) {
      const nomProposant = calcularNomPublic(nou);
      const propostes = await getDocs(query(collection(db, 'propostes'), where('numeroSoci', '==', Number(nou.numeroSoci))));
      const pendents = propostes.docs.filter((p) => p.data().nomProposant !== nomProposant);
      // Amb més propostes de les que caben en un lot, la resta va en lots posteriors (cadascun atòmic). Si un
      // falla, el soci ja és desat però el desat es dona per fallit i els canvis queden pendents: tornar a desar
      // només reescriu les propostes que encara tenen el nom vell.
      for (let i = 0; i < pendents.length; i += PROPOSTES_PER_LOT) {
        const lot = i === 0 ? batch : writeBatch(db);
        pendents.slice(i, i + PROPOSTES_PER_LOT).forEach((p) => lot.update(p.ref, { nomProposant }));
        if (i > 0) lotsAddicionals.push(lot);
      }
    }
    await batch.commit();
    setDesat(nou);
    for (const lot of lotsAddicionals) await lot.commit();
    return undefined;
  };

  const {
    valors, canvia, estat, desa, descarta, errorDesat,
  } = useFitxaEditable({ inicial, onDesar });
  const desant = estat === 'desant';
  // Per mostrar: el document desat amb els canvis pendents del formulari.
  const dades = { ...desat, ...valors };

  useEffect(() => {
    if (!editant || !desat.numeroSoci) return;
    Promise.all([
      getDocs(collection(db, 'sessions')),
      getDocs(query(collection(db, 'accessLog'), where('numeroSoci', '==', Number(desat.numeroSoci)))),
    ]).then(([sessionsSnap, accessLogSnap]) => {
      const sessions = sessionsSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => s.data && s.data <= avui());
      const entradesSoci = accessLogSnap.docs.map((d) => d.data());
      setAssistencies(assistenciaPerSessio(sessions, entradesSoci));
    });
  }, [editant, desat.numeroSoci]);

  useEffect(() => {
    if (!editant || !desat.numeroSoci) return;
    getDocs(query(
      collection(db, 'moviments'),
      where('categoria', '==', CATEGORIA_QUOTA_SOCI),
      where('numeroSoci', '==', Number(desat.numeroSoci))
    )).then((snap) => {
      const llista = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''));
      setPagaments(llista);
    });
  }, [editant, desat.numeroSoci]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!operantRef.current) desa();
  };

  // Les accions del soci (estat, carnet) escriuen el document desat al moment, sense els canvis pendents del
  // formulari; mentre n'hi ha una en curs, «Desar» queda bloquejat (i a l'inrevés) perquè no es trepitgin.
  const opera = async (accio, missatgeError) => {
    operantRef.current = true;
    setOperant(true);
    setErrorEstat(null);
    try {
      await accio();
    } catch {
      setErrorEstat(missatgeError);
    } finally {
      operantRef.current = false;
      setOperant(false);
    }
  };

  const handleDesactivar = async () => {
    if (!motiuDesactivacio.trim()) {
      setErrorEstat('Cal indicar el motiu de la desactivació.');
      return;
    }
    const confirmat = await confirma({
      missatge: "Segur que vols desactivar aquest soci? El seu carnet deixarà de funcionar a l'escaneig.",
      perill: true,
      etiquetaAcceptar: 'Desactiva',
    });
    if (!confirmat) return;
    await opera(async () => {
      const actualitzacio = { actiu: false, motiuDesactivacio: motiuDesactivacio.trim(), dataDesactivacio: avui() };
      const batch = writeBatch(db);
      batch.update(doc(db, 'socis', id), actualitzacio);
      esborrarSociPublic(batch, db, desat.tokenCarnet);
      await batch.commit();
      setDesat((d) => ({ ...d, ...actualitzacio }));
      setMotiuDesactivacio('');
      setMostrarFormDesactivacio(false);
    }, "No s'ha pogut desar. Torna-ho a provar.");
  };

  const handleRegenerarCarnet = async () => {
    const confirmat = await confirma({
      missatge: 'Segur que vols regenerar el carnet? El QR físic actual deixarà de funcionar i caldrà imprimir-ne un de nou.',
      perill: true,
      etiquetaAcceptar: 'Regenera',
    });
    if (!confirmat) return;
    await opera(async () => {
      const nouToken = crypto.randomUUID();
      const batch = writeBatch(db);
      batch.update(doc(db, 'socis', id), { tokenCarnet: nouToken });
      esborrarSociPublic(batch, db, desat.tokenCarnet);
      sincronitzarSociPublic(batch, db, { ...desat, tokenCarnet: nouToken });
      await batch.commit();
      setDesat((d) => ({ ...d, tokenCarnet: nouToken }));
    }, "No s'ha pogut regenerar el carnet. Torna-ho a provar.");
  };

  const handleReactivar = async () => {
    const confirmat = await confirma({ missatge: 'Segur que vols reactivar aquest soci?', etiquetaAcceptar: 'Reactiva' });
    if (!confirmat) return;
    await opera(async () => {
      const actualitzacio = { actiu: true, motiuDesactivacio: null, dataDesactivacio: null };
      const batch = writeBatch(db);
      batch.update(doc(db, 'socis', id), actualitzacio);
      sincronitzarSociPublic(batch, db, { ...desat, ...actualitzacio });
      await batch.commit();
      setDesat((d) => ({ ...d, ...actualitzacio }));
    }, "No s'ha pogut desar. Torna-ho a provar.");
  };

  const accionsBloquejades = desant || operant;
  // Trucar i escriure fan servir les dades desades (no els canvis pendents): l'enllaç sempre és el que hi ha a la fitxa.
  const telTelefon = hrefTelefon(desat.telefon);
  const mailtoCorreu = hrefCorreu(desat.correuElectronic);

  const estatSoci = dades.ultimPagament ? calcularEstatSoci(dades) : ESTAT_NOU_REGISTRE;
  const venciment = dades.ultimPagament ? calcularVenciment(dades) : null;
  const sessionsAssistides = assistencies.filter((s) => s.assisteix);
  const sessionsNoAssistides = assistencies.filter((s) => !s.assisteix);
  const pagamentActual = pagaments[0] ?? null;
  // El període actual va des de l'activació del carnet (o l'inici de la quota
  // si encara no s'ha escanejat dins seu) fins al venciment de la quota — no
  // des del pagament ni sense límit superior.
  const iniciPeriode = iniciPeriodeActual(dades);
  // En una renovació anticipada la quota no compta des del pagament, sinó des que venç l'anterior.
  const vigenciaDes = iniciVigencia(dades);
  const vencimentStr = venciment ? venciment.toLocaleDateString('sv-SE') : null;
  const sessionsPeriodeActual = iniciPeriode
    ? sessionsAssistides.filter((s) => s.data >= iniciPeriode && s.data <= vencimentStr)
    : [];
  const sessionsNoAssistidesPeriodeActual = iniciPeriode
    ? sessionsNoAssistides.filter((s) => s.data >= iniciPeriode && s.data <= vencimentStr)
    : [];
  const costPerSessio = pagamentActual && sessionsPeriodeActual.length > 0
    ? pagamentActual.total / sessionsPeriodeActual.length
    : null;
  const dadesGrafic = [
    { name: 'Hi ha assistit', value: sessionsPeriodeActual.length, color: COLOR_ASSISTEIX },
    { name: 'No hi ha assistit', value: sessionsNoAssistidesPeriodeActual.length, color: COLOR_NO_ASSISTEIX },
  ].filter((d) => d.value > 0);

  // Les seccions de pagaments i sessions van després de `PaginaAdmin` (a tot l'ample): l'espai per a la barra
  // fixa es reserva al final de tot.
  return (
    <div className="espai-barra-desar">
      <PaginaAdmin
        amplada="fitxa"
        titol={editant ? 'Fitxa del soci/a' : "Donar d'alta un/a soci/a"}
        tornar={TORNAR}
        accions={editant && (
          <>
            {telTelefon && (
              <a className="btn-icona soci-form__contacte" href={telTelefon} aria-label={`Trucar al ${desat.telefon.trim()}`}>
                <IconaTelefon />
                <span className="btn-icona__text">Trucar</span>
              </a>
            )}
            {mailtoCorreu && (
              <a className="btn-icona soci-form__contacte" href={mailtoCorreu} target="_blank" rel="noopener noreferrer" aria-label={`Escriure un correu a ${primeraAdrecaCorreu(desat.correuElectronic)}`}>
                <IconaCorreu />
                <span className="btn-icona__text">Escriure un correu</span>
              </a>
            )}
            <span className="soci-form__pagament-mobil">
              <BotoAfegir to={ROUTES.SOCIS_PAGAMENT.replace(':id', id)} etiqueta="Registrar pagament" compacte />
            </span>
          </>
        )}
      >
        <div className="soci-form-pagina">
          <form className="soci-form" onSubmit={handleSubmit} noValidate>
            {editant && (
              <div className="soci-form__dades-clau">
                <p className="soci-form__numero">
                  Número de soci/a: {dades.numeroSoci || "pendent d'assignar"}
                </p>
                <p className="soci-form__data-clau">Data de sol·licitud: {formatData(dades.dataAlta)}</p>
                <p className="soci-form__data-clau">Últim pagament: {formatData(dades.ultimPagament)}</p>
                {vigenciaDes && vigenciaDes !== dades.ultimPagament && (
                  <p className="soci-form__data-clau">Quota vigent des de: {formatData(vigenciaDes)}</p>
                )}
                <p className="soci-form__data-clau">
                  Activació del carnet: {dades.inicPeriode ? formatData(dades.inicPeriode) : 'Encara no ha escanejat des del pagament'}
                </p>
                {venciment && (
                  <p className="soci-form__data-clau">Venciment de la quota: {formatData(venciment)}</p>
                )}
              </div>
            )}

            {CAMPS_FORMULARI.map(([camp, etiqueta]) => (
              <div className="form__field" key={camp}>
                <label className="form__label" htmlFor={camp}>{etiqueta}</label>
                <input
                  id={camp}
                  className="form__input"
                  value={valors[camp]}
                  onChange={(e) => canvia(camp, e.target.value)}
                />
              </div>
            ))}

            <div className="form__field form__field--casella">
              <label className="form__casella" htmlFor="organitzacio">
                <input
                  id="organitzacio"
                  type="checkbox"
                  checked={valors.organitzacio}
                  onChange={(e) => canvia('organitzacio', e.target.checked)}
                />
                Persona de l'organització del Cineclub
              </label>
              <p className="form__ajuda">
                Les seves propostes de pel·lícules es mostren com a «{NOM_ORGANITZACIO}».
              </p>
            </div>

            <BarraDesar estat={estat} onDescarta={descarta} missatgeError={errorDesat} bloquejada={operant} />
          </form>

          {editant && (
            <aside className="soci-form-pagina__accions">
              {teNumeroSoci(dades) && (
                <div className="soci-form-pagina__bloc-accio">
                  <h2 className="soci-form-pagina__accions-titol">Carnet</h2>
                  <Link className="soci-form-pagina__carnet" to={ROUTES.SOCIS_CARNET.replace(':id', id)}>
                    <CarnetCard soci={dades} />
                  </Link>
                  {/* Un soci desactivat no té carnet vàlid: en reactivar-lo es torna a publicar el token actual. */}
                  {estaActiu(desat) && (
                    <button type="button" className="soci-form__accio-petita" onClick={handleRegenerarCarnet} disabled={accionsBloquejades}>
                      Regenerar carnet
                    </button>
                  )}
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
                    <button type="button" className="soci-form__accio-petita" onClick={handleReactivar} disabled={accionsBloquejades}>Reactivar soci</button>
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
                    <button type="button" className="btn btn--outline" onClick={handleDesactivar} disabled={accionsBloquejades}>Confirmar desactivació</button>
                  </>
                ) : (
                  <button type="button" className="soci-form__accio-petita" onClick={() => setMostrarFormDesactivacio(true)} disabled={accionsBloquejades}>
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
                          {formatEuros(pagamentActual.total)} pagats ÷ {sessionsPeriodeActual.length} {sessionsPeriodeActual.length === 1 ? 'sessió assistida' : 'sessions assistides'} des del {formatData(iniciPeriode)}
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
      </PaginaAdmin>

      {editant && (
        <div className="soci-form__seccio soci-form__seccio--gris">
          <div className="soci-form__contingut">
            <div className="soci-form__seccio-capcalera">
              <h2 className="soci-form__subtitol">Pagaments de la quota</h2>
              <BotoAfegir to={ROUTES.SOCIS_PAGAMENT.replace(':id', id)} etiqueta="Registrar pagament" compacte />
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
                  {imatgeDeSessio(s) ? (
                    <img className="soci-form__cartell-imatge" src={imatgeDeSessio(s)} alt={s.titol} />
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
    </div>
  );
}

// Si s'edita, carrega el soci; la fitxa es munta quan hi ha les dades (el hook només llegeix `inicial` en muntar).
function CarregaSoci({ id }) {
  const [soci, setSoci] = useState(null);
  const [errorCarrega, setErrorCarrega] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) return undefined;
    let actiu = true;
    getDoc(doc(db, 'socis', id)).then((snap) => {
      if (!actiu) return;
      const dadesDoc = snap.data();
      if (!dadesDoc) {
        navigate(ROUTES.SOCIS, { replace: true });
        return;
      }
      setSoci({ ...CAMPS_INICIALS, ...dadesDoc });
    }).catch(() => { if (actiu) setErrorCarrega(ERROR_CARREGA); });
    return () => { actiu = false; };
  }, [id, navigate]);

  if (!id) return <FitxaSoci soci={CAMPS_INICIALS} />;
  if (errorCarrega) {
    return (
      <PaginaAdmin amplada="fitxa" titol="Fitxa del soci/a" tornar={TORNAR}>
        <p className="form__error" role="alert">{errorCarrega}</p>
      </PaginaAdmin>
    );
  }
  if (!soci) return <Carregant />;
  return <FitxaSoci id={id} soci={soci} />;
}

// Clau per soci: en passar de l'alta a la fitxa del soci creat, l'estat comença de nou.
export default function SociForm() {
  const { id } = useParams();
  return <CarregaSoci key={id ?? 'nou'} id={id} />;
}
