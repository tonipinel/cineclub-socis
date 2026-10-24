import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { useAuth } from '../auth/useAuth';
import { ROLE_ADMIN, ROLE_TAQUILLA } from '../constants/roles';
import * as ROUTES from '../constants/routes';
import { GRUPS_ADMIN, grupActiu } from '../lib/menuAdmin';
import { NOM_ORGANITZACIO } from '../lib/propostes';

const [GRUP_SOCIS, GRUP_PROGRAMACIO, GRUP_SALA] = GRUPS_ADMIN;

// Els grups (amb `elements`) enllacen al seu primer element i tenen submenú.
const ENLLACOS_ADMIN = [
  GRUP_SOCIS,
  GRUP_PROGRAMACIO,
  GRUP_SALA,
  { to: ROUTES.COMPTABILITAT, etiqueta: 'Comptabilitat', icona: 'comptabilitat' },
  { to: ROUTES.CONFIGURACIO, etiqueta: 'Configuració', icona: 'configuracio' },
];

const ENLLACOS_TAQUILLA = [
  { to: ROUTES.ESCANEIG, etiqueta: 'Escaneig', icona: 'escaneig' },
];

const ICONES = {
  socis: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
    </>
  ),
  sessions: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9h18M8 5v4M8 15v4M16 5v4M16 15v4" />
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

function Icona({ nom, className = 'site-header__icona', strokeWidth = '1.6' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONES[nom]}
    </svg>
  );
}

function Badge({ valor }) {
  return valor > 0 ? <span className="site-header__badge" aria-hidden="true">{valor}</span> : null;
}

export default function Header() {
  const { user, role, signOut } = useAuth();
  const { pathname } = useLocation();
  const [menuObert, setMenuObert] = useState(false);
  const [comptadorSolicituds, setComptadorSolicituds] = useState(0);
  const [comptadorPropostes, setComptadorPropostes] = useState(0);
  const enllacos = role === ROLE_ADMIN ? ENLLACOS_ADMIN : role === ROLE_TAQUILLA ? ENLLACOS_TAQUILLA : [];
  const comptadors = { solicituds: comptadorSolicituds, propostes: comptadorPropostes };
  const grupDeLaRuta = role === ROLE_ADMIN ? grupActiu(pathname) : null;
  const tancarMenu = () => setMenuObert(false);

  const classeSubenllac = ({ isActive }) => `site-header__sublink${isActive ? ' site-header__sublink--actiu' : ''}`;
  const subenllacos = (grup) => grup.elements.map((element) => (
    <NavLink key={element.to} to={element.to} aria-label={element.etiqueta} className={classeSubenllac} onClick={tancarMenu}>
      {element.etiqueta}
      <Badge valor={comptadors[element.comptador]} />
    </NavLink>
  ));

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
    const unsubPropostes = onSnapshot(qPropostes, (snap) => {
      // Les de l'organització són de l'equip: no cal revisar-les, així que no compten al badge.
      setComptadorPropostes(snap.docs.filter((d) => d.data().nomProposant !== NOM_ORGANITZACIO).length);
    });
    return () => { unsubSolicituds(); unsubPropostes(); };
  }, [role]);

  if (!user) {
    return (
      <header className="capcalera-publica">
        <div className="capcalera-publica__interior">
          <a className="capcalera-publica__marca" href={`${ROUTES.MARCA_URL}/`} aria-label="Cineclub Roda de Berà">
            <img className="capcalera-publica__logo" src="/logo-marca.png" alt="" />
            <span className="capcalera-publica__marca-text">Cineclub Roda de Berà</span>
          </a>
          <Link className="capcalera-publica__link" to={ROUTES.ACCEDIR}>Accedir</Link>
        </div>
      </header>
    );
  }

  return (
    <header className={`site-header${grupDeLaRuta ? ' site-header--amb-submenu' : ''}`}>
      <div className="site-header__barra">
        <div className="site-header__marca">
          {role === ROLE_ADMIN ? (
            <Link to={ROUTES.DASHBOARD}>
              <img className="site-header__logo" src="/logo-cineclub.png" alt="Cineclub Roda de Berà" />
            </Link>
          ) : (
            <img className="site-header__logo" src="/logo-cineclub.png" alt="Cineclub Roda de Berà" />
          )}
        </div>
        {enllacos.length > 0 && (
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
              onClick={tancarMenu}
              aria-hidden="true"
            />
            <nav className={`site-header__nav ${menuObert ? 'site-header__nav--obert' : ''}`}>
              {enllacos.map((enllac) => {
                if (!enllac.elements) {
                  return (
                    <NavLink
                      key={enllac.to}
                      to={enllac.to}
                      aria-label={enllac.etiqueta}
                      className={({ isActive }) => `site-header__link${isActive ? ' site-header__link--actiu' : ''}`}
                      onClick={tancarMenu}
                    >
                      <Icona nom={enllac.icona} />
                      {enllac.etiqueta}
                    </NavLink>
                  );
                }
                const actiu = grupDeLaRuta?.id === enllac.id;
                return (
                  <div key={enllac.id} className="site-header__grup">
                    <NavLink
                      to={enllac.elements[0].to}
                      aria-label={enllac.etiqueta}
                      className={`site-header__link${actiu ? ' site-header__link--actiu' : ''}`}
                      onClick={tancarMenu}
                    >
                      <Icona nom={enllac.icona} />
                      {enllac.etiqueta}
                      <Badge valor={enllac.elements.reduce((suma, e) => suma + (comptadors[e.comptador] ?? 0), 0)} />
                    </NavLink>
                    <div className="site-header__subgrup">{subenllacos(enllac)}</div>
                  </div>
                );
              })}
              <button
                className="site-header__link site-header__link--sortir"
                type="button"
                onClick={() => { tancarMenu(); signOut(); }}
              >
                <Icona nom="sortir" />
                Sortir
              </button>
            </nav>
          </>
        )}
      </div>
      {grupDeLaRuta && (
        <>
          <div className="site-header__separador" aria-hidden="true" />
          <div className="site-header__fons-submenu" aria-hidden="true" />
          <nav className="site-header__submenu" aria-label="Submenú">
            {subenllacos(grupDeLaRuta)}
          </nav>
        </>
      )}
    </header>
  );
}
