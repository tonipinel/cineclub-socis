import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { db } from '../../firebase/firebase';
import { resumDashboardSocis } from '../../lib/socis';
import { resumDashboardTiquets } from '../../lib/escaneig';
import { resumComptable, balancPerSessio, formatEuros, classeSigne } from '../../lib/moviments';
import * as ROUTES from '../../constants/routes';

export default function DashboardPage() {
  const [dades, setDades] = useState(undefined);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([
      getDocs(collection(db, 'socis')),
      getDocs(collection(db, 'sessions')),
      getDocs(collection(db, 'accessLog')),
      getDocs(collection(db, 'moviments')),
      getDocs(collection(db, 'lotsTiquets')),
      getDocs(query(collection(db, 'solicituds'), where('estat', '==', 'pendent'))),
    ]).then(([socisSnap, sessionsSnap, accessLogSnap, movimentsSnap, lotsSnap, solicitudsSnap]) => {
      setDades({
        socis: socisSnap.docs.map((d) => d.data()),
        sessions: sessionsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        accessLog: accessLogSnap.docs.map((d) => d.data()),
        moviments: movimentsSnap.docs.map((d) => d.data()),
        lots: lotsSnap.docs.map((d) => d.data()),
        solicituds: solicitudsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      });
    }).catch(() => setError(true));
  }, []);

  if (error) return <p className="dashboard__error">No s'han pogut carregar les dades del dashboard.</p>;
  if (!dades) return <p className="dashboard__carregant">Carregant…</p>;

  const socis = resumDashboardSocis(dades.socis, dades.sessions, dades.accessLog);
  const tiquets = resumDashboardTiquets(dades.lots, dades.accessLog, dades.sessions);
  const comptable = resumComptable(dades.moviments);
  const balancSessions = balancPerSessio(dades.moviments);
  const ultimesSessions = [...dades.sessions].sort((a, b) => (b.data ?? '').localeCompare(a.data ?? '')).slice(0, 5);
  const ultimesSolicituds = [...dades.solicituds]
    .sort((a, b) => (b.timestamp?.toDate?.() ?? 0) - (a.timestamp?.toDate?.() ?? 0))
    .slice(0, 3);

  return (
    <div className="dashboard">
      <h1 className="dashboard__titol">Dashboard</h1>
      <div className="dashboard__graella">

        <div className="dashboard__modul">
          <h2 className="dashboard__modul-titol">Socis</h2>
          <p className="dashboard__xifra">{socis.total}</p>
          <p className="dashboard__subtitol">Altes per mes (últims 12 mesos)</p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={socis.altesPerMes}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} width={24} />
              <Tooltip />
              <Bar dataKey="total" fill="#BF9000" />
            </BarChart>
          </ResponsiveContainer>
          <p>Assistència mitjana (últimes 12 sessions): <strong>{socis.assistenciaMitjana}%</strong></p>
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
          <h2 className="dashboard__modul-titol">Sol·licituds</h2>
          <p className="dashboard__xifra">{dades.solicituds.length}</p>
          <p>pendents d'aprovar</p>
          <ul className="dashboard__llista">
            {ultimesSolicituds.map((s) => (
              <li key={s.id}>{s.nom} {s.cognoms}</li>
            ))}
          </ul>
          <Link className="dashboard__enllac" to={ROUTES.SOLICITUDS}>Veure totes</Link>
        </div>

        <div className="dashboard__modul">
          <h2 className="dashboard__modul-titol">Sessions</h2>
          {ultimesSessions.length === 0 && <p>Encara no hi ha cap sessió.</p>}
          <ul className="dashboard__llista">
            {ultimesSessions.map((s) => {
              const balanc = balancSessions[s.id] ?? 0;
              return (
                <li key={s.id} className="dashboard__sessio-fila">
                  <span>{s.titol}</span>
                  <span className={classeSigne(balanc)}>{formatEuros(balanc)}</span>
                </li>
              );
            })}
          </ul>
          <Link className="dashboard__enllac" to={ROUTES.SESSIONS}>Veure totes</Link>
        </div>

        <div className="dashboard__modul">
          <h2 className="dashboard__modul-titol">Tiquets</h2>
          <p className="dashboard__xifra">{tiquets.disponibles}</p>
          <p>disponibles per gastar</p>
          <p>{tiquets.gastatsUltimaSessio} gastats a l'última sessió</p>
          <Link className="dashboard__enllac" to={ROUTES.TICKETS}>Veure tiquets</Link>
        </div>

        <div className="dashboard__modul dashboard__modul--ample">
          <h2 className="dashboard__modul-titol">Comptabilitat</h2>
          <p className={`dashboard__comptabilitat-excedent ${classeSigne(comptable.excedent)}`}>
            Excedent: {formatEuros(comptable.excedent)}
          </p>
          <p className="dashboard__comptabilitat-seccio">Ingressos</p>
          <p className="dashboard__comptabilitat-fila"><span>Total ingressos</span><span>{formatEuros(comptable.ingressosTotal)}</span></p>
          {Object.entries(comptable.ingressosPerCategoriaIMetode).map(([categoria, valors]) => (
            <p key={categoria} className="dashboard__comptabilitat-fila">
              <span>{categoria}</span>
              <span>{formatEuros(valors.total)} (efectiu {formatEuros(valors.efectiu)} / a compte {formatEuros(valors.aCompte)})</span>
            </p>
          ))}
          <p className="dashboard__comptabilitat-seccio">Despeses</p>
          <p className="dashboard__comptabilitat-fila"><span>Total despeses</span><span>{formatEuros(comptable.despesesTotal)}</span></p>
          {Object.entries(comptable.despesesPerCategoria).map(([categoria, total]) => (
            <p key={categoria} className="dashboard__comptabilitat-fila">
              <span>{categoria}</span><span>{formatEuros(total)}</span>
            </p>
          ))}
          <p className="dashboard__comptabilitat-total"><span>Al banc</span><span>{formatEuros(comptable.banc)}</span></p>
          <p className="dashboard__comptabilitat-total"><span>A caixa</span><span>{formatEuros(comptable.caixa)}</span></p>
          <Link className="dashboard__enllac" to={ROUTES.COMPTABILITAT}>Veure comptabilitat</Link>
        </div>

      </div>
    </div>
  );
}
