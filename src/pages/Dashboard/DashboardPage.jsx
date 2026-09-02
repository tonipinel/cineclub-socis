import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import {
  BarChart, Bar, Cell, LineChart, Line, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { db } from '../../firebase/firebase';
import { avui } from '../../lib/data';
import { resumDashboardSocis } from '../../lib/socis';
import { resumDashboardTiquets, resumPerSessio } from '../../lib/escaneig';
import {
  resumComptable, resumReal, resumPrevisio, balancPerSessio, formatEuros, classeSigne, ETIQUETES_METODE,
  LLINDAR_COST_SESSIO_RENOVACIO, CATEGORIA_QUOTA_SOCI, TIPUS_QUOTA, TIPUS_MOVIMENT,
} from '../../lib/moviments';
import * as ROUTES from '../../constants/routes';
import Carregant from '../../components/Carregant';

const PESTANYES_EVOLUCIO = [
  ['real', 'Últims 12 mesos (real)'],
  ['previsio', 'Previsió pròxims 12 mesos'],
];

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

const CATEGORIES_DETALL_TANCAT_PER_DEFECTE = ['Gestió associació'];

export default function DashboardPage() {
  const [dades, setDades] = useState(undefined);
  const [error, setError] = useState(false);
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
    }).catch(() => setError(true));
  }, []);

  if (error) return <p className="dashboard__error">No s'han pogut carregar les dades del dashboard.</p>;
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
  const previsio = resumPrevisio(dades.moviments, dades.socis, dades.sessions, dades.accessLog);
  const mesosPrevisio = previsio.mesos.reduce((acc, mes) => {
    const excedentProjectat = (acc.length > 0 ? acc[acc.length - 1].excedentProjectat : comptable.excedent) + mes.impacteNet;
    acc.push({ ...mes, excedentProjectat });
    return acc;
  }, []);
  const dadesGrafic = [
    ...real.mesos.map((mes) => ({ etiqueta: mes.etiqueta, tresoreriaReal: mes.tresoreria, tresoreriaPrevista: null })),
    ...mesosPrevisio.map((mes) => ({ etiqueta: mes.etiqueta, tresoreriaReal: null, tresoreriaPrevista: mes.excedentProjectat })),
  ];
  if (real.mesos.length > 0 && mesosPrevisio.length > 0) {
    dadesGrafic[real.mesos.length - 1].tresoreriaPrevista = dadesGrafic[real.mesos.length - 1].tresoreriaReal;
  }
  const balancSessions = balancPerSessio(dades.moviments);
  const dataAvui = avui();
  const ultimesSessions = dades.sessions
    .filter((s) => (s.data ?? '') <= dataAvui)
    .sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''))
    .slice(0, 5);
  const dadesBalancSessions = [...ultimesSessions].reverse().map((s) => ({
    titol: s.titol,
    balanc: balancSessions[s.id] ?? 0,
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
  const percentTiquetsUsats = totalTiquets > 0 ? Math.round((tiquets.usats / totalTiquets) * 100) : 0;

  return (
    <div className="dashboard">
      <h1 className="dashboard__titol">Dashboard</h1>

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
          <p className="dashboard__subtitol">Balanç per sessió (últimes 5)</p>
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

          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={dadesGrafic}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="etiqueta" tick={{ fontSize: 9 }} interval={1} angle={-40} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10 }} width={60} />
              <Tooltip formatter={(valor) => formatEuros(valor)} />
              <Legend />
              <Line type="monotone" dataKey="tresoreriaReal" name="Tresoreria real" stroke="#000000" strokeWidth={2} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="tresoreriaPrevista" name="Tresoreria prevista" stroke="#BF9000" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false} />
            </LineChart>
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
            <div className="dashboard__previsio-taula-wrap">
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
              <div className="dashboard__previsio-taula-wrap">
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
                    {mesosPrevisio.map((mes) => (
                      <tr key={mes.etiqueta}>
                        <td>{mes.etiqueta}</td>
                        <td>{Math.round(mes.novesAltes)}</td>
                        <td>{mes.renovacionsEsperades} de {mes.sociesDeguts}</td>
                        <td>{formatEuros(mes.ingressosQuotes)}</td>
                        <td>{formatEuros(mes.ingressosAportacions)}</td>
                        <td>{formatEuros(-mes.costPellicula)}</td>
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
    </div>
  );
}
