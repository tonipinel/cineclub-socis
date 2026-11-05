import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import {
  BarChart, Bar, Cell, AreaChart, Area, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { db } from '../../firebase/firebase';
import { avui } from '../../lib/data';
import { resumDashboardSocis } from '../../lib/socis';
import { resumDashboardTiquets, resumPerSessio } from '../../lib/escaneig';
import { resumVotacio, tandaOberta } from '../../lib/tandes';
import { sessionsAmbControl } from '../../lib/sessions';
import {
  resumComptable, resumReal, resumPrevisio, costRealSessio, costsRealsSessions, rendibilitatPerSessio, formatEuros, classeSigne, ETIQUETES_METODE,
  LLINDAR_COST_SESSIO_RENOVACIO, CATEGORIA_QUOTA_SOCI, TIPUS_QUOTA, TIPUS_MOVIMENT,
} from '../../lib/moviments';
import * as ROUTES from '../../constants/routes';
import TopVotacio from '../../components/TopVotacio';
import Carregant from '../../components/Carregant';
import PaginaAdmin from '../../components/PaginaAdmin';
import ErrorCarrega from '../../components/ErrorCarrega';
import useErrorCarrega from '../../lib/useErrorCarrega';

const PESTANYES_EVOLUCIO = [
  ['real', 'Últims 12 mesos (real)'],
  ['previsio', 'Previsió pròxims 12 mesos'],
];

const COLOR_REAL = '#16a34a';
const COLOR_PREVISIO_ESTIMADA = '#6b7280';
const COLOR_PREVISIO_PRECISA = '#f97316';

// Sèries de la previsió: dues per color, que s'alternen en cada tram.
const clauSerie = (precis, tram) => `${precis ? 'tresoreriaPrevistaPrecisa' : 'tresoreriaPrevista'}${Math.floor(tram / 2) % 2 === 0 ? '' : '2'}`;

const PALETA_INGRESSOS = ['#15803d', '#16a34a', '#4ade80'];
const PALETA_DESPESES = ['#b91c1c', '#f97316', '#7f1d1d'];

function TooltipAssistencia({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  const total = payload.reduce((suma, entrada) => suma + entrada.value, 0);
  return (
    <div className="dashboard__tooltip">
      <p className="dashboard__tooltip-titol">{label}</p>
      {payload.map((entrada) => (
        <p key={entrada.dataKey} style={{ color: entrada.color }}>{entrada.name}: {entrada.value}</p>
      ))}
      <p className="dashboard__tooltip-total">Total: {total}</p>
    </div>
  );
}

function MarcaCost({ mes }) {
  if (mes.precis) return <span className="dashboard__previsio-marca dashboard__previsio-marca--precisa">cost real</span>;
  if (mes.parcial) return <span className="dashboard__previsio-marca">cost parcial</span>;
  return null;
}

// Un sol valor per mes: la tresoreria real i la de la sèrie pròpia del mes (no la del punt de canvi repetit).
function TooltipEvolucio({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  const fila = payload[0].payload;
  const precis = fila.seriePropia?.startsWith('tresoreriaPrevistaPrecisa');
  return (
    <div className="dashboard__tooltip">
      <p className="dashboard__tooltip-titol">{label}</p>
      {fila.tresoreriaReal !== null && <p style={{ color: COLOR_REAL }}>Tresoreria real: {formatEuros(fila.tresoreriaReal)}</p>}
      {fila.seriePropia && (
        <p style={{ color: precis ? COLOR_PREVISIO_PRECISA : COLOR_PREVISIO_ESTIMADA }}>
          Tresoreria prevista ({precis ? 'programació coneguda' : 'estimada'}): {formatEuros(fila[fila.seriePropia])}
        </p>
      )}
    </div>
  );
}

// El dashboard ensenya com a molt les 8 millors pel·lícules de la votació.
const FILMS_MAXIMS_DASHBOARD = 8;

const CATEGORIES_DETALL_TANCAT_PER_DEFECTE = ['Gestió associació'];

export default function DashboardPage() {
  const [dades, setDades] = useState(undefined);
  const {
    error, falla, reintenta, intent,
  } = useErrorCarrega();
  const [votacio, setVotacio] = useState(null);
  const [programacio, setProgramacio] = useState(null);
  const [pestanyaEvolucio, setPestanyaEvolucio] = useState('real');
  const [categoriesDetallTancat, setCategoriesDetallTancat] = useState(
    () => new Set(CATEGORIES_DETALL_TANCAT_PER_DEFECTE)
  );

  const alternarDetallCategoria = (categoria) => {
    setCategoriesDetallTancat((actual) => {
      const nou = new Set(actual);
      if (nou.has(categoria)) nou.delete(categoria); else nou.add(categoria);
      return nou;
    });
  };

  useEffect(() => {
    Promise.all([
      getDocs(collection(db, 'socis')),
      getDocs(collection(db, 'sessions')),
      getDocs(collection(db, 'accessLog')),
      getDocs(collection(db, 'moviments')),
      getDocs(collection(db, 'lotsTiquets')),
    ]).then(([socisSnap, sessionsSnap, accessLogSnap, movimentsSnap, lotsSnap]) => {
      setDades({
        socis: socisSnap.docs.map((d) => d.data()),
        sessions: sessionsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        accessLog: accessLogSnap.docs.map((d) => d.data()),
        moviments: movimentsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        lots: lotsSnap.docs.map((d) => d.data()),
      });
    }).catch(falla);
  }, [intent, falla]);

  // Lectures opcionals dels costs de les pel·lícules programades: si fallen,
  // tots els mesos de la previsió es calculen amb l'estimació.
  useEffect(() => {
    let viu = true;
    Promise.all([
      getDocs(collection(db, 'propostesInternes')),
      getDocs(collection(db, 'distribuidores')),
    ]).then(([internesSnap, distribuidoresSnap]) => {
      if (!viu) return;
      setProgramacio({
        interns: Object.fromEntries(internesSnap.docs.map((d) => [d.id, d.data()])),
        distribuidores: Object.fromEntries(distribuidoresSnap.docs.map((d) => [d.id, d.data()])),
      });
    }).catch(() => {
      // Sense costos reals: tots els mesos s'estimen.
    });
    return () => { viu = false; };
  }, []);

  // Lectures opcionals: si fallen, simplement no es mostra el bloc de votació.
  useEffect(() => {
    let viu = true;
    (async () => {
      try {
        const tandesSnap = await getDocs(collection(db, 'tandes'));
        const tanda = tandaOberta(tandesSnap.docs.map((d) => ({ id: d.id, ...d.data() })), new Date());
        if (!tanda) return;
        const [votsSnap, propostesSnap] = await Promise.all([
          getDocs(collection(db, 'tandes', tanda.id, 'vots')),
          getDocs(collection(db, 'propostes')),
        ]);
        if (!viu) return;
        setVotacio({
          tanda,
          vots: votsSnap.docs.map((d) => ({ numeroSoci: d.id, ...d.data() })),
          propostes: Object.fromEntries(propostesSnap.docs.map((d) => [d.id, d.data()])),
        });
      } catch {
        // Sense bloc de votació.
      }
    })();
    return () => { viu = false; };
  }, []);

  if (error) {
    return <ErrorCarrega amplada="fitxa" titol="Dashboard" missatge="No s'han pogut carregar les dades del dashboard." onReintenta={reintenta} />;
  }
  if (!dades) return <Carregant />;

  const socis = resumDashboardSocis(dades.socis, dades.sessions, dades.accessLog);
  const tiquets = resumDashboardTiquets(dades.lots, dades.accessLog, dades.sessions);
  const comptable = resumComptable(dades.moviments);
  const dadesIngressosCategoria = Object.entries(comptable.ingressosPerCategoria)
    .map(([categoria, grup]) => ({ categoria, total: grup.total }));
  const dadesDespesesCategoria = Object.entries(comptable.despesesPerCategoria)
    .map(([categoria, grup]) => ({ categoria, total: grup.total }));
  const despesesGestioAssociacio = dades.moviments.filter(
    (m) => m.tipus === TIPUS_MOVIMENT.DESPESA && m.categoria === 'Gestió associació'
  );
  const real = resumReal(dades.moviments);
  const dataAvui = avui();
  const costsReals = programacio
    ? Object.fromEntries(dades.sessions
      .filter((s) => (s.data ?? '') > dataAvui)
      .map((s) => [s.id, costRealSessio(s, programacio.interns, programacio.distribuidores)]))
    : {};
  const previsio = resumPrevisio(dades.moviments, dades.socis, dades.sessions, dades.accessLog, new Date(), { costsReals });
  const resta = previsio.restaMesActual;
  const hiHaResta = resta.sessionsProgramades > 0;
  // Una sola base per a tot: la tresoreria de l'últim punt de la línia real, més el que queda del mes per programació.
  const ultimReal = real.mesos[real.mesos.length - 1];
  const excedentFinalMes = (ultimReal ? ultimReal.tresoreria : comptable.excedent) + resta.impacteNet;
  const mesosPrevisio = previsio.mesos.reduce((acc, mes) => {
    const excedentProjectat = (acc.length > 0 ? acc[acc.length - 1].excedentProjectat : excedentFinalMes) + mes.impacteNet;
    acc.push({ ...mes, excedentProjectat });
    return acc;
  }, []);
  const dadesGrafic = [
    ...real.mesos.map((mes) => ({
      etiqueta: mes.etiqueta, tresoreriaReal: mes.tresoreria, seriePropia: null,
    })),
    ...mesosPrevisio.map((mes) => ({ etiqueta: mes.etiqueta, tresoreriaReal: null, seriePropia: null })),
  ];
  if (ultimReal) {
    // Punts de la previsió: l'últim punt real (el mateix valor, perquè les línies s'empalmin) i els mesos següents.
    const punts = [
      { fila: real.mesos.length - 1, valor: ultimReal.tresoreria, precis: hiHaResta && resta.precis },
      ...mesosPrevisio.map((mes, i) => ({ fila: real.mesos.length + i, valor: mes.excedentProjectat, precis: mes.precis })),
    ];
    // Cada tram del mateix color té la seva sèrie (alternant dues per color) perquè dos trams no se superposin.
    // El punt de canvi es repeteix només com a primer punt de la sèrie del tram següent.
    let tram = 0;
    punts.forEach((punt, i) => {
      if (i > 0 && punts[i - 1].precis !== punt.precis) {
        tram += 1;
        dadesGrafic[punts[i - 1].fila][clauSerie(punt.precis, tram)] = punts[i - 1].valor;
      }
      const clau = clauSerie(punt.precis, tram);
      dadesGrafic[punt.fila][clau] = punt.valor;
      dadesGrafic[punt.fila].seriePropia = clau;
    });
  }
  const rendibilitatSessions = rendibilitatPerSessio(
    dades.moviments,
    dades.socis,
    dades.sessions,
    programacio ? costsRealsSessions(dades.sessions, programacio.interns, programacio.distribuidores) : {},
  );
  const ultimesSessions = sessionsAmbControl(dades.sessions)
    .filter((s) => (s.data ?? '') <= dataAvui)
    .sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''))
    .slice(0, 5);
  const dadesBalancSessions = [...ultimesSessions].reverse().map((s) => ({
    titol: s.titol,
    balanc: rendibilitatSessions[s.id] ?? 0,
  }));
  const resumAssistenciaPerSessio = resumPerSessio(dades.accessLog);
  const dadesAssistenciaSessions = [...ultimesSessions].reverse().map((s) => {
    const resum = resumAssistenciaPerSessio[s.id] ?? { socisDistints: 0, entradesGeneriques: 0 };
    return { titol: s.titol, socis: resum.socisDistints, noSocis: resum.entradesGeneriques };
  });
  const altesPerSessio = {};
  for (const m of dades.moviments) {
    if (m.categoria === CATEGORIA_QUOTA_SOCI && m.tipusQuota === TIPUS_QUOTA.ALTA && m.sessionId) {
      altesPerSessio[m.sessionId] = (altesPerSessio[m.sessionId] ?? 0) + 1;
    }
  }
  const dadesAltesSessions = [...ultimesSessions].reverse().map((s) => ({
    titol: s.titol,
    altes: altesPerSessio[s.id] ?? 0,
  }));
  const mitjanaAltesSessions = dadesAltesSessions.length > 0
    ? (dadesAltesSessions.reduce((suma, s) => suma + s.altes, 0) / dadesAltesSessions.length).toFixed(1)
    : 0;
  const totalTiquets = tiquets.disponibles + tiquets.usats;
  const resumVot = votacio && resumVotacio({
    tanda: votacio.tanda, vots: votacio.vots, socis: dades.socis, propostes: votacio.propostes, sessions: dades.sessions,
  });
  const percentTiquetsUsats = totalTiquets > 0 ? Math.round((tiquets.usats / totalTiquets) * 100) : 0;

  return (
    <PaginaAdmin amplada="fitxa" titol="Dashboard">

      <div className="dashboard__numeros">
        <div className="comptabilitat__formula-terme">
          <p className="comptabilitat__formula-etiqueta">Total de socis</p>
          <p className="comptabilitat__formula-valor">{socis.total}</p>
        </div>
        <div className="comptabilitat__formula-terme">
          <p className="comptabilitat__formula-etiqueta">Tiquets</p>
          <p className="comptabilitat__formula-valor">{totalTiquets}</p>
          <div className="dashboard__barra-tiquets">
            <div className="dashboard__barra-tiquets-usats" style={{ width: `${percentTiquetsUsats}%` }} />
          </div>
          <p className="dashboard__barra-tiquets-detall">{tiquets.usats} usats · {tiquets.disponibles} disponibles</p>
        </div>
        <div className="comptabilitat__formula-fila">
          <div className="comptabilitat__formula-terme">
            <p className="comptabilitat__formula-etiqueta">Disponibilitat en efectiu</p>
            <p className="comptabilitat__formula-valor comptabilitat__formula-valor--efectiu">{formatEuros(comptable.caixa)}</p>
          </div>
          <span className="comptabilitat__formula-operador">+</span>
          <div className="comptabilitat__formula-terme">
            <p className="comptabilitat__formula-etiqueta">Disponibilitat bancària</p>
            <p className="comptabilitat__formula-valor comptabilitat__formula-valor--banc">{formatEuros(comptable.banc)}</p>
          </div>
        </div>
        <div className="comptabilitat__formula-fila">
          <span className="comptabilitat__formula-operador">=</span>
          <div className="comptabilitat__formula-terme comptabilitat__formula-terme--total">
            <p className="comptabilitat__formula-etiqueta">Fons total de tresoreria</p>
            <p className="comptabilitat__formula-valor comptabilitat__formula-valor--total">{formatEuros(comptable.excedent)}</p>
          </div>
        </div>
      </div>

      <div className="dashboard__fila-superior">
        {resumVot && (
          <div className="dashboard__modul dashboard__modul--ample">
            <h2 className="dashboard__modul-titol">Votació: {votacio.tanda.nom}</h2>
            <p>{resumVot.participants} de {resumVot.total} han votat · {resumVot.completats} han completat · {resumVot.pendents} pendents</p>
            <p className="dashboard__subtitol">Completats: {resumVot.completats} de {resumVot.total}</p>
            <div className="dashboard__votacio-barra-wrap">
              <div
                className="dashboard__votacio-barra"
                role="progressbar"
                aria-label="Completats"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={resumVot.percentCompletats}
                aria-valuetext={`${resumVot.completats} de ${resumVot.total} han completat la votació`}
              >
                <div className="dashboard__votacio-barra-omplerta" style={{ width: `${resumVot.percentCompletats}%` }} />
              </div>
              <span className="dashboard__votacio-percentatge">{resumVot.percentCompletats}%</span>
            </div>
            <TopVotacio files={resumVot.files.slice(0, FILMS_MAXIMS_DASHBOARD)} />
            <Link className="dashboard__enllac" to={ROUTES.TANDES_RESULTATS.replace(':id', votacio.tanda.id)}>Veure resultats complets</Link>
          </div>
        )}
        <div className="dashboard__columna">

        <div className="dashboard__modul">
          <h2 className="dashboard__modul-titol">Noves altes de socis</h2>
          <p className="dashboard__subtitol">Altes per sessió (últimes 5)</p>
          {ultimesSessions.length === 0 && <p>Encara no hi ha cap sessió.</p>}
          {ultimesSessions.length > 0 && (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={dadesAltesSessions} margin={{ top: 5, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="titol" tick={{ fontSize: 9 }} interval={0} angle={-40} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={24} />
                <Tooltip />
                <Bar dataKey="altes" fill="#BF9000" />
              </BarChart>
            </ResponsiveContainer>
          )}
          <p>Mitjana d'altes de socis (últimes 5 sessions): <strong>{mitjanaAltesSessions}</strong></p>
          {socis.renovacionsProperes.length > 0 && (
            <>
              <p className="dashboard__subtitol">Renoven aviat</p>
              <ul className="dashboard__llista">
                {socis.renovacionsProperes.slice(0, 5).map((s) => (
                  <li key={s.numeroSoci}>{s.nom} {s.cognoms} — {s.dies} dies</li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="dashboard__modul">
          <h2 className="dashboard__modul-titol">Assistència</h2>
          <p className="dashboard__subtitol">Socis i no socis per sessió (últimes 5)</p>
          {ultimesSessions.length === 0 && <p>Encara no hi ha cap sessió.</p>}
          {ultimesSessions.length > 0 && (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={dadesAssistenciaSessions} margin={{ top: 5, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="titol" tick={{ fontSize: 9 }} interval={0} angle={-40} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={30} />
                <Tooltip content={<TooltipAssistencia />} />
                <Legend wrapperStyle={{ fontSize: 11 }} verticalAlign="top" />
                <Bar dataKey="socis" name="Socis" stackId="assistencia" fill="#BF9000" />
                <Bar dataKey="noSocis" name="No socis" stackId="assistencia" fill="#7F6000" />
              </BarChart>
            </ResponsiveContainer>
          )}
          <p>Assistència mitjana (últimes 5 sessions): <strong>{socis.assistenciaMitjana}%</strong></p>
        </div>

        <div className="dashboard__modul">
          <h2 className="dashboard__modul-titol">Rentabilitat de les sessions</h2>
          <p className="dashboard__subtitol">Rendibilitat per sessió (últimes 5), amb la part que li toca de les quotes dels socis</p>
          {ultimesSessions.length === 0 && <p>Encara no hi ha cap sessió.</p>}
          {ultimesSessions.length > 0 && (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dadesBalancSessions} margin={{ bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="titol" tick={{ fontSize: 9 }} interval={0} angle={-40} textAnchor="end" height={70} />
                <YAxis tick={{ fontSize: 10 }} width={40} />
                <Tooltip formatter={(valor) => formatEuros(valor)} />
                <ReferenceLine y={0} stroke="#00000033" />
                <Bar dataKey="balanc">
                  {dadesBalancSessions.map((entrada) => (
                    <Cell key={entrada.titol} fill={entrada.balanc >= 0 ? '#15803d' : '#b91c1c'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <Link className="dashboard__enllac" to={ROUTES.SESSIONS}>Veure totes</Link>
        </div>

        </div>

        <div className="dashboard__modul">
          <h2 className="dashboard__modul-titol">Comptabilitat</h2>
          <h3 className="comptabilitat__desglossament-titol comptabilitat__desglossament-titol--ingressos">Ingressos</h3>
          {dadesIngressosCategoria.length > 0 && (
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie data={dadesIngressosCategoria} dataKey="total" nameKey="categoria" innerRadius={40} outerRadius={70} paddingAngle={2}>
                  {dadesIngressosCategoria.map((entrada, i) => (
                    <Cell key={entrada.categoria} fill={PALETA_INGRESSOS[i % PALETA_INGRESSOS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(valor) => formatEuros(valor)} />
              </PieChart>
            </ResponsiveContainer>
          )}
          {Object.entries(comptable.ingressosPerCategoria).map(([categoria, grup], i) => (
            <div key={categoria}>
              <div className="comptabilitat__desglossament-fila comptabilitat__desglossament-fila--categoria">
                <span>
                  <span className="dashboard__pastilla" style={{ backgroundColor: PALETA_INGRESSOS[i % PALETA_INGRESSOS.length] }} />
                  {categoria}
                </span>
                <span className="comptabilitat__valor--positiu">+{formatEuros(grup.total)}</span>
              </div>
              {grup.detalls.map((detall) => (
                <div key={`${detall.preuUnitari}-${detall.metode}`} className="comptabilitat__desglossament-fila comptabilitat__desglossament-fila--submetode">
                  <span>{formatEuros(detall.preuUnitari)} × {detall.quantitat} · {ETIQUETES_METODE[detall.metode] ?? detall.metode}</span>
                  <span>+{formatEuros(detall.total)}</span>
                </div>
              ))}
            </div>
          ))}
          <h3 className="comptabilitat__desglossament-titol comptabilitat__desglossament-titol--despeses">Despeses</h3>
          {dadesDespesesCategoria.length > 0 && (
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie data={dadesDespesesCategoria} dataKey="total" nameKey="categoria" innerRadius={40} outerRadius={70} paddingAngle={2}>
                  {dadesDespesesCategoria.map((entrada, i) => (
                    <Cell key={entrada.categoria} fill={PALETA_DESPESES[i % PALETA_DESPESES.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(valor) => formatEuros(valor)} />
              </PieChart>
            </ResponsiveContainer>
          )}
          {Object.entries(comptable.despesesPerCategoria).map(([categoria, grup], i) => (
            <div key={categoria}>
              <div className="comptabilitat__desglossament-fila comptabilitat__desglossament-fila--categoria">
                <span>
                  <span className="dashboard__pastilla" style={{ backgroundColor: PALETA_DESPESES[i % PALETA_DESPESES.length] }} />
                  {categoria}
                </span>
                <span className="comptabilitat__valor--negatiu">−{formatEuros(grup.total)}</span>
              </div>
              {categoriesDetallTancat.has(categoria) ? (
                <button
                  type="button"
                  className="enllac dashboard__veure-detall"
                  onClick={() => alternarDetallCategoria(categoria)}
                >
                  Veure detall
                </button>
              ) : categoria === 'Gestió associació' ? (
                despesesGestioAssociacio.map((m) => (
                  <div key={m.id} className="comptabilitat__desglossament-fila comptabilitat__desglossament-fila--submetode">
                    <span>{m.concepte}</span>
                    <span>−{formatEuros(Number(m.total) || 0)}</span>
                  </div>
                ))
              ) : (
                grup.detalls.map((detall) => (
                  <div key={`${detall.preuUnitari}-${detall.metode}`} className="comptabilitat__desglossament-fila comptabilitat__desglossament-fila--submetode">
                    <span>{formatEuros(detall.preuUnitari)} × {detall.quantitat} · {ETIQUETES_METODE[detall.metode] ?? detall.metode}</span>
                    <span>−{formatEuros(detall.total)}</span>
                  </div>
                ))
              )}
            </div>
          ))}
          <div className="comptabilitat__desglossament-total">
            <span>Balanç</span>
            <span className={classeSigne(comptable.ingressosTotal - comptable.despesesTotal)}>
              {formatEuros(comptable.ingressosTotal - comptable.despesesTotal)}
            </span>
          </div>
          <Link className="dashboard__enllac" to={ROUTES.COMPTABILITAT}>Veure comptabilitat</Link>
        </div>
      </div>

      <div className="dashboard__graella">
        <div className="dashboard__modul dashboard__modul--ample">
          <h2 className="dashboard__modul-titol">Evolució econòmica</h2>

          <ResponsiveContainer width="100%" height={290}>
            <AreaChart data={dadesGrafic}>
              <defs>
                {[['real', COLOR_REAL], ['previst', COLOR_PREVISIO_PRECISA], ['estimat', COLOR_PREVISIO_ESTIMADA]].map(([id, color]) => (
                  <linearGradient key={id} id={`degradat-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.03} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="etiqueta" tick={{ fontSize: 9 }} interval={1} angle={-40} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10 }} width={60} />
              <Tooltip content={<TooltipEvolucio />} />
              <Legend wrapperStyle={{ paddingTop: 10 }} itemSorter={null} />
              <Area type="monotone" dataKey="tresoreriaReal" name="Real" stroke={COLOR_REAL} strokeWidth={2} fill="url(#degradat-real)" baseValue="dataMin" dot={false} connectNulls={false} />
              <Area type="monotone" dataKey="tresoreriaPrevistaPrecisa" name="Previst" stroke={COLOR_PREVISIO_PRECISA} strokeWidth={2} strokeDasharray="5 4" fill="url(#degradat-previst)" baseValue="dataMin" dot={false} connectNulls={false} />
              <Area type="monotone" dataKey="tresoreriaPrevista" name="Estimat" stroke={COLOR_PREVISIO_ESTIMADA} strokeWidth={2} strokeDasharray="5 4" fill="url(#degradat-estimat)" baseValue="dataMin" dot={false} connectNulls={false} />
              <Area type="monotone" dataKey="tresoreriaPrevista2" stroke={COLOR_PREVISIO_ESTIMADA} strokeWidth={2} strokeDasharray="5 4" fill="url(#degradat-estimat)" baseValue="dataMin" dot={false} connectNulls={false} legendType="none" />
              <Area type="monotone" dataKey="tresoreriaPrevistaPrecisa2" stroke={COLOR_PREVISIO_PRECISA} strokeWidth={2} strokeDasharray="5 4" fill="url(#degradat-previst)" baseValue="dataMin" dot={false} connectNulls={false} legendType="none" />
            </AreaChart>
          </ResponsiveContainer>

          <div className="comptabilitat__pestanyes">
            {PESTANYES_EVOLUCIO.map(([valor, etiqueta]) => (
              <button
                key={valor}
                type="button"
                className={`comptabilitat__pestanya ${pestanyaEvolucio === valor ? 'comptabilitat__pestanya--activa' : ''}`}
                onClick={() => setPestanyaEvolucio(valor)}
              >
                {etiqueta}
              </button>
            ))}
          </div>

          {pestanyaEvolucio === 'real' && (
            <div className="scroll-horitzontal dashboard__previsio-taula-wrap" role="region" tabIndex={0} aria-label="Evolució real">
              <table className="dashboard__previsio-taula">
                <thead>
                  <tr>
                    <th>Mes</th>
                    <th>Pagaments de quota</th>
                    <th>Quotes</th>
                    <th>Aportacions</th>
                    <th>Pel·lícula</th>
                    <th>Impacte net</th>
                    <th>Tresoreria</th>
                  </tr>
                </thead>
                <tbody>
                  {real.mesos.map((mes) => (
                    <tr key={mes.etiqueta}>
                      <td>{mes.etiqueta}</td>
                      <td>{mes.nombreQuotes}</td>
                      <td>{formatEuros(mes.ingressosQuotes)}</td>
                      <td>{formatEuros(mes.ingressosAportacions)}</td>
                      <td>{formatEuros(-mes.costPellicula)}</td>
                      <td className={classeSigne(mes.impacteNet)}>{formatEuros(mes.impacteNet)}</td>
                      <td className={classeSigne(mes.tresoreria)}>{formatEuros(mes.tresoreria)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pestanyaEvolucio === 'previsio' && (
            <>
              <p className="dashboard__subtitol">
                Si es fa 1 sessió/mes: nous socis segons el ritme dels últims 3 mesos, i renovacions
                {' '}només dels socis a qui els venç realment la quota aquell mes, descartant els que
                {' '}tenen un cost per sessió superior a {formatEuros(LLINDAR_COST_SESSIO_RENOVACIO)}
              </p>
              <div className="scroll-horitzontal dashboard__previsio-taula-wrap" role="region" tabIndex={0} aria-label="Taula de previsió">
                <table className="dashboard__previsio-taula">
                  <thead>
                    <tr>
                      <th>Mes</th>
                      <th>Nous socis</th>
                      <th>Renovacions</th>
                      <th>Quotes</th>
                      <th>Aportacions</th>
                      <th>Pel·lícula</th>
                      <th>Impacte net</th>
                      <th>Tresoreria</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hiHaResta && (
                      <tr>
                        <td>Resta de {resta.etiqueta}</td>
                        <td>—</td>
                        <td>—</td>
                        <td>{formatEuros(resta.ingressosQuotes)}</td>
                        <td>{formatEuros(resta.ingressosAportacions)}</td>
                        <td>{formatEuros(-resta.costPellicula)}<MarcaCost mes={resta} /></td>
                        <td className={classeSigne(resta.impacteNet)}>{formatEuros(resta.impacteNet)}</td>
                        <td className={classeSigne(excedentFinalMes)}>{formatEuros(excedentFinalMes)}</td>
                      </tr>
                    )}
                    {mesosPrevisio.map((mes) => (
                      <tr key={mes.etiqueta}>
                        <td>{mes.etiqueta}</td>
                        <td>{Math.round(mes.novesAltes)}</td>
                        <td>{mes.renovacionsEsperades} de {mes.sociesDeguts}</td>
                        <td>{formatEuros(mes.ingressosQuotes)}</td>
                        <td>{formatEuros(mes.ingressosAportacions)}</td>
                        <td>{formatEuros(-mes.costPellicula)}<MarcaCost mes={mes} /></td>
                        <td className={classeSigne(mes.impacteNet)}>{formatEuros(mes.impacteNet)}</td>
                        <td className={classeSigne(mes.excedentProjectat)}>{formatEuros(mes.excedentProjectat)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

      </div>
    </PaginaAdmin>
  );
}
