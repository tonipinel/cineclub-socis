import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { useAuth } from '../auth/useAuth';
import { useIdentitatPublica } from '../auth/useIdentitatPublica';
import { ROLE_ADMIN, ROLE_TAQUILLA } from '../constants/roles';
import * as ROUTES from '../constants/routes';

const ENLLACOS_ADMIN = [
  [ROUTES.SOCIS, 'Socis', 'socis'],
  [ROUTES.SOLICITUDS, "Sol·licituds", 'solicituds'],
  [ROUTES.PROPOSTES_PENDENTS, 'Propostes', 'propostes'],
  [ROUTES.SESSIONS, 'Sessions', 'sessions'],
  [ROUTES.TICKETS, 'Tiquets', 'tiquets'],
  [ROUTES.ESCANEIG, 'Escaneig', 'escaneig'],
  [ROUTES.COMPTABILITAT, 'Comptabilitat', 'comptabilitat'],
  [ROUTES.CONFIGURACIO, 'Configuració', 'configuracio'],
];

const ENLLACOS_TAQUILLA = [
  [ROUTES.ESCANEIG, 'Escaneig', 'escaneig'],
];

const ICONES = {
  socis: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
    </>
  ),
  solicituds: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 3v4h6V3" />
      <path d="M9 12h6M9 16h6" />
    </>
  ),
  propostes: (
    <>
      <path d="M3 8h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8Z" />
      <path d="M3 8l1.3-4h3L6 8M9.7 8 11 4h3l-1.3 4M16.3 8l1.3-4h3L19 8" />
    </>
  ),
  sessions: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9h18M8 5v4M8 15v4M16 5v4M16 15v4" />
    </>
  ),
  tiquets: (
    <>
      <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1a2 2 0 0 0 0 4v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-4Z" />
      <path d="M10 6.5v11" strokeDasharray="2 2" />
    </>
  ),
  escaneig: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7l1.3-2.5A1 1 0 0 1 10.2 4h3.6a1 1 0 0 1 .9.5L16 7" />
      <circle cx="12" cy="13.5" r="3.3" />
    </>
  ),
  comptabilitat: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M14.8 9.3a3.2 3.2 0 1 0 0 5.4M9 10.4h3.8M9 13.6h3.8" />
    </>
  ),
  configuracio: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>
  ),
  sortir: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
};

function Icona({ nom }) {
  return (
    <svg
      className="site-header__icona"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONES[nom]}
    </svg>
  );
}

export default function Header() {
  const { user, role, signOut } = useAuth();
  const { identitat: identitatPublica } = useIdentitatPublica();
  const [menuObert, setMenuObert] = useState(false);
  const [comptadorSolicituds, setComptadorSolicituds] = useState(0);
  const [comptadorPropostes, setComptadorPropostes] = useState(0);
  const enllacos = role === ROLE_ADMIN ? ENLLACOS_ADMIN : role === ROLE_TAQUILLA ? ENLLACOS_TAQUILLA : [];
  const comptadors = { solicituds: comptadorSolicituds, propostes: comptadorPropostes };

  useEffect(() => {
    if (!menuObert) return undefined;
    document.body.classList.add('menu-obert-body');
    return () => document.body.classList.remove('menu-obert-body');
  }, [menuObert]);

  useEffect(() => {
    if (role !== ROLE_ADMIN) return undefined;
    const qSolicituds = query(collection(db, 'solicituds'), where('estat', '==', 'pendent'));
    const unsubSolicituds = onSnapshot(qSolicituds, (snap) => setComptadorSolicituds(snap.size));
    const qPropostes = query(collection(db, 'propostes'), where('estat', '==', 'pendent'));
    const unsubPropostes = onSnapshot(qPropostes, (snap) => setComptadorPropostes(snap.size));
    return () => { unsubSolicituds(); unsubPropostes(); };
  }, [role]);

  return (
    <header className="site-header">
      <div className="site-header__marca">
        {role === ROLE_ADMIN ? (
          <Link to={ROUTES.DASHBOARD}>
            <img className="site-header__logo" src="/logo-cineclub.png" alt="Cineclub Roda de Berà" />
          </Link>
        ) : (
          <img className="site-header__logo" src="/logo-cineclub.png" alt="Cineclub Roda de Berà" />
        )}
        {!user && identitatPublica && (
          <span className="site-header__salutacio">Hola, {identitatPublica.nomPublic}!</span>
        )}
      </div>
      {user && enllacos.length > 0 && (
        <>
          <button
            type="button"
            className="site-header__hamburguesa"
            aria-label={menuObert ? 'Tancar el menú' : 'Obrir el menú'}
            aria-expanded={menuObert}
            onClick={() => setMenuObert((v) => !v)}
          >
            ☰
          </button>
          <div
            className={`site-header__overlay ${menuObert ? 'site-header__overlay--visible' : ''}`}
            onClick={() => setMenuObert(false)}
            aria-hidden="true"
          />
          <nav className={`site-header__nav ${menuObert ? 'site-header__nav--obert' : ''}`}>
            {enllacos.map(([to, etiqueta, icona]) => (
              <NavLink
                key={to}
                to={to}
                aria-label={etiqueta}
                className={({ isActive }) => `site-header__link${isActive ? ' site-header__link--actiu' : ''}`}
                onClick={() => setMenuObert(false)}
              >
                <Icona nom={icona} />
                {etiqueta}
                {comptadors[icona] > 0 && (
                  <span className="site-header__badge" aria-hidden="true">{comptadors[icona]}</span>
                )}
              </NavLink>
            ))}
            <button
              className="site-header__link"
              type="button"
              onClick={() => { setMenuObert(false); signOut(); }}
            >
              <Icona nom="sortir" />
              Sortir
            </button>
          </nav>
        </>
      )}
    </header>
  );
}
