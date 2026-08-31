import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { ROLE_ADMIN, ROLE_TAQUILLA } from '../constants/roles';
import * as ROUTES from '../constants/routes';

const ENLLACOS_ADMIN = [
  [ROUTES.SOCIS, 'Socis', 'socis'],
  [ROUTES.SOLICITUDS, "Sol·licituds", 'solicituds'],
  [ROUTES.SESSIONS, 'Sessions', 'sessions'],
  [ROUTES.TICKETS, 'Tiquets', 'tiquets'],
  [ROUTES.ESCANEIG, 'Escaneig', 'escaneig'],
  [ROUTES.COMPTABILITAT, 'Comptabilitat', 'comptabilitat'],
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
  const [menuObert, setMenuObert] = useState(false);
  const enllacos = role === ROLE_ADMIN ? ENLLACOS_ADMIN : role === ROLE_TAQUILLA ? ENLLACOS_TAQUILLA : [];

  return (
    <header className="site-header">
      <div className="site-header__marca">
        <img className="site-header__logo" src="/logo-cineclub.png" alt="Cineclub Roda de Berà" />
      </div>
      {user && enllacos.length > 0 && (
        <>
          <button
            type="button"
            className="site-header__hamburguesa"
            aria-label="Obrir el menú"
            aria-expanded={menuObert}
            onClick={() => setMenuObert((v) => !v)}
          >
            ☰
          </button>
          <nav className={`site-header__nav ${menuObert ? 'site-header__nav--obert' : ''}`}>
            {enllacos.map(([to, etiqueta, icona]) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `site-header__link${isActive ? ' site-header__link--actiu' : ''}`}
                onClick={() => setMenuObert(false)}
              >
                <Icona nom={icona} />
                {etiqueta}
              </NavLink>
            ))}
            <button className="site-header__link" type="button" onClick={signOut}>
              <Icona nom="sortir" />
              Sortir
            </button>
          </nav>
        </>
      )}
    </header>
  );
}
